// The printing press. Turns a product spec into real pages.
//
// Everything here is built to survive a home printer: hairline rules rather
// than heavy fills, tints light enough to write on in biro, and no page that
// depends on colour to make sense.
import { Doc, PAPER, FONTS, textWidth, wrap, fitSize } from '../doc.js';

export const PALETTES = {
  sage:   { paper: '#ffffff', ink: '#20261f', soft: '#f2f5ef', mid: '#dbe4d5', accent: '#6f8f6a', rule: '#c4cdbf', faint: '#8a958a' },
  blush:  { paper: '#ffffff', ink: '#2a2124', soft: '#fbf1f1', mid: '#f0dada', accent: '#c17e80', rule: '#dcc9c9', faint: '#9c8b8d' },
  ink:    { paper: '#ffffff', ink: '#15181c', soft: '#f4f5f7', mid: '#dfe2e7', accent: '#3f4956', rule: '#c9ccd2', faint: '#868d97' },
  ocean:  { paper: '#ffffff', ink: '#16232b', soft: '#eef4f7', mid: '#d3e2e9', accent: '#4b7f95', rule: '#bfd2da', faint: '#7f929b' },
  clay:   { paper: '#ffffff', ink: '#2b211a', soft: '#f8f2ec', mid: '#ecdccd', accent: '#a8724a', rule: '#dcc8b6', faint: '#9a8878' },
  mono:   { paper: '#ffffff', ink: '#111111', soft: '#f5f5f5', mid: '#e2e2e2', accent: '#444444', rule: '#c9c9c9', faint: '#8a8a8a' },
  lilac:  { paper: '#ffffff', ink: '#231f2b', soft: '#f4f1f9', mid: '#e0d8ee', accent: '#7a6a9c', rule: '#cdc4dd', faint: '#8d869c' },
};

export const PALETTE_NAMES = Object.keys(PALETTES);

const MARGIN = 42;

function frame(page, pal) {
  return {
    x: MARGIN,
    y: MARGIN,
    w: page.w - MARGIN * 2,
    h: page.h - MARGIN * 2,
    right: page.w - MARGIN,
    bottom: page.h - MARGIN,
    pal,
  };
}

/** Shared header. Returns the y where body content may start. */
function header(page, spec, pageSpec, pal, index) {
  const f = frame(page, pal);
  const brand = (spec.brand || '').toUpperCase();
  if (brand) {
    page.text(f.x, f.y + 8, brand, {
      size: 7,
      font: FONTS.bold,
      fill: pal.faint,
      tracking: 1.6,
    });
  }
  if (pageSpec.eyebrow) {
    page.text(f.right, f.y + 8, String(pageSpec.eyebrow).toUpperCase(), {
      size: 7,
      font: FONTS.bold,
      fill: pal.accent,
      tracking: 1.4,
      align: 'right',
    });
  }

  let y = f.y + 44;
  const title = pageSpec.title || spec.title;
  const size = fitSize(title, f.w, 21, 12, FONTS.bold);
  page.text(f.x, y, title, { size, font: FONTS.bold, fill: pal.ink });
  y += 16;

  if (pageSpec.subtitle) {
    y = page.paragraph(f.x, y, pageSpec.subtitle, f.w * 0.82, {
      size: 9,
      fill: pal.faint,
      maxLines: 2,
    });
    y += 2;
  }

  page.line(f.x, y + 6, f.right, y + 6, { stroke: pal.rule, lw: 0.9 });
  page.rect(f.x, y + 6, 54, 2.2, { fill: pal.accent });
  return y + 26;
}

function footer(page, spec, pal, index, total) {
  const f = frame(page, pal);
  page.line(f.x, f.bottom - 16, f.right, f.bottom - 16, { stroke: pal.rule, lw: 0.6 });
  page.text(f.x, f.bottom - 4, spec.footer || spec.brand || '', {
    size: 7,
    fill: pal.faint,
    tracking: 0.6,
  });
  if (total > 1) {
    page.text(f.right, f.bottom - 4, `${index + 1} / ${total}`, {
      size: 7,
      fill: pal.faint,
      align: 'right',
    });
  }
}

// --- page kinds ------------------------------------------------------------

