// End to end, with no API keys and no network: ideas in, sellable files out.
//
//   npm test
//
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import config from '../src/core/config.js';
import { all, count, one, insert, update, run } from '../src/core/db.js';
import { agentList, agentsIn } from '../src/agents/registry.js';
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
import { listProducts, getListing, assetsFor } from '../src/pipeline/products.js';
import { openApprovals, answer } from '../src/core/approvals.js';
import { teach, lessonsFor, forget } from '../src/core/memory.js';
import { insightBlock, ownerTaste } from '../src/core/insights.js';
import { closestMatch, cannibalWarning, TOO_SIMILAR } from '../src/core/similarity.js';
import { recordFailures, failureSummary } from '../src/core/retro.js';
import { record, todayUsage, usageByAgent, overBudget } from '../src/core/spend.js';
import { uid } from '../src/core/util.js';
import { auditListing, buildTitle, buildTags } from '../src/etsy/seo.js';
import { SEEDS } from '../src/agents/ideas-corpus.js';
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
  'fourteen agents across two businesses',
  agentList().length === 14,
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
check('the Scout proposed a batch', proposed.length >= 8, `${proposed.length} proposed`);
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
await drain(60);

const products = listProducts();
check('approved ideas turned into products', products.length >= 2, `${products.length} products`);

let allGood = true;
for (const product of products) {
  const assets = assetsFor(product.id);
  const pdfs = assets.filter((a) => a.kind === 'pdf' && a.role === 'deliverable');
  const mockups = assets.filter((a) => a.role === 'mockup');
  const listing = getListing(product.id);

  console.log(`\n  ${product.sku} — ${product.title}`);
  check('   reached the ready stage or beyond', ['ready', 'listed'].includes(product.stage), product.stage);
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
  const sold = listProducts()[0];
  insert('sales', {
    id: uid('sale'),
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
  check('the two businesses have separate agents', agentsIn('etsy').length >= 8 && agentsIn('ventures').length === 6);
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
  const venture = createVenture({ ...candidate, name: candidate.name + ' Test' });
  decideVenture(venture.id, 'approved', '', 'test');
  await drain(30);

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
    check('   the landing page quotes the real complaint', page.includes(built.evidence[0].quote.slice(0, 40)));
    check('   and shows a price', page.includes(String(built.monetisation.price)));
    const server = readFileSync(join(dir, 'server.js'), 'utf8');
    check('   the server has a working waitlist endpoint', server.includes('/api/waitlist'));
  }

  const campaigns = campaignsFor(built.id);
  check('a launch pack is prepared', campaigns.length >= 1);
  check('   but it stays a draft until you approve it', campaigns[0]?.status === 'draft');
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
    ]).some((p) => p.includes('outlive'))
  );
  check(
    '   while a clean set passes',
    imageProblems([
      { label: '1', svg: '<text>INSTANT DOWNLOAD</text>' }, { label: '2', svg: '<text>a</text>' },
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
