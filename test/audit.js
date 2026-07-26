// Every door in the building, opened once.
//
// The smoke test proves the pipeline works. This proves the *dashboard* works:
// every API route the front end can call, with a real body, against a real
// server, plus the error paths that should be refused rather than crash.
//
//   npm run audit
//
// It boots the server on an ephemeral port in-process, so it never fights with
// a dashboard you already have running.
import { createDashboardServer } from '../src/server/index.js';
import { loadKnowledge } from '../src/knowledge/index.js';
import { requestIdeas, drain, decideIdeas } from '../src/pipeline/orchestrator.js';
import { listProducts } from '../src/pipeline/products.js';
import { openApprovals } from '../src/core/approvals.js';
import { all, one, count, insert } from '../src/core/db.js';
import { createVenture, saveSignals } from '../src/ventures/pipeline.js';
import { uid, now } from '../src/core/util.js';
import { stop as stopLoop } from '../src/pipeline/orchestrator.js';

let failures = 0;
let checks = 0;
const problems = [];

function check(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failures++;
    problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \x1b[31m×\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- a server on a port nobody else is using -------------------------------

const server = createDashboardServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

/** Call a route and come back with both the status and the parsed body. */
async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed = null;
  const text = await res.text();
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

const ok = (r) => r.status >= 200 && r.status < 300;

console.log('\nDashboard audit — every route the front end can reach\n');

// --- something to audit against --------------------------------------------

loadKnowledge();
if (count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'") < 4) {
  requestIdeas(10, null);
  await drain(4);
}
if (listProducts().length < 1) {
  const seed = all("SELECT id FROM ideas WHERE status = 'proposed' LIMIT 2").map((i) => i.id);
  if (seed.length) decideIdeas(seed, 'approved', '', 'audit');
  await drain(60);
}

// --- the payload the whole front end is built on ---------------------------

console.log('State');
const state = await call('GET', '/api/state');
check('GET /api/state answers', ok(state), `status ${state.status}`);

const REQUIRED_STATE_KEYS = [
  'shop', 'worlds', 'divisions', 'counts', 'agents', 'attention', 'activity',
  'ideas', 'products', 'jobs', 'knowledge', 'ledger', 'ventures', 'signals',
  'campaigns', 'insights', 'budget', 'proposals', 'digest',
];
for (const key of REQUIRED_STATE_KEYS) {
  check(`state carries "${key}"`, state.body?.[key] !== undefined);
}
check('the clock the valley draws itself by is present', Boolean(state.body?.shop?.clock?.phase));
check(
  'the loop reports whether it is actually running, not what the config wants',
  typeof state.body?.shop?.loopRunning === 'boolean',
  JSON.stringify(state.body?.shop?.loopRunning)
);
check(
  'every agent in state names a station that exists',
  (state.body?.agents || []).every((a) =>
    Object.values(state.body.worlds || {}).some((w) => w.stations.some((s) => s.id === a.home))
  )
);
check(
  'the payload stays small enough to push over SSE',
  JSON.stringify(state.body).length < 400_000,
  `${Math.round(JSON.stringify(state.body).length / 1024)}KB`
);

// Every counter a station advertises has to exist on the payload, or the
// building renders with a blank label and nobody notices for a month.
const counters = Object.values(state.body?.worlds || {})
  .flatMap((w) => w.stations)
  .map((s) => s.counter)
  .filter(Boolean);
check(
  'every station counter resolves against the payload',
  counters.every((c) => state.body.counts?.[c] !== undefined),
  counters.filter((c) => state.body.counts?.[c] === undefined).join(', ')
);

// --- the event stream ------------------------------------------------------

console.log('\nLive updates');
{
  const controller = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: controller.signal });
  check('GET /api/events opens', res.status === 200, `status ${res.status}`);
  check(
    'it is an event stream',
    (res.headers.get('content-type') || '').includes('text/event-stream'),
    res.headers.get('content-type') || 'no content-type'
  );
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const opening = decoder.decode((await reader.read()).value);
  check('it greets the browser so the connection is not left hanging', opening.includes(':'), JSON.stringify(opening));

  // Cause an event, then wait for it to come back down the wire. This is the
  // whole point of the stream: the dashboard must not need a refresh.
  let pushed = '';
  const listening = (async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      pushed += decoder.decode(value);
      if (pushed.includes('data:')) return;
    }
  })();
  await call('POST', '/api/teach', { agent: 'scout', text: `Audit ping ${Date.now()}.` });
  await listening;
  check('an event reaches an open dashboard without a refresh', pushed.includes('data:'), JSON.stringify(pushed.slice(0, 80)));
  controller.abort();
}

