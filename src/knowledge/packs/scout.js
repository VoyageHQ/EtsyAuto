// The Scout: what makes an idea worth the shop's time.
export default {
  id: 'scout',
  agent: 'scout',
  division: 'etsy',
  title: 'Finding products worth making',
  summary: 'Niche selection, demand signals, saturation, and the ideas that never work.',

  lessons: [
    // --- how to pick a niche -----------------------------------------------
    'Start from a person and a moment, not from a product type. "The parent on Sunday night who has not planned a single meal" gives you a product; "meal planners" gives you a category with ten thousand listings in it.',
    'The best ideas come from a problem that recurs on a schedule: every week, every month, every school term, every tax year. Recurring problems mean the buyer remembers you and buys again.',
    'A good idea can be described in the buyer\'s own words without using the word "planner". If the only way you can describe it is by its format, it has no angle.',
    'Look for jobs people currently do badly in a spreadsheet or on the back of an envelope. That is a proven need with a visible workaround.',
    'Neurodivergent-friendly versions of ordinary products are consistently underserved: ADHD, autism, dyslexia, chronic illness, low energy. These buyers are specific about what they need and loyal when someone gets it right.',
    'Products for a named programme or method sell better than generic ones because people search the name: Couch to 5K, zero-based budgeting, cash stuffing, the Sunday reset, Cornell notes. Use the method name, never a brand name.',

    // --- reading demand ------------------------------------------------------
    'Demand and competition rise together. A category with no competition usually has no buyers, not an untapped goldmine. Prefer a busy category entered at a specific angle over an empty one.',
    'Seasonal products must be listed six to ten weeks before the season, because Etsy needs time to learn the listing. A Christmas planner listed in December has missed it.',
    'Evergreen products pay the rent; seasonal products pay for the good months. Aim for roughly three evergreen ideas for every seasonal one.',
    'The strongest seasonal windows for printables are January (budgets, goals, fitness), March to April (spring cleaning, tax year), August (back to school and teacher planners), and October to November (Christmas planning). Propose into those windows early.',
    'If an idea only works for one country, say so up front. Tax years, school terms, holidays and paper sizes all differ, and a US buyer will refund a planner built around UK school terms.',

    // --- what to avoid -------------------------------------------------------
    'Do not propose anything already free and good from a well-known source. People will pay to have it organised better, but not to have it at all.',
    'Do not propose products that need constant updating — anything tied to a specific year, tax rate, app version or price list becomes a support burden and dead stock.',
    'Do not propose "bundles of everything". A 200-page mega pack looks like filler and attracts refund requests. Small, complete, specific.',
    'Do not propose anything whose main appeal is an illustration style the shop cannot draw. This shop generates clean vector layouts, not characters or scenes.',
    'Avoid ideas that require the buyer to trust you with money, health or legal outcomes. A budget planner is fine; anything that reads as advice is not.',

    // --- writing the proposal ------------------------------------------------
    'Every idea you propose needs a one-sentence answer to "why would someone pay for this rather than scribble it on paper". If you cannot answer, drop the idea.',
    'Give the honest effort number. A binder with thirty pages is a four, not a two, and pretending otherwise wrecks the shop\'s planning.',
    'Price ranges should reflect what the category actually supports, not what you hope. Single-page printables sit low, multi-page systems and spreadsheets sit high, and wall art depends entirely on the set size.',
    'When the owner rejects something, do not propose a near-identical version with a new name a week later. Read the reasons you have been given and move somewhere genuinely different.',
    'Propose in themes, not scattergun. Three related ideas for the same buyer are more useful than eight unrelated ones, because they can become a bundle later.',
  ],

  rules: {
    // Price bands the offline path uses to sanity-check its own suggestions.
    priceBands: {
      'single sheet': [2, 4.5],
      'small pack': [3, 7],
      'multi-page pack': [4, 9],
      binder: [5, 14],
      spreadsheet: [4, 14],
      'wall art set': [4, 10],
      'digital planner': [6, 18],
    },
    // Months when each theme should already be listed, not started.
    seasonalLeadWeeks: 8,
    seasonWindows: {
      'new year': [10, 11, 0],
      'spring clean': [1, 2],
      'exam season': [2, 3],
      'summer holidays': [4, 5],
      'back to school': [5, 6, 7],
      halloween: [7, 8],
      christmas: [7, 8, 9, 10],
    },
    // Ideas that keep being suggested and keep not working.
    avoidPatterns: [
      'mega bundle',
      'everything bundle',
      '\\b(20\\d\\d)\\b', // year-specific, becomes dead stock
      'daily planner for everyone',
      'universal',
    ],
  },
};
