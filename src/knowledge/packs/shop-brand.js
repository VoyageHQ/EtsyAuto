// The Maker: what makes forty listings look like one shop rather than forty
// unrelated files.
export default {
  id: 'shop-brand',
  agent: 'maker',
  division: 'etsy',
  title: 'Making it look like one shop',
  summary: 'Consistency, restraint, and the small decisions that make a catalogue cohere.',

  lessons: [
    'A shop is judged as a grid, not as individual listings. A buyer who lands on one product looks at the shop page next, and what they are deciding there is whether you are a real shop.',
    'Pick a small palette set and reuse it. Seven palettes across forty products reads as considered; forty palettes reads as forty different people.',
    'Palette should follow category, not mood of the day. Money is one colour family, home and cleaning another, wellbeing another. Then a buyer of one recognises the next.',
    'Type is the strongest signal of coherence and the cheapest to keep constant. One heading treatment and one body treatment across everything.',
    'Every product should carry the shop name in the same place, at the same weight. Small, bottom of the page, never shouting.',
    'Resist decoration that carries no information. Blank space on a printable is where a person writes; filling it with flourishes takes the product away from them.',
    'The cover page sets the expectation for the rest. If the cover is elaborate and the interior is plain, that reads as a bait and switch even when the interior is exactly right.',
    'Consistent margins across a catalogue matter more than beautiful margins on one product. A buyer who prints two of your things wants them to sit in the same binder.',
    'Undated beats dated for almost everything: it sells all year, it never becomes stale stock, and it is what most buyers actually want. Reserve dated editions for products where the date is the point.',
    'A single accent colour per product, used sparingly, does more than a full palette used evenly. The accent is what the eye uses to navigate the page.',
    'Everything must survive being printed on a mono laser printer at a library, because that is where a lot of these get printed.',
    'Page numbers and a contents page cost nothing and make a multi-page pack feel like a book rather than a folder of loose sheets.',
    'The read-me is part of the design. It is the first file most buyers open and a wall of unformatted text there undoes a beautiful planner.',
    'Name files the way a buyer would want to find them six months later: product name, then paper size. Never "final_v3_new.pdf".',
    'When a new product is a sibling of an existing one, borrow its layout deliberately rather than starting fresh. Sameness between siblings is a feature.',
  ],

  rules: {
    brand: {
      // A catalogue built from a small set of palettes reads as one shop. The
      // Curator and the Maker both check against this before adding another.
      maxPalettesInCatalogue: 7,
      // Category → the palette family it should stay in, so a buyer learns the
      // shop's visual language instead of meeting a new one each time. The
      // design engine reads this table directly: edit it and the shop's whole
      // look changes, with no code to touch.
      paletteByCategory: {
        'Budget planners': 'sage',
        'Chore charts': 'ocean',
        'ADHD & neurodivergent': 'lilac',
        'Meal planners': 'clay',
        'Wedding templates': 'blush',
        'Kids activities': 'ocean',
        'Business spreadsheets': 'ink',
        'Fitness trackers': 'ocean',
        'Wall art': 'clay',
        'Digital planners': 'ink',
        'Home admin': 'ink',
        'Self care': 'blush',
        'Teacher & study': 'sage',
        Seasonal: 'clay',
        Pets: 'clay',
        Travel: 'ocean',
        Bundles: 'ink',
      },
      defaultPalette: 'sage',
      // Undated stock sells all year; dated stock is dead every January.
      preferUndated: true,
      requireContentsPageFrom: 6, // pages
      requirePageNumbersFrom: 4,
    },
  },
};