function drawCover(page, spec, pageSpec, pal) {
  const f = frame(page, pal);
  page.rect(f.x - 10, f.y - 10, f.w + 20, f.h + 20, { stroke: pal.rule, lw: 1.1 });
  page.rect(f.x - 4, f.y - 4, f.w + 8, f.h + 8, { stroke: pal.mid, lw: 0.6 });

  const cx = page.w / 2;
  page.text(cx, f.y + 60, (spec.brand || '').toUpperCase(), {
    size: 8,
    font: FONTS.bold,
    fill: pal.faint,
    tracking: 3,
    align: 'center',
  });

  sprig(page, cx, f.y + 110, pal, 1.4);

  const title = pageSpec.title || spec.title;
  const lines = wrap(title, f.w - 60, 30, FONTS.bold);
  let y = page.h / 2 - (lines.length - 1) * 18 - 20;
  for (const line of lines) {
    const size = fitSize(line, f.w - 60, 30, 16, FONTS.bold);
    page.text(cx, y, line, { size, font: FONTS.bold, fill: pal.ink, align: 'center' });
    y += 34;
  }

  if (pageSpec.subtitle) {
    page.line(cx - 40, y + 4, cx + 40, y + 4, { stroke: pal.accent, lw: 1.4 });
    y = page.paragraph(f.x + 60, y + 28, pageSpec.subtitle, f.w - 120, {
      size: 10.5,
      fill: pal.faint,
      align: 'center',
      maxLines: 3,
    });
  }

  const chips = pageSpec.chips || spec.chips || [];
  if (chips.length) {
    let chipY = page.h - 150;
    let chipX = cx - chipsWidth(chips) / 2;
    for (const chip of chips) {
      const w = textWidth(chip, 8, FONTS.bold) + 20;
      page.rect(chipX, chipY, w, 18, { r: 9, fill: pal.soft, stroke: pal.mid, lw: 0.6 });
      page.text(chipX + w / 2, chipY + 12, chip, {
        size: 8,
        font: FONTS.bold,
        fill: pal.accent,
        align: 'center',
      });
      chipX += w + 8;
    }
  }

  page.text(cx, page.h - 90, pageSpec.note || 'Print at 100%. Do not scale to fit.', {
    size: 8,
    fill: pal.faint,
    align: 'center',
  });
}

const chipsWidth = (chips) =>
  chips.reduce((sum, c) => sum + textWidth(c, 8, FONTS.bold) + 28, 0) - 8;

function drawTable(page, spec, pageSpec, pal, startY) {
  const f = frame(page, pal);
  const columns = normaliseColumns(pageSpec.columns, f.w);
  const rowCount = typeof pageSpec.rows === 'number' ? pageSpec.rows : (pageSpec.rows || []).length || 20;
  const rowLabels = Array.isArray(pageSpec.rows) ? pageSpec.rows : null;

  const totalsBand = pageSpec.totals ? 30 : 0;
  const noteBand = pageSpec.note ? 46 : 0;
  const available = f.bottom - 26 - startY - totalsBand - noteBand;
  const headH = 22;
  const rowH = Math.max(14, Math.min(30, (available - headH) / rowCount));
  const tableH = headH + rowH * rowCount;

  // Header band.
  page.rect(f.x, startY, f.w, headH, { fill: pal.mid });
  let cx = f.x;
  columns.forEach((col) => {
    page.text(cx + 7, startY + 14.5, String(col.label).toUpperCase(), {
      size: 7.5,
      font: FONTS.bold,
      fill: pal.ink,
      tracking: 0.9,
    });
    cx += col.w;
  });

  // Rows.
  for (let i = 0; i < rowCount; i++) {
    const y = startY + headH + i * rowH;
    if (i % 2 === 1) page.rect(f.x, y, f.w, rowH, { fill: pal.soft });
    page.line(f.x, y, f.right, y, { stroke: pal.rule, lw: 0.5 });
    if (rowLabels?.[i]) {
      page.text(f.x + 7, y + rowH / 2 + 3, rowLabels[i], {
        size: 8.5,
        font: FONTS.bold,
        fill: pal.ink,
      });
    }
    if (pageSpec.checkboxColumn) {
      const last = columns[columns.length - 1];
      const boxX = f.right - last.w / 2 - 5;
      page.rect(boxX, y + rowH / 2 - 5, 10, 10, { stroke: pal.accent, lw: 0.8, r: 1.5 });
    }
  }

  // Column rules + outline.
  cx = f.x;
  columns.forEach((col, i) => {
    if (i > 0) page.line(cx, startY, cx, startY + tableH, { stroke: pal.rule, lw: 0.5 });
    cx += col.w;
  });
  page.rect(f.x, startY, f.w, tableH, { stroke: pal.rule, lw: 1 });

  let y = startY + tableH;
  if (pageSpec.totals) {
    y += 10;
    page.rect(f.x, y, f.w, 22, { fill: pal.soft, stroke: pal.rule, lw: 0.8 });
    page.text(f.x + 8, y + 14.5, String(pageSpec.totals).toUpperCase(), {
      size: 8,
      font: FONTS.bold,
      fill: pal.ink,
      tracking: 0.8,
    });
    page.line(f.right - 130, y + 16, f.right - 10, y + 16, { stroke: pal.ink, lw: 0.7 });
    y += 22;
  }
  if (pageSpec.note) drawNote(page, pal, f, y + 14, pageSpec.note);
}

