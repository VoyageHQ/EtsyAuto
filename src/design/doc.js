// A tiny document model. Pages hold flat drawing primitives in points
// (72 per inch) with a top-left origin, y going down — the same mental model
// as CSS. The PDF writer flips it, the SVG writer does not.

export const PAPER = {
  A4: { w: 595.28, h: 841.89, label: 'A4' },
  Letter: { w: 612, h: 792, label: 'US Letter' },
  A4L: { w: 841.89, h: 595.28, label: 'A4 landscape' },
  LetterL: { w: 792, h: 612, label: 'US Letter landscape' },
  Square: { w: 720, h: 720, label: '1:1' },
  Ratio23: { w: 576, h: 864, label: '2:3 (4x6, 8x12, 16x24)' },
  Ratio45: { w: 576, h: 720, label: '4:5 (8x10, 16x20)' },
};

export const FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
};

// Standard Adobe widths per 1000 units, ASCII 32..126.
const W_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Width of a string in points. */
export function textWidth(text, size, font = FONTS.regular) {
  const table = font === FONTS.bold ? W_BOLD : W_REGULAR;
  let total = 0;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const w = code >= 32 && code <= 126 ? table[code - 32] : 556;
    total += w;
  }
  return (total / 1000) * size;
}

/** Greedy word wrap to a pixel width. Returns an array of lines. */
export function wrap(text, maxWidth, size, font = FONTS.regular) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, font) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrink a font size until the text fits on one line. */
export function fitSize(text, maxWidth, startSize, minSize = 6, font = FONTS.regular) {
  let size = startSize;
  while (size > minSize && textWidth(text, size, font) > maxWidth) size -= 0.5;
  return size;
}

export class Page {
  constructor(paper = 'A4', meta = {}) {
    const p = typeof paper === 'string' ? PAPER[paper] || PAPER.A4 : paper;
    this.w = p.w;
    this.h = p.h;
    this.paper = typeof paper === 'string' ? paper : 'custom';
    this.meta = meta;
    this.items = [];
  }

  rect(x, y, w, h, opts = {}) {
    this.items.push({ type: 'rect', x, y, w, h, r: opts.r || 0, fill: opts.fill || null, stroke: opts.stroke || null, lw: opts.lw ?? 0.75, dash: opts.dash || null });
    return this;
  }

  line(x1, y1, x2, y2, opts = {}) {
    this.items.push({ type: 'line', x1, y1, x2, y2, stroke: opts.stroke || '#000000', lw: opts.lw ?? 0.75, dash: opts.dash || null });
    return this;
  }

  circle(cx, cy, r, opts = {}) {
    this.items.push({ type: 'circle', cx, cy, r, fill: opts.fill || null, stroke: opts.stroke || null, lw: opts.lw ?? 0.75 });
    return this;
  }

  /** Closed polygon from [{x,y},...]. */
  poly(points, opts = {}) {
    this.items.push({ type: 'poly', points, fill: opts.fill || null, stroke: opts.stroke || null, lw: opts.lw ?? 0.75, close: opts.close !== false });
    return this;
  }

  /**
   * Draw text. `y` is the baseline. align: left | center | right.
   * Letter spacing is in points.
   */
  text(x, y, value, opts = {}) {
    const font = opts.font || FONTS.regular;
    const size = opts.size ?? 10;
    const align = opts.align || 'left';
    const tracking = opts.tracking || 0;
    const str = String(value ?? '');
    const width = textWidth(str, size, font) + tracking * Math.max(0, str.length - 1);
    let drawX = x;
    if (align === 'center') drawX = x - width / 2;
    else if (align === 'right') drawX = x - width;
    this.items.push({ type: 'text', x: drawX, y, text: str, size, font, fill: opts.fill || '#1c1c1c', tracking, width });
    return this;
  }

  /** Wrapped paragraph. Returns the y just below the last line. */
  paragraph(x, y, value, maxWidth, opts = {}) {
    const size = opts.size ?? 9;
    const font = opts.font || FONTS.regular;
    const leading = opts.leading ?? size * 1.35;
    const lines = wrap(value, maxWidth, size, font);
    const limited = opts.maxLines ? lines.slice(0, opts.maxLines) : lines;
    limited.forEach((line, i) => {
      this.text(opts.align === 'center' ? x + maxWidth / 2 : x, y + i * leading, line, {
        ...opts,
        size,
        font,
      });
    });
    return y + limited.length * leading;
  }
}

export class Doc {
  constructor(meta = {}) {
    this.title = meta.title || 'Untitled';
    this.author = meta.author || 'Hartistic';
    this.subject = meta.subject || '';
    this.keywords = meta.keywords || [];
    this.pages = [];
  }

  addPage(paper = 'A4', meta = {}) {
    const page = new Page(paper, meta);
    this.pages.push(page);
    return page;
  }
}

export default Doc;
