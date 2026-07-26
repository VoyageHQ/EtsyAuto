// Screenshot via CDP.
//
// Chromium's own --screenshot flag never returns on this dashboard: it waits
// for the page to go quiet, and a page with requestAnimationFrame plus an open
// SSE stream never does. Driving the DevTools protocol ourselves lets us say
// "wait this long, then capture", which is what we actually want.
//
//   node shot.mjs <url> <out.png> [width] [height] [waitMs] [jsToRunFirst]
//
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [url, out, w = '1500', h = '900', waitMs = '3000', script = ''] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node shot.mjs <url> <out.png> [w] [h] [waitMs] [script]');
  process.exit(1);
}
const PORT = Number(process.env.CDP_PORT || 9333);

/** Find Chromium without pinning a build number that changes under us. */
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  // Playwright's 'chromium' entry is a symlink straight to the binary on some
  // images and a directory on others, so try both shapes.
  const candidates = [join(root, 'chromium'), join(root, 'chromium', 'chrome-linux', 'chrome')];
  if (existsSync(root)) {
    for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium-'))) {
      candidates.push(join(root, dir, 'chrome-linux', 'chrome'));
    }
  }
  candidates.push('/usr/bin/chromium', '/usr/bin/google-chrome');
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`no chromium found under ${root}; set CHROME_PATH`);
  return found;
}

const chrome = spawn(
  chromePath(),
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--window-size=${w},${h}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome never came up');
}

const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});
await new Promise((r) => ws.addEventListener('open', r));

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

await send('Page.enable');
await send('Page.navigate', { url });
await sleep(Number(waitMs));
if (script) {
  await send('Runtime.evaluate', { expression: script, awaitPromise: true });
  await sleep(1200);
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(`wrote ${out}`);
ws.close();
chrome.kill();
process.exit(0);
