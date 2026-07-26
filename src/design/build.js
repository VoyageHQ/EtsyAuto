// Take a spec and put real, sellable files on disk.
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import config from '../core/config.js';
import { insert, run, uid } from '../core/db.js';
import { now, slug } from '../core/util.js';
import { buildDoc } from './templates/layout.js';
import { sheetsFromSpec } from './templates/plan.js';
import { renderPdf } from './pdf.js';
import { renderSvgPage } from './svg.js';
import { buildMockups } from './mockup.js';
import { watermarkFor } from './watermark.js';

const PAPERS = [
  { key: 'A4', suffix: 'A4' },
  { key: 'Letter', suffix: 'US-Letter' },
];

/**
 * Build every file for a product.
 * @param {object} product products row
 * @param {object} spec normalised spec
 * @returns {{dir: string, assets: object[], pageCount: number}}
 */
export function buildProduct(product, spec) {
  const folder = `${product.sku}-${slug(product.title, 48)}`;
  const dir = join(config.outDir, folder);
  const base = slug(product.title, 48) || 'product';
  mkdirSync(join(dir, 'images'), { recursive: true });
  mkdirSync(join(dir, 'preview'), { recursive: true });

  // Wipe any assets from a previous build of this product.
  run('DELETE FROM assets WHERE product_id = ?', product.id);

  const assets = [];
  const record = (kind, role, label, path) => {
    const asset = {
      id: uid('as'),
      product_id: product.id,
      kind,
      role,
      label,
      path: path.replace(config.root + '/', ''),
      bytes: safeSize(path),
      created_at: now(),
    };
    insert('assets', asset);
    assets.push(asset);
  };

  // Wall art and other fixed-ratio products define their own page sizes, so
  // there is nothing to re-flow for Letter.
  const fixedRatio = spec.pages.every((p) => p.paper && p.paper !== 'A4');
  const papers = fixedRatio ? [{ key: 'A4', suffix: 'print-ready' }] : PAPERS;

  let primaryDoc = null;
  for (const paper of papers) {
    const doc = buildDoc(spec, paper.key);
    if (!primaryDoc) primaryDoc = doc;
    const path = join(dir, `${base}-${paper.suffix}.pdf`);
    writeFileSync(path, renderPdf(doc));
    record('pdf', 'deliverable', `${spec.title} (${paper.suffix.replace('-', ' ')})`, path);
  }

  // Page previews. These are what the dashboard shows and what the browser
  // turns into PNGs for Etsy.
  primaryDoc.pages.forEach((page, i) => {
    const path = join(dir, 'preview', `page-${String(i + 1).padStart(2, '0')}.svg`);
    writeFileSync(path, renderSvgPage(page));
    record('svg', 'preview', `Page ${i + 1}`, path);
  });

  // Listing images.
  for (const mockup of buildMockups(spec, primaryDoc, {
    price: product.price,
    currency: currencySymbol(config.currency),
    watermark: watermarkFor(),
  })) {
    const path = join(dir, 'images', `${mockup.name}.svg`);
    writeFileSync(path, mockup.svg);
    record('svg', 'mockup', mockup.name, path);
  }

  // Companion spreadsheet.
  if (spec.sheets) {
    const sheets = sheetsFromSpec(spec);
    if (sheets.length) {
      mkdirSync(join(dir, 'spreadsheet'), { recursive: true });
      for (const sheet of sheets) {
        const path = join(dir, 'spreadsheet', `${slug(sheet.name, 40) || 'sheet'}.csv`);
        writeFileSync(path, toCsv(sheet));
        record('csv', 'deliverable', `${sheet.name} (spreadsheet)`, path);
      }
    }
  }

  // The file every buyer opens first.
  const readmePath = join(dir, 'READ-ME-FIRST.txt');
  writeFileSync(readmePath, readme(spec, product, primaryDoc.pages.length));
  record('txt', 'instructions', 'Read me first', readmePath);

  // A brief you can hand to Canva if you would rather design it by hand.
  const briefPath = join(dir, 'design-brief.md');
  writeFileSync(briefPath, designBrief(spec, product));
  record('brief', 'instructions', 'Canva design brief', briefPath);

  return { dir: folder, assets, pageCount: primaryDoc.pages.length };
}

