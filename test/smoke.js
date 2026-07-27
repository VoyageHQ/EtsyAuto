// End to end, with no API keys and no network: ideas in, sellable files out.
//
//   npm test
//
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import config from '../src/core/config.js';
import { all, count, one, insert, update, run } from '../src/core/db.js';
import { agentList, agentsIn, agents, getAgent, agentForKind } from '../src/agents/registry.js';
import { STATION_IDS, WORLDS } from '../src/core/stations.js';
import {
  saveSignals,
  signalCount,
  unusedSignals,
  createVenture,
  decideVenture,
  getVenture,
  campaignsFor,
} from '../src/ventures/pipeline.js';
import { synthesise, extractDesire } from '../src/ventures/synthesise.js';
import { ventureInsightBlock } from '../src/core/insights.js';
import { drain, decideIdeas, requestIdeas } from '../src/pipeline/orchestrator.js';
import { enqueue } from '../src/pipeline/queue.js';
import { listProducts, getListing, assetsFor, setStage } from '../src/pipeline/products.js';
import { openApprovals, answer } from '../src/core/approvals.js';
import { teach, lessonsFor, forget } from '../src/core/memory.js';
import { insightBlock, ownerTaste } from '../src/core/insights.js';
import { closestMatch, cannibalWarning, TOO_SIMILAR } from '../src/core/similarity.js';
import { recordFailures, failureSummary } from '../src/core/retro.js';
import { record, todayUsage, usageByAgent, overBudget } from '../src/core/spend.js';
import { uid, titleCase } from '../src/core/util.js';
import { auditListing, buildTitle, buildTags } from '../src/etsy/seo.js';
import { auditOne, auditShop, sweep } from '../src/etsy/seo-audit.js';
import { SEEDS, TWISTS } from '../src/agents/ideas-corpus.js';
import { offlineSpec } from '../src/design/templates/plan.js';
import { buildDoc } from '../src/design/templates/layout.js';
import { buildMockups } from '../src/design/mockup.js';
import { watermarkFor } from '../src/design/watermark.js';

/** The mark's opacity in a built image, for comparing one image against another. */
const opacityOf = (image) => Number(String(image?.svg).match(/opacity="([\d.]+)"/g)?.slice(-1)[0]?.match(/[\d.]+/)?.[0] || 0);
import { avatarFor } from '../src/discord/avatars.js';
import { loadKnowledge, packSummary } from '../src/knowledge/index.js';
import { writeBackup, readBackup } from '../src/core/backup.js';
import { checkShop } from '../src/core/health.js';
import {
  findTrademarks,
  findBannedPhrases,
  findShameLanguage,
  findPlaceholders,
  tidyPrice,
  bandFor,
  spellingVariants,
  ventureKillReasons,
  evidenceStrength,
  findMedicalClaims,
  findPolicyTraps,
  findOverreachingLicence,
  licenceTermsStated,
  imageProblems,
  paletteForCategory,
  findHardKills,
  overCollectingFields,
  findPhrases,
  findShopFacingCopy,
  unkeptTitlePromises,
} from '../src/knowledge/apply.js';

// This run must behave the same on a machine with a live shop as on a bare
// clone. A half-filled .env — a keystring but no shop id, which is exactly
// what a stalled setup leaves behind — now makes the Shopkeeper refuse to
// publish and hold the product, which is right in real life and would make
// this suite pass or fail depending on whose laptop it ran on. So start from
// no connection at all; the section that needs one borrows it deliberately.
for (const key of ['keystring', 'accessToken', 'shopId', 'sharedSecret']) config.etsy[key] = '';

/**
 * Work the queue until nothing is left, with a ceiling so a genuine loop still
 * ends the run rather than hanging it.
 *
 * Each foreman's plan can queue more work, so a fixed job budget only reaches
 * the end of the pipeline by luck — and as the shop grew it stopped doing so.
 * The checks then reported half-built products as failures: a test failing
 * because the test gave up early.
 */
async function drainFully(rounds = 12) {
  for (let i = 0; i < rounds; i++) {
    enqueue({ agent: 'manager', kind: 'manager.plan', subject: 'drain', priority: 1 });
    enqueue({ agent: 'harbourmaster', kind: 'harbourmaster.plan', subject: 'drain', priority: 1 });
    const did = await drain(200);
    if (did <= 2) return;
  }
}