// --- ideas -----------------------------------------------------------------

console.log('\nResearch Bench');
const askedFor = await call('POST', '/api/ideas/request', { count: 3, theme: 'adhd' });
check('POST /api/ideas/request queues a job', ok(askedFor) && askedFor.body.jobId, JSON.stringify(askedFor.body));
await drain(4);

const proposed = all("SELECT * FROM ideas WHERE status = 'proposed' ORDER BY score DESC");
check('the Scout put something on the bench', proposed.length > 0, `${proposed.length}`);

if (proposed.length >= 3) {
  const shelved = await call('POST', '/api/ideas/decide', { ids: [proposed[0].id], decision: 'shelved' });
  check('"shelve for later" works', ok(shelved) && shelved.body.decided === 1, JSON.stringify(shelved.body));

  const turnedDown = await call('POST', '/api/ideas/decide', {
    ids: [proposed[1].id], decision: 'rejected', note: 'audit: not for this shop',
  });
  check('"not for me" works', ok(turnedDown) && turnedDown.body.decided === 1);
  check(
    'and the reason became a lesson for the Scout',
    count("SELECT COUNT(*) FROM lessons WHERE agent_id = 'scout' AND text LIKE '%not for this shop%'") > 0
  );

  const built = await call('POST', '/api/ideas/decide', { ids: [proposed[2].id], decision: 'approved' });
  check('"build the selected" works', ok(built) && built.body.decided === 1);
}
const noIds = await call('POST', '/api/ideas/decide', { ids: [] });
check('deciding nothing is refused, not crashed', noIds.status === 400, `status ${noIds.status}`);

// --- approvals -------------------------------------------------------------

console.log('\nHeads up');
const open = openApprovals();
check('there is something waiting on the owner', open.length > 0, `${open.length} open`);
if (open.length) {
  const answered = await call('POST', `/api/approvals/${open[0].id}/answer`, { value: 'ok' });
  check('POST /api/approvals/:id/answer works', ok(answered), JSON.stringify(answered.body).slice(0, 120));
}
const ghost = await call('POST', '/api/approvals/appr_nope/answer', { value: 'ok' });
check('answering an approval that does not exist is refused', ghost.status >= 400, `status ${ghost.status}`);

// --- the Office ------------------------------------------------------------

console.log('\nOffice');
const taught = await call('POST', '/api/teach', { agent: 'scout', text: 'Audit lesson: never propose sundials.' });
check('"teach it" works', ok(taught) && taught.body.id, JSON.stringify(taught.body));

const houseRule = await call('POST', '/api/teach', { agent: null, text: 'Audit lesson: the shop is called Hartistic.' });
check('teaching "everyone" works', ok(houseRule) && houseRule.body.id);

// A mistyped input is the owner's slip, not a server fault. It has to come
// back as a refusal the front end can show, not a 500 that lands in the
// activity feed looking like the valley broke.
const emptyLesson = await call('POST', '/api/teach', { agent: 'scout', text: '   ' });
check('an empty lesson is refused rather than stored', emptyLesson.status === 400, `status ${emptyLesson.status}`);
check('and the refusal explains itself', typeof emptyLesson.body?.error === 'string', JSON.stringify(emptyLesson.body));

if (taught.body?.id) {
  const forgotten = await call('POST', `/api/lessons/${taught.body.id}/forget`);
  check('"forget" works', ok(forgotten) && forgotten.body.forgotten);
}

for (const who of ['everyone', 'scout', 'maker', 'prospector', 'marketer']) {
  const k = await call('GET', `/api/knowledge/${who}`);
  check(`GET /api/knowledge/${who} returns lessons`, ok(k) && k.body.lessons?.length > 0, `${k.body?.lessons?.length ?? 0}`);
}
const unknownAgent = await call('GET', '/api/knowledge/nobody');
check('an unknown agent returns an empty list rather than a 500', unknownAgent.status === 200 && Array.isArray(unknownAgent.body.lessons));

