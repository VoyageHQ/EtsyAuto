// Doc -> PDF, written by hand so the project needs no PDF library.
// Produces a PDF 1.4 file with Flate-compressed content streams and the three
// base Helvetica faces, which every PDF reader and printer already has.
import { deflateSync } from 'node:zlib';
import { FONTS } from './doc.js';

const FONT_RES = {
  [FONTS.regular]: 'F1',
  [FONTS.bold]: 'F2',
  [FONTS.italic]: 'F3',
};

// Characters outside Latin-1 that we still want to print correctly.
const WINANSI = new Map([
  ['€', 128], ['‚', 130], ['ƒ', 131], ['„', 132],
  ['…', 133], ['†', 134], ['‡', 135], ['ˆ', 136],
  ['‰', 137], ['Š', 138], ['‹', 139], ['Œ', 140],
  ['‘', 145], ['’', 146], ['“', 147], ['”', 148],
  ['•', 149], ['–', 150], ['—', 151], ['˜', 152],
  ['™', 153], ['š', 154], ['›', 155], ['œ', 156],
  ['ž', 158], ['Ÿ', 159],
]);

function pdfString(text) {
  const bytes = [];
  for (const ch of String(text)) {
    let code = ch.codePointAt(0);
    if (WINANSI.has(ch)) code = WINANSI.get(ch);
    else if (code > 255) code = 63; // '?'
    if (code === 0x28 || code === 0x29 || code === 0x5c) bytes.push(0x5c); // ( ) \
    bytes.push(code);
  }
  return Buffer.from(bytes);
}

function colour(hex) {
  const h = String(hex || '#000000').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6) || '000000', 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return `${fmt(r)} ${fmt(g)} ${fmt(b)}`;
}

const fmt = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return (Math.round(v * 1000) / 1000).toString();
};

/** Bezier magic number for circles. */
const K = 0.5523;

function pageContent(page) {
  const H = page.h;
  const flipY = (y) => H - y;
  const ops = [];

  for (const item of page.items) {
    switch (item.type) {
      case 'rect': {
        const y = flipY(item.y + item.h);
        if (item.dash) ops.push(`[${item.dash.join(' ')}] 0 d`);
        if (item.fill) ops.push(`${colour(item.fill)} rg`);
        if (item.stroke) ops.push(`${colour(item.stroke)} RG`, `${fmt(item.lw)} w`);
        if (item.r > 0) {
          roundRect(ops, item.x, y, item.w, item.h, item.r);
        } else {
          ops.push(`${fmt(item.x)} ${fmt(y)} ${fmt(item.w)} ${fmt(item.h)} re`);
        }
        ops.push(paintOp(item));
        if (item.dash) ops.push('[] 0 d');
        break;
      }
      case 'line': {
        ops.push(`${colour(item.stroke)} RG`, `${fmt(item.lw)} w`);
        if (item.dash) ops.push(`[${item.dash.join(' ')}] 0 d`);
        ops.push(
          `${fmt(item.x1)} ${fmt(flipY(item.y1))} m ${fmt(item.x2)} ${fmt(flipY(item.y2))} l S`
        );
        if (item.dash) ops.push('[] 0 d');
        break;
      }
      case 'circle': {
        const cx = item.cx;
        const cy = flipY(item.cy);
        const r = item.r;
        if (item.fill) ops.push(`${colour(item.fill)} rg`);
        if (item.stroke) ops.push(`${colour(item.stroke)} RG`, `${fmt(item.lw)} w`);
        ops.push(`${fmt(cx + r)} ${fmt(cy)} m`);
        ops.push(curve(cx + r, cy + r * K, cx + r * K, cy + r, cx, cy + r));
        ops.push(curve(cx - r * K, cy + r, cx - r, cy + r * K, cx - r, cy));
        ops.push(curve(cx - r, cy - r * K, cx - r * K, cy - r, cx, cy - r));
        ops.push(curve(cx + r * K, cy - r, cx + r, cy - r * K, cx + r, cy));
        ops.push(paintOp(item));
        break;
      }
      case 'poly': {
        if (!item.points?.length) break;
        if (item.fill) ops.push(`${colour(item.fill)} rg`);
        if (item.stroke) ops.push(`${colour(item.stroke)} RG`, `${fmt(item.lw)} w`);
        item.points.forEach((p, i) => {
          ops.push(`${fmt(p.x)} ${fmt(flipY(p.y))} ${i === 0 ? 'm' : 'l'}`);
        });
        if (item.close) ops.push('h');
        ops.push(paintOp(item));
        break;
      }
      case 'text': {
        const res = FONT_RES[item.font] || 'F1';
        ops.push('BT');
        ops.push(`/${res} ${fmt(item.size)} Tf`);
        if (item.tracking) ops.push(`${fmt(item.tracking)} Tc`);
        ops.push(`${colour(item.fill)} rg`);
        ops.push(`${fmt(item.x)} ${fmt(flipY(item.y))} Td`);
        ops.push(`(${pdfString(item.text).toString('latin1')}) Tj`);
        if (item.tracking) ops.push('0 Tc');
        ops.push('ET');
        break;
      }
      default:
        break;
    }
  }
  return Buffer.from(ops.join('\n'), 'latin1');
}

