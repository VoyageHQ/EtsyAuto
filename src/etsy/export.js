// Packing a listing for upload. This is the free path: no Etsy API access
// needed, nothing to apply for. You get a folder you can work through in
// about two minutes per product.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import config from '../core/config.js';
import { all } from '../core/db.js';
import { money } from '../core/util.js';
import { auditListing } from './seo.js';

/**
 * @param {object} product products row (needs .dir)
 * @param {object} listing listings row / object
 * @returns {string} the folder that was written
 */
export function writeListingPack(product, listing) {
  const dir = join(config.outDir, product.dir);
  mkdirSync(dir, { recursive: true });

  const assets = all('SELECT * FROM assets WHERE product_id = ? ORDER BY role, label', product.id);
  const deliverables = assets.filter((a) => a.role === 'deliverable' || a.role === 'instructions');
  const mockups = assets.filter((a) => a.role === 'mockup');
  const problems = auditListing(listing);
  const tags = Array.isArray(listing.tags) ? listing.tags : JSON.parse(listing.tags || '[]');
  const materials = Array.isArray(listing.materials)
    ? listing.materials
    : JSON.parse(listing.materials || '[]');

  const md = [
    `# ${listing.title}`,
    '',
    `**SKU** ${product.sku}  ·  **Price** ${money(listing.price, config.currency)}  ·  **Type** Digital download`,
    '',
    problems.length
      ? ['> [!] Fix before uploading:', ...problems.map((p) => `> - ${p}`), ''].join('\n')
      : '> Checked and clean. Nothing to fix.\n',
    '## 1. Copy the title',
    '```',
    listing.title,
    '```',
    `${listing.title.length}/140 characters.`,
    '',
    '## 2. Copy the tags',
    'Etsy wants them one at a time. All 13 are already the legal length.',
    '```',
    tags.join(', '),
    '```',
    '',
    '## 3. Copy the description',
    '```',
    listing.description,
    '```',
    '',
    '## 4. Upload these digital files',
    ...deliverables.map((a) => `- \`${a.path}\`${a.bytes ? ` (${kb(a.bytes)})` : ''} — ${a.label}`),
    '',
    'Etsy allows five files per listing, up to 20MB each. These are all well under.',
    '',
    '## 5. Upload these listing images',
    'The dashboard turns each of these into a PNG for you — open the product and',
    'press "Save PNGs". Etsy shows images at 4:3 and these are built at 2400x1800.',
    ...mockups.map((a) => `- \`${a.path.replace(/\.svg$/, '.png')}\` — ${a.label}`),
    '',
    '## 6. Listing settings',
    '| Field | Value |',
    '| --- | --- |',
    '| Type | Digital |',
    '| Who made it | I did |',
    '| What is it | A finished product |',
    '| When was it made | Made to order |',
    `| Materials | ${materials.join(', ')} |`,
    `| Price | ${money(listing.price, config.currency)} |`,
    '| Quantity | 999 (digital listings never run out) |',
    '| Personalisation | Off |',
    '| Renew | Automatic |',
    '',
    '## 7. After it is live',
    'Paste the listing URL into the dashboard (Shopfront → paste URL) so the',
    'Ledger can track what it earns and the Researcher can watch its ranking.',
    '',
  ].join('\n');

  const mdPath = join(dir, 'LISTING.md');
  writeFileSync(mdPath, md);

  // A one-row CSV, handy for bulk-upload tools and for your own records.
  const csvPath = join(dir, 'listing.csv');
  writeFileSync(
    csvPath,
    toCsv([
      ['sku', 'title', 'description', 'price', 'currency', 'tags', 'materials', 'type', 'quantity'],
      [
        product.sku,
        listing.title,
        listing.description,
        Number(listing.price).toFixed(2),
        config.currency,
        tags.join('|'),
        materials.join('|'),
        'download',
        '999',
      ],
    ])
  );

  return dir;
}

const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

function toCsv(rows) {
  const escape = (value) => {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((row) => row.map(escape).join(',')).join('\n') + '\n';
}

export default writeListingPack;
