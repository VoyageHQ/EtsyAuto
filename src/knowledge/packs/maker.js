// The Maker: how to lay out a page that prints properly and gets used.
export default {
  id: 'maker',
  agent: 'maker',
  division: 'etsy',
  title: 'Print production and page craft',
  summary: 'Margins, line weights, writing space, and designing for the people who buy this.',

  lessons: [
    // --- printing on real printers ------------------------------------------
    'Home printers cannot print to the edge. Keep everything at least 12mm from the paper edge, and never rely on a border that runs off the page — it will be clipped and the buyer will think the file is broken.',
    'A4 is 210 x 297mm, US Letter is 216 x 279mm. Letter is wider and shorter, so a layout that only just fits A4 vertically will be cut off on Letter. Design to the smaller of the two in each direction and both sizes work.',
    'Lines thinner than about 0.3pt disappear on some inkjets and look grey on others. Use 0.5pt for structural rules and 0.75pt or heavier for anything that defines a box the buyer writes in.',
    'Large solid fills waste ink, warp cheap paper and make people resent the product. Use tints below about 12% for shading, and never fill a whole page.',
    'Tell the buyer to print at 100% or "actual size". The single most common support message for printables is a layout that looks wrong because the printer defaulted to "fit to page".',
    'Design so the pages work in greyscale. Check that every colour you rely on still reads as different when it is turned to grey — if two categories become the same grey, use pattern or position instead.',

    // --- space to actually write ---------------------------------------------
    'A person writing by hand needs at least 6mm of row height, and 8 to 10mm is comfortable. Anything tighter looks efficient in a preview and is unusable in real life.',
    'Leave a wider first column for labels than you think you need. Handwritten words are bigger than typeset ones.',
    'A blank line to write on should be a light rule, not a box, unless the answer is genuinely one word. Boxes constrain handwriting; lines invite it.',
    'Every page that asks people to fill something in should have somewhere to write what they were thinking. The notes area is the part people say they love.',
    'Tick boxes should be at least 4mm square with a clear gap from the text. Circles read as "shade this in", squares read as "tick this" — use the one you mean.',

    // --- structure -------------------------------------------------------------
    'Page one must be useful on its own, because it is the preview image that sells the product. Never make page one a title page with nothing on it.',
    'Every page needs one job and a title that says what that job is. If you cannot title a page in four words, it is doing two things.',
    'Four to eight pages is the sweet spot for a pack. Fewer feels thin at the price, more feels like padding and each extra page has to justify itself.',
    'Repeat the structure across pages: same margins, same header position, same type sizes. Consistency is what makes a home-printed pack feel bought rather than downloaded.',
    'Put the instructions on the pages that need them, in small italic text at the bottom, rather than in a separate instructions page nobody prints.',

    // --- designing for the buyer ------------------------------------------------
    'For ADHD and executive-function products: break every task into something achievable in five minutes, never imply the buyer has failed, and design so that missing three days does not ruin the page. Streak-based layouts punish exactly the people who buy these.',
    'For dyslexia-friendly versions: sans-serif type at 12 to 14pt, line spacing about 1.5, left-aligned with a ragged right edge, short lines, cream rather than white background, and no italics or blocks of capitals.',
    'For older buyers or large print: 14pt minimum, high contrast, generous boxes, and nothing important in a light grey.',
    'For children: fewer items per page, bigger boxes, and a visible reward mechanism. Parents buy the chart, but the child has to want to fill it in.',
    'Body text needs a contrast ratio of about 4.5 to 1 against its background to stay readable. Pale grey text on white looks elegant on screen and vanishes on paper.',

    // --- the shop's own standards ------------------------------------------------
    'Write real content, never placeholders. If a page is a checklist, write the actual checklist. A file full of "Item 1, Item 2" is not a product.',
    'The footer on every page should carry the shop name and a personal-use line. It is free branding and it discourages casual resharing.',
    'Never depend on a font, an image or an element the shop does not own. Everything here is generated vector work, and it must stay that way.',
    'When a product includes a spreadsheet, the CSV must have the same column headers as the printed table. People switch between the two and expect them to match.',
  ],

  rules: {
    print: {
      safeMarginMm: 12,
      minRowHeightMm: 6,
      comfortableRowHeightMm: 9,
      minLineWeightPt: 0.5,
      maxTintPercent: 12,
      minBodyPt: 9,
      minContrastRatio: 4.5,
    },
    paperMm: {
      A4: [210, 297],
      Letter: [216, 279],
    },
    pageCount: { min: 3, sweetSpot: [4, 8], max: 14 },
    accessibility: {
      dyslexia: { minPt: 12, lineSpacing: 1.5, background: '#fdf8ef', avoid: ['italic', 'all caps', 'justified'] },
      largePrint: { minPt: 14 },
    },
    // Language that must never appear on a page aimed at neurodivergent buyers.
    shameWords: [
      'lazy',
      'no excuses',
      'discipline yourself',
      'stop making excuses',
      'you failed',
      'don\'t break the chain',
      'never miss',
    ],
  },
};
