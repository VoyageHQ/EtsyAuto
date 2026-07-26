// THE SHOPKEEPER — the only villager allowed to touch the outside world, and
// only after you have said yes.
import { join } from 'node:path';
import Agent from './base.js';
import config from '../core/config.js';
import { getProduct, getListing, assetsFor, setStage, blockProduct } from '../pipeline/products.js';
import { writeListingPack } from '../etsy/export.js';
import { createDraftListing, etsyEnabled } from '../etsy/api.js';
import { rasterise, findBrowser } from '../design/rasterise.js';
import { insert, update, one } from '../core/db.js';
import { uid, now, money } from '../core/util.js';
import { existsSync, statSync } from 'node:fs';

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

  /**
   * The listing images, as PNG paths on disk.
   *
   * The mockups are built as SVG so they can embed the real pages at any size
   * for nothing, but Etsy only accepts raster. Any PNGs already exported from
   * the dashboard are used as they are; the rest are rendered here with
   * whatever browser the machine has, which is how this stays free.
   */
  async ensureImages(product) {
    const assets = assetsFor(product.id);
    const mockups = assets.filter((a) => a.role === 'mockup');

    const ready = mockups
      .filter((a) => a.kind === 'png')
      .map((a) => join(config.root, a.path))
      .filter((path) => existsSync(path));
    if (ready.length) return ready.slice(0, 10);

    const jobs = mockups
      .filter((a) => a.kind === 'svg' && existsSync(join(config.root, a.path)))
      .map((a) => ({
        svgPath: join(config.root, a.path),
        pngPath: join(config.root, a.path).replace(/\.svg$/i, '.png'),
        label: a.label,
      }));
    if (!jobs.length) return [];

    const { written, failed, browser } = await rasterise(jobs);
    if (failed.length) {
      this.say(
        `${failed.length} listing image(s) would not render${browser ? '' : ' — no browser on this machine'}.`,
        { kind: 'images', level: 'warn', discord: false }
      );
    }

    // Record them so the Shopfront and the Inspector can see them too, and so a
    // rebuild does not redo work that is already done.
    for (const path of written) {
      const rel = path.replace(config.root + '/', '');
      if (one('SELECT id FROM assets WHERE product_id = ? AND path = ?', product.id, rel)) continue;
      insert('assets', {
        id: uid('as'),
        product_id: product.id,
        kind: 'png',
        role: 'mockup',
        label: jobs.find((j) => j.pngPath === path)?.label || 'image',
        path: rel,
        bytes: statSync(path).size,
        created_at: now(),
      });
    }
    if (written.length) {
      this.say(`${written.length} listing image(s) rendered for ${product.sku}.`, {
        kind: 'images',
        level: 'good',
        discord: false,
      });
    }
    return written.slice(0, 10);
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
        // Etsy will only take raster images, and it will not let a listing
        // without one be published at all. So make them now rather than hoping
        // somebody pressed "save pngs" in the Shopfront first — which is what
        // used to happen, and why drafts arrived with no pictures.
        const images = await this.ensureImages(product);

        if (!images.length) {
          // Held, not lost. Marking it blocked is what gives it a way back:
          // it shows in the Shopfront with a "send to Etsy" button, the health
          // check reports it, and the Manager stops treating it as finished.
          // The first version of this just returned, which left the product in
          // a state nothing retried and nothing displayed — worse than the
          // imageless draft it was written to prevent.
          blockProduct(product.id, 'no listing images could be made');
          this.say(
            `${product.sku} is held: I could not make the listing images, and Etsy will not let a ` +
              'listing be published without one. Open the Shopfront and press ' +
              '"send to etsy" to try again, or "save pngs" first and your browser will do it.' +
              (findBrowser() ? '' : ' (No Chrome, Edge, Chromium or Brave found on this machine.)'),
            { kind: 'listed', level: 'warn', meta: { productId: product.id } }
          );
          this.goHome();
          return { result: { held: 'no listing images' } };
        }

        const created = await createDraftListing({ listing, product, deliverables, images });
        update('listings', listing.id, {
          status: created.state === 'active' ? 'live' : 'draft',
          etsy_listing_id: created.listingId,
          export_path: dir.replace(config.root + '/', ''),
          updated_at: now(),
        });
        setStage(product.id, 'listed', { status: 'done' });
        this.say(
          `${product.sku} is a ${created.state} listing on Etsy with ${images.length} image(s) ` +
            `and ${deliverables.length} file(s) attached: ${created.url}`,
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
