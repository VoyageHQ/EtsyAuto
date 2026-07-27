// Put products on Etsy right now, in the foreground, and say exactly what
// happened.
//
//   npm run etsy:push                 # show what would go up, change nothing
//   npm run etsy:push -- --yes        # actually upload
//   npm run etsy:push -- HV-0004 --yes
//   npm run etsy:push -- --all --yes  # include ones already on Etsy (re-drafts them)
//
// "Send to etsy" on the dashboard queues a job. When that job fails, the reason
// lands in the activity feed among a hundred other lines, and the pack it
// writes as a fallback looks a lot like success. This does the same work with
// nothing hidden: the real Etsy reply, the file list, the image list, and a
// count of what actually attached.
//
// The rails are the same as everywhere else. Nothing is deleted without --yes,
// only DRAFTS are ever deleted, and the state is confirmed with Etsy at the
// moment of deletion rather than trusted from the local database.
import { join } from 'node:path';
import config from '../src/core/config.js';
import { listProducts, getListing, assetsFor } from '../src/pipeline/products.js';
import {
  createDraftListing,
  deleteDraftListing,
  listingState,
  connectionGaps,
  whyNotConnected,
} from '../src/etsy/api.js';
import { getAgent } from '../src/agents/registry.js';
import { update } from '../src/core/db.js';
import { now, money } from '../src/core/util.js';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;

const args = process.argv.slice(2);
const go = args.includes('--yes');
const includeListed = args.includes('--all');
const only = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());

console.log(`\n${bold('Sending products to Etsy')}\n`);

// --- is there even a connection? -------------------------------------------

const gaps = connectionGaps();
if (gaps.length) {
  console.log(`  ${red('×')} ${whyNotConnected()}\n`);
  console.log(`  ${dim('Missing:')} ${gaps.join(', ')}\n`);
  process.exit(1);
}
console.log(`  ${green('✓')} Connected to shop ${config.etsy.shopId}. ` +
  `New listings go up as ${bold(config.etsy.publishMode)}.\n`);

// --- what is there to send? -------------------------------------------------

const queue = [];
for (const product of listProducts()) {
  const listing = getListing(product.id);
  if (!listing) continue;
  if (only.length && !only.includes(product.sku.toUpperCase())) continue;
  if (listing.etsy_listing_id && !includeListed && !only.length) continue;
  queue.push({ product, listing });
}

if (!queue.length) {
  console.log(
    only.length
      ? `  Nothing matched ${only.join(', ')}.\n`
      : `  Everything with copy written is already on Etsy. ${dim('Use --all to re-draft them.')}\n`
  );
  process.exit(0);
}

const shopkeeper = getAgent('lister');

for (const { product, listing } of queue) {
  const deliverables = assetsFor(product.id)
    .filter((a) => a.role === 'deliverable')
    .map((a) => join(config.root, a.path));

  console.log(`${bold(product.sku)} — ${product.title}`);
  const tags = Array.isArray(listing.tags) ? listing.tags : JSON.parse(listing.tags || '[]');
  console.log(
    `  ${dim(
      `${deliverables.length} download file(s) · ${money(listing.price, config.currency)} · ${tags.length} tags`
    )}`
  );

  if (!go) {
    console.log(`  ${amber('would upload')} ${dim('— run again with --yes')}\n`);
    continue;
  }

  // Etsy only takes raster, and the mockups are SVG. This is the same call the
  // Shopkeeper makes, so a browser problem shows up here rather than silently
  // producing a picture-less draft.
  let images = [];
  try {
    images = await shopkeeper.ensureImages(product);
  } catch (err) {
    console.log(`  ${red('×')} could not render the listing images: ${err.message}\n`);
    continue;
  }
  if (!images.length) {
    console.log(`  ${red('×')} no listing images could be made, and Etsy will not publish a`);
    console.log(`      listing without one. Install Chrome or Chromium, or open the Shopfront`);
    console.log(`      and press "save pngs" first.\n`);
    continue;
  }
  console.log(`  ${dim(`${images.length} image(s) ready`)}`);

  // Replace rather than duplicate.
  if (listing.etsy_listing_id) {
    try {
      const live = await listingState(listing.etsy_listing_id);
      if (live.state !== 'draft') {
        console.log(`  ${amber('skipped')} — listing ${listing.etsy_listing_id} is ${bold(live.state)} on Etsy.`);
        console.log(`      ${dim('Only drafts are ever replaced. Take it down on Etsy first.')}\n`);
        continue;
      }
      await deleteDraftListing(listing.etsy_listing_id);
      console.log(`  ${dim(`deleted the old draft ${listing.etsy_listing_id}`)}`);
    } catch (err) {
      console.log(`  ${dim(`old draft ${listing.etsy_listing_id} is already gone (${err.message})`)}`);
    }
    update('listings', listing.id, { etsy_listing_id: null, updated_at: now() });
  }

  try {
    const created = await createDraftListing({ listing, product, deliverables, images });
    update('listings', listing.id, {
      status: created.state === 'active' ? 'live' : 'draft',
      etsy_listing_id: created.listingId,
      updated_at: now(),
    });
    const short = created.imagesUploaded === 0 || created.filesUploaded === 0;
    console.log(
      `  ${short ? amber('partial') : green('✓')} ${created.state} listing ${created.listingId} — ` +
        `${created.imagesUploaded}/${created.imagesOffered} images, ` +
        `${created.filesUploaded}/${created.filesOffered} files`
    );
    for (const problem of created.problems) console.log(`      ${red('·')} ${problem}`);
    console.log(`      ${dim(created.url)}\n`);
  } catch (err) {
    console.log(`  ${red('×')} Etsy refused it: ${err.message}\n`);
  }
}

if (!go) {
  console.log(`${dim('Nothing was changed. Add --yes to upload.')}\n`);
} else {
  console.log(`${bold('Done.')} Open your Etsy Shop Manager → Listings → Drafts.\n`);
}