function normaliseColumns(columns, width) {
  const list = (columns && columns.length ? columns : ['Item', 'Notes']).map((c) =>
    typeof c === 'string' ? { label: c } : { label: c.label, weight: c.weight }
  );
  const totalWeight = list.reduce((sum, c) => sum + (c.weight || 1), 0);
  return list.map((c) => ({ ...c, w: (width * (c.weight || 1)) / totalWeight }));
}

function drawChecklist(page, spec, pageSpec, pal, startY) {
  const f = frame(page, pal);
  const sections = pageSpec.sections?.length
    ? pageSpec.sections
    : [{ title: '', items: pageSpec.items || [] }];

  const twoCol = pageSpec.columnsCount === 2 || sections.length > 3;
  const colW = twoCol ? (f.w - 22) / 2 : f.w;
  let col = 0;
  let y = startY;

  for (const section of sections) {
    const items = section.items || [];
    const blockH = 26 + items.length * 17 + 12;
    if (y + blockH > f.bottom - 30) {
      if (twoCol && col === 0) {
        col = 1;
        y = startY;
      } else {
        break;
      }
    }
    const x = f.x + col * (colW + 22);

    if (section.title) {
      page.rect(x, y - 11, colW, 19, { fill: pal.soft });
      page.rect(x, y - 11, 2.5, 19, { fill: pal.accent });
      page.text(x + 9, y + 2, String(section.title).toUpperCase(), {
        size: 8.5,
        font: FONTS.bold,
        fill: pal.ink,
        tracking: 0.9,
      });
      y += 20;
    }
    for (const item of items) {
      page.rect(x + 2, y - 7.5, 9.5, 9.5, { stroke: pal.accent, lw: 0.85, r: 1.5 });
      const label = typeof item === 'string' ? item : item.label;
      const size = 9;
      const lines = wrap(label, colW - 22, size);
      page.text(x + 19, y, lines[0], { size, fill: pal.ink });
      if (lines[1]) {
        y += 12;
        page.text(x + 19, y, lines[1], { size, fill: pal.faint });
      }
      if (typeof item !== 'string' && item.minutes) {
        page.text(x + colW - 2, y, `${item.minutes} min`, {
          size: 7.5,
          font: FONTS.bold,
          fill: pal.faint,
          align: 'right',
        });
      }
      y += 17;
    }
    y += 14;
  }

  if (pageSpec.note) drawNote(page, pal, f, Math.min(y + 6, f.bottom - 46), pageSpec.note);
}