function safeSize(path) {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

function toCsv(sheet) {
  const escape = (value) => {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [sheet.headers, ...sheet.rows].map((row) => row.map(escape).join(',')).join('\n') + '\n';
}

const currencySymbol = (code) => ({ GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$' }[code] || '');

function readme(spec, product, pageCount) {
  return `${spec.title}
${'='.repeat(spec.title.length)}

Thank you — and welcome. Here is everything in this download.

WHAT IS INCLUDED
  * ${pageCount} printable page${pageCount === 1 ? '' : 's'} as a PDF, in A4 and US Letter
${spec.sheets ? '  * An editable .csv spreadsheet (opens in Excel, Numbers, LibreOffice and Google Sheets)\n' : ''}  * This instructions file

HOW TO PRINT IT
  1. Open the PDF that matches your paper: A4 (most of the world) or US Letter
     (United States and Canada).
  2. In your printer settings choose "Actual size" or 100%. Do NOT choose
     "Fit to page" or "Shrink oversized pages" — it will shift the layout.
  3. Plain paper is fine. 120gsm or card feels nicer if you have it.
  4. Everything is designed to print in black and white, so greyscale mode
     works perfectly and saves your colour ink.

REUSING IT WITHOUT REPRINTING
  Slide a page into a punched pocket or laminate it, and write on it with a
  dry wipe pen. Wipe clean at the end of the week and start again.

TERMS
  This file is for your own personal use. You are very welcome to print it as
  many times as you like for yourself and your household.
  Please do not resell it, share the files, or use them commercially.
  ${product.sku} · ${config.shopName}

If anything looks wrong, message the shop before leaving a review — it will
almost always be a printer setting and it takes two minutes to fix.
`;
}

function designBrief(spec, product) {
  const pages = spec.pages
    .map((page, i) => {
      const bits = [`### Page ${i + 1} — ${page.title || page.kind}`];
      if (page.subtitle) bits.push(`_${page.subtitle}_`);
      bits.push(`- Layout: **${page.kind}**`);
      if (page.columns?.length) {
        bits.push(`- Columns: ${page.columns.map((c) => (typeof c === 'string' ? c : c.label)).join(' · ')}`);
      }
      if (Array.isArray(page.rows)) bits.push(`- Rows: ${page.rows.filter(Boolean).join(' · ') || `${page.rows.length} blank rows`}`);
      else if (page.rows) bits.push(`- Rows: ${page.rows} blank rows`);
      if (page.sections?.length) {
        for (const section of page.sections) {
          const items = section.items.map((i2) => (typeof i2 === 'string' ? i2 : i2.label)).filter(Boolean);
          bits.push(`- ${section.title || 'Section'}: ${items.join(', ') || '(blank lines)'}`);
        }
      }
      if (page.note) bits.push(`- Footnote: ${page.note}`);
      return bits.join('\n');
    })
    .join('\n\n');

  return `# Design brief — ${spec.title}

**SKU** ${product.sku}
**Palette** ${spec.palette}
**Paper** A4 (595 × 842 pt) and US Letter (612 × 792 pt)

The Maker has already produced finished PDFs from this brief. Use this file
only if you want to rebuild the product by hand in Canva, Inkscape, Google
Docs or Libre Draw — for example to add illustrations the generator cannot
draw.

## Canva route (free plan)
1. Create a design → Custom size → 21 × 29.7 cm for A4.
2. Set up a grid or table for each page below.
3. Stick to free elements only. Filter to "Free" so nothing lands with a
   watermark, and avoid Canva's stock photos in anything you sell.
4. Share → Download → PDF Print, with crop marks off.
5. Drop the PDF into \`out/${product.sku}-*/\` replacing the generated one,
   then press Rebuild on the dashboard to refresh the listing images.

## Pages

${pages}

## House rules
- Nothing may depend on colour to be readable.
- Every page needs 12mm of clear margin so home printers do not clip it.
- No stock photography, no paid fonts, no AI-generated logos.
`;
}

export default buildProduct;
