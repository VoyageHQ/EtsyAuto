// Listing images. Etsy shows these at 4:3, so they are built at 2400x1800
// with the real pages embedded inside — what the buyer sees is exactly what
// they get. Output is SVG; the dashboard turns them into the PNG/JPG that
// Etsy accepts with one click (see docs/PUBLISHING.md).
import { renderSvgInner } from './svg.js';
import { PALETTES } from './templates/layout.js';
import { wrap, textWidth, fitSize, FONTS } from './doc.js';

const W = 1200;
const H = 900;
const SCALE = 2; // exported at 2400x1800

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FAMILY = "Helvetica, Arial, 'Liberation Sans', sans-serif";

function svgOpen() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}">`;
}

function text(x, y, value, opts = {}) {
  const anchor = opts.align === 'center' ? 'middle' : opts.align === 'right' ? 'end' : 'start';
  const weight = opts.bold ? ' font-weight="700"' : '';
  const style = opts.italic ? ' font-style="italic"' : '';
  const track = opts.tracking ? ` letter-spacing="${opts.tracking}"` : '';
  return `<text x="${x}" y="${y}" font-family="${FAMILY}" font-size="${opts.size || 20}"${weight}${style}${track} fill="${opts.fill || '#222'}" text-anchor="${anchor}">${esc(value)}</text>`;
}

/** Drop a real page into the artwork at a given size, with a paper shadow. */
function pageCard(page, x, y, targetW, opts = {}) {
  const scale = targetW / page.w;
  const h = page.h * scale;
  const rotate = opts.rotate ? ` rotate(${opts.rotate} ${targetW / 2} ${h / 2})` : '';
  return [
    `<g transform="translate(${x} ${y})${rotate}">`,
    `<rect x="3" y="5" width="${targetW}" height="${h}" fill="#000" opacity="0.10" rx="2"/>`,
    `<g transform="scale(${scale})">${renderSvgInner(page)}</g>`,
    `<rect width="${targetW}" height="${h}" fill="none" stroke="#00000022" stroke-width="1"/>`,
    '</g>',
  ].join('');
}