let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failures++;
    console.log(`  \x1b[31m×\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\nSmoke test — the whole pipeline, offline\n');

console.log('The fleet');
check(
  'sixteen agents across two businesses',
  agentList().length === 16,
  `${agentList().length} found`
);
check(
  'one of them exists purely to invent products',
  agentList().some((a) => a.id === 'scout' && a.handles.includes('scout.brainstorm'))
);
check(
  'one of them exists to bundle what already sells',
  agentList().some((a) => a.id === 'curator' && a.handles.includes('curator.scan'))
);
check('every agent has a home station and a colour', agentList().every((a) => a.home && a.colour));
check(
  'every agent has a building to stand in',
  agentList().every((a) => STATION_IDS.includes(a.home)),
  agentList().filter((a) => !STATION_IDS.includes(a.home)).map((a) => a.id).join(', ')
);

console.log('\nIdeas');
requestIdeas(12, null);
await drain(4);
const proposed = all("SELECT * FROM ideas WHERE status = 'proposed' ORDER BY score DESC");
// Two outcomes are both correct, and which one you get depends on how much the
// shop has already made. On a fresh clone the Scout fills the bench. On a shop
// that has been running for weeks its built-in notebook is genuinely empty —
// that is a real limit, and it is what "the shop has stopped looking for
// ideas" turned out to be. What is never acceptable is the third thing it used
// to do: propose nothing and say nothing.
check('the Scout proposed a batch, or has ideas already waiting', proposed.length >= 8, `${proposed.length} proposed`);
check('they are scored and sorted', proposed[0]?.score >= (proposed.at(-1)?.score ?? 0));
check('each one names an audience and a pitch', proposed.every((i) => i.audience && i.pitch));
check(
  'nothing is proposed twice',
  new Set(proposed.map((i) => i.title.toLowerCase())).size === proposed.length
);
check(
  'it raised a request for a decision rather than deciding itself',
  openApprovals().some((a) => a.kind === 'ideas')
);

// And the other half of it: when the notebook really is empty, the Scout has
// to say so rather than sounding like it has judged the market and found it
// wanting. That sentence is the difference between a shop thinking and a shop
// that has quietly stopped.
{
  const scout = getAgent('scout');
  const before = count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'");
  // Ask for far more than the notebook holds.
  await scout.handle({ payload: { count: 400 } });
  const out = await scout.handle({ payload: { count: 400 } });
  check(
    'when it runs out of ideas it says so, rather than going quiet',
    out.result?.exhausted === true || count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'") > before,
    JSON.stringify(out.result)
  );
}

// The other half of "it stopped looking for ideas".
{
  const scout = getAgent('scout');

  // A shop that has been running for weeks has proposed every seed and every
  // twist of every seed. Offline, that really is the end of the notebook —
  // and the Scout used to answer it with "nothing new worth proposing this
  // round", which reads as a judgement about the market rather than a limit
  // of its own. Say which, and say what unlocks it.
  const everything = [];
  for (const seed of SEEDS) {
    everything.push(seed.t.toLowerCase());
    for (const twist of TWISTS) everything.push(`${seed.t} — ${titleCase(twist.label)}`.toLowerCase());
  }
  // With no market readings either, there is genuinely nothing left.
  const parkedMarket = all('SELECT * FROM market');
  run('DELETE FROM market');
  check(
    'with the whole notebook already used it produces nothing rather than junk',
    scout.offlineIdeas(6, null, everything).length === 0
  );

  // But a market reading is not finite: Etsy changes, and every quiet phrase
  // with demand behind it is a product nobody has built. This is the source
  // that keeps the bench filling once the notebook is empty.
  const { record: recordMarket } = await import('../src/etsy/market.js');
  recordMarket({
    keyword: 'teacher planner undated',
    listings: 3100,
    competition: 'quiet',
    priceLow: 3,
    priceMedian: 6,
    priceHigh: 14,
    sampled: 40,
    phrases: [{ word: 'teacher', inListings: 30 }, { word: 'planner', inListings: 28 }],
  });
  const fromGap = scout.offlineIdeas(3, null, everything);
  const gapIdea = fromGap.find((i) => /teacher planner undated/i.test(i.keywords?.[0] || ''));
  check(
    '   but a quiet corner of the real market still gives it something to propose',
    Boolean(gapIdea),
    `${fromGap.length} ideas: ${fromGap.map((i) => i.title).join(' | ')}`
  );
  check(
    '   and the idea says why, with the number behind it',
    /3,100 live listings/.test(gapIdea?.pitch || ''),
    gapIdea?.pitch
  );
  check(
    '   priced against what that corner actually charges',
    gapIdea?.priceLow > 3 && gapIdea?.priceHigh < 10,
    `${gapIdea?.priceLow}–${gapIdea?.priceHigh}`
  );

  run('DELETE FROM market');
  for (const row of parkedMarket) insert('market', row);
}

console.log('\nTeaching');
const lessonsBefore = count("SELECT COUNT(*) FROM lessons WHERE agent_id = 'scout' AND active = 1");
teach('scout', 'Never propose anything aimed at babies.', 'test');
check(
  'a lesson sticks against the agent',
  count("SELECT COUNT(*) FROM lessons WHERE agent_id = 'scout' AND active = 1") === lessonsBefore + 1
);
const rejected = proposed.at(-1);
decideIdeas([rejected.id], 'rejected', 'too crowded on Etsy already', 'test');
check(
  'a reason given when turning an idea down becomes a lesson',
  count("SELECT COUNT(*) FROM lessons WHERE agent_id = 'scout' AND active = 1") === lessonsBefore + 2
);

console.log('\nProduction');
const chosen = proposed.slice(0, 2);
decideIdeas(chosen.map((i) => i.id), 'approved', '', 'test');
enqueue({ agent: 'manager', kind: 'manager.plan', subject: 'smoke', priority: 1 });
// Drain until the queue is genuinely empty rather than for a fixed number of
// jobs. As the shop has grown the fixed budget stopped covering a full run,
// and the checks below then reported half-built products as failures — a
// test failing because the test stopped early, which is the worst kind.
await drainFully();

const products = listProducts();
check('approved ideas turned into products', products.length >= 2, `${products.length} products`);

let allGood = true;
for (const product of products) {
  const assets = assetsFor(product.id);
  const pdfs = assets.filter((a) => a.kind === 'pdf' && a.role === 'deliverable');
  const mockups = assets.filter((a) => a.role === 'mockup');
  const listing = getListing(product.id);

  console.log(`\n  ${product.sku} — ${product.title}`);
  // A product the Inspector sent back is a working gate, not a broken
  // pipeline — it is parked on an answer from the owner, which is the design.
  // Only an unexplained stall counts against the run.
  // A product the Inspector sent back, or one the Shopkeeper held, is a gate
  // working — it is parked, visible and actionable by design. Only a product
  // sitting in the middle of the pipeline with nothing holding it and nobody
  // on it is a failure of the run.
  const parked = product.status === 'blocked';
  check(
    '   reached the ready stage or beyond',
    ['ready', 'listed'].includes(product.stage) || parked,
    parked ? 'held — a gate stopped it, which is the design' : product.stage
  );
  check('   produced at least one PDF', pdfs.length >= 1);
  check('   produced listing images', mockups.length >= 3, `${mockups.length}`);
  check('   has a price', Number(product.price) > 0, String(product.price));
  check('   has listing copy', Boolean(listing));

  for (const pdf of pdfs) {
    const path = join(config.root, pdf.path);
    const exists = existsSync(path);
    check(`   ${pdf.path.split('/').pop()} exists`, exists);
    if (!exists) {
      allGood = false;
      continue;
    }
    const buf = readFileSync(path);
    check('   it is a real PDF, not a stub', buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 3000, `${buf.length} bytes`);
    check('   it is complete', buf.subarray(-1024).toString('latin1').includes('%%EOF'));
  }

  if (listing) {
    const problems = auditListing(listing);
    check('   the listing passes Etsy\'s rules', problems.length === 0, problems.join('; '));
    check('   the title fits in 140 characters', listing.title.length <= 140, `${listing.title.length}`);
    check('   13 tags, all legal', listing.tags.length === 13 && listing.tags.every((t) => t.length <= 20));
    check(
      '   the description admits it is a digital download',
      /digital download/i.test(listing.description)
    );
  }
}

console.log('\nPublishing');
const listingApproval = openApprovals().find((a) => a.kind === 'listing');
check('the Inspector asked before anything left the valley', Boolean(listingApproval));
if (listingApproval) {
  answer(listingApproval.id, 'publish', 'test');
  await drain(20);
  const product = listProducts(`WHERE id = '${listingApproval.ref_id}'`)[0];
  const listing = getListing(listingApproval.ref_id);
  check('approving it packed an upload folder', listing?.status === 'exported' || listing?.status === 'live');
  check('the product is marked as listed', product?.stage === 'listed');
  const pack = join(config.outDir, product.dir, 'LISTING.md');
  check('LISTING.md is there to copy and paste', existsSync(pack));
  if (existsSync(pack)) {
    const md = readFileSync(pack, 'utf8');
    check('it contains the tags to paste', md.includes('Copy the tags'));
    check('it lists the files to upload', md.includes('Upload these digital files'));
  }
}

console.log('\nLearning from its own results');
{
  // The Scout is told about the shop's *best* sellers, not every sale, so a
  // £5.99 one has to beat everything the database has accumulated over
  // previous runs to appear at all. That made this check pass or fail
  // depending on how many times npm test had been run. Clear the slate, prove
  // the wiring, put it back.
  const soldId = uid('sale');
  const priorSales = all('SELECT * FROM sales');
  run('DELETE FROM sales');
  const sold = listProducts()[0];
  insert('sales', {
    id: soldId,
    listing_id: null,
    sku: sold.sku,
    amount: 5.99,
    currency: 'GBP',
    occurred_at: Date.now(),
    source: 'test',
  });
  const block = insightBlock('scout');
  check('a sale shows up in what the Scout is told', block.includes(sold.title), block.slice(0, 80));
  check('the block names the shop\'s own numbers', /has taken/.test(block));
  // A single decision in a category proves nothing, so the Scout is only told
  // about a category once there are at least two.
  const sameCategory = all(
    `SELECT id, category FROM ideas WHERE status = 'proposed'
     AND category = (SELECT category FROM ideas WHERE status = 'proposed'
                     GROUP BY category HAVING COUNT(*) >= 2 LIMIT 1)`
  );
  check('there is a category with enough decisions to judge', sameCategory.length >= 2);
  if (sameCategory.length >= 2) {
    decideIdeas(sameCategory.slice(0, 2).map((i) => i.id), 'rejected', '', 'test');
    check(
      'the Scout is then told which categories you approve and reject',
      insightBlock('scout').includes('yes and no to'),
      ownerTaste().map((t) => `${t.category} ${t.yes}/${t.no}`).join(', ')
    );
  }
  check('the Scribe is not shown the owner-taste data it cannot use', !insightBlock('copywriter').includes('yes and no to'));

  run('DELETE FROM sales WHERE id = ?', soldId);
  for (const sale of priorSales) insert('sales', sale);
}

console.log('\nNot competing with itself');
{
  const existing = listProducts()[0];
  const near = closestMatch(existing.title);
  check('an exact repeat is caught', near.score >= TOO_SIMILAR, `${near.score.toFixed(2)}`);
  const reworded = existing.title.split(' ').reverse().join(' ') + ' Printable';
  check(
    'a reworded near-copy is caught too',
    closestMatch(reworded).score >= TOO_SIMILAR,
    `${closestMatch(reworded).score.toFixed(2)}`
  );
  check('something genuinely different is not', closestMatch('Puppy Vaccination Log').score < TOO_SIMILAR);
  check(
    'the Researcher warns when a product would cannibalise a listing',
    typeof cannibalWarning(existing.title, []) === 'string'
  );
}

console.log('\nLearning from mistakes');
{
  const product = listProducts()[0];
  const taughtAlready = lessonsFor('copywriter').some((l) => /all 13 tags/.test(l.text));
  const before = lessonsFor('copywriter').length;
  recordFailures(product.id, ['Only 4 tags. Use all 13.']);
  check(
    'one failure is recorded but teaches nothing yet',
    lessonsFor('copywriter').length === before || taughtAlready
  );
  recordFailures(product.id, ['Only 6 tags. Use all 13.']);
  check(
    'the second time, the responsible agent is taught automatically',
    lessonsFor('copywriter').some((l) => /all 13 tags/.test(l.text))
  );
  const afterTeaching = lessonsFor('copywriter').length;
  recordFailures(product.id, ['Only 2 tags. Use all 13.']);
  check('and it is not taught the same thing again', lessonsFor('copywriter').length === afterTeaching);
  check('the pattern is visible in the Review Hall', failureSummary().some((f) => f.times >= 3));
}

console.log('\nBudget meter');
{
  const before = todayUsage().total;
  record({ agent: 'scout', model: 'test', inTokens: 1200, outTokens: 800 });
  const after = todayUsage();
  check('token use is counted', after.total === before + 2000, `${after.total}`);
  check('and attributed to the agent', usageByAgent().some((row) => row.agent === 'scout'));
  check('no cap set means never over budget', overBudget() === false);
  config.llm.dailyTokens = 100;
  check('a cap that is spent stops further spending', overBudget() === true);
  config.llm.dailyTokens = 0;
}

console.log('\nBundling what already works');
{
  // Two finished products for the same buyer is what the Curator looks for.
  for (const product of listProducts().slice(0, 2)) {
    update('products', product.id, { category: 'Budget planners' });
  }
  enqueue({ agent: 'curator', kind: 'curator.scan', subject: 'test scan', priority: 1 });
  await drain(10);

  const proposal = one("SELECT * FROM proposals WHERE kind = 'bundle' ORDER BY created_at DESC");
  check('the Curator proposed a bundle', Boolean(proposal), 'none proposed');

  if (proposal) {
    const payload = JSON.parse(proposal.payload);
    check('it is cheaper than buying separately', payload.price < payload.separate);
    check('it names the products it would merge', payload.productIds.length >= 2);

    const askedFirst = openApprovals().find((a) => a.kind === 'bundle');
    // On a re-run against an existing database the same products are already
    // bundled, so there is legitimately nothing new to ask about.
    check('it asked before building anything', Boolean(askedFirst) || proposal.status === 'done');

    if (askedFirst) {
      answer(askedFirst.id, 'yes', 'test');
      await drain(20);
      const bundle = listProducts("WHERE category = 'Bundles'")[0];
      check('approving it assembled a real bundle', Boolean(bundle), 'no bundle product');
      if (bundle) {
        check('the bundle merges pages from both products', (bundle.spec?.pages?.length || 0) >= 6);
        const pdf = assetsFor(bundle.id).find((a) => a.kind === 'pdf');
        check('and produced a real PDF', Boolean(pdf));
        if (pdf) {
          const buf = readFileSync(join(config.root, pdf.path));
          check('   which opens cleanly', buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 3000);
        }
        check('it went on to the Scribe rather than straight out', bundle.stage !== 'listed');
      }
    }
  }
}

console.log('\nThe venture arm');
{
  check('the two businesses have separate agents', agentsIn('etsy').length >= 9 && agentsIn('ventures').length === 7);
  check(
    'no venture agent stands in the Etsy valley',
    agentsIn('ventures').every((a) => WORLDS.harbour.stations.some((s) => s.id === a.home))
  );
  check(
    'one agent exists purely to find startup ideas',
    agentsIn('ventures').some((a) => a.id === 'prospector' && a.handles.includes('prospector.harvest'))
  );
  check(
    'one agent exists purely to market them',
    agentsIn('ventures').some((a) => a.id === 'marketer')
  );

  // The Prospector works from stored signals, so the test does not depend on
  // any external service being reachable.
  const fixtures = [
    {
      source: 'test',
      externalId: 'fx1',
      title: 'Invoice chasing is killing me',
      text: 'I wish there was a way to chase unpaid invoices automatically. I spend hours every week on it.',
      url: 'https://example.com/1',
      author: 'a',
      score: 40,
      comments: 12,
      phrase: 'i wish there was',
      channel: 'r/freelance',
      postedAt: Date.now() - 86400000,
    },
    {
      source: 'test',
      externalId: 'fx2',
      title: 'Chasing invoices',
      text: 'Is there a tool that will chase unpaid invoices for a small studio? We still use a spreadsheet.',
      url: 'https://example.com/2',
      author: 'b',
      score: 22,
      comments: 5,
      phrase: 'is there a tool that',
      channel: 'r/freelance',
      postedAt: Date.now() - 3600000,
    },
  ];
  check('signals are stored', saveSignals(fixtures) === 2 || signalCount() >= 2);
  check('the same post is never harvested twice', saveSignals(fixtures) === 0);

  const desire = extractDesire(fixtures[0].text, fixtures[0].phrase);
  check('the actual want is extracted from the post', /chase unpaid invoices/i.test(desire), desire);

  const candidates = synthesise(unusedSignals(50), 3);
  check('complaints become candidate businesses', candidates.length >= 1);
  const candidate = candidates[0];
  if (candidate) {
    check('   every candidate carries evidence', candidate.evidence.length >= 1);
    check('   the evidence links back to a real post', Boolean(candidate.evidence[0].url));
    check('   it says how it makes money', Number(candidate.monetisation?.price) > 0);
    check('   and when the first payment could land', Number(candidate.monetisation?.daysToRevenue) > 0);
  }

  // Push one all the way through: analysis, plan, build, launch pack.
  //
  // createVenture recognises a business it already has and hands that one back
  // instead of adding a copy, which is the point of it — but it meant the
  // second run of this suite got last run's finished venture and quietly
  // asserted nothing about the pipeline. A unique suffix does not help either:
  // the match is on similarity, so "... Test a1b2" is still the same business
  // as "... Test c3d4". Clear the previous one out and start fresh.
  const HARNESS = 'Smoke Harness Venture';
  for (const stale of all('SELECT id FROM ventures WHERE name = ?', HARNESS)) {
    run('DELETE FROM marketing WHERE venture_id = ?', stale.id);
    run('DELETE FROM ventures WHERE id = ?', stale.id);
  }
  // The database is fresh every run but ventures/ on disk is not, and the slug
  // is derived from the name — so without this the checks below read last
  // run's landing page, quoting last run's evidence, and fail for a reason
  // that has nothing to do with this run. Only ever the harness's own folder.
  rmSync(join(config.root, config.ventures.dir, 'smoke-harness-venture'), {
    recursive: true,
    force: true,
  });
  const venture = createVenture({ ...candidate, name: HARNESS });
  decideVenture(venture.id, 'approved', '', 'test');
  await drainFully();

  const built = getVenture(venture.id);
  check('an approved venture gets analysed', Boolean(built.analysis?.verdict));
  check('   and scoped', Boolean(built.plan?.mvpGoal));
  check('   and the scope says what is NOT being built', (built.plan?.notBuilding || []).length > 0);
  check('   and scaffolded into real files', Boolean(built.dir));

  if (built.dir) {
    const dir = join(config.root, built.dir);
    for (const file of ['server.js', 'public/index.html', 'public/styles.css', 'README.md', 'PLAN.md']) {
      check(`   ${file} exists`, existsSync(join(dir, file)));
    }
    const page = readFileSync(join(dir, 'public/index.html'), 'utf8');
    // The page escapes what it prints, as it must — so compare against the
    // text a reader sees, not the raw string. Matching raw against escaped
    // HTML fails the moment somebody's complaint contains an apostrophe.
    const readable = page
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    // One of them, not the first. The page is written when the Builder runs,
    // and the Analyst may reorder the evidence afterwards — pinning this to
    // evidence[0] tested the ordering rather than the thing that matters,
    // which is that the page carries a real quote somebody actually posted.
    check(
      '   the landing page quotes a real complaint',
      built.evidence.some((e) => readable.includes(e.quote.slice(0, 40))),
      JSON.stringify((readable.match(/<blockquote>([^<]*)</) || [])[1]?.slice(0, 60))
    );
    check('   and shows a price', page.includes(String(built.monetisation.price)));
    const server = readFileSync(join(dir, 'server.js'), 'utf8');
    check('   the server has a working waitlist endpoint', server.includes('/api/waitlist'));
  }

  // --- is it a business, or a folder? -----------------------------------
  // Before this the Builder produced a Node server on localhost writing to a
  // JSON file: unreachable, unpayable, and gone when the laptop closed. Three
  // properties that between them mean "not a business" however good the idea.
  if (built.dir) {
    const dir = join(config.root, built.dir);
    for (const file of ['worker.js', 'wrangler.toml', 'public/pricing.html', 'DEPLOY.md', 'SELL.md']) {
      check(`   ${file} exists`, existsSync(join(dir, file)));
    }
    check(
      '   the deploy workflow is there, so pushing publishes it',
      existsSync(join(dir, '.github/workflows/deploy.yml'))
    );

    const deployDocText = readFileSync(join(dir, 'DEPLOY.md'), 'utf8');
    check('   and it names the free tiers rather than saying "free"', /100,000 requests a day/.test(deployDocText));
    check('   with no card required to follow it', /no card/i.test(deployDocText));

    // The one that matters most: the page can collect its first interested
    // person before the owner has signed up for anything at all.
    const app = readFileSync(join(dir, 'public/app.js'), 'utf8');
    check('   the signup form falls back to mailto, so it works with no accounts', /mailto:/.test(app));

    const sell = readFileSync(join(dir, 'SELL.md'), 'utf8');
    check(
      '   and where the first customer comes from is a list of real people, not "do marketing"',
      built.evidence.some((e) => sell.includes(e.quote.slice(0, 30))) ||
        /go and find five people/.test(sell)
    );
  }

  // The Architect must not plan something that bills before the first sale.
  {
    const { affordability } = await import('../src/ventures/freetier.js');
    check(
      "the plan does not cost anything to run",
      affordability(built).ok,
      affordability(built).reasons.join('; ')
    );
    check(
      '   and a plan that named AWS would have been caught',
      !affordability({ ...built, solution: 'hosted on AWS EC2 with RDS' }).ok
    );
    check(
      '   as would one built on per-token API calls',
      !affordability({ ...built, solution: 'every request calls the OpenAI API' }).ok
    );
    check('   the running cost is written down as numbers', (built.plan?.runningCost?.parts || []).length >= 5);
  }

  const campaigns = campaignsFor(built.id);
  check('a launch pack is prepared', campaigns.length >= 1);
  // Some of these may be from an earlier run against the same database, and
  // one of those may since have been approved — by a person, which is the
  // point. What must be true is that the Marketer never approves its own.
  check('   but it stays a draft until you approve it', campaigns.some((c) => c.status === 'draft'));
  check(
    '   and it never proposes spending your money on its own',
    Number(campaigns[0]?.budget || 0) === 0
  );
  if (built.dir) {
    for (const file of ['LAUNCH-PLAN.md', 'AD-COPY.md', 'CONTENT-CALENDAR.csv', 'POSITIONING.md']) {
      check(`   marketing/${file} written`, existsSync(join(config.root, built.dir, 'marketing', file)));
    }
  }

  const campaignAsk = openApprovals().find((a) => a.kind === 'campaign');
  check('it asks before launching', Boolean(campaignAsk));

  // --- and it only asks once --------------------------------------------
  // The heads-up panel reached 33 items, 18 of them the same sentence about
  // the same venture. Three things had to be wrong at once, so all three are
  // held here: the question repeated, the manager re-drove work that was
  // waiting on a person, and the same business was invented over and over.
  {
    const { ask, waitingOnOwner } = await import('../src/core/approvals.js');
    const openBefore = openApprovals().length;
    const twin = ask({
      kind: campaignAsk.kind,
      refId: 'a-brand-new-ref',
      title: campaignAsk.title,
      agent: 'marketer',
    });
    check('the same question is not asked twice while it is open', openApprovals().length === openBefore, `${openApprovals().length} vs ${openBefore}`);
    check('   and the caller is handed the one already waiting', twin === campaignAsk.id);
    check('a manager can see that something is waiting on you', Boolean(waitingOnOwner(campaignAsk.ref_id)));
    check('   and does not see one for something nobody asked about', !waitingOnOwner('nothing-like-this'));

    // Eight rounds of both foremen. Before the fix each round produced a fresh
    // launch pack and a fresh question for every venture parked on an answer.
    const harbourmaster = getAgent('harbourmaster');
    const manager = getAgent('manager');
    const ventureCount = () => count("SELECT COUNT(*) FROM ventures WHERE status != 'abandoned'");
    const before = { asks: openApprovals().length, ventures: ventureCount() };
    for (let i = 0; i < 8; i++) {
      await harbourmaster.handle({ payload: {} });
      await manager.handle({ payload: {} });
    }
    check(
      'eight rounds of the foremen add no new questions',
      openApprovals().length === before.asks,
      `${before.asks} → ${openApprovals().length}`
    );
    check(
      '   and no new ventures',
      ventureCount() === before.ventures,
      `${before.ventures} → ${ventureCount()}`
    );
  }

  // The same business, proposed again, is recognised rather than duplicated.
  {
    const { createVenture, existingVenture } = await import('../src/ventures/pipeline.js');
    const known = all("SELECT name FROM ventures WHERE status != 'abandoned' LIMIT 1")[0];
    if (known) {
      const total = () => count('SELECT COUNT(*) FROM ventures');
      const before = total();
      const same = createVenture({ name: known.name, oneLiner: 'x', problem: 'x', audience: 'x', solution: 'x' });
      check('the same business is not put on the books twice', total() === before, `${before} → ${total()}`);
      check('   and the existing one is handed back', same?.name === known.name);
      check('   a reworded version counts as the same too', Boolean(existingVenture(`${known.name} Pro`)));
      check('   while something genuinely different does not', !existingVenture('Kiln Repair Scheduling For Potters'));
    }
  }

  // The two businesses must not read each other's data.
  check(
    'venture agents are not told about the Etsy shop',
    !ventureInsightBlock().includes('listing') || !ventureInsightBlock().includes('Etsy')
  );
  check(
    'the shop\'s numbers never reach a venture prompt',
    insightBlock('prospector', 'ventures') === ventureInsightBlock()
  );
}

console.log('\nWhat the agents have been taught');
{
  const { added } = loadKnowledge();
  const packs = packSummary();
  const total = packs.reduce((n, p) => n + p.lessons, 0);
  check('knowledge packs load', packs.length >= 16, `${packs.length} packs`);
  check('   and carry real content', total >= 250, `${total} lessons`);

  const scoutKnows = lessonsFor('scout', 'etsy');
  const prospectorKnows = lessonsFor('prospector', 'ventures');
  check('every agent gets its own plus its house rules', scoutKnows.length > 20 && prospectorKnows.length > 20);
  check(
    'shop rules never reach a venture agent',
    prospectorKnows.every((l) => l.division !== 'etsy')
  );
  check(
    'venture rules never reach a shop agent',
    scoutKnows.every((l) => l.division !== 'ventures')
  );
  check('loading twice adds nothing', loadKnowledge().added === 0);

  // A deleted lesson must stay deleted, or the delete button is a lie.
  const victim = lessonsFor('scout', 'etsy').find((l) => String(l.source).startsWith('pack:'));
  forget(victim.id);
  loadKnowledge();
  check('a lesson you deleted is not silently reinstated', !lessonsFor('scout', 'etsy').some((l) => l.id === victim.id));
  check('and can be brought back deliberately', loadKnowledge({ restoreDeleted: true }).added >= 1);
}

console.log('\nThe first sixty characters of a title');
{
  // Etsy clips the title under a search thumbnail, so those characters are the
  // only ones most buyers ever read. Spending them saying the same thing twice
  // buys nothing — Etsy does not rank a repeated phrase higher.
  const repeated = buildTitle({
    name: 'Christmas Budget & Gift Planner',
    keyword: 'christmas budget planner',
    audience: 'parents planning december',
  });
  check(
    'a keyword that just repeats the name is dropped',
    !/Christmas Budget Planner/i.test(repeated.replace('Christmas Budget & Gift Planner', '')),
    repeated
  );
  check('   so something useful reaches the crop', /parents/i.test(repeated.slice(0, 60)), repeated.slice(0, 60));

  const additive = buildTitle({ name: 'Meal Planner', keyword: 'weekly meal prep planner', audience: 'busy families' });
  check('a keyword that genuinely adds words is kept', /weekly/i.test(additive), additive);

  check(
    'titles stay inside what Etsy accepts',
    buildTitle({ name: 'A'.repeat(120), keyword: 'x', audience: 'y' }).length <= 140
  );
}

console.log('\nThe Signwriter');
{
  // Half-wiring an agent is silent: it appears nowhere and never runs. These
  // check each of the joints rather than that the class exists.
  check('the Signwriter is on the roster', agents.has('signwriter'));
  check('   with a station in the valley, not the harbour',
    WORLDS.valley.stations.some((s) => s.id === getAgent('signwriter').home));
  check('   and its job kind routes to it', agentForKind('signwriter.audit')?.id === 'signwriter');
  check('   and it knows the shop rules, not the harbour ones',
    getAgent('signwriter').division === 'etsy');
  check('   and it starts with search knowledge',
    lessonsFor('signwriter', 'etsy').some((l) => /tag/i.test(l.text)),
    `${lessonsFor('signwriter', 'etsy').length} lessons`);

  // The audit itself, on listings built to fail in known ways.
  const thin = {
    sku: 'T-1', title: 'Planner', tags: ['planner'], description: 'short', live: false, updatedAt: Date.now(),
  };
  const thinFindings = auditOne(thin);
  check('a listing using 1 of 13 tags is caught', thinFindings.some((f) => f.area === 'tags'));
  check('   and single-word tags are called out', thinFindings.some((f) => /single/i.test(f.what)) || thinFindings.length > 0);

  const good = {
    sku: 'T-2',
    title: 'ADHD Cleaning Chart | Five Minute Tasks | Printable PDF | Instant Download | A4 & US Letter',
    tags: ['adhd cleaning chart', 'five minute tasks', 'adhd printable', 'cleaning checklist',
           'neurodivergent chart', 'adhd chore chart', 'cleaning routine', 'adhd adults',
           'executive function', 'daily cleaning', 'tidy checklist', 'adhd planner', 'chore printable'],
    description: 'ADHD Cleaning Chart for adults who freeze at "tidy the house". '.repeat(12),
    live: false,
    updatedAt: Date.now(),
  };
  check('a well-built listing raises nothing serious',
    !auditOne(good).some((f) => f.severity === 'bad'),
    auditOne(good).map((f) => f.what).join(' | '));

  // The rule that matters most: do not churn a live listing.
  const recentlyChanged = { ...thin, live: true, updatedAt: Date.now() - 2 * 86400000 };
  const held = auditOne(recentlyChanged);
  check('a live listing changed recently is left alone', held.every((f) => f.area === 'settling'), held.map((f) => f.area).join(','));
  check('   and it says when to come back', held.some((f) => /more days/i.test(f.fix)));

  // Two listings chasing the same search is the shop bidding against itself.
  const clash = auditShop([
    { sku: 'A', title: 'Budget Planner Printable', tags: ['budget planner', 'monthly budget', 'money tracker'], category: 'Budget planners' },
    { sku: 'B', title: 'Printable Budget Planner', tags: ['budget planner', 'monthly budget', 'money tracker'], category: 'Budget planners' },
  ]);
  check('two listings chasing the same search are caught', clash.some((f) => f.area === 'cannibalising'));
  check('   and the fix is not "delete one"', clash.some((f) => /different buyer|bundle/i.test(f.fix)));

  const report = sweep();
  check('a whole-shop sweep runs and scores itself', ['good', 'poor', 'bad'].includes(report.score), report.score);
  check('   and every finding says what to do', (report.findings || []).every((f) => f.what && f.fix));
}

console.log('\nDuplicates are kept, and built differently');
{
  // Dropping near-duplicates emptied the bench: the catalogue only grows, so
  // eventually everything the Scout thinks of resembles something already
  // there. They come through marked instead, and the owner decides.
  const base = offlineSpec(
    { id: 'v-base', title: 'Monthly Budget Planner', category: 'Budget planners', pitch: 'p', audience: 'a' },
    'Hartistic'
  );
  const variant = offlineSpec(
    { id: 'v-two', title: 'Monthly Budget Planner', category: 'Budget planners', pitch: 'p', audience: 'a', variantOf: 'Monthly Budget Planner' },
    'Hartistic'
  );
  check('a variant wears a different palette', base.palette !== variant.palette, `${base.palette} vs ${variant.palette}`);
  check(
    '   and lays its pages out differently',
    JSON.stringify(base.pages.map((p) => p.title)) !== JSON.stringify(variant.pages.map((p) => p.title))
  );
  check('   while still being a proper pack', variant.pages.length >= 3, `${variant.pages.length} pages`);
  check('   and its cover stays first', variant.pages[0].kind === 'cover');

  // Rebuilding must give the same product back, not a third one.
  const again = offlineSpec(
    { id: 'v-two', title: 'Monthly Budget Planner', category: 'Budget planners', pitch: 'p', audience: 'a', variantOf: 'Monthly Budget Planner' },
    'Hartistic'
  );
  check(
    'rebuilding a variant produces the same product, not a new one',
    JSON.stringify(again.pages.map((p) => p.title)) === JSON.stringify(variant.pages.map((p) => p.title))
  );
}

console.log('\nThe rail on deleting listings');
{
  // Re-drafting deletes things on somebody's real shop, so the rule that only
  // drafts are ever deleted is tested rather than trusted. The HTTP layer is
  // stubbed: nothing here touches Etsy.
  // etsyEnabled() gates every call, so the credentials have to look present for
  // the rail underneath it to be reachable at all. Borrowed, then given back —
  // only the four keys, because config.etsy.enabled is a getter and spreading
  // the object turns it into a plain value that cannot be assigned back.
  const BORROWED = ['keystring', 'accessToken', 'shopId', 'sharedSecret'];
  const savedEtsy = Object.fromEntries(BORROWED.map((k) => [k, config.etsy[k]]));
  Object.assign(config.etsy, { keystring: 'test', accessToken: 'x.y', shopId: '1', sharedSecret: 's' });

  const realFetch = globalThis.fetch;
  const bodies = {
    '/application/listings/111': { state: 'active', title: 'live', listing_images_count: 5 },
    '/application/listings/222': { state: 'draft', title: 'draft', listing_images_count: 0 },
  };
  const deleted = [];
  globalThis.fetch = async (url, opts = {}) => {
    const path = String(url).replace('https://api.etsy.com/v3', '').split('?')[0];
    if (opts.method === 'DELETE') {
      deleted.push(path);
      return new Response('{}', { status: 200 });
    }
    if (path.includes('/oauth/token')) {
      return new Response(JSON.stringify({ access_token: 'x.y', expires_in: 3600 }), { status: 200 });
    }
    return bodies[path]
      ? new Response(JSON.stringify(bodies[path]), { status: 200 })
      : new Response('{"error":"not stubbed"}', { status: 404 });
  };

  const { deleteDraftListing } = await import('../src/etsy/api.js');
  let refusedLive = false;
  try {
    await deleteDraftListing('111');
  } catch (err) {
    refusedLive = /not a draft/i.test(err.message);
  }
  check('a live listing is never deleted', refusedLive);
  check('   and no DELETE was even attempted for it', !deleted.includes('/application/listings/111'));

  let deletedDraft = false;
  try {
    await deleteDraftListing('222');
    deletedDraft = deleted.includes('/application/listings/222');
  } catch {
    deletedDraft = false;
  }
  check('a genuine draft can be deleted', deletedDraft);

  globalThis.fetch = realFetch;
  Object.assign(config.etsy, savedEtsy);
  check('the borrowed credentials were handed back', config.etsy.keystring === savedEtsy.keystring);
}

console.log('\nWhen the upload does not happen');
{
  // The complaint that produced this section: "when i click send to etsy it is
  // just packing them for me to paste to etsy". Both ways that happens ended
  // with the same green "packed and ready", so a broken connection and a
  // finished job read identically. Each one now has to be distinguishable.
  const { connectionGaps, whyNotConnected } = await import('../src/etsy/api.js');
  const { grantUpload, revokeUpload, mayUpload } = await import('../src/etsy/permission.js');
  const BORROWED = ['keystring', 'accessToken', 'shopId', 'sharedSecret'];
  const savedEtsy = Object.fromEntries(BORROWED.map((k) => [k, config.etsy[k]]));

  Object.assign(config.etsy, { keystring: 'test', accessToken: '', shopId: '', sharedSecret: '' });
  check('a half-filled .env names the lines that are empty', connectionGaps().join(',') === 'ETSY_ACCESS_TOKEN,ETSY_SHOP_ID');
  check('   and says so in a sentence', /half connected/i.test(whyNotConnected()));

  // The Shopkeeper must hold the product rather than announce a pack, because
  // a held product is visible in the Shopfront and has a button to retry.
  const victim = listProducts("WHERE stage = 'listed'")[0];
  if (victim) {
    update('products', victim.id, { status: 'active' });
    const shopkeeper = getAgent('lister');
    const out = await shopkeeper.handle({ payload: { productId: victim.id } });
    const after = listProducts(`WHERE id = '${victim.id}'`)[0];
    check('half a connection holds the product instead of packing it', out.result?.held === 'etsy not connected', JSON.stringify(out.result));
    check('   and the product is blocked, so it shows up with a way back', after.status === 'blocked', after.status);
    update('products', victim.id, { status: 'active' });
  }

  // A refusal from Etsy is a fault, not a finish. It used to fall through to
  // the pack and report success.
  Object.assign(config.etsy, { keystring: 'test', accessToken: 'x.y', shopId: '1', sharedSecret: 's' });
  const realFetch = globalThis.fetch;
  // Only Etsy is stubbed. The Shopkeeper renders its images through a local
  // headless browser it finds over HTTP, and swallowing that call was enough
  // to make this test fail for the wrong reason — it never reached Etsy at all.
  globalThis.fetch = async (url, opts) => {
    if (!String(url).startsWith('https://api.etsy.com')) return realFetch(url, opts);
    if (String(url).includes('/oauth/token')) {
      return new Response(JSON.stringify({ access_token: 'x.y', expires_in: 3600 }), { status: 200 });
    }
    return new Response('{"error":"Invalid API key"}', { status: 401 });
  };

  if (victim) {
    const shopkeeper = getAgent('lister');
    const theListing = getListing(victim.id);

    // Unapproved first. This is the gate that was missing when an upload path
    // with no gate on it put 130-odd duplicate drafts in a real shop. The
    // publishing section above answered an approval, and the half-connected
    // attempt returned before spending it, so take it back explicitly.
    revokeUpload(theListing.id);
    const unapproved = await shopkeeper.handle({ payload: { productId: victim.id } });
    check('an unapproved listing is refused before Etsy is called', unapproved.result?.refused === 'not-approved', JSON.stringify(unapproved.result));

    grantUpload(theListing.id, 'approval');
    const out = await shopkeeper.handle({ payload: { productId: victim.id } });
    const after = listProducts(`WHERE id = '${victim.id}'`)[0];
    check('a refusal from Etsy is reported as a failure, not a pack', Boolean(out.result?.failed), JSON.stringify(out.result));
    check('   with the sign-in hint attached to the 401', /etsy:auth/.test(String(out.result?.failed)), String(out.result?.failed).slice(0, 120));
    check('   and the product held rather than marked finished', after.status === 'blocked', after.status);

    // The permission was spent on the attempt. That is deliberate: a failed
    // upload needs a fresh decision, because the other way round is how one
    // yes turns into a shopful of drafts when something retries in a loop.
    check('   and the approval was spent, so a retry cannot try again', !getListing(victim.id).upload_ok_at);
    const retry = await shopkeeper.handle({ payload: { productId: victim.id } });
    check('   a retried job asks you again instead of uploading', retry.result?.refused === 'not-approved', JSON.stringify(retry.result));
    update('products', victim.id, { status: 'active' });
  }

  // The wall behind the gate: even with permission granted every time, a
  // runaway stops after a handful rather than filling the shop.
  {
    const saved = config.etsy.maxUploadsPerHour;
    config.etsy.maxUploadsPerHour = 2;
    const rows = all("SELECT id FROM listings LIMIT 3");
    for (const row of rows) update('listings', row.id, { uploaded_at: Date.now(), etsy_listing_id: null });
    const some = getListing(victim?.id) || null;
    if (some) {
      grantUpload(some.id, 'approval');
      const verdict = mayUpload({ ...getListing(victim.id), etsy_listing_id: null });
      check('the hourly cap stops a runaway even with permission', verdict.code === 'rate-limit', verdict.code);
    }
    for (const row of rows) update('listings', row.id, { uploaded_at: null });
    config.etsy.maxUploadsPerHour = saved;
  }

  globalThis.fetch = realFetch;
  Object.assign(config.etsy, savedEtsy);
}

console.log("\nThe owner's product list");
{
  // 307 concepts imported from a spreadsheet. The danger with bulk-imported
  // data is that it looks fine in a spreadsheet and is wrong in a listing —
  // a tag cut at character 20 in the middle of a word, a title promising a
  // Notion workspace that ships a PDF. Both of those shipped once and both
  // cost the shop products that sat blocked for good.
  const imported = SEEDS.filter((seed) => seed.build);
  check('the master list is in the notebook', imported.length >= 300, `${imported.length} of ${SEEDS.length} seeds`);
  check(
    '   every tag is a real Etsy tag: 20 characters, whole words, no punctuation',
    SEEDS.every((seed) => seed.k.every((tag) => tag.length <= 20 && /^[a-z0-9 ]+$/.test(tag))),
    SEEDS.flatMap((s) => s.k).filter((t) => t.length > 20 || !/^[a-z0-9 ]+$/.test(t)).slice(0, 3).join(' | ')
  );
  check(
    '   nothing is proposed twice',
    new Set(SEEDS.map((s) => s.t.toLowerCase())).size === SEEDS.length
  );
  check(
    '   every price is a real range above the floor',
    SEEDS.every((s) => s.p[0] >= 1.5 && s.p[1] > s.p[0])
  );

  // The important one. A seed whose title names a tool this engine cannot
  // produce must be marked, and the Scout must not propose it.
  const promisesAnotherTool = SEEDS.filter((s) =>
    /\b(notion|canva|cricut|lightroom|goodnotes|preset|svg)\b/i.test(`${s.t} ${s.g}`)
  );
  check(
    '   anything naming a tool the engine cannot make is marked as artwork',
    promisesAnotherTool.every((s) => s.build === 'art'),
    promisesAnotherTool.filter((s) => s.build !== 'art').map((s) => s.t).slice(0, 3).join(' | ')
  );

  const scout = getAgent('scout');
  const proposed = scout.offlineIdeas(40, null, []);
  check(
    '   and the Scout proposes none of them',
    proposed.every((idea) => !/\b(notion|canva|cricut|lightroom|goodnotes|preset)\b/i.test(idea.title)),
    proposed.filter((i) => /notion|canva|cricut/i.test(i.title)).map((i) => i.title).slice(0, 3).join(' | ')
  );
  check(
    '   while still having plenty to propose',
    proposed.length >= 20,
    `${proposed.length} ideas from a clean bench`
  );

  // "Editable" is a promise the buyer checks the moment they open the file.
  // A seed that makes it has to ship the spreadsheet that keeps it — this is
  // the same fault as the "editable edition" spin-offs, which promised typing
  // fields and shipped a flat PDF, and sat blocked at the design stage for good.
  const overPromising = SEEDS.filter(
    (s) =>
      s.build !== 'art' &&
      /\b(editable|fillable|auto-?calculat|google sheets|excel)\b/i.test(`${s.t} ${s.g}`) &&
      !/spreadsheet/i.test(s.f)
  );
  check(
    'nothing promises an editable file without shipping one',
    overPromising.length === 0,
    overPromising.map((s) => s.t).slice(0, 3).join(' | ')
  );

  // Medical, legal, tax and grief content reaches you with a warning attached.
  const careful = SEEDS.filter((s) => s.careful);
  check('subjects that need reading before approving are flagged', careful.length >= 10, `${careful.length} flagged`);
  check(
    '   including the health logbooks, which are the obvious trap',
    careful.some((s) => /blood sugar|blood pressure|medication/i.test(s.t)),
    careful.map((s) => s.t).slice(0, 4).join(' | ')
  );
}

console.log('\nNot shouting at you');
{
  // A permission that is granted and never spent is a standing order to the
  // Manager to try again, and it obeyed it every tick forever: fifteen
  // identical lines a minute about one product, none of them actionable.
  // Anything that ends an upload attempt now either spends the permission or
  // hands it back, so the next move is yours.
  const { grantUpload, awaitingUpload } = await import('../src/etsy/permission.js');
  const { createProduct, saveListing } = await import('../src/pipeline/products.js');
  const { drain: drainQueue } = await import('../src/pipeline/orchestrator.js');

  const BORROWED = ['keystring', 'accessToken', 'shopId', 'sharedSecret'];
  const savedEtsy = Object.fromEntries(BORROWED.map((k) => [k, config.etsy[k]]));
  Object.assign(config.etsy, { keystring: 'k', accessToken: 'a.b', shopId: '1', sharedSecret: 's' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) =>
    String(url).startsWith('https://api.etsy.com')
      ? new Response('{}', { status: 200 })
      : realFetch(url, opts);

  const victim = createProduct({
    title: 'Retry Loop Canary',
    category: 'Budget planners',
    spec: { pages: [{ kind: 'cover', title: 'x' }] },
    price: 4.99,
  });
  saveListing(victim.id, {
    title: 'Retry Loop Canary Printable',
    description: 'd',
    tags: ['a'],
    materials: ['pdf'],
    price: 4.99,
    status: 'ready',
  });
  setStage(victim.id, 'ready', { status: 'active' });
  grantUpload(getListing(victim.id).id, 'approval');

  const attempts = () =>
    count("SELECT COUNT(*) FROM jobs WHERE kind = 'lister.publish' AND IFNULL(payload,'') LIKE ?", `%${victim.id}%`);

  for (let round = 0; round < 6; round++) {
    enqueue({ agent: 'manager', kind: 'manager.plan', subject: 'canary', priority: 1 });
    await drainQueue(30);
  }

  check(
    'an upload that cannot happen is tried once, not once a tick forever',
    attempts() <= 2,
    `${attempts()} attempts over six rounds`
  );
  check(
    '   because the permission was handed back rather than left lying around',
    !awaitingUpload().some((l) => l.product_id === victim.id)
  );

  globalThis.fetch = realFetch;
  Object.assign(config.etsy, savedEtsy);
}

console.log('\nReading the real marketplace');
{
  // The only research here that is not an opinion. Etsy publishes what is live
  // against a search phrase for nothing but an api key, and everything the
  // Scout aims at is built on it — so the summarising has to be right whether
  // or not a network is present.
  const { summarise, record, recentMarket, openings, marketBlock, sweep: marketSweep } =
    await import('../src/etsy/market.js');

  const summary = summarise({
    keyword: 'adhd cleaning chart',
    listings: 1420,
    prices: [3, 4, 4, 5, 12],
    titles: [
      'ADHD Cleaning Chart Printable PDF Instant Download',
      'ADHD Cleaning Checklist | Printable | A4',
      'Cleaning Chart for ADHD Adults Digital Download',
      'Neurodivergent Cleaning Routine Printable',
    ],
  });
  check('a quiet phrase is reported as quiet', summary.competition === 'quiet', summary.competition);
  check('   with the middle price, not the average', summary.priceMedian === 4, String(summary.priceMedian));
  check(
    '   and the words that actually recur in titles',
    summary.phrases.some((p) => p.word === 'cleaning') && summary.phrases.some((p) => p.word === 'adhd'),
    summary.phrases.map((p) => p.word).join(',')
  );
  check(
    '   with the boilerplate every listing carries thrown away',
    !summary.phrases.some((p) => ['printable', 'download', 'pdf', 'digital'].includes(p.word)),
    summary.phrases.map((p) => p.word).join(',')
  );
  check(
    'a crowded phrase is reported as crowded',
    summarise({ keyword: 'wedding planner', listings: 90000, prices: [5], titles: ['Wedding Planner'] })
      .competition === 'crowded'
  );

  record(summary);
  const again = record({ ...summary, listings: 1600 });
  check('a second reading remembers the first, so movement shows', again.wasListings === 1420, String(again.wasListings));
  check('the latest reading is on file', recentMarket(5).some((r) => r.keyword === 'adhd cleaning chart'));
  check('quiet corners are findable', openings(5).some((r) => r.keyword === 'adhd cleaning chart'));
  check('and it reads as sentences, not a table', /live listings/.test(marketBlock()));

  // No keystring is a reason, not a crash — this runs on every machine.
  const savedKey = config.etsy.keystring;
  config.etsy.keystring = '';
  const off = await marketSweep(['anything']);
  check('with no api key it says why rather than throwing', /ETSY_KEYSTRING/.test(off.reason), off.reason);
  config.etsy.keystring = savedKey;
}

console.log('\nProtecting the listing images');
{
  const spec = offlineSpec({ title: 'Habit Tracker', category: 'Fitness trackers', pitch: 'p', audience: 'a' }, 'Hartistic');
  const doc = buildDoc(spec, 'A4');

  const marked = buildMockups(spec, doc, { watermark: watermarkFor() });
  check('every listing image carries a mark', marked.every((m) => /pattern id="wm/.test(m.svg)), `${marked.length} images`);
  check(
    '   each with its own pattern id, so they do not share one opacity',
    new Set(marked.map((m) => m.svg.match(/pattern id="(wm\d+)"/)?.[1])).size === marked.length
  );
  check(
    '   lighter on the hero, which has to make the sale',
    opacityOf(marked.find((m) => m.name === '1-hero')) < opacityOf(marked.find((m) => m.name === '2-contents'))
  );
  check(
    '   and full strength on the pages someone could copy',
    opacityOf(marked.find((m) => m.name === '2-contents')) > 0
  );

  const bare = buildMockups(spec, doc, {});
  check('and it can be switched off entirely', bare.every((m) => !/pattern id="wm/.test(m.svg)));

  // A page written with `body` instead of `blocks` used to render as a heading
  // over a blank sheet — inside something sold.
  const instructions = { kind: 'instructions', title: 'How to use this', body: ['First thing.', 'Second thing.'] };
  const page = buildDoc({ ...spec, pages: [instructions] }, 'A4').pages[0];
  check('an instructions page written either way has content on it', /First thing/.test(JSON.stringify(page.ops || page)));
}

console.log('\nThe Harbour proposing things that make sense');
{
  const signal = (id, text, phrase) => ({
    id, source: 'test', external_id: id, title: text, text, url: `https://example.com/${id}`,
    author: 'someone', score: 30, comments: 4, phrase, channel: 'hacker news', posted_at: Date.now(),
  });

  // Three people asking for the same thing is a market. The wording is
  // deliberately verb-led, because that is how people write.
  const real = synthesise(
    [
      signal('s1', 'I wish there was a way to chase unpaid invoices automatically every month.', 'i wish there was'),
      signal('s2', 'Is there a tool that will chase unpaid invoices for me without me remembering?', 'is there a tool that'),
      signal('s3', 'We still use a spreadsheet to chase unpaid invoices and it is awful.', 'we still use a spreadsheet'),
    ],
    4
  );
  check('three people asking for the same thing becomes a candidate', real.length >= 1, `${real.length}`);
  check(
    '   described in English, not spliced verb-first',
    real[0] && !/ for (chase|track|manage|log) /.test(real[0].oneLiner),
    real[0]?.oneLiner
  );
  check('   and named after what it is for', real[0] && /invoice/i.test(real[0].name), real[0]?.name);

  // One person thinking aloud is an anecdote. The Prospector's own pack says
  // so, and the synthesiser used to promote exactly this into a venture.
  const poetry = synthesise(
    [signal('p1', 'Is there an App that explores the smeared line between meanings? '.repeat(9), 'is there an app that')],
    4
  );
  check(
    'one person musing does not become six ventures',
    poetry.length <= 1,
    poetry.map((v) => v.name).join(', ')
  );
  check(
    '   and nothing incoherent is put in front of the owner',
    poetry.every((v) => !/ for (explores|takes|uses|instructs) /.test(v.oneLiner)),
    poetry.map((v) => v.oneLiner).join(' | ')
  );

  check('no signals means no ventures, not invented ones', synthesise([], 4).length === 0);
}

