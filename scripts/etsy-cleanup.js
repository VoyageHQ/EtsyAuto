// Find and remove the duplicate drafts this shop put in your Etsy account.
//
//   npm run etsy:cleanup           # look, group, count. Changes nothing.
//   npm run etsy:cleanup -- --yes  # delete the duplicates
//
// Written after an upload path with no gate on it created 130-odd drafts of
// the same handful of products. Deleting those by hand in Etsy's interface is
// an evening's work, so this does it — carefully.
//
// What counts as a duplicate: two or more DRAFTS in your shop with the same
// title. Of each group, exactly one is kept, and the choice is not arbitrary:
//
//   1. the one this shop has recorded against the product, if it is in the
//      group — so the local database stays true afterwards;
//   2. otherwise the one with the most images, because that is the most
//      finished of them;
//   3. ties broken by the oldest, which is the one that has existed longest
//      and may already have been seen.
//
// What is never touched:
//
//   · anything that is not a DRAFT. Active, expired and sold-out listings are
//     not read past their state, and no delete is issued for them. A live
//     listing carries views and favourites that do not come back.
//   · a draft whose title matches nothing else. If you made it by hand, it is
//     unique and it stays.
//
// Every deletion re-confirms the listing's state with Etsy in the moment,
// rather than trusting the list this script fetched a minute earlier.
import config from '../src/core/config.js';
import { all, update } from '../src/core/db.js';
import {
  shopListings,
  deleteDraftListing,
  connectionGaps,
  whyNotConnected,
} from '../src/etsy/api.js';
import { now } from '../src/core/util.js';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;

const go = process.argv.slice(2).includes('--yes');

console.log(`\n${bold('Tidying up your Etsy drafts')}\n`);

const gaps = connectionGaps();
if (gaps.length) {
  console.log(`  ${red('×')} ${whyNotConnected()}\n`);
  process.exit(1);
}

// --- what is actually in the shop ------------------------------------------

console.log(`  ${dim('asking Etsy for every draft in the shop…')}`);
let drafts;
try {
  drafts = await shopListings('draft');
} catch (err) {
  console.log(`  ${red('×')} ${err.message}\n`);
  process.exit(1);
}
console.log(`  ${green('✓')} ${drafts.length} draft(s) found.\n`);

if (!drafts.length) {
  console.log('  Nothing to tidy.\n');
  process.exit(0);
}

// The ids this shop believes in, so the survivor of each group keeps the local
// database honest instead of orphaning it.
const known = new Map(
  all("SELECT l.id, l.etsy_listing_id, p.sku FROM listings l JOIN products p ON p.id = l.product_id WHERE IFNULL(l.etsy_listing_id,'') != ''")
    .map((row) => [String(row.etsy_listing_id), row])
);

// --- group by title ---------------------------------------------------------

const groups = new Map();
for (const draft of drafts) {
  const key = draft.title.trim().toLowerCase();
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(draft);
}

const doomed = [];
const kept = [];
for (const [, group] of groups) {
  if (group.length < 2) continue;
  const survivor =
    group.find((d) => known.has(d.id)) ||
    [...group].sort((a, b) => b.images - a.images || a.createdAt - b.createdAt)[0];
  kept.push({ survivor, group });
  for (const draft of group) if (draft.id !== survivor.id) doomed.push({ draft, survivor });
}

if (!doomed.length) {
  console.log(`  ${green('No duplicates.')} All ${drafts.length} drafts have distinct titles.\n`);
  process.exit(0);
}

console.log(`${bold(`${doomed.length} duplicate draft(s) across ${kept.length} product(s)`)}\n`);
for (const { survivor, group } of kept) {
  console.log(`  ${bold(survivor.title.slice(0, 62))}`);
  console.log(
    `    ${green('keep')}   ${survivor.id} ${dim(
      `${survivor.images} image(s)${known.has(survivor.id) ? ` · recorded as ${known.get(survivor.id).sku}` : ''}`
    )}`
  );
  console.log(`    ${red('delete')} ${group.length - 1} other(s) ${dim(group.filter((d) => d.id !== survivor.id).map((d) => d.id).join(', ').slice(0, 120))}`);
}
console.log('');

if (!go) {
  console.log(`${amber('Nothing was deleted.')} Run it again with ${bold('--yes')} to remove them.\n`);
  console.log(`${dim(`  npm run etsy:cleanup -- --yes`)}\n`);
  process.exit(0);
}

// --- do it ------------------------------------------------------------------

let deleted = 0;
let refused = 0;
for (const { draft } of doomed) {
  try {
    // deleteDraftListing re-reads the state from Etsy and refuses anything
    // that is not a draft. That check is worth the extra call: this list was
    // fetched minutes ago and you may have published one in the meantime.
    await deleteDraftListing(draft.id);
    deleted += 1;
    if (deleted % 10 === 0) console.log(`  ${dim(`${deleted} deleted…`)}`);
  } catch (err) {
    refused += 1;
    console.log(`  ${amber('kept')} ${draft.id} — ${err.message.slice(0, 120)}`);
  }
}

// Any product still pointing at something that is gone should forget it, so
// the Shopfront offers "send to etsy" rather than a dead link.
const goneIds = new Set(doomed.map((d) => d.draft.id));
let repointed = 0;
for (const [id, row] of known) {
  if (!goneIds.has(id)) continue;
  update('listings', row.id, { etsy_listing_id: null, status: 'ready', updated_at: now() });
  repointed += 1;
}

console.log(`\n${bold('Done.')} ${deleted} deleted, ${refused} left alone.`);
if (repointed) console.log(`  ${repointed} product(s) now point at nothing and can be re-sent.`);
console.log(
  `\n  Uploads are limited to ${config.etsy.maxUploadsPerHour} an hour and need your approval,\n` +
    `  so this cannot happen again. ${dim('ETSY_MAX_UPLOADS_PER_HOUR in .env')}\n`
);