const restored = await call('POST', '/api/knowledge/restore');
check('"bring back the ones I removed" works', ok(restored) && typeof restored.body.added === 'number');

// The overnight digest. The agents run while the owner sleeps, so this is the
// first thing they see; it has to be right and it must not clear itself.
const digest = await call('GET', '/api/digest');
check('GET /api/digest answers', ok(digest), `status ${digest.status}`);
check('   with a headline', typeof digest.body?.headline === 'string', JSON.stringify(digest.body?.headline));
check('   and a plain-text rendering for the terminal', typeof digest.body?.text === 'string');
check('   and knows how long you were away', Number(digest.body?.hours) >= 1);
check('   listing what is waiting on you', Array.isArray(digest.body?.waiting));

const seen = await call('POST', '/api/digest/seen');
check('"got it" marks it read', ok(seen) && Number(seen.body?.seenAt) > 0, JSON.stringify(seen.body));

// Pressing "got it" has to actually work — including when approvals are still
// open, since those live in the heads-up panel and repeating them here would
// mean the card could never be dismissed.
const afterSeen = await call('GET', '/api/digest');
check('   and then it is quiet', afterSeen.body?.quiet === true, JSON.stringify(afterSeen.body?.headline));
check('   while still counting what is outstanding', afterSeen.body?.waitingTotal >= 0);

// Reading the state must NOT count as having seen it: a dashboard left open on
// a second screen would otherwise quietly eat the night's news.
await call('GET', '/api/state');
await call('GET', '/api/state');
const afterPolling = await call('GET', '/api/digest');
check('polling the dashboard does not move the mark', afterPolling.body?.since === afterSeen.body?.since);

// The shop health check. The Inspector guards the gate; this looks at what has
// gone wrong since, which no single agent watches for.
const health = await call('GET', '/api/health');
check('GET /api/health answers', ok(health), `status ${health.status}`);
check('   with findings it can render', Array.isArray(health.body?.findings) && typeof health.body?.text === 'string');
check('   scored so the dashboard can pick a colour', ['good', 'poor', 'bad'].includes(health.body?.score), health.body?.score);
check(
  '   and every finding says what to do about it',
  (health.body?.findings || []).every((f) => f.what && f.fix && f.severity),
  JSON.stringify((health.body?.findings || []).find((f) => !f.fix) || '')
);

// The Signwriter's sweep, on demand.
const seo = await call('POST', '/api/seo');
check('POST /api/seo runs a search sweep', ok(seo) && Array.isArray(seo.body?.findings), JSON.stringify(seo.body).slice(0, 120));
check('   scored so the panel can colour it', ['good', 'poor', 'bad'].includes(seo.body?.score), seo.body?.score);
check('   and every finding says what to do about it', (seo.body?.findings || []).every((f) => f.what && f.fix));
check('   and the report is kept for the panel', Boolean((await call('GET', '/api/state')).body?.seo));

const ticked = await call('POST', '/api/tick');
check('"do one job now" works', ok(ticked) && 'worked' in ticked.body, JSON.stringify(ticked.body));

const loopOn = await call('POST', '/api/loop', { on: true });
check('"start loop" works', ok(loopOn) && loopOn.body.running === true, JSON.stringify(loopOn.body));
const loopOff = await call('POST', '/api/loop', { on: false });
check('"pause loop" works', ok(loopOff) && loopOff.body.running === false, JSON.stringify(loopOff.body));

// --- products, the Workshop and the Shopfront ------------------------------

console.log('\nWorkshop and Shopfront');
await drain(60);
const products = listProducts();
check('there is a product to inspect', products.length > 0, `${products.length}`);