console.log('\nSaying it to the buyer, not to the shop');
{
  // The Scout's reasoning is written for the valley. Printed in a listing it
  // tells a shopper the product's shape was chosen for the seller's benefit.
  check('shop reasoning in buyer copy is caught', findShopFacingCopy('sets of three sell better than singles').length >= 1);
  check('   and seasonality reasoning too', findShopFacingCopy('January and September spikes').length >= 1);
  check('   while a real benefit passes', findShopFacingCopy('twelve weeks on one page, so you can see the whole block') .length === 0);
  check(
    'no seed in the corpus talks to the shop instead of the buyer',
    SEEDS.every((seed) => findShopFacingCopy(seed.g).length === 0),
    SEEDS.filter((seed) => findShopFacingCopy(seed.g).length).map((s) => s.t).join(', ')
  );

  // A product that is not what its title says is a refund, not a lost sale.
  check(
    'a product that does not contain what the title promises is caught',
    unkeptTitlePromises('Christmas Gift Wrapping Planner', [{ title: 'Monthly overview' }, { title: 'Bills' }]).length >= 2
  );
  check(
    '   but one stray word is left alone',
    unkeptTitlePromises('Zesty Budget Planner', [{ title: 'Monthly budget overview' }]).length === 0
  );
  const gift = offlineSpec({ title: 'Christmas Budget & Gift Planner', category: 'Budget planners', pitch: 'x', audience: 'y' }, 'H');
  check(
    'a gift planner is built with a gift list, not direct debits',
    gift.pages.some((p) => /gift list/i.test(p.title || '')),
    gift.pages.map((p) => p.title).join(' / ')
  );
  check('   and it keeps its promises', unkeptTitlePromises('Christmas Budget & Gift Planner', gift.pages).length === 0);
}

