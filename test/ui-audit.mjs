// Open every building, in both businesses, and watch for anything that breaks.
//
//   npm run audit:ui            # needs a chromium; skips cleanly without one
//
// The HTTP audit proves the routes answer. This proves the *dashboard* can
// actually render what they return: every station panel opened, every control
// present, with the browser console and the network tab watched throughout.
// A panel that throws while rendering leaves a blank box and no other trace,
// which is exactly the kind of fault nobody notices until they need that page.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createDashboardServer } from '../src/server/index.js';
import { loadKnowledge } from '../src/knowledge/index.js';
import { requestIdeas, drain, decideIdeas, stop as stopLoop } from '../src/pipeline/orchestrator.js';
import { listProducts } from '../src/pipeline/products.js';
import { all, count, one } from '../src/core/db.js';
import { forget } from '../src/core/memory.js';
import { WORLDS } from '../src/core/stations.js';

const SHOT_DIR = process.env.AUDIT_SHOTS || '';
let failures = 0;
let checks = 0;
const problems = [];

function check(label, condition, detail = '') {
  checks++;
  if (condition) console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  else {
    failures++;
    problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \x1b[31m×\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function chromePath() {
  if (process.env.CHROME_PATH) return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  // Playwright's 'chromium' entry is a symlink straight to the binary on some
  // images and a directory on others, so try both shapes.
  const candidates = [join(root, 'chromium'), join(root, 'chromium', 'chrome-linux', 'chrome')];
  if (existsSync(root)) {
    for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium-'))) {
      candidates.push(join(root, dir, 'chrome-linux', 'chrome'));
    }
  }
  candidates.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome');
  return candidates.find((p) => existsSync(p)) || null;
}

const chrome = chromePath();
if (!chrome) {
  // Not having a browser is a fair state for this machine to be in; failing the
  // run over it would only teach people to ignore the run.
  console.log('\nUI audit — skipped, no chromium found (set CHROME_PATH to run it)\n');
  process.exit(0);
}

console.log('\nUI audit — every building, both businesses\n');

// --- a populated valley on a port nobody else is using ---------------------

loadKnowledge();
if (count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'") < 4) {
  requestIdeas(10, null);
  await drain(4);
}
if (listProducts().length < 1) {
  const seed = all("SELECT id FROM ideas WHERE status = 'proposed' LIMIT 2").map((i) => i.id);
  if (seed.length) decideIdeas(seed, 'approved', '', 'ui-audit');
  await drain(60);
}

// "bring back the ones I removed" only exists once something has been removed,
// so remove one. Otherwise the control can never be exercised and a broken
// restore button would sit there undiscovered until the day it was needed.
const removable = one("SELECT id FROM lessons WHERE source LIKE 'pack:%' AND active = 1 LIMIT 1");
if (removable) forget(removable.id);

const server = createDashboardServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;

// --- drive the browser over CDP -------------------------------------------

const PORT = 9444;
const browser = spawn(
  chrome,
  ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
   `--remote-debugging-port=${PORT}`, '--window-size=1500,950', 'about:blank'],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function firstPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('chromium never came up');
}

const page = await firstPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
const failedRequests = [];

ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  // An uncaught throw and a console.error both mean the same thing here:
  // something on the page did not do what it was written to do.
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params?.exceptionDetails;
    consoleErrors.push(d?.exception?.description || d?.text || 'unknown exception');
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
    consoleErrors.push((msg.params.args || []).map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Network.responseReceived') {
    const { url: reqUrl, status } = msg.params.response;
    if (status >= 400) failedRequests.push(`${status} ${reqUrl}`);
  }
});
await new Promise((r) => ws.addEventListener('open', r));

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res?.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || 'threw');
  return res?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Page.navigate', { url });
await sleep(4000);

// --- does it come up at all ------------------------------------------------

console.log('First paint');
check('the page rendered a valley', await evaluate("!!document.querySelector('#map')"));
check('the sidebar has the agents in it', (await evaluate("document.querySelectorAll('#agents .agent').length")) > 0);
check('the activity feed has something in it', (await evaluate("document.querySelectorAll('#activity > *').length")) > 0);
check('the clock is running', Boolean(await evaluate("document.getElementById('clock-time')?.textContent?.trim()")));
check('nothing threw before first paint', consoleErrors.length === 0, consoleErrors.join(' | '));

// --- every building, in both worlds ---------------------------------------

// `data-station` is not unique: the heads-up panel tags each waiting approval
// with the building it came from, so a bare querySelector finds an *approval
// button* before it finds the building. Clicking one of those answers the
// owner's approval — which is how this audit spent its first run silently
// greenlighting ventures. Only the map and the tab bar are buildings.
const BUILDING = (id) => `document.querySelector('#tabs [data-station="${id}"], #overlay [data-station="${id}"]')`;