if (products.length) {
  const detail = await call('GET', `/api/products/${products[0].id}`);
  check('GET /api/products/:id works', ok(detail) && detail.body.sku, JSON.stringify(detail.body).slice(0, 120));
  check('it comes with its assets', Array.isArray(detail.body?.assets));
  check('it comes with its listing copy', 'listing' in (detail.body || {}));

  const assets = await call('GET', `/api/assets/${products[0].id}`);
  check('GET /api/assets/:id works', ok(assets) && Array.isArray(assets.body.assets));

  // "send to etsy" — after deleting a draft by hand, or a held listing, or a
  // rebuild. With Etsy not connected it should still requeue rather than error.
  const relisted = await call('POST', `/api/products/${products[0].id}/relist`);
  check('"send to etsy" works', ok(relisted) && relisted.body.queued === true, JSON.stringify(relisted.body));
  check(
    '   and it forgets the old listing id so nothing points at a listing that is gone',
    !one('SELECT etsy_listing_id FROM listings WHERE product_id = ?', products[0].id)?.etsy_listing_id
  );
  const relistNothing = await call('POST', '/api/products/prod_nope/relist');
  check('re-listing something that does not exist is refused', relistNothing.status === 400, `status ${relistNothing.status}`);

  const rebuilt = await call('POST', `/api/products/${products[0].id}/rebuild`);
  check('"rebuild" works', ok(rebuilt), JSON.stringify(rebuilt.body).slice(0, 160));

  // A 1x1 transparent PNG is enough to prove the round trip.
  const dot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const mockups = await call('POST', `/api/products/${products[0].id}/mockups`, {
    images: [{ name: 'audit-hero', dataUrl: dot }],
  });
  check('"turn the images into PNGs" works', ok(mockups) && mockups.body.saved?.length === 1, JSON.stringify(mockups.body));

  const junkImage = await call('POST', `/api/products/${products[0].id}/mockups`, { images: [{ name: '', dataUrl: '' }] });
  check('a junk image is skipped rather than written', ok(junkImage) && junkImage.body.saved?.length === 0);
}

const noProduct = await call('GET', '/api/products/prod_nope');
check('an unknown product is a 404, not a crash', noProduct.status === 404, `status ${noProduct.status}`);

// --- the Ledger ------------------------------------------------------------

console.log('\nLedger');
const sale = await call('POST', '/api/sales', { sku: 'HV-0001', amount: 4.99, source: 'audit' });
check('"record it" works', ok(sale) && sale.body.id, JSON.stringify(sale.body));
const badSale = await call('POST', '/api/sales', { sku: 'HV-0001', amount: 'lots' });
check('a sale with no number is refused', badSale.status === 400, `status ${badSale.status}`);
const negativeSale = await call('POST', '/api/sales', { sku: 'HV-0001', amount: -5 });
check('a negative sale is refused', negativeSale.status === 400, `status ${negativeSale.status}`);

const listing = one('SELECT * FROM listings LIMIT 1');
if (listing) {
  const linked = await call('POST', `/api/listings/${listing.id}/url`, {
    url: 'https://www.etsy.com/listing/1234567890/some-planner',
  });
  check('pasting an Etsy URL back works', ok(linked) && linked.body.etsyListingId === '1234567890', JSON.stringify(linked.body));
  const junkUrl = await call('POST', `/api/listings/${listing.id}/url`, { url: 'https://example.com' });
  check('a URL that is not an Etsy listing is refused', junkUrl.status === 400, `status ${junkUrl.status}`);
}

// --- the harbour -----------------------------------------------------------

console.log('\nThe Harbour');
const harvest = await call('POST', '/api/ventures/harvest', { count: 3, perPhrase: 2 });
check('"go and listen now" works', ok(harvest) && harvest.body.jobId, JSON.stringify(harvest.body));

// Give the Prospector something to work with that does not need the network.
const signalsBefore = count('SELECT COUNT(*) FROM signals');
saveSignals([
  {
    source: 'audit',
    externalId: `audit-${Date.now()}`,
    url: 'https://example.com/thread/1',
    title: 'I wish there was a tool that tracked my invoices',
    text: 'We still use a spreadsheet for this and it is a nightmare every month.',
    author: 'someone',
    score: 40,
    comments: 12,
    phrase: 'i wish there was',
    channel: 'audit',
    postedAt: now(),
  },
]);
check('signals can be stored for the Prospector', count('SELECT COUNT(*) FROM signals') > signalsBefore);

// A source that hands back a half-filled signal must not take the harvest down
// with it — one bad row from a forum feed should cost one row, not the run.
let survivedJunk = true;
try {
  saveSignals([{ source: 'audit', title: 'no external id at all' }]);
} catch (err) {
  survivedJunk = false;
  check('a malformed signal does not crash the harvest', false, err.message);
}
if (survivedJunk) check('a malformed signal does not crash the harvest', true);