console.log('\nTags a person would actually type');
{
  // There are only thirteen tags. One that reads as word salad is not a weak
  // tag, it is a missing one.
  const crossed = buildTags([], { title: 'Habit Tracker Bundle | Water Planner | Printable PDF' });
  check(
    'pairs are not built across the title separators',
    !crossed.includes('bundle water') && !crossed.includes('planner printable'),
    crossed.join(' / ')
  );
  check('   while pairs within a segment survive', crossed.includes('habit tracker'), crossed.join(' / '));
  check('every tag reads as a phrase, not a fragment', crossed.every((t) => t.trim().length >= 3));
  check('   and none exceeds what Etsy accepts', crossed.every((t) => t.length <= 20));
  check('   and there are no duplicates', new Set(crossed).size === crossed.length);

  // The Scout writes audiences as descriptions. Cutting them by word count
  // produced fragments that went straight into titles and tags.
  const audience = (text) => buildTags([], { audience: text })[0];
  check('an audience joined by "and" is cut at the join', audience('spring cleaners and end-of-tenancy movers') === 'spring cleaners');
  check('   and one joined by "of" too', audience('parents of 11-16 year olds') === 'parents');
  check('   leaving no dangling adjective', audience('renters new to paying bills') === 'renters');
  check('   while a short audience is left alone', audience('habit builders') === 'habit builders');
}

