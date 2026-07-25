// Things every agent in the shop needs to know, whatever their job.
export default {
  id: 'shop-house',
  agent: null, // everyone
  division: 'etsy',
  title: 'House knowledge — the shop',
  summary: 'Etsy mechanics, money, and the lines nobody crosses.',

  lessons: [
    // --- how Etsy actually works -------------------------------------------
    'Etsy search reads the title, the tags and the category together. A phrase that appears in both the title and a tag is treated as a stronger match than one appearing in either alone, so make your main phrase appear in both.',
    'Tags match multi-word phrases, not individual words. "budget planner" as one tag is worth more than "budget" and "planner" as two, because Etsy will still find the individual words inside it.',
    'Never use two tags that mean the same thing. Etsy treats near-identical tags as one, so "meal planner" and "meal planning" waste a slot that a different phrase could have used.',
    'A brand new listing gets a short-lived visibility boost from Etsy while it works out how buyers respond. This means the first week of a listing tells you more than the next month does — but it also means a bad title wastes the only free traffic you get.',
    'Etsy ranks partly on listing quality: views converting to favourites and sales. A listing nobody clicks is dragged down over time, so a poor thumbnail hurts more than a poor description.',
    'Digital listings never run out and never need a shipping profile. Set quantity to 999 and auto-renew on, so a sale does not quietly de-list the item.',
    'Fees change, so check the current rates in Etsy\'s own seller handbook rather than trusting any figure written down here. The structure has been stable for years though: a small fee per listing, another when it renews, a percentage of each sale, and a payment processing percentage on top. Assume roughly a fifth to a quarter of the sale price goes in fees when you sanity-check a price.',
    'For buyers in the UK and EU, Etsy handles VAT on digital downloads itself. Do not add tax to the price or mention tax in the description.',

    // --- what makes a digital product sell ---------------------------------
    'The person buying a digital download cannot touch it, so the listing images are the product as far as the decision goes. If the images are unclear the listing fails no matter how good the file is.',
    'Specific beats broad, every time. "ADHD cleaning chart for adults who freeze at tidy the house" outsells "cleaning planner" because the buyer recognises themselves in it.',
    'Buyers of printables are usually solving a problem this week, not building a system for next year. Say what the first page does for them today.',
    'The most reprinted page in any pack is the simplest one — the shopping list, the weekly grid, the checklist. Make sure that page is good and that it is visible in the preview images.',
    'Undated products sell all year and never become dead stock. Prefer undated unless the product genuinely needs dates.',
    'Every product should print legibly in black and white. Buyers frequently print in greyscale to save ink, and a design that depends on colour to be readable generates refund requests.',

    // --- the lines nobody crosses -------------------------------------------
    'Never use a brand, character, film, TV show, band or celebrity name anywhere: not in the title, not in the tags, not in the files. This includes "inspired by" and deliberate misspellings. It is the fastest way to lose a shop.',
    'Never claim a result you cannot evidence: no "best selling", no "thousands of happy customers", no invented reviews or numbers, no fake scarcity or countdowns.',
    'Never imply a physical item is coming. Say plainly and early that this is an instant digital download and nothing is posted.',
    'Never make medical, financial, legal or therapeutic claims. A planner helps someone organise; it does not treat, cure, diagnose or guarantee anything. "ADHD-friendly layout" is fine, "helps ADHD symptoms" is not.',
    'Only use fonts, images and elements that are licensed for commercial use. Everything this shop generates is original vector work, which is safe; anything imported from elsewhere needs its licence checked before it ships.',
    'Etsy\'s policies on how items are made — including any use of AI tools — change over time. Check the current seller handbook rather than assuming, and describe how the product was made accurately if asked.',

    // --- tone ---------------------------------------------------------------
    'Write the way you would speak to one person who has this problem. British spelling in the prose, no exclamation marks, no emoji in titles, no capitals for emphasis.',
    'Never use "unlock", "elevate", "game changer", "revolutionary", "seamless", "effortlessly", "in today\'s fast-paced world", or "say goodbye to". They read as filler and they make a listing look mass-produced.',
  ],

  rules: {
    // Used by the offline paths as well as the prompts.
    bannedPhrases: [
      'unlock',
      'elevate your',
      'game changer',
      'game-changer',
      'revolutionary',
      'seamless',
      'effortlessly',
      "in today's fast-paced world",
      'say goodbye to',
      'best selling',
      'best-selling',
      'thousands of happy',
      'limited time only',
      'act now',
      'cure',
      'treats symptoms',
      'guaranteed results',
    ],
    // Names that must never appear anywhere in a listing or file.
    trademarkTraps: [
      'disney',
      'bluey',
      'peppa',
      'pixar',
      'marvel',
      'harry potter',
      'taylor swift',
      'barbie',
      'pokemon',
      'lego',
      'nintendo',
      'netflix',
      'starbucks',
      'weight watchers',
      'slimming world',
    ],
    listingDefaults: {
      quantity: 999,
      autoRenew: true,
      whoMade: 'i_did',
      whenMade: 'made_to_order',
      isSupply: false,
    },
    feeAssumption: 0.22, // rough all-in share of the sale price, for sanity checks
  },
};