for (const [worldId, world] of Object.entries(WORLDS)) {
  console.log(`\n${worldId === 'valley' ? 'The Valley' : 'The Harbour'}`);

  // Switch business by clicking the name, the same way a person would. The map
  // only draws the current world's buildings, so "is this station's label on
  // the page" is the honest test of whether the switch landed.
  const anchor = world.stations[0].id;
  const switched = await evaluate(`
    (async () => {
      for (let i = 0; i < 4; i++) {
        if (${BUILDING(anchor)}) return true;
        document.getElementById('district-switch').click();
        await new Promise((r) => setTimeout(r, 600));
      }
      return Boolean(${BUILDING(anchor)});
    })()
  `);
  check(`switching to the ${worldId} works`, switched === true);
  await sleep(600);

  for (const station of world.stations) {
    const before = consoleErrors.length;
    const beforeRequests = failedRequests.length;

    const opened = await evaluate(`
      (async () => {
        const el = ${BUILDING(station.id)};
        if (!el) return 'no building to click';
        el.click();
        const modal = document.getElementById('modal');
        // Wait for the panel rather than guessing at a delay — panels that
        // fetch (the knowledge reader, the venture detail) take longer than
        // ones that render straight from state.
        for (let i = 0; i < 30 && modal.hidden; i++) await new Promise((r) => setTimeout(r, 100));
        if (modal.hidden) return 'panel did not open';
        const body = document.getElementById('modal-body');
        if (!body.textContent.trim()) return 'panel opened empty';
        if (!document.getElementById('modal-title').textContent.trim()) return 'panel has no title';
        return 'ok';
      })()
    `);

    const newErrors = consoleErrors.slice(before);
    const newFailures = failedRequests.slice(beforeRequests);
    check(
      `${station.name} opens and renders`,
      opened === 'ok' && newErrors.length === 0 && newFailures.length === 0,
      [opened === 'ok' ? '' : opened, ...newErrors, ...newFailures].filter(Boolean).join(' | ')
    );

    if (SHOT_DIR) {
      mkdirSync(SHOT_DIR, { recursive: true });
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot?.data) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(join(SHOT_DIR, `${worldId}-${station.id}.png`), Buffer.from(shot.data, 'base64'));
      }
    }

    await evaluate("document.getElementById('modal-close')?.click()");
    await sleep(250);
    check(`${station.name} closes again`, (await evaluate("document.getElementById('modal').hidden")) === true);
  }
}

// --- every control the panels advertise ------------------------------------

console.log('\nControls');
// Walk both worlds again, this time only reading which controls each panel
// offers. Nothing here is clicked inside the panel — the HTTP audit already
// proves what the buttons call, and clicking them here would decide the
// owner's ideas for them.
const controls = {};
for (const [, world] of Object.entries(WORLDS)) {
  const anchor = world.stations[0].id;
  await evaluate(`
    (async () => {
      for (let i = 0; i < 4; i++) {
        if (${BUILDING(anchor)}) return;
        document.getElementById('district-switch').click();
        await new Promise((r) => setTimeout(r, 600));
      }
    })()
  `);
  for (const station of world.stations) {
    const acts = await evaluate(`
      (async () => {
        const el = ${BUILDING(station.id)};
        if (!el) return [];
        el.click();
        const modal = document.getElementById('modal');
        for (let i = 0; i < 20 && modal.hidden; i++) await new Promise((r) => setTimeout(r, 100));
        const found = [...document.querySelectorAll('#modal-body [data-act]')].map((b) => b.dataset.act);
        document.getElementById('modal-close')?.click();
        await new Promise((r) => setTimeout(r, 120));
        return found;
      })()
    `);
    for (const act of acts || []) controls[act] = (controls[act] || 0) + 1;
  }
}

// Every button the source defines should have appeared on some panel. One that
// never renders is either dead code or a panel that silently stopped drawing.
const DECLARED = ['all', 'none', 'more', 'approve', 'shelve', 'reject', 'tick',
                  'loop-on', 'loop-off', 'teach', 'restore', 'sale', 'harvest', 'health'];

// Buttons that are not data-act but still have to be reachable.
const DECLARED_DATA = ['relist', 'rebuild', 'png', 'open'];
for (const act of DECLARED) {
  check(`the "${act}" control renders somewhere`, Boolean(controls?.[act]), 'never appeared');
}

// The product controls live on their own attributes rather than data-act.
// Products sit in different buildings depending on their stage, so look in all
// three rather than assuming which one has them today. Switch back to the
// valley first: the walk above finishes in the harbour, where none of these
// tabs exist, and looking for them there reports the app as broken when it is
// the test standing in the wrong place.
await evaluate(`
  (async () => {
    for (let i = 0; i < 4; i++) {
      if (document.querySelector('#tabs [data-station="workshop"]')) return;
      document.getElementById('district-switch').click();
      await new Promise((r) => setTimeout(r, 600));
    }
  })()
`);

const productControls = await evaluate(`
  (async () => {
    const found = new Set();
    for (const id of ['workshop', 'review-hall', 'shopfront']) {
      const el = document.querySelector('#tabs [data-station="' + id + '"]');
      if (!el) continue;
      el.click();
      const modal = document.getElementById('modal');
      for (let i = 0; i < 20 && modal.hidden; i++) await new Promise((r) => setTimeout(r, 100));
      for (const name of ['relist', 'rebuild', 'png', 'open']) {
        if (document.querySelector('#modal-body [data-' + name + ']')) found.add(name);
      }
      document.getElementById('modal-close')?.click();
      await new Promise((r) => setTimeout(r, 150));
    }
    return [...found];
  })()
`);
for (const name of DECLARED_DATA) {
  check(`the "${name}" product control renders`, (productControls || []).includes(name), (productControls || []).join(', '));
}

check('no page errors across the whole walk', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));
check('no failed requests across the whole walk', failedRequests.length === 0, failedRequests.slice(0, 4).join(' | '));

// --- done ------------------------------------------------------------------

ws.close();
browser.kill();
stopLoop();
server.close();

console.log(
  failures
    ? `\n\x1b[31m${checks - failures}/${checks} passed — ${failures} problem(s)\x1b[0m\n` +
        'Problems:\n' + problems.map((p) => `  - ${p}`).join('\n') + '\n'
    : `\n\x1b[32m${checks}/${checks} checks passed\x1b[0m\n`
);
process.exit(failures ? 1 : 0);
