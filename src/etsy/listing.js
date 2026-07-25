// Building the listing itself: title, tags, price and the description a buyer
// reads before deciding. The offline version is a proper Etsy description, not
// a placeholder — it is the same skeleton the good shops use.
import config from '../core/config.js';
import { money, truncate } from '../core/util.js';
import { buildTags, buildTitle, buildMaterials } from './seo.js';

/**
 * Suggest a price. Digital products are priced on perceived value, and the
 * two things buyers use to judge that are page count and how specific it is.
 */
export function suggestPrice(idea, pageCount) {
  const low = Number(idea.price_low) || 3;
  const high = Number(idea.price_high) || low + 3;
  const spread = high - low;
  const pageFactor = Math.min(1, Math.max(0, (pageCount - 3) / 12));
  const demandFactor = ((Number(idea.demand) || 3) - 1) / 4;
  const raw = low + spread * (0.35 + pageFactor * 0.35 + demandFactor * 0.3);
  // Charm pricing: land on .00 / .49 / .99 like the rest of the marketplace.
  const rounded = Math.round(raw * 2) / 2;
  return Number((rounded - 0.01).toFixed(2));
}

const SECTION_RULE = '· · · · · · · · · · · · · · · · · · · · · · · ·';

/**
 * @param {object} args
 * @param {object} args.idea
 * @param {object} args.product
 * @param {object} args.spec
 * @param {number} args.pageCount
 * @param {object} [args.research]
 * @param {string} [args.body] a description body written by the Copywriter
 */
export function buildListing({ idea, product, spec, pageCount, research, body }) {
  const keywords = dedupe([
    ...(research?.keywords || []),
    ...(idea.keywords || []),
  ]);
  const primary = keywords[0] || idea.title.toLowerCase();

  const title = buildTitle({
    name: idea.title,
    keyword: primary,
    audience: idea.audience,
    format: shortFormat(idea.format),
  });

  const price = product.price || suggestPrice(idea, pageCount);
  const description = body
    ? assembleDescription(body, { idea, spec, pageCount, price })
    : offlineDescription({ idea, spec, pageCount, price, keywords });

  return {
    title,
    description,
    tags: buildTags(keywords, { category: idea.category, audience: idea.audience }),
    materials: buildMaterials(spec),
    price,
    files: (pageCount && `${pageCount} pages`) || null,
  };
}

const shortFormat = (format) => {
  const f = String(format || '').toLowerCase();
  if (f.includes('spreadsheet')) return 'Spreadsheet';
  if (f.includes('art')) return 'Wall Art Set';
  if (f.includes('binder')) return 'Planner Binder';
  if (f.includes('hyperlinked')) return 'Digital Planner';
  if (f.includes('cards')) return 'Printable Cards';
  return null;
};

const dedupe = (list) => [...new Set(list.map((k) => String(k).toLowerCase().trim()).filter(Boolean))];

/** Wrap a written body in the boilerplate every digital listing needs. */
function assembleDescription(body, { idea, spec, pageCount, price }) {
  return [
    truncate(String(body).trim(), 4000),
    '',
    SECTION_RULE,
    '',
    whatYouGet(spec, pageCount),
    '',
    printing(),
    '',
    digitalNotice(),
    '',
    terms(),
  ].join('\n');
}

function offlineDescription({ idea, spec, pageCount, price, keywords }) {
  const hook = idea.pitch || `${idea.title} for ${idea.audience}.`;
  const why = idea.angle ? `Why this one and not a free scribble: ${idea.angle}` : '';

  return [
    `${idea.title}`,
    '',
    hook,
    '',
    `Made for ${idea.audience}. ${why}`.trim(),
    '',
    SECTION_RULE,
    '',
    whatYouGet(spec, pageCount),
    '',
    'HOW TO USE IT',
    '1. Buy it, and the files appear straight away in your Etsy downloads.',
    '2. Print the A4 or US Letter version at 100% (not "fit to page").',
    '3. Fill it in with a pen, or pop it in a punched pocket and use a dry',
    '   wipe pen so you can reuse it every week.',
    '',
    printing(),
    '',
    digitalNotice(),
    '',
    terms(),
    '',
    SECTION_RULE,
    '',
    `Keywords: ${keywords.slice(0, 8).join(', ')}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function whatYouGet(spec, pageCount) {
  const lines = ['WHAT YOU GET'];
  lines.push(`• ${pageCount} printable page${pageCount === 1 ? '' : 's'} in one tidy PDF`);
  lines.push('• A4 size and US Letter size, both included');
  if (spec?.sheets) lines.push('• An editable spreadsheet (.csv) for Excel, Numbers or free Google Sheets');
  lines.push('• Prints beautifully in black and white, so it costs pennies in ink');
  lines.push('• Undated, so you can start on any day and reprint it forever');
  for (const page of (spec?.pages || []).slice(1, 8)) {
    if (page.title) lines.push(`   – ${page.title}`);
  }
  return lines.join('\n');
}

const printing = () =>
  [
    'PRINTING',
    'Any home printer will do. Choose "Actual size" or 100% in your printer',
    'settings rather than "Fit to page", and plain paper is absolutely fine —',
    '120gsm or card just feels nicer. Greyscale works perfectly.',
  ].join('\n');

const digitalNotice = () =>
  [
    'THIS IS A DIGITAL DOWNLOAD',
    'No physical item will be posted to you. Nothing is printed, packed or',
    'shipped. You download the files and print them yourself, as many times',
    'as you like.',
  ].join('\n');

const terms = () =>
  [
    'TERMS',
    'For your own personal use. Please do not resell the files, share them, or',
    'use them commercially. Colours can look slightly different from screen to',
    'printer, which is normal.',
    '',
    'Any trouble at all, message the shop first — it is almost always a printer',
    'setting and it takes two minutes to sort out.',
  ].join('\n');

/** The prompt the Copywriter uses when a model is available. */
export function copyPrompt({ idea, spec, pageCount, research }) {
  return `
Write the opening of an Etsy listing description for this digital download.

Product: ${idea.title}
Category: ${idea.category}
Who it is for: ${idea.audience}
The pitch: ${idea.pitch}
What makes it different: ${idea.angle}
Pages: ${pageCount}
${spec?.sheets ? 'Includes an editable spreadsheet.\n' : ''}${
    research?.keywords?.length ? `Buyers search for: ${research.keywords.join(', ')}\n` : ''
  }Page titles: ${(spec?.pages || []).map((p) => p.title).filter(Boolean).join(' · ')}

Rules:
- 150 to 250 words. Plain English. British spelling.
- Start with the buyer's problem in their own words, not with the product name.
- Say what is on the pages, concretely.
- Work the main search phrase in naturally, twice at most.
- No "unlock", "elevate", "game changer", "in today's fast-paced world", no
  emoji, no exclamation marks, no fake urgency, no invented reviews or claims.
- Do NOT write the "what you get", printing, digital download or terms
  sections — those get added afterwards. Just the human part.
Return plain text only.`.trim();
}

export function priceLine(price) {
  return money(price, config.currency);
}

export default buildListing;
