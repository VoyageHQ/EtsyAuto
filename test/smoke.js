// End to end, with no API keys and no network: ideas in, sellable files out.
//
//   npm test
//
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import config from '../src/core/config.js';
import { all, count, one } from '../src/core/db.js';
import { agentList } from '../src/agents/registry.js';
import { drain, decideIdeas, requestIdeas } from '../src/pipeline/orchestrator.js';
import { enqueue } from '../src/pipeline/queue.js';
import { listProducts, getListing, assetsFor } from '../src/pipeline/products.js';
import { openApprovals, answer } from '../src/core/approvals.js';
import { teach } from '../src/core/memory.js';
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
check('seven agents on the roster', agentList().length === 7, `${agentList().length} found`);
check(
  'one of them exists purely to invent products',
  agentList().some((a) => a.id === 'scout' && a.handles.includes('scout.brainstorm'))
);
check('every agent has a home station and a colour', agentList().every((a) => a.home && a.colour));

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

console.log('\nDiscord');
const avatar = avatarFor({ id: 'scout', colour: '#e0b877' });
check('avatars generate as valid PNGs', avatar.subarray(1, 4).toString() === 'PNG' && avatar.length > 500);
check('every agent gets a distinct avatar', new Set(agentList().map((a) => avatarFor(a).length)).size > 1);

console.log(`\n${failures ? '\x1b[31m' : '\x1b[32m'}${checks - failures}/${checks} checks passed\x1b[0m\n`);
process.exit(failures ? 1 : 0);
