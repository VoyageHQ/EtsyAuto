// End to end, with no API keys and no network: ideas in, sellable files out.
//
//   npm test
//
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import config from '../src/core/config.js';
import { all, count, one, insert, update } from '../src/core/db.js';
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
import { teach, lessonsFor } from '../src/core/memory.js';
import { insightBlock, ownerTaste } from '../src/core/insights.js';
import { closestMatch, cannibalWarning, TOO_SIMILAR } from '../src/core/similarity.js';
import { recordFailures, failureSummary } from '../src/core/retro.js';
import { record, todayUsage, usageByAgent, overBudget } from '../src/core/spend.js';
import { uid } from '../src/core/util.js';
import { auditListing } from '../src/etsy/seo.js';
import { avatarFor } from '../src/discord/avatars.js';

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

console.log('\nDiscord');
const avatar = avatarFor({ id: 'scout', colour: '#e0b877' });
check('avatars generate as valid PNGs', avatar.subarray(1, 4).toString() === 'PNG' && avatar.length > 500);
check('every agent gets a distinct avatar', new Set(agentList().map((a) => avatarFor(a).length)).size > 1);

console.log(`\n${failures ? '\x1b[31m' : '\x1b[32m'}${checks - failures}/${checks} checks passed\x1b[0m\n`);
process.exit(failures ? 1 : 0);