function drawGrid(page, spec, pageSpec, pal, startY) {
  const f = frame(page, pal);
  const cols = pageSpec.columns?.length
    ? pageSpec.columns.map((c) => (typeof c === 'string' ? c : c.label))
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const rows = Array.isArray(pageSpec.rows)
    ? pageSpec.rows
    : Array.from({ length: pageSpec.rows || 8 }, () => '');

  const noteBand = pageSpec.note ? 46 : 0;
  const labelW = pageSpec.labelWidth || Math.min(150, f.w * 0.28);
  const cellW = (f.w - labelW) / cols.length;
  const headH = 22;
  const rowH = Math.max(18, Math.min(78, (f.bottom - 26 - startY - headH - noteBand) / rows.length));
  const gridH = headH + rowH * rows.length;

  page.rect(f.x + labelW, startY, f.w - labelW, headH, { fill: pal.mid });
  cols.forEach((label, i) => {
    page.text(f.x + labelW + cellW * (i + 0.5), startY + 14.5, String(label).toUpperCase(), {
      size: 7.5,
      font: FONTS.bold,
      fill: pal.ink,
      align: 'center',
      tracking: 0.6,
    });
  });

  rows.forEach((label, r) => {
    const y = startY + headH + r * rowH;
    if (r % 2 === 1) page.rect(f.x, y, f.w, rowH, { fill: pal.soft });
    page.line(f.x, y, f.right, y, { stroke: pal.rule, lw: 0.5 });
    if (label) {
      const size = fitSize(label, labelW - 12, 9, 6.5, FONTS.bold);
      page.text(f.x + 6, y + rowH / 2 + 3, label, { size, font: FONTS.bold, fill: pal.ink });
    } else {
      // Blank row: give them a line to write the job on.
      page.line(f.x + 8, y + rowH / 2 + 3, f.x + labelW - 8, y + rowH / 2 + 3, {
        stroke: pal.rule,
        lw: 0.6,
        dash: [2, 2],
      });
    }
    if (pageSpec.cells !== 'blank') {
      cols.forEach((_, c) => {
        const cxx = f.x + labelW + cellW * (c + 0.5);
        const cyy = y + rowH / 2;
        if (pageSpec.cells === 'circle') {
          page.circle(cxx, cyy, 5.5, { stroke: pal.accent, lw: 0.85 });
        } else if (pageSpec.cells === 'star') {
          star(page, cxx, cyy, 6.5, pal.accent);
        } else {
          page.rect(cxx - 5.5, cyy - 5.5, 11, 11, { stroke: pal.accent, lw: 0.85, r: 1.5 });
        }
      });
    }
  });

  for (let c = 0; c <= cols.length; c++) {
    const x = f.x + labelW + cellW * c;
    page.line(x, startY, x, startY + gridH, { stroke: pal.rule, lw: 0.5 });
  }
  page.line(f.x + labelW, startY, f.x + labelW, startY + gridH, { stroke: pal.rule, lw: 1 });
  page.rect(f.x, startY, f.w, gridH, { stroke: pal.rule, lw: 1 });

  if (pageSpec.note) drawNote(page, pal, f, startY + gridH + 16, pageSpec.note);
}

function drawTracker(page, spec, pageSpec, pal, startY) {
  const f = frame(page, pal);
  const rows = Array.isArray(pageSpec.rows) ? pageSpec.rows : ['', '', '', '', '', ''];
  const boxes = pageSpec.boxes || 30;
  const perRow = Math.min(boxes, pageSpec.perRow || 30);
  const noteBand = pageSpec.note ? 46 : 0;
  const rowH = Math.max(34, Math.min(96, (f.bottom - 26 - startY - noteBand) / rows.length));
  const labelW = Math.min(140, f.w * 0.26);
  const trackW = f.w - labelW;
  const step = trackW / perRow;
  const radius = Math.min(step / 2 - 1.6, 8);

  rows.forEach((label, r) => {
    const y = startY + r * rowH;
    page.line(f.x, y, f.right, y, { stroke: pal.rule, lw: 0.5 });
    if (label) {
      const size = fitSize(label, labelW - 10, 10, 7, FONTS.bold);
      page.text(f.x, y + rowH / 2 - 2, label, { size, font: FONTS.bold, fill: pal.ink });
    } else {
      page.line(f.x, y + rowH / 2 + 3, f.x + labelW - 12, y + rowH / 2 + 3, {
        stroke: pal.rule,
        lw: 0.6,
        dash: [2, 2],
      });
    }
    for (let i = 0; i < perRow; i++) {
      const cxx = f.x + labelW + step * (i + 0.5);
      const cyy = y + rowH / 2;
      page.circle(cxx, cyy, radius, { stroke: pal.accent, lw: 0.8 });
      if (pageSpec.numbered) {
        page.text(cxx, cyy + 2.5, String(i + 1), {
          size: Math.max(5, radius - 2),
          fill: pal.faint,
          align: 'center',
        });
      }
    }
  });
  page.line(f.x, startY + rows.length * rowH, f.right, startY + rows.length * rowH, {
    stroke: pal.rule,
    lw: 0.5,
  });

  if (pageSpec.note) drawNote(page, pal, f, startY + rows.length * rowH + 16, pageSpec.note);
}