let venture = one('SELECT * FROM ventures ORDER BY created_at DESC LIMIT 1');
if (!venture) {
  createVenture({
    name: 'Audit Venture',
    oneLiner: 'A thing people asked for.',
    problem: 'Invoices are tracked in a spreadsheet and it breaks every month.',
    audience: 'freelancers',
    solution: 'A small tracker with reminders.',
    monetisation: 'one-off £19',
    evidence: [{ url: 'https://example.com/thread/1', quote: 'I wish there was a tool that tracked my invoices' }],
  });
  venture = one('SELECT * FROM ventures ORDER BY created_at DESC LIMIT 1');
}
check('there is a venture on the shortlist', Boolean(venture));

if (venture) {
  const revenue = await call('POST', `/api/ventures/${venture.id}/revenue`, { amount: 12, kind: 'one-off' });
  check('recording venture revenue works', ok(revenue), JSON.stringify(revenue.body));
  const badRevenue = await call('POST', `/api/ventures/${venture.id}/revenue`, { amount: 0 });
  check('zero revenue is refused', badRevenue.status === 400, `status ${badRevenue.status}`);

  const decided = await call('POST', `/api/ventures/${venture.id}/decide`, { decision: 'approved', note: 'audit' });
  check('approving a venture works', ok(decided), JSON.stringify(decided.body).slice(0, 120));
}

const campaign = one('SELECT * FROM marketing LIMIT 1');
if (campaign) {
  const status = await call('POST', `/api/campaigns/${campaign.id}/status`, { status: 'approved' });
  check('changing a campaign status works', ok(status) && status.body.status === 'approved');
}
const badStatus = await call('POST', '/api/campaigns/camp_nope/status', { status: 'exploded' });
check('an unknown campaign status is refused', badStatus.status === 400, `status ${badStatus.status}`);

// --- static hosting and the rails on it ------------------------------------

console.log('\nStatic files and their rails');
const page = await call('GET', '/');
check('the dashboard page is served', page.status === 200 && String(page.body).includes('<canvas'));
for (const asset of ['/js/main.js', '/js/panels.js', '/js/map.js', '/js/api.js', '/css/app.css']) {
  const res = await call('GET', asset);
  check(`${asset} is served`, res.status === 200, `status ${res.status}`);
}

// The dashboard falls back to index.html for unknown paths, so "did it 404" is
// the wrong question. The one that matters is whether the file on disk leaked.
for (const attempt of ['/../package.json', '/out/../package.json', '/out/../../.env', '/%2e%2e/package.json']) {
  const res = await fetch(base + attempt);
  const text = res.status === 200 ? await res.text() : '';
  check(
    `${attempt} does not hand back a file from outside`,
    !text.includes('"dependencies"') && !text.includes('ETSY_KEYSTRING'),
    `status ${res.status}`
  );
}
// "Open the folder" points at a directory, and the static handler only served
// files — so the one button that reaches your finished products 404'd.
if (products.length && products[0].dir) {
  const folder = await call('GET', `/out/${products[0].dir}/`);
  check('a product folder opens instead of 404ing', folder.status === 200, `status ${folder.status}`);
  check('   and lists the files with download links', String(folder.body).includes('download'));
  check('   including the PDF the buyer gets', /\.pdf/i.test(String(folder.body)));
}

const missing = await call('GET', '/out/nothing-here.pdf');
check('a missing generated file is a 404', missing.status === 404, `status ${missing.status}`);

// --- how it behaves when misused -------------------------------------------

console.log('\nBad input');
const wrongMethod = await call('GET', '/api/tick');
check('GET on a POST route does not 500', wrongMethod.status !== 500, `status ${wrongMethod.status}`);
const brokenJson = await fetch(`${base}/api/teach`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json',
});
check('malformed JSON is refused, not fatal', brokenJson.status >= 400 && brokenJson.status < 500, `status ${brokenJson.status}`);
const unknownRoute = await call('GET', '/api/does-not-exist');
check('an unknown API path does not 500', unknownRoute.status !== 500, `status ${unknownRoute.status}`);

// --- done ------------------------------------------------------------------

stopLoop();
server.close();

console.log(
  failures
    ? `\n\x1b[31m${checks - failures}/${checks} passed — ${failures} problem(s)\x1b[0m\n`
    : `\n\x1b[32m${checks}/${checks} checks passed\x1b[0m\n`
);
if (failures) {
  console.log('Problems:\n' + problems.map((p) => `  - ${p}`).join('\n') + '\n');
}
process.exit(failures ? 1 : 0);