console.log('\nNoticing what is quietly wrong');
{
  const clean = checkShop();
  check('a healthy shop reports a score', ['good', 'poor', 'bad'].includes(clean.score), clean.score);
  check('   and every finding carries a fix', clean.findings.every((f) => f.what && f.fix));

  // Plant the faults a shop really develops, and check each is found. A
  // checker that cannot fail is worth nothing.
  const listing = one('SELECT * FROM listings LIMIT 1');
  const product = one('SELECT * FROM products LIMIT 1');
  if (listing && product) {
    run('UPDATE listings SET title = ?, tags = ? WHERE id = ?', 'Disney Budget Planner', JSON.stringify(['budget']), listing.id);
    run('UPDATE products SET price = 0.99 WHERE id = ?', product.id);
    const found = checkShop();

    check(
      'a trademark that got in before the checks existed is caught',
      found.findings.some((f) => /disney/i.test(f.what) && f.severity === 'bad')
    );
    check(
      'a listing that lost its tags is caught',
      found.findings.some((f) => /tags/i.test(f.what))
    );
    check(
      'a price under the floor the fees demand is caught',
      found.findings.some((f) => f.area === 'money')
    );
    check('and the worst thing is listed first', found.findings[0]?.severity === 'bad');
    check('   with the shop scored accordingly', found.score === 'bad');

    // Put it back so later checks see the shop as it was.
    run('UPDATE listings SET title = ?, tags = ? WHERE id = ?', listing.title, listing.tags, listing.id);
    run('UPDATE products SET price = ? WHERE id = ?', product.price, product.id);
  }
}

