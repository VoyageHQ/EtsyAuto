---
name: hartistic-product-page
description: How to extend the Hartistic Valley design engine — adding a new printable page kind (painter) in src/design/templates/layout.js, a new product blueprint in plan.js, a palette, or a paper size — so the agents can make a kind of product they currently cannot. Use this skill whenever the user asks for a new product format ("a habit tracker page", "a weekly spread", "a wall art layout", "landscape pages"), reports a PDF that looks wrong or prints badly, wants the look of the products changed, or asks about the vector/PDF engine. Also use it before editing anything under src/design/, because pages are painted by a fixed painter table and an unknown kind silently falls back to a plain table.
---

# Extending the design engine

Everything the shop sells is generated from a **spec** — a plain object listing
pages — turned into a `Doc`, then written out as PDF and SVG. There is no
design tool in the loop and no fonts to license. The chain is:

```
idea → offlineSpec()/model → normaliseSpec() → buildDoc() → PDF + SVG + PNG
       src/design/templates/plan.js            templates/layout.js   design/pdf.js, svg.js, png.js
```

`src/design/build.js` orchestrates it and also writes `READ-ME-FIRST.txt`,
`design-brief.md` and the CSV companion.

## Adding a page kind

A page kind is a **painter**: a function that draws onto a `Page`. The table at
the bottom of `layout.js` is the whole registry:

```js
const PAINTERS = {
  cover: drawCover, table: drawTable, checklist: drawChecklist,
  grid: drawGrid, tracker: drawTracker, columns: drawColumns,
  poster: drawPoster, instructions: drawInstructions,
};
```

To add one:

1. **Write the painter.** Signature `(sheet, spec, pageSpec, pal, startY)`.
   Cover and poster are special-cased in `buildDoc` and receive no `startY`
   because they paint edge to edge; everything else is drawn between the header
   and the footer, so start at `startY` and leave the footer band alone.
2. **Register it in `PAINTERS`.**
3. **Allow it through validation.** `PAGE_KINDS` in `plan.js` is a `Set` that
   `normaliseSpec()` checks against. A kind missing from that set is rewritten
   to `table` — this is the silent failure to watch for when a new page "does
   nothing".
4. **Emit it from a blueprint** (below), or nothing will ever ask for it.
5. **Render one and look at it.** See "Seeing your work" below.

### Drawing API

`Page` in `src/design/doc.js` gives you `rect`, `line`, `circle`, `poly`,
`text`, `paragraph`, plus `textWidth`, `wrap` and `fitSize` as free functions.
Coordinates are PDF points, origin top-left, and `sheet.w` / `sheet.h` are the
paper dimensions. Only the base-14 fonts exist (`FONTS`), with real width
tables — that is why `textWidth` is reliable and why you must not assume a
monospace grid.

Colours come from the palette (`pal.ink`, `soft`, `mid`, `accent`, `rule`,
`faint`), never hard-coded. A painter with `#333` in it ignores the product's
chosen palette and looks wrong in six of seven products.

### Print constraints that are not negotiable

These come from the knowledge packs and the Inspector enforces some of them:

- **12mm safe margin** on every edge. Home printers cannot reach closer, and a
  grid that runs to the paper edge comes out cropped.
- **6mm minimum row height** anywhere a person writes by hand.
- **Must read in black and white.** Distinguish rows by rule weight or fill
  tone, never by hue alone. Test by imagining the palette collapsed to grey.
- **Ink-frugal.** Large solid fills are correct on a cover and wrong on a page
  someone prints thirty times.
- The same spec is rendered at **A4 and US Letter**. Letter is shorter and
  wider; anything positioned from the top with a hard-coded height will fall
  off one of them. Derive from `sheet.h`, not from constants.

## Adding a product blueprint

`BLUEPRINTS` in `plan.js` is an ordered list of `{ match, build }`. `match` is a
regex tested against the idea; the first hit wins, so put specific patterns
above general ones. `build(idea)` returns `{ pages: [...] }`.

```js
{
  match: /habit|streak|routine|daily.?ritual/i,
  build: (idea) => ({
    pages: [
      cover(idea, ['Undated', 'A4 + Letter', 'Print at home']),
      { kind: 'tracker', title: 'Thirty days', rows: 12, columns: 30,
        note: 'Miss one, carry on. Two in a row is the only thing to avoid.' },
      { kind: 'instructions', title: 'How to use this' },
    ],
  }),
}
```

`DEFAULT_BLUEPRINT` catches anything unmatched — check what it produces for the
user's idea before adding a blueprint, because it is often already adequate.

Keep to **four to eight pages**. A twenty-page pack is not better value; it is
a product nobody finishes printing, and the Curator's bundle rules cap at 16.

Copy on the page must earn its place and must not shame the reader —
neurodivergent-friendly products are a core category here, and
`findShameLanguage()` in `src/knowledge/apply.js` will reject "never miss a
day" and "perfect streak" style copy at the Inspector.

## Palettes and paper

Palettes are seven flat objects at the top of `layout.js`; `PALETTE_NAMES` is
derived, so adding a key is enough. Keep `paper` near-white unless the palette
exists for a reason (the dyslexia-friendly cream is one), and keep `ink` dark
enough to photocopy.

Paper sizes are `PAPER` in `doc.js`, in points. Adding one means auditing every
painter for hard-coded heights first.

## Seeing your work

Nothing here is worth trusting unrendered. The fastest loop:

```bash
node --disable-warning=ExperimentalWarning -e "
Promise.all([
  import('./src/design/templates/plan.js'),
  import('./src/design/templates/layout.js'),
  import('./src/design/pdf.js'),
  import('node:fs'),
]).then(([plan, layout, pdf, fs]) => {
  const spec = plan.offlineSpec({ title: 'Thirty Day Habit Tracker', category: 'Fitness' }, 'Hartistic');
  console.log(spec.pages.map((p) => p.kind).join(' | '));
  fs.writeFileSync('/tmp/preview.pdf', pdf.renderPdf(layout.buildDoc(spec, 'A4')));
});
"
```

Check the page-kind list first — if your new kind shows as `table`, it never
reached `PAGE_KINDS`. Then open the PDF, or render the SVG and screenshot it
(see the `hartistic-dashboard-shot` skill for the headless-browser helper).

`npm test` builds a real product end to end and asserts the files exist and are
non-trivial in size, so run it before committing.