function drawColumns(page, spec, pageSpec, pal, startY) {
  const f = frame(page, pal);
  const blocks = pageSpec.blocks?.length
    ? pageSpec.blocks
    : [{ title: 'Notes', lines: 12 }, { title: 'Next steps', lines: 12 }];
  const gap = 20;
  const colW = (f.w - gap * (blocks.length - 1)) / blocks.length;
  const height = f.bottom - 30 - startY;

  blocks.forEach((block, i) => {
    const x = f.x + i * (colW + gap);
    page.rect(x, startY, colW, height, { stroke: pal.rule, lw: 0.9, r: 4 });
    page.rect(x, startY, colW, 20, { fill: pal.soft });
    page.text(x + 8, startY + 13.5, String(block.title || '').toUpperCase(), {
      size: 8,
      font: FONTS.bold,
      fill: pal.ink,
      tracking: 0.8,
    });
    let y = startY + 38;
    if (block.prompt) {
      y = page.paragraph(x + 8, y, block.prompt, colW - 16, {
        size: 8.5,
        font: FONTS.italic,
        fill: pal.faint,
        maxLines: 3,
      });
      y += 8;
    }
    const lines = block.lines || Math.floor((startY + height - y) / 19);
    for (let l = 0; l < lines; l++) {
      const ly = y + l * 19;
      if (ly > startY + height - 12) break;
      page.line(x + 8, ly, x + colW - 8, ly, { stroke: pal.rule, lw: 0.5 });
    }
  });
}

function drawPoster(page, spec, pageSpec, pal) {
  const f = frame(page, pal);
  const cx = page.w / 2;
  const style = pageSpec.style || 'typographic';

  if (pageSpec.border !== false) {
    page.rect(f.x, f.y, f.w, f.h, { stroke: pal.rule, lw: 1.1 });
  }

  if (style === 'chart') {
    // Useful art: a reference chart, e.g. kitchen conversions.
    page.text(cx, f.y + 54, (pageSpec.title || spec.title).toUpperCase(), {
      size: fitSize((pageSpec.title || spec.title).toUpperCase(), f.w - 60, 22, 12, FONTS.bold),
      font: FONTS.bold,
      fill: pal.ink,
      align: 'center',
      tracking: 2,
    });
    page.line(cx - 34, f.y + 68, cx + 34, f.y + 68, { stroke: pal.accent, lw: 1.4 });
    const rows = pageSpec.rows || [];
    const startY = f.y + 100;
    const rowH = Math.min(30, (f.h - 160) / Math.max(rows.length, 1));
    rows.forEach((row, i) => {
      const y = startY + i * rowH;
      const left = Array.isArray(row) ? row[0] : row.left;
      const right = Array.isArray(row) ? row[1] : row.right;
      page.text(f.x + 40, y, String(left), { size: 11, font: FONTS.bold, fill: pal.ink });
      page.text(f.right - 40, y, String(right), { size: 11, fill: pal.accent, align: 'right' });
      page.line(f.x + 40, y + 7, f.right - 40, y + 7, { stroke: pal.rule, lw: 0.5, dash: [1.5, 2.5] });
    });
    page.text(cx, f.y + f.h - 22, spec.brand || '', {
      size: 7.5,
      fill: pal.faint,
      align: 'center',
      tracking: 2,
    });
    return;
  }

  if (style === 'botanical') {
    sprig(page, cx, page.h / 2 - 40, pal, 3.4);
    page.text(cx, page.h - 150, (pageSpec.caption || spec.title).toUpperCase(), {
      size: 11,
      font: FONTS.bold,
      fill: pal.ink,
      align: 'center',
      tracking: 3.4,
    });
    if (pageSpec.latin) {
      page.text(cx, page.h - 132, pageSpec.latin, {
        size: 9,
        font: FONTS.italic,
        fill: pal.faint,
        align: 'center',
      });
    }
    return;
  }

  // Typographic: the quote or affirmation, set big.
  const words = String(pageSpec.headline || spec.title);
  const lines = pageSpec.lines || wrap(words, f.w - 90, 34, FONTS.bold);
  let y = page.h / 2 - ((lines.length - 1) * 44) / 2 - 10;
  lines.forEach((line, i) => {
    const emphasise = pageSpec.emphasis === i;
    const size = fitSize(line, f.w - 80, 36, 14, FONTS.bold);
    page.text(cx, y, line, {
      size,
      font: emphasise ? FONTS.italic : FONTS.bold,
      fill: emphasise ? pal.accent : pal.ink,
      align: 'center',
      tracking: 0.6,
    });
    y += 44;
  });
  page.line(cx - 26, y + 2, cx + 26, y + 2, { stroke: pal.accent, lw: 1.6 });
  if (pageSpec.caption) {
    page.text(cx, y + 30, pageSpec.caption.toUpperCase(), {
      size: 8.5,
      fill: pal.faint,
      align: 'center',
      tracking: 2.6,
    });
  }
}