function badge(x, y, label, pal) {
  const w = textWidth(label, 15, FONTS.bold) + 34;
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="34" rx="17" fill="${pal.accent}"/>`,
    text(x + w / 2, y + 22, label, { size: 15, bold: true, fill: '#ffffff', align: 'center', tracking: 0.8 }),
  ].join('');
}

function backdrop(pal) {
  return [
    `<rect width="${W}" height="${H}" fill="${pal.soft}"/>`,
    `<circle cx="${W - 120}" cy="120" r="240" fill="${pal.mid}" opacity="0.55"/>`,
    `<circle cx="90" cy="${H - 60}" r="180" fill="${pal.mid}" opacity="0.4"/>`,
  ].join('');
}

/**
 * @param {object} spec normalised product spec
 * @param {import('./doc.js').Doc} doc the built document
 * @param {object} opts { price, currency, pageCount }
 * @returns {{name: string, svg: string}[]}
 */
export function buildMockups(spec, doc, opts = {}) {
  const pal = PALETTES[spec.palette] || PALETTES.sage;
  const pages = doc.pages;
  const out = [];

  // 1 — hero
  {
    const parts = [svgOpen(), backdrop(pal)];
    const titleLines = wrap(spec.title, 520, 46, FONTS.bold).slice(0, 3);
    let y = 300 - (titleLines.length - 1) * 26;
    parts.push(text(80, 150, (spec.brand || '').toUpperCase(), { size: 17, bold: true, fill: pal.faint, tracking: 4 }));
    for (const line of titleLines) {
      parts.push(text(80, y, line, { size: fitSize(line, 520, 46, 24, FONTS.bold), bold: true, fill: pal.ink }));
      y += 54;
    }
    parts.push(`<rect x="80" y="${y - 26}" width="86" height="5" fill="${pal.accent}"/>`);
    const sub = wrap(spec.subtitle || '', 500, 21).slice(0, 3);
    let sy = y + 24;
    for (const line of sub) {
      parts.push(text(80, sy, line, { size: 21, fill: pal.faint }));
      sy += 29;
    }
    parts.push(badge(80, sy + 16, 'INSTANT DOWNLOAD', pal));
    parts.push(
      text(80, sy + 108, `${pages.length} PAGE${pages.length === 1 ? '' : 'S'}  ·  A4 + US LETTER  ·  PRINT AT HOME`, {
        size: 15,
        bold: true,
        fill: pal.faint,
        tracking: 1.6,
      })
    );

    // Fanned pages on the right.
    const fan = pages.slice(0, 3);
    fan.forEach((page, i) => {
      parts.push(pageCard(page, 690 + i * 66, 165 + i * 40, 352 - i * 14, { rotate: i === 0 ? -3 : i === 1 ? 1.5 : 5 }));
    });
    parts.push('</svg>');
    out.push({ name: '1-hero', svg: parts.join('\n') });
  }

  // 2 — everything you get
  {
    const parts = [svgOpen(), `<rect width="${W}" height="${H}" fill="${pal.paper}"/>`];
    parts.push(text(W / 2, 92, 'WHAT YOU GET', { size: 26, bold: true, fill: pal.ink, align: 'center', tracking: 4 }));
    parts.push(`<rect x="${W / 2 - 40}" y="112" width="80" height="4" fill="${pal.accent}"/>`);
    const show = pages.slice(0, 8);
    const cols = show.length <= 4 ? show.length : 4;
    const rows = Math.ceil(show.length / cols);
    const cellW = (W - 160) / cols;
    const thumbW = Math.min(cellW - 30, (H - 240) / rows / 1.414);
    show.forEach((page, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 80 + col * cellW + (cellW - thumbW) / 2;
      const yTop = 160 + row * ((H - 230) / rows);
      parts.push(pageCard(page, x, yTop, thumbW));
      const label = page.meta?.kind === 'cover' ? 'Cover' : titleOf(spec, i);
      parts.push(
        text(x + thumbW / 2, yTop + thumbW * 1.414 + 26, label, {
          size: 15,
          bold: true,
          fill: pal.faint,
          align: 'center',
        })
      );
    });
    parts.push('</svg>');
    out.push({ name: '2-contents', svg: parts.join('\n') });
  }

  // 3 — the details
  {
    const parts = [svgOpen(), backdrop(pal)];
    parts.push(text(80, 130, 'THE DETAILS', { size: 26, bold: true, fill: pal.ink, tracking: 4 }));
    parts.push(`<rect x="80" y="152" width="80" height="4" fill="${pal.accent}"/>`);
    const bullets = [
      `${pages.length} printable page${pages.length === 1 ? '' : 's'}, ready to use straight away`,
      'A4 and US Letter PDFs, both included',
      'Prints cleanly in black and white to save ink',
      spec.sheets ? 'Editable .csv spreadsheet included (Excel, Numbers, Google Sheets)' : 'Print as many times as you like, forever',
      'Instant download — nothing is posted to you',
      'For personal use. Please do not resell or share the files.',
    ];
    let y = 220;
    for (const line of bullets) {
      parts.push(`<circle cx="94" cy="${y - 7}" r="6" fill="${pal.accent}"/>`);
      const lines = wrap(line, 520, 21);
      lines.forEach((l, i) => {
        parts.push(text(120, y + i * 28, l, { size: 21, fill: pal.ink }));
      });
      y += 28 * lines.length + 20;
    }
    if (opts.price) {
      parts.push(text(80, H - 90, `${opts.currency || ''}${Number(opts.price).toFixed(2)}`, { size: 44, bold: true, fill: pal.accent }));
      parts.push(text(80, H - 60, 'DIGITAL DOWNLOAD', { size: 14, bold: true, fill: pal.faint, tracking: 2 }));
    }
    const hero = pages[1] || pages[0];
    parts.push(pageCard(hero, 730, 170, 380));
    parts.push('</svg>');
    out.push({ name: '3-details', svg: parts.join('\n') });
  }

  // 4 — one page, close up, so buyers can read it
  if (pages[1]) {
    const parts = [svgOpen(), `<rect width="${W}" height="${H}" fill="${pal.soft}"/>`];
    const page = pages[1];
    const targetH = H - 130;
    const w = (page.w / page.h) * targetH;
    parts.push(pageCard(page, (W - w) / 2, 70, w));
    parts.push(text(W / 2, 46, 'A CLOSER LOOK', { size: 18, bold: true, fill: pal.faint, align: 'center', tracking: 3.4 }));
    parts.push('</svg>');
    out.push({ name: '4-closeup', svg: parts.join('\n') });
  }

  return out;
}

function titleOf(spec, index) {
  const page = spec.pages?.[index];
  return page?.title || page?.kind || 'Page';
}

export default buildMockups;