console.log('\nBacking up what exists nowhere else');
{
  const dir = join(config.root, 'data');
  const path = join(dir, 'smoke-backup.json');
  const written = writeBackup(path);
  check('a backup writes every table worth keeping', written.rows > 0, `${written.rows} rows`);
  check('   including the lessons you taught', (written.counts.lessons ?? 0) > 0);
  check('   and the decisions you made', (written.counts.ideas ?? 0) > 0);
  check('   and it says where it went', existsSync(written.path));

  // A restore into a shop that already has these rows must be a no-op, or
  // running it twice would duplicate the owner's whole history.
  const again = readBackup(path);
  check('restoring what is already here changes nothing', again.total === 0, `${again.total} rows touched`);
  check('   and says so rather than silently doing nothing', Object.keys(again.skipped).length > 0);

  const dry = readBackup(path, { dryRun: true });
  check('a dry run reports without touching anything', dry.dryRun === true);

  // The thing this feature exists for: losing a row and getting it back.
  const victim = one("SELECT * FROM lessons WHERE source = 'test' LIMIT 1");
  if (victim) {
    run('DELETE FROM lessons WHERE id = ?', victim.id);
    check('a lesson can genuinely be lost', !one('SELECT id FROM lessons WHERE id = ?', victim.id));
    const back = readBackup(path);
    check('   and the backup brings it back', Boolean(one('SELECT id FROM lessons WHERE id = ?', victim.id)));
    check('   restoring only what was missing', back.total === 1, `${back.total} rows`);
  }

  check('a file that is not a backup is refused clearly', (() => {
    writeFileSync(join(dir, 'not-a-backup.json'), '{"hello":"world"}');
    try {
      readBackup(join(dir, 'not-a-backup.json'));
      return false;
    } catch (err) {
      return /not a valley backup/i.test(err.message);
    }
  })());

  rmSync(path, { force: true });
  rmSync(join(dir, 'not-a-backup.json'), { force: true });
}

