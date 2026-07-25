// THE SHOPKEEPER — the only villager allowed to touch the outside world, and
// only after you have said yes.
import { join } from 'node:path';
import Agent from './base.js';
import config from '../core/config.js';
import { getProduct, getListing, assetsFor, setStage } from '../pipeline/products.js';
import { writeListingPack } from '../etsy/export.js';
import { createDraftListing, etsyEnabled } from '../etsy/api.js';
import { update } from '../core/db.js';
import { now, money } from '../core/util.js';

export class Lister extends Agent {
  constructor() {
    super({
      id: 'lister',
      name: 'The Shopkeeper',
      title: 'listing publisher',
      station: 'shopfront',
      colour: '#8fc9a8',
      handles: ['lister.publish'],
      voice: 'Short status updates. Says exactly what it did and where the files are.',
      purpose: `
You put approved listings into the shop, and nothing else. You never invent a
listing, never change a price, and never publish anything the owner has not
approved. If credentials are missing you pack the files up neatly instead and
say so plainly.`,
    });
  }

  async handle(job) {
    const product = getProduct(job.payload.productId);
    if (!product) return { result: { skipped: 'product gone' } };
    const listing = getListing(product.id);
    if (!listing) return { result: { skipped: 'nothing written yet' } };
    this.moveTo('shopfront', `listing ${product.sku}`);

    const dir = writeListingPack(product, listing);

    if (etsyEnabled()) {
      try {
        const assets = assetsFor(product.id);
        const deliverables = assets
          .filter((a) => a.role === 'deliverable')
          .map((a) => join(config.root, a.path));
        // Etsy needs raster images. Any PNGs saved from the dashboard get used;
        // otherwise the draft goes up without images for you to add.
        const images = assets
          .filter((a) => a.role === 'mockup' && a.kind === 'png')
          .map((a) => join(config.root, a.path));

        const created = await createDraftListing({ listing, product, deliverables, images });
        update('listings', listing.id, {
          status: created.state === 'active' ? 'live' : 'draft',
          etsy_listing_id: created.listingId,
          export_path: dir.replace(config.root + '/', ''),
          updated_at: now(),
        });
        setStage(product.id, 'listed', { status: 'done' });
        this.say(
          `${product.sku} is a ${created.state} listing on Etsy: ${created.url}` +
            (images.length ? '' : ' — no images attached yet, save the PNGs from the dashboard and add them.'),
          { kind: 'listed', level: 'good', meta: { productId: product.id, url: created.url } }
        );
        this.goHome();
        return { result: created };
      } catch (err) {
        this.say(
          `Etsy would not take ${product.sku}: ${err.message}. The upload pack is ready instead at ${dir.replace(config.root + '/', '')}.`,
          { kind: 'listed', level: 'warn', meta: { productId: product.id } }
        );
      }
    }

    update('listings', listing.id, {
      status: 'exported',
      export_path: dir.replace(config.root + '/', ''),
      updated_at: now(),
    });
    setStage(product.id, 'listed', { status: 'done' });
    this.say(
      `${product.sku} packed and ready at ${dir.replace(config.root + '/', '')}/LISTING.md — ` +
        `title, 13 tags and description ready to paste, priced ${money(listing.price, config.currency)}.`,
      { kind: 'packed', level: 'good', meta: { productId: product.id, dir } }
    );
    this.goHome();
    return { result: { dir, mode: 'export' } };
  }
}

export default Lister;
