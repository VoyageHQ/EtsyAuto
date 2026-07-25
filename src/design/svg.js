// Doc -> SVG. Used for the dashboard preview and as the source the browser
// turns into the PNG listing images Etsy wants.
import { FONTS } from './doc.js';

const FAMILY = "Helvetica, Arial, 'Liberation Sans', sans-serif";

const esc = (text) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const n = (v) => (Math.round(Number(v) * 100) / 100).toString();

function paint(item) {
  const bits = [];
  bits.push(`fill="${item.fill || 'none'}"`);
  if (item.stroke) {
    bits.push(`stroke="${item.stroke}"`, `stroke-width="${n(item.lw ?? 0.75)}"`);
    if (item.dash) bits.push(`stroke-dasharray="${item.dash.join(' ')}"`);
  }
  return bits.join(' ');
}

/** Render just the drawing instructions of a page, with no <svg> wrapper. */
export function renderSvgInner(page, opts = {}) {
  const parts = [];
  if (opts.background !== false) {
    parts.push(`<rect width="${n(page.w)}" height="${n(page.h)}" fill="${opts.background || '#ffffff'}"/>`);
  }

  for (const item of page.items) {
    switch (item.type) {
      case 'rect':
        parts.push(
          `<rect x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}"` +
            (item.r ? ` rx="${n(item.r)}"` : '') +
            ` ${paint(item)}/>`
        );
        break;
      case 'line':
        parts.push(
          `<line x1="${n(item.x1)}" y1="${n(item.y1)}" x2="${n(item.x2)}" y2="${n(item.y2)}" ` +
            `stroke="${item.stroke}" stroke-width="${n(item.lw)}"` +
            (item.dash ? ` stroke-dasharray="${item.dash.join(' ')}"` : '') +
            '/>'
        );
        break;
      case 'circle':
        parts.push(
          `<circle cx="${n(item.cx)}" cy="${n(item.cy)}" r="${n(item.r)}" ${paint(item)}/>`
        );
        break;
      case 'poly':
        parts.push(
          `<${item.close ? 'polygon' : 'polyline'} points="${item.points
            .map((p) => `${n(p.x)},${n(p.y)}`)
            .join(' ')}" ${paint(item)}/>`
        );
        break;
      case 'text': {
        const weight = item.font === FONTS.bold ? ' font-weight="700"' : '';
        const style = item.font === FONTS.italic ? ' font-style="italic"' : '';
        const track = item.tracking ? ` letter-spacing="${n(item.tracking)}"` : '';
        parts.push(
          `<text x="${n(item.x)}" y="${n(item.y)}" font-family="${FAMILY}" ` +
            `font-size="${n(item.size)}"${weight}${style}${track} fill="${item.fill}">${esc(item.text)}</text>`
        );
        break;
      }
      default:
        break;
    }
  }
  return parts.join('\n');
}

/** Render one page of a Doc as a standalone SVG string. */
export function renderSvgPage(page, opts = {}) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(page.w)}" height="${n(page.h)}" ` +
      `viewBox="0 0 ${n(page.w)} ${n(page.h)}">`,
    renderSvgInner(page, opts),
    '</svg>',
  ].join('\n');
}

export default renderSvgPage;
