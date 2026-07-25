// THE MAKER — builds the actual files. Works in the Workshop.
import Agent from './base.js';
import { getProduct, ideaFor, advance } from '../pipeline/products.js';
import { offlineSpec, normaliseSpec } from '../design/templates/plan.js';
import { PALETTE_NAMES } from '../design/templates/layout.js';
import { buildProduct } from '../design/build.js';
import { suggestPrice } from '../etsy/listing.js';
import config from '../core/config.js';

export class Maker extends Agent {
  constructor() {
    super({
      id: 'maker',
      name: 'The Maker',
      title: 'designer and file builder',
      station: 'workshop',
      colour: '#d99b7c',
      handles: ['maker.build'],
      voice: 'Practical. Talks about pages and layouts, not "visions".',
      purpose: `
You turn an approved idea into a finished, printable product: a page-by-page
plan that the press then renders as real PDFs.

What you care about:
- Page one has to be useful on its own, because it is the preview that sells.
- Every page earns its place. Five good pages beat twenty padded ones.
- It must work in black and white on a cheap home printer.
- Real content, not lorem ipsum. If a page is a checklist, write the actual
  checklist items. If it is a table, name the actual columns.
- Nothing that needs a paid font, stock photo or licensed image.`,
    });
  }

  async handle(job) {
    const product = getProduct(job.payload.productId);
    if (!product) return { result: { skipped: 'product gone' } };
    const idea = ideaFor(product) || {
      id: product.id,
      title: product.title,
      category: product.category,
      keywords: [],
    };
    this.moveTo('workshop', `building ${product.sku}`);

    const raw = await this.thinkOr(() => null, {
      task: `designing ${product.sku}`,
      json: true,
      maxTokens: 4000,
      prompt: this.specPrompt(product, idea),
    });

    const spec = raw
      ? normaliseSpec(raw, idea, config.shopName)
      : offlineSpec(idea, config.shopName);

    const built = buildProduct(product, spec);
    const price = product.price || suggestPrice(idea, built.pageCount);

    this.say(
      `${product.sku} built: ${built.pageCount} pages, ${built.assets.length} files, ` +
        `${spec.palette} palette${spec.sheets ? ', with spreadsheet' : ''}.`,
      { kind: 'built', level: 'good', meta: { productId: product.id, dir: built.dir } }
    );

    advance(product, { spec, price, dir: built.dir });
    this.goHome();
    return { result: { pageCount: built.pageCount, assets: built.assets.length, dir: built.dir } };
  }

  specPrompt(product, idea) {
    const research = product.research || {};
    return `
Plan the pages for this product. The press will render your plan as A4 and US
Letter PDFs, so describe pages, not pixels.

Product: ${idea.title}
Category: ${idea.category}
Who it is for: ${idea.audience}
The pitch: ${idea.pitch}
Their angle: ${idea.angle || '—'}
${research.differentiators?.length ? `Must do: ${research.differentiators.join('; ')}\n` : ''}
Return JSON:
{
  "title": "product title",
  "subtitle": "one line that goes on the cover",
  "palette": one of ${PALETTE_NAMES.join(' | ')},
  "sheets": true if a companion .csv spreadsheet makes sense,
  "pages": [ 4 to 8 pages, first must be {"kind":"cover"} ]
}

Page kinds and the fields each one uses:
- cover: title, subtitle, chips (2-3 short badges), note
- table: title, subtitle, columns (2-6, each {"label","weight"}), rows (number
  of blank rows, or an array of row labels), totals (a totals row label),
  checkboxColumn (true to put a tick box in the last column), note
- checklist: title, subtitle, sections ([{title, items:[string or
  {label, minutes}]}]), columnsCount (1 or 2), note
- grid: title, subtitle, columns (e.g. days of the week), rows (array of row
  labels, or a number of blank write-on rows), cells ("box" | "circle" |
  "star" | "blank"), note
- tracker: title, subtitle, rows (array of labels), boxes (circles per row),
  perRow, numbered (true), note
- columns: title, blocks ([{title, prompt, lines}]) — for notes and reflection
- instructions: title, blocks ([{title, body}]) — how to use it
- poster: only for wall art. style ("typographic" | "botanical" | "chart"),
  lines, caption, rows for charts

Write the real content. Actual checklist items, actual column headers, actual
row labels. Nothing generic.`.trim();
  }
}

export default Maker;