const curve = (x1, y1, x2, y2, x3, y3) =>
  `${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x3)} ${fmt(y3)} c`;

function paintOp(item) {
  if (item.fill && item.stroke) return 'B';
  if (item.fill) return 'f';
  return 'S';
}

function roundRect(ops, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ops.push(`${fmt(x + rr)} ${fmt(y)} m`);
  ops.push(`${fmt(x + w - rr)} ${fmt(y)} l`);
  ops.push(curve(x + w - rr * (1 - K), y, x + w, y + rr * (1 - K), x + w, y + rr));
  ops.push(`${fmt(x + w)} ${fmt(y + h - rr)} l`);
  ops.push(curve(x + w, y + h - rr * (1 - K), x + w - rr * (1 - K), y + h, x + w - rr, y + h));
  ops.push(`${fmt(x + rr)} ${fmt(y + h)} l`);
  ops.push(curve(x + rr * (1 - K), y + h, x, y + h - rr * (1 - K), x, y + h - rr));
  ops.push(`${fmt(x)} ${fmt(y + rr)} l`);
  ops.push(curve(x, y + rr * (1 - K), x + rr * (1 - K), y, x + rr, y));
  ops.push('h');
}

/**
 * Render a Doc to PDF bytes.
 * @param {import('./doc.js').Doc} doc
 * @returns {Buffer}
 */
export function renderPdf(doc) {
  /** @type {Buffer[]} */
  const objects = [];
  const addObject = (body) => {
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
    return objects.length; // 1-based object number
  };

  // Reserve 1 = Catalog, 2 = Pages.
  addObject('');
  addObject('');

  const fontIds = {
    F1: addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    F2: addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    F3: addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>'),
  };
  const fontDict = Object.entries(fontIds)
    .map(([res, id]) => `/${res} ${id} 0 R`)
    .join(' ');

  const pageIds = [];
  for (const page of doc.pages) {
    const raw = pageContent(page);
    const packed = deflateSync(raw);
    const streamId = addObject(
      Buffer.concat([
        Buffer.from(`<< /Length ${packed.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
        packed,
        Buffer.from('\nendstream', 'latin1'),
      ])
    );
    const pageId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(page.w)} ${fmt(page.h)}] ` +
        `/Resources << /Font << ${fontDict} >> >> /Contents ${streamId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[0] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1');
  objects[1] = Buffer.from(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
    'latin1'
  );

  const stamp = pdfDate(new Date());
  const infoId = addObject(
    `<< /Title (${pdfString(doc.title).toString('latin1')}) ` +
      `/Author (${pdfString(doc.author).toString('latin1')}) ` +
      `/Subject (${pdfString(doc.subject || '').toString('latin1')}) ` +
      `/Keywords (${pdfString((doc.keywords || []).join(', ')).toString('latin1')}) ` +
      `/Creator (EtsyAuto) /Producer (EtsyAuto) /CreationDate (${stamp}) /ModDate (${stamp}) >>`
  );

  // Assemble.
  const chunks = [];
  let offset = 0;
  const push = (buf) => {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'latin1');
    chunks.push(b);
    offset += b.length;
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const offsets = [];
  objects.forEach((body, i) => {
    offsets[i] = offset;
    push(`${i + 1} 0 obj\n`);
    push(body);
    push('\nendobj\n');
  });

  const xrefStart = offset;
  const lines = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (const off of offsets) {
    lines.push(`${String(off).padStart(10, '0')} 00000 n \n`);
  }
  push(lines.join(''));
  push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\n` +
      `startxref\n${xrefStart}\n%%EOF\n`
  );

  return Buffer.concat(chunks);
}

function pdfDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export default renderPdf;