function drawInstructions(page, spec, pageSpec, pal, startY) {
  const f = frame(page, pal);
  let y = startY;
  const blocks = pageSpec.blocks || [];
  for (const block of blocks) {
    page.text(f.x, y, String(block.title || '').toUpperCase(), {
      size: 9,
      font: FONTS.bold,
      fill: pal.accent,
      tracking: 1.2,
    });
    y += 15;
    y = page.paragraph(f.x, y, block.body, f.w - 40, { size: 9.5, fill: pal.ink, leading: 14 });
    y += 18;
    if (y > f.bottom - 60) break;
  }
}

// --- little decorations ----------------------------------------------------

/** A small hand-drawn-ish sprig. Vector, original, free to sell. */
function sprig(page, cx, cy, pal, scale = 1) {
  const s = scale;
  page.line(cx, cy - 26 * s, cx, cy + 26 * s, { stroke: pal.accent, lw: 1.1 * s });
  for (let i = -4; i <= 4; i++) {
    const y = cy + i * 6 * s;
    const len = (13 - Math.abs(i) * 1.9) * s;
    const lift = 5 * s;
    page.poly(
      [
        { x: cx, y },
        { x: cx - len, y: y - lift },
        { x: cx - len * 0.55, y: y + lift * 0.65 },
      ],
      { fill: i % 2 === 0 ? pal.mid : pal.soft, stroke: pal.accent, lw: 0.7 * s }
    );
    page.poly(
      [
        { x: cx, y: y + 3 * s },
        { x: cx + len, y: y + 3 * s - lift },
        { x: cx + len * 0.55, y: y + 3 * s + lift * 0.65 },
      ],
      { fill: i % 2 === 0 ? pal.soft : pal.mid, stroke: pal.accent, lw: 0.7 * s }
    );
  }
}

function star(page, cx, cy, r, colour) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.42;
    points.push({ x: cx + Math.cos(angle) * rad, y: cy + Math.sin(angle) * rad });
  }
  page.poly(points, { stroke: colour, lw: 0.8 });
}

function drawNote(page, pal, f, y, note) {
  const h = 34;
  const top = Math.min(y, f.bottom - 26 - h);
  page.rect(f.x, top, f.w, h, { fill: pal.soft, r: 4 });
  page.rect(f.x, top, 2.5, h, { fill: pal.accent });
  page.paragraph(f.x + 10, top + 14, note, f.w - 24, {
    size: 8,
    font: FONTS.italic,
    fill: pal.faint,
    maxLines: 2,
    leading: 11,
  });
}

// --- entry point -----------------------------------------------------------

const PAINTERS = {
  cover: drawCover,
  table: drawTable,
  checklist: drawChecklist,
  grid: drawGrid,
  tracker: drawTracker,
  columns: drawColumns,
  poster: drawPoster,
  instructions: drawInstructions,
};

/**
 * Build a printable document from a spec.
 * @param {object} spec see docs/DESIGN.md
 * @param {string} paper key of PAPER
 * @returns {Doc}
 */
export function buildDoc(spec, paper = 'A4') {
  const pal = PALETTES[spec.palette] || PALETTES.sage;
  const doc = new Doc({
    title: spec.title,
    author: spec.brand || 'Hartistic',
    subject: spec.subtitle || '',
    keywords: spec.keywords || [],
  });
  const pages = spec.pages?.length ? spec.pages : [{ kind: 'cover' }];

  pages.forEach((pageSpec, index) => {
    const sheet = doc.addPage(pageSpec.paper || paper, { kind: pageSpec.kind });
    if (pal.paper !== '#ffffff') sheet.rect(0, 0, sheet.w, sheet.h, { fill: pal.paper });

    const kind = PAINTERS[pageSpec.kind] ? pageSpec.kind : 'table';
    if (kind === 'cover' || kind === 'poster') {
      PAINTERS[kind](sheet, spec, pageSpec, pal);
      return;
    }
    const startY = header(sheet, spec, pageSpec, pal, index);
    PAINTERS[kind](sheet, spec, pageSpec, pal, startY);
    footer(sheet, spec, pal, index, pages.length);
  });

  return doc;
}

export default buildDoc;
