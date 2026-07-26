// Replace drafts that went up without images.
//
//   npm run etsy:redraft              # show what would happen, change nothing
//   npm run etsy:redraft -- --yes     # actually do it
//   npm run etsy:redraft -- HV-0002 --yes
//
// Drafts created before the Shopkeeper could render its own images went up with
// no pictures, and an Etsy listing without one cannot be published. The files
// have also improved since — a page that rendered blank, thumbnails that lost
// their captions, and the watermark — so the right fix is to rebuild locally
// and put a fresh draft up rather than patch the old one.
//
// Two rails, both deliberate:
//
//   · Nothing is deleted unless you pass --yes. The default run only reports.
//   · Only DRAFTS are ever deleted, and the state is confirmed with Etsy at the
//     moment of deletion rather than trusted from the local database. If you
//     published one by hand, this leaves it alone and says so.
import config from '../src/core/config.js';
import { all, one, update } from '../src/core/db.js';
import { listProducts, getListing, assetsFor } from '../src/pipeline/products.js';
import { deleteDraftListing, listingState, createDraftListing, etsyEnabled } from '../src/etsy/api.js';
import { getAgent } from '../src/agents/registry.js';
import { buildProduct } from '../src/design/build.js';
import { writeListingPack } from '../src/etsy/export.js';
import { now } from '../src/core/util.js';
import { join } from 'node:path';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;

const args = process.argv.slice(2);
const go = args.includes('--yes');
const only = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());

console.log(`\n${bold('Re-drafting listings that have no images')}\n`);

if (!etsyEnabled()) {
  console.error(`${red('Etsy is not connected.')} Run npm run etsy:check first.\n`);
  process.exit(1);
}

// --- what is on Etsy, and what state it is really in ------------------------

const candidates = [];
for (const product of listProducts()) {
  const listing = getListing(product.id);
  if (!listing?.etsy_listing_id) continue;
  if (only.length && !only.includes(product.sku.toUpperCase())) continue;

  let live;
  try {
    live = await listingState(listing.etsy_listing_id);
  } catch (err) {
    console.log(`  ${amber('?')} ${product.sku} — could not read listing ${listing.etsy_listing_id}: ${err.message}`);
    continue;
  }
  candidates.push({ product, listing, live });
}

if (!candidates.length) {
  console.log('  Nothing on Etsy to look at.\n');
  process.exit(0);
}

const redraft = [];
for (const entry of candidates) {
  const { product, live } = entry;
  if (live.state !== 'draft') {
    console.log(
      `  ${dim('·')} ${product.sku} is ${bold(live.state)} — left alone. ` +
        dim('Only drafts are ever replaced.')
    );
    continue;
  }
  if (live.images > 0) {
    console.log(`  ${green('✓')} ${product.sku} already has ${live.images} image(s) — nothing to do.`);
    continue;
  }
  console.log(`  ${amber('→')} ${product.sku} is a draft with no images — would be rebuilt and re-drafted.`);
  redraft.push(entry);
}

if (!redraft.length) {
  console.log(`\n  ${green('Nothing needs re-drafting.')}\n`);
  process.exit(0);
}

if (!go) {
  console.log(`
  ${bold(`${redraft.length} listing(s) would be replaced.`)} Nothing has been changed.

  Each one gets its files rebuilt locally first, so it picks up the fixes since
  it was made — the instructions page that rendered blank, the missing
  thumbnail captions, and the watermark — then the old draft is deleted and a
  fresh one created with the images and files attached.

  ${dim('Run it for real:')}  ${bold('npm run etsy:redraft -- --yes')}
`);
  process.exit(0);
}

// --- do it ------------------------------------------------------------------

console.log(`\n${bold('Working')}\n`);

const lister = getAgent('lister');
let done = 0;
let failed = 0;

for (const { product, listing } of redraft) {
  try {
    // Rebuild first. If this fails, the old draft is still there — better a
    // stale draft than none at all.
    console.log(`  ${product.sku} rebuilding files…`);
    buildProduct(product, product.spec);

    const fresh = { ...getListing(product.id) };
    const images = await lister.ensureImages(product);
    if (!images.length) {
      console.log(`  ${red('×')} ${product.sku} — still no images could be made. Old draft left in place.`);
      failed++;
      continue;
    }

    const deliverables = assetsFor(product.id)
      .filter((a) => a.role === 'deliverable')
      .map((a) => join(config.root, a.path));

    console.log(`  ${product.sku} deleting old draft ${listing.etsy_listing_id}…`);
    await deleteDraftListing(listing.etsy_listing_id);

    console.log(`  ${product.sku} creating the new draft…`);
    const created = await createDraftListing({ listing: fresh, product, deliverables, images });

    writeListingPack(product, fresh);
    update('listings', listing.id, {
      etsy_listing_id: created.listingId,
      status: created.state === 'active' ? 'live' : 'draft',
      updated_at: now(),
    });

    console.log(
      `  ${green('✓')} ${product.sku} → ${created.url} ` +
        dim(`(${images.length} images, ${deliverables.length} files)`)
    );
    done++;
  } catch (err) {
    console.log(`  ${red('×')} ${product.sku} — ${err.message}`);
    failed++;
  }
}

console.log(`
${bold('Done')}  ${done} re-drafted${failed ? `, ${failed} left alone` : ''}.

  They are drafts, so nothing is on sale. Open each one in Etsy, check the
  pictures are what you want, and publish when you are happy.
`);
process.exit(failed && !done ? 1 : 0);