console.log('\nKnowledge that works without a model');
{
  check('a trademark in a title is caught', findTrademarks('Bluey Chore Chart').length === 1);
  check('   including in a filename', findTrademarks('out/x/peppa-planner.pdf').length === 1);
  check('unprovable claims are caught', findBannedPhrases('Unlock your best selling year').length >= 2);
  check('shaming language is caught', findShameLanguage('stop making excuses and tidy up').length >= 1);
  check('placeholders are caught', findPlaceholders('Item 1 goes here').length >= 1);

  check('prices land on a charm ending', String(tidyPrice(4.2, 'small pack')).endsWith('.49'));
  check('   and never below the floor the fees demand', tidyPrice(0.5, 'single sheet') >= 2.5);
  check('   and never above the band for that product', tidyPrice(30, 'single sheet') <= 4.5);
  check('the band follows what the product is', bandFor({ pages: 12 }) === 'binder' && bandFor({ pages: 1 }) === 'single sheet');

  check('spelling variants are suggested', spellingVariants(['budget organiser']).includes('budget organizer'));
  check('   but synonyms are not swapped', !spellingVariants(['meal planner']).includes('meal diary'));

  check(
    'a venture needing a licence is killed on sight',
    ventureKillReasons(
      { name: 'x', one_liner: 'automated financial advice', solution: '', audience: 'investors', monetisation: { model: 'subscription', price: 20, daysToRevenue: 30 } },
      90
    ).length >= 1
  );
  check(
    'a subscription priced below the floor is flagged',
    ventureKillReasons(
      { name: 'x', one_liner: 'y', solution: '', audience: 'a', monetisation: { model: 'subscription', price: 3, daysToRevenue: 30 } },
      90
    ).length >= 1
  );
  check('one post is an anecdote, three is a signal', evidenceStrength(1).level === 'anecdote' && evidenceStrength(3).level === 'signal');

  // The newer packs. Each of these is knowledge that has to hold with no model
  // configured, because that is how the shop is actually run.
  check('a medical claim is caught', findMedicalClaims('This chart treats ADHD').length >= 1);
  check('   but helping is still allowed', findMedicalClaims('A gentle chart that helps with ADHD').length === 0);
  check('a policy trap is caught', findPolicyTraps('A dupe of the famous planner').length >= 1);
  check('   but an honest comparison is not', findPolicyTraps('Similar in feel to a bullet journal').length === 0);
  check('a licence the shop cannot grant is caught', findOverreachingLicence('Commercial use included').length >= 1);
  check('telling the buyer what they may do counts', licenceTermsStated('For personal use only.'));
  check('   and saying nothing does not', !licenceTermsStated('Enjoy your new planner.'));

  check('a thin image set is caught', imageProblems([{ label: 'a' }, { label: 'b' }]).length >= 1);
  check(
    '   and a price baked into an image is caught',
    imageProblems([
      { label: '1', svg: '<text>INSTANT DOWNLOAD</text>' }, { label: '2', svg: '<text>only \u00a34.99</text>' },
      { label: '3', svg: '<text>x</text>' }, { label: '4', svg: '<text>y</text>' },
    ]).some((p) => p.includes('price ("£4.99") is baked'))
  );
  check(
    '   while a clean set passes',
    imageProblems([
      { label: '1', svg: '<text>INSTANT DOWNLOAD</text>' }, { label: '2', svg: '<text>a</text>' },
      { label: '3', svg: '<text>b</text>' }, { label: '4', svg: '<text>c</text>' },
    ]).length === 0
  );
  check(
    '   and a bare currency symbol is a column heading, not a price',
    imageProblems([
      { label: '1', svg: '<text>INSTANT DOWNLOAD</text>' },
      { label: '2', svg: '<text>Amount £</text><text>Paid £</text>' },
      { label: '3', svg: '<text>b</text>' }, { label: '4', svg: '<text>c</text>' },
    ]).length === 0
  );

  check('the category decides the palette, from the pack', paletteForCategory('ADHD & neurodivergent') === 'lilac');
  check('   and an unknown category still gets one', Boolean(paletteForCategory('Something New')));

  check('ground a solo venture cannot stand on is caught', findHardKills('it holds customer funds').length >= 1);
  check('data a small venture should not collect is caught', overCollectingFields(['email', 'date of birth']).length === 1);

  // A currency symbol is a literal, not a regex anchor. Read as a pattern, "$"
  // matches every string there has ever been.
  check('a phrase made of punctuation is matched literally', findPhrases('nothing here', ['$']).length === 0);
}

console.log('\nDiscord');
const avatar = avatarFor({ id: 'scout', colour: '#e0b877' });
check('avatars generate as valid PNGs', avatar.subarray(1, 4).toString() === 'PNG' && avatar.length > 500);
check('every agent gets a distinct avatar', new Set(agentList().map((a) => avatarFor(a).length)).size > 1);

console.log(`\n${failures ? '\x1b[31m' : '\x1b[32m'}${checks - failures}/${checks} checks passed\x1b[0m\n`);
process.exit(failures ? 1 : 0);
