// Turning an approved idea into a page-by-page build plan.
//
// The Maker prefers to write this plan with a model, because bespoke page
// content sells better. When there is no model, these blueprints take over —
// they are opinionated but genuinely usable products, not lorem ipsum.
import { PALETTE_NAMES } from './layout.js';
import { seededRandom, titleCase } from '../../core/util.js';
import { paletteForCategory } from '../../knowledge/apply.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Prep ahead'];

// Which palette a category wears is a branding decision, not a layout one, so
// it lives in the shop-brand knowledge pack. Editing that table changes the
// whole catalogue's look with no code to touch — and, unlike a constant in
// here, it survives on the owner's machine because packs ship in the repo.
const PALETTE_BY_CATEGORY = new Proxy(
  {},
  { get: (_, category) => (typeof category === 'string' ? paletteForCategory(category) : undefined) }
);


const PRINT_NOTE =
  'Print at 100% (do not "scale to fit"). Works on A4 and US Letter. Prints cleanly in black and white.';

/** @type {{match: RegExp, build: (idea: any, rng: () => number) => object}[]} */
const BLUEPRINTS = [
  {
    // Before the money blueprint, deliberately. "Christmas Budget & Gift
    // Planner" contains "budget", so the generic money pack claimed it and
    // shipped bills and direct debits to somebody who was promised a gift
    // list. A product that does not contain what its title says is a refund,
    // however good the pages are.
    match: /christmas|gift|holiday season|advent|festive|secret santa|birthday/i,
    build: (idea) => ({
      pages: [
        cover(idea, ['Undated', 'A4 + Letter', 'Print at home']),
        {
          kind: 'table',
          title: 'The gift list',
          subtitle: 'Everyone you are buying for, what you decided, and what it cost.',
          columns: [
            { label: 'Who', weight: 1.6 },
            { label: 'Idea', weight: 2.2 },
            { label: 'Budget', weight: 1 },
            { label: 'Spent', weight: 1 },
            { label: 'Bought', weight: 0.7 },
          ],
          rows: 22,
          checkboxColumn: true,
          totals: 'Total spent',
          note: 'Fill in Budget when you decide, Spent when you buy. The gap between them is the whole point.',
        },
        {
          kind: 'table',
          title: 'What it all costs',
          subtitle: 'The parts of the season that are not presents.',
          columns: [
            { label: 'Cost', weight: 2.4 },
            { label: 'Planned', weight: 1 },
            { label: 'Actual', weight: 1 },
          ],
          rows: 16,
          totals: 'Total for the season',
          note: 'Food, drink, travel, cards, postage, decorations, the work do. This is the bit that surprises people.',
        },
        {
          kind: 'checklist',
          title: 'The run-up',
          subtitle: 'Spread across the weeks so December is not one long panic.',
          eyebrow: 'Week by week',
          columnsCount: 2,
          sections: [
            {
              title: 'Early — while there is still time',
              items: [
                'Write the full list of who you are buying for',
                'Set a budget per person and add it up',
                'Order anything coming from abroad',
                'Check last posting dates and write them down',
                'Buy cards and stamps',
              ],
            },
            {
              title: 'The middle stretch',
              items: [
                'Buy the gifts that need thought',
                'Write and post the cards',
                'Plan the food shop and what can be frozen',
                'Sort wrapping paper, tape and tags',
                'Book anything that needs booking',
              ],
            },
            {
              title: 'The last fortnight',
              items: [
                'Wrap in batches rather than all at once',
                'Do the big food shop',
                'Confirm who is coming and when',
                'Charge the batteries nobody remembers',
                'Put a bag by the door for the recycling',
              ],
            },
          ],
          note: 'Tick as you go. Anything not ticked by the last section is a thing to drop, not to panic about.',
        },
        {
          kind: 'columns',
          title: 'Notes for next year',
          subtitle: 'Written now, while you still remember.',
          blocks: [
            { title: 'What cost more than expected', prompt: 'Be specific. "Presents" is not a reason.', lines: 14 },
            { title: 'What to do earlier next time', prompt: 'One thing. Not five.', lines: 14 },
          ],
        },
        {
          kind: 'instructions',
          title: 'How to use this',
          body: [
            'Start with the gift list. Write everyone down before you write a single budget — seeing the whole list is what stops the total running away.',
            'Set a budget per person, then add it up. If the total frightens you, change it now rather than in January.',
            'Fill in Spent as you buy. The gap between Budget and Spent is the only number that matters.',
            'Keep the running costs page open alongside. Presents are rarely where the money actually goes.',
          ],
        },
      ],
      sheets: true,
      palette: 'clay',
    }),
  },
  {
    match: /budget|bill|debt|saving|sinking|money|expense|paycheck/i,
    build: (idea) => ({
      pages: [
        cover(idea, ['Undated', 'A4 + Letter', 'Print at home']),
        {
          kind: 'table',
          title: 'Monthly overview',
          subtitle: 'Income in, money out, and what is actually left.',
          eyebrow: 'Month',
          columns: [
            { label: 'Category', weight: 2.2 },
            { label: 'Planned', weight: 1 },
            { label: 'Actual', weight: 1 },
            { label: 'Difference', weight: 1 },
          ],
          rows: 22,
          totals: 'Total for the month',
          note: 'Fill in Planned at the start of the month and Actual as you go. The Difference column is where the truth lives.',
        },
        {
          kind: 'table',
          title: 'Bills & direct debits',
          subtitle: 'Every regular payment, with the date it leaves your account.',
          columns: [
            { label: 'Bill', weight: 2.4 },
            { label: 'Due', weight: 0.8 },
            { label: 'Amount', weight: 1 },
            { label: 'Paid', weight: 0.7 },
          ],
          rows: 20,
          checkboxColumn: true,
          totals: 'Total fixed costs',
        },
        {
          kind: 'tracker',
          title: 'Savings & payoff progress',
          subtitle: 'Colour one circle for every milestone you hit.',
          rows: ['Emergency fund', 'Debt payoff', 'Sinking fund', 'Big goal'],
          boxes: 20,
          perRow: 20,
          numbered: true,
          note: 'Write your target on the line, then shade a circle each time you put money in.',
        },
        {
          kind: 'columns',
          title: 'Notes & next month',
          subtitle: 'What went wrong, and what you will change.',
          blocks: [
            { title: 'What blew the budget', prompt: 'Be specific. "Food" is not a reason.', lines: 16 },
            { title: 'One change for next month', prompt: 'One. Not five.', lines: 16 },
          ],
        },
      ],
    }),
  },
  {
    match: /adhd|autis|neurodiver|executive function|spoon|dopamine|overwhelm/i,
    build: (idea) => ({
      palette: 'lilac',
      pages: [
        cover(idea, ['No shame language', '5 minute tasks', 'A4 + Letter']),
        {
          kind: 'checklist',
          title: 'Five minute wins',
          subtitle: 'Start anywhere. Every line is genuinely five minutes or less.',
          eyebrow: 'Start here',
          columnsCount: 2,
          sections: [
            {
              title: 'Kitchen',
              items: [
                { label: 'Load or empty the dishwasher', minutes: 5 },
                { label: 'Clear one worktop only', minutes: 4 },
                { label: 'Bin anything out of date', minutes: 5 },
                { label: 'Wipe the hob', minutes: 3 },
              ],
            },
            {
              title: 'Living room',
              items: [
                { label: 'Collect all the cups', minutes: 2 },
                { label: 'Cushions and blankets straightened', minutes: 3 },
                { label: 'One surface cleared', minutes: 5 },
                { label: 'Rubbish into one bag', minutes: 4 },
              ],
            },
            {
              title: 'Bedroom',
              items: [
                { label: 'Clothes into the basket, not the floor', minutes: 4 },
                { label: 'Bedside table cleared', minutes: 3 },
                { label: 'Make the bed badly, it still counts', minutes: 2 },
              ],
            },
            {
              title: 'Bathroom',
              items: [
                { label: 'Sink and taps wiped', minutes: 3 },
                { label: 'Toilet, just the toilet', minutes: 4 },
                { label: 'Empty the bin', minutes: 2 },
              ],
            },
          ],
          note: 'Doing one thing badly beats doing nothing perfectly. Tick it anyway.',
        },
        {
          kind: 'grid',
          title: 'Week at a glance',
          subtitle: 'Pick one room a day. Skipped days are not failures.',
          columns: DAYS,
          rows: ['Kitchen', 'Bathroom', 'Bedroom', 'Living room', 'Laundry', 'Floors', 'Admin'],
          cells: 'circle',
          note: 'If you miss three days, start again on the next line. There is no streak to lose.',
        },
        {
          kind: 'checklist',
          title: 'Task breakdown',
          subtitle: 'Write the scary job at the top, then cut it into pieces you can actually start.',
          sections: [
            { title: 'The job', items: ['', '', ''] },
            { title: 'First tiny step (2 minutes)', items: ['', ''] },
            { title: 'Then', items: ['', '', '', '', ''] },
            { title: 'Done when', items: ['', ''] },
          ],
        },
        {
          kind: 'tracker',
          title: 'Reset tracker',
          subtitle: 'One circle per reset. Any size of reset counts.',
          rows: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
          boxes: 7,
          perRow: 7,
          note: 'Seven circles a week. Four is a good week. Two is still better than none.',
        },
      ],
    }),
  },
  {
    match: /chore|cleaning|rota|tidy|reset|housework|clean/i,
    build: (idea) => ({
      pages: [
        cover(idea, ['Reusable', 'A4 + Letter', 'Reward chart included']),
        {
          kind: 'grid',
          title: 'Weekly chore chart',
          subtitle: 'Write the jobs down the side, tick them off across the week.',
          columns: DAYS,
          rows: ['', '', '', '', '', '', '', ''],
          cells: 'star',
          note: 'Laminate it or pop it in a wallet and use a dry wipe pen to reuse it forever.',
        },
        {
          kind: 'checklist',
          title: 'Room by room',
          subtitle: 'Everything that needs doing, in the order that saves walking about.',
          columnsCount: 2,
          sections: [
            { title: 'Kitchen', items: ['Worktops', 'Hob and splashback', 'Sink and taps', 'Floor', 'Bin and recycling', 'Fridge shelf'] },
            { title: 'Bathroom', items: ['Sink', 'Toilet', 'Shower or bath', 'Mirror', 'Floor', 'Towels changed'] },
            { title: 'Bedrooms', items: ['Beds made', 'Clothes away', 'Surfaces dusted', 'Hoover', 'Bins'] },
            { title: 'Living space', items: ['Tidy away', 'Dust', 'Hoover', 'Cushions', 'Windows'] },
          ],
        },
        {
          kind: 'grid',
          title: 'Reward chart',
          subtitle: 'Collect stars, choose a reward. Write the reward in the box first.',
          columns: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
          rows: ['', '', '', ''],
          cells: 'star',
          labelWidth: 120,
          note: 'Agree the reward before the week starts. It works far better that way.',
        },
      ],
    }),
  },
  {
    match: /meal|food|recipe|freezer|grocery|dinner|eating/i,
    build: (idea) => ({
      pages: [
        cover(idea, ['Shopping list included', 'A4 + Letter', 'Undated']),
        {
          kind: 'grid',
          title: 'Weekly meal plan',
          subtitle: 'Plan the week, then shop once.',
          columns: DAYS,
          rows: MEALS,
          cells: 'blank',
          labelWidth: 92,
          note: 'Leave one night deliberately empty. Something always comes up.',
        },
        {
          kind: 'checklist',
          title: 'Shopping list',
          subtitle: 'Grouped the way a supermarket is laid out, so you walk it once.',
          columnsCount: 2,
          sections: [
            { title: 'Fruit & veg', items: ['', '', '', '', '', '', ''] },
            { title: 'Meat, fish & dairy', items: ['', '', '', '', '', ''] },
            { title: 'Cupboard', items: ['', '', '', '', '', '', ''] },
            { title: 'Frozen', items: ['', '', '', ''] },
            { title: 'Household', items: ['', '', '', ''] },
            { title: 'Treats', items: ['', '', ''] },
          ],
        },
        {
          kind: 'table',
          title: 'Freezer & cupboard inventory',
          subtitle: 'What you already have, so you stop buying it twice.',
          columns: [
            { label: 'Item', weight: 2.4 },
            { label: 'Qty', weight: 0.7 },
            { label: 'Date in', weight: 1 },
            { label: 'Use by', weight: 1 },
          ],
          rows: 24,
        },
        {
          kind: 'columns',
          title: 'Meals that always work',
          subtitle: 'Your own bank of easy wins, so the plan writes itself next week.',
          blocks: [
            { title: 'Ten minute meals', lines: 16 },
            { title: 'Family favourites', lines: 16 },
          ],
        },
      ],
    }),
  },
  {
    match: /wedding|hen|bridal|bride|marriage/i,
    build: (idea) => ({
      palette: 'blush',
      pages: [
        cover(idea, ['Full planning set', 'A4 + Letter', 'Undated']),
        {
          kind: 'checklist',
          title: 'Countdown checklist',
          subtitle: 'What to sort, and roughly when.',
          columnsCount: 2,
          sections: [
            { title: '12+ months', items: ['Set the budget', 'Rough guest number', 'Venue viewings', 'Book the venue', 'Save the dates'] },
            { title: '9 months', items: ['Photographer', 'Food and drink', 'Dress or suit', 'Registrar or officiant'] },
            { title: '6 months', items: ['Invitations', 'Flowers', 'Cake', 'Music', 'Rings'] },
            { title: '3 months', items: ['Final numbers', 'Seating plan', 'Order of the day', 'Hair and make-up trial'] },
            { title: '1 month', items: ['Final payments', 'Supplier timings', 'Table plan printed', 'Emergency kit'] },
            { title: 'The week', items: ['Rehearsal', 'Delegate jobs', 'Pack for the night', 'Eat something'] },
          ],
        },
        {
          kind: 'table',
          title: 'Budget tracker',
          subtitle: 'Quoted, deposit paid, balance left. No surprises in the final month.',
          columns: [
            { label: 'Supplier / item', weight: 2.4 },
            { label: 'Quoted', weight: 1 },
            { label: 'Deposit', weight: 1 },
            { label: 'Balance', weight: 1 },
            { label: 'Paid', weight: 0.7 },
          ],
          rows: 22,
          checkboxColumn: true,
          totals: 'Total spend',
        },
        {
          kind: 'table',
          title: 'Guest list & RSVPs',
          columns: [
            { label: 'Name', weight: 2.2 },
            { label: 'Invited', weight: 0.8 },
            { label: 'RSVP', weight: 0.8 },
            { label: 'Meal', weight: 1 },
            { label: 'Table', weight: 0.8 },
          ],
          rows: 26,
        },
        {
          kind: 'table',
          title: 'Order of the day',
          subtitle: 'The timeline every supplier will ask you for.',
          columns: [
            { label: 'Time', weight: 0.8 },
            { label: 'What happens', weight: 2.6 },
            { label: 'Who is on it', weight: 1.4 },
          ],
          rows: 22,
          note: 'Send this to your photographer and venue two weeks before. It saves the day.',
        },
      ],
    }),
  },
  {
    match: /kids|children|activity|toddler|handwriting|times table|reading|school|revision|student|teacher/i,
    build: (idea) => ({
      pages: [
        cover(idea, ['Reprint forever', 'A4 + Letter', 'No prep needed']),
        {
          kind: 'checklist',
          title: 'Activity menu',
          subtitle: 'Pick one. No screens required, nothing you need to buy.',
          columnsCount: 2,
          sections: [
            { title: 'Ten minutes', items: ['Paper aeroplane contest', 'Draw the person opposite you', 'Sock basketball', 'I-spy in the garden'] },
            { title: 'Half an hour', items: ['Build a den', 'Treasure hunt with clues', 'Junk model something', 'Bake with three ingredients'] },
            { title: 'A whole afternoon', items: ['Put on a play', 'Make a comic', 'Nature scavenger hunt', 'Obstacle course'] },
            { title: 'Quiet time', items: ['Reading corner', 'Colouring', 'Jigsaw', 'Audiobook and drawing'] },
          ],
        },
        {
          kind: 'grid',
          title: 'Practice tracker',
          subtitle: 'A tick a day. Ten minutes counts.',
          columns: DAYS,
          rows: ['Reading', 'Writing', 'Numbers', 'Something creative', 'Outside'],
          cells: 'star',
        },
        {
          kind: 'columns',
          title: 'My favourite things this week',
          blocks: [
            { title: 'Best bit', prompt: 'Draw it or write it.', lines: 14 },
            { title: 'Next week I want to', lines: 14 },
          ],
        },
      ],
    }),
  },
  {
    match: /spreadsheet|bookkeeping|invoice|profit|business|mileage|expense|etsy seller|content/i,
    build: (idea) => ({
      palette: 'ink',
      sheets: true,
      pages: [
        cover(idea, ['Spreadsheet + printable', 'Formulas included', 'No software to buy']),
        {
          kind: 'table',
          title: 'Income',
          subtitle: 'Every sale, in one place, ready for your tax return.',
          columns: [
            { label: 'Date', weight: 0.9 },
            { label: 'Customer / platform', weight: 2 },
            { label: 'Description', weight: 2 },
            { label: 'Net', weight: 0.9 },
            { label: 'Fees', weight: 0.9 },
          ],
          rows: 26,
          totals: 'Total income',
        },
        {
          kind: 'table',
          title: 'Expenses',
          subtitle: 'Keep the receipt reference. Future you will thank present you.',
          columns: [
            { label: 'Date', weight: 0.9 },
            { label: 'Supplier', weight: 1.8 },
            { label: 'Category', weight: 1.4 },
            { label: 'Amount', weight: 0.9 },
            { label: 'Receipt', weight: 0.8 },
          ],
          rows: 26,
          checkboxColumn: true,
          totals: 'Total expenses',
        },
        {
          kind: 'table',
          title: 'Monthly summary',
          columns: [
            { label: 'Month', weight: 1.2 },
            { label: 'Income', weight: 1 },
            { label: 'Expenses', weight: 1 },
            { label: 'Profit', weight: 1 },
            { label: 'Set aside for tax', weight: 1.2 },
          ],
          rows: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
          totals: 'Year to date',
          note: 'Set aside a percentage of profit every month rather than panicking in January.',
        },
        {
          kind: 'instructions',
          title: 'How to use the spreadsheet',
          blocks: [
            { title: 'Open it anywhere', body: 'The .csv files open in Excel, Numbers, LibreOffice and Google Sheets. Google Sheets is free and needs nothing installed.' },
            { title: 'Only type in the white cells', body: 'Headers and totals rows are there for you to keep. Add rows at the bottom rather than in the middle so any formulas you add keep working.' },
            { title: 'One file per tax year', body: 'Duplicate the folder each April and start clean. Keep the old one; you have to be able to produce it for six years.' },
          ],
        },
      ],
    }),
  },
  {
    match: /fitness|workout|gym|run|weight|strength|health|pregnan|habit|water/i,
    build: (idea) => ({
      pages: [
        cover(idea, ['12 week plan', 'A4 + Letter', 'Undated']),
        {
          kind: 'table',
          title: 'Workout log',
          subtitle: 'Sets, reps and what you actually lifted.',
          columns: [
            { label: 'Exercise', weight: 2.2 },
            { label: 'Set 1', weight: 1 },
            { label: 'Set 2', weight: 1 },
            { label: 'Set 3', weight: 1 },
            { label: 'Notes', weight: 1.6 },
          ],
          rows: 22,
          note: 'Beat one number from last week. One is enough.',
        },
        {
          kind: 'table',
          title: 'Measurements',
          subtitle: 'Same day, same time, same conditions. Weekly is plenty.',
          columns: [
            { label: 'Date', weight: 1 },
            { label: 'Weight', weight: 1 },
            { label: 'Chest', weight: 1 },
            { label: 'Waist', weight: 1 },
            { label: 'Hips', weight: 1 },
            { label: 'How I feel', weight: 1.8 },
          ],
          rows: 20,
        },
        {
          kind: 'tracker',
          title: '12 week habit tracker',
          subtitle: 'Shade a circle for every day you turn up.',
          rows: ['Movement', 'Water', 'Sleep 7h+', 'Protein', 'Steps'],
          boxes: 28,
          perRow: 28,
          note: 'Missing one day is a day off. Missing two is the start of a habit. Never miss twice.',
        },
        {
          kind: 'columns',
          title: 'Why I started',
          blocks: [
            { title: 'The reason', prompt: 'Write it now, read it in week five.', lines: 14 },
            { title: 'Wins so far', lines: 14 },
          ],
        },
      ],
    }),
  },
  {
    match: /wall art|print|poster|art set|botanical|affirmation|line art|nursery|typograph/i,
    build: (idea, rng) => {
      const headlines = [
        ['GOOD', 'THINGS', 'TAKE TIME'],
        ['MAKE', 'IT', 'HAPPEN'],
        ['SLOW', 'MORNINGS'],
        ['BE HERE', 'NOW'],
        ['GATHER', 'TOGETHER'],
      ];
      const chosen = headlines[Math.floor(rng() * headlines.length)];
      return {
        palette: PALETTE_BY_CATEGORY['Wall art'],
        pages: [
          { kind: 'poster', paper: 'Ratio23', style: 'typographic', lines: chosen, emphasis: 1, caption: idea.title },
          { kind: 'poster', paper: 'Ratio45', style: 'typographic', lines: chosen, emphasis: 1, caption: idea.title },
          { kind: 'poster', paper: 'Square', style: 'botanical', caption: 'Pressed sprig', latin: 'no. i' },
          {
            kind: 'poster',
            paper: 'Ratio23',
            style: 'chart',
            title: 'Kitchen conversions',
            rows: [
              ['1 tsp', '5 ml'],
              ['1 tbsp', '15 ml'],
              ['1 cup flour', '125 g'],
              ['1 cup sugar', '200 g'],
              ['1 cup butter', '227 g'],
              ['1 oz', '28 g'],
              ['1 lb', '454 g'],
              ['1 pint (UK)', '568 ml'],
              ['350 F', '180 C / gas 4'],
              ['400 F', '200 C / gas 6'],
            ],
          },
          {
            kind: 'instructions',
            title: 'Printing your art',
            blocks: [
              { title: 'Sizes included', body: 'Each design comes in 2:3 (fits 4x6, 8x12, 12x18, 16x24), 4:5 (fits 8x10, 16x20) and 1:1 square. Pick the ratio that matches your frame.' },
              { title: 'At home', body: 'Choose "actual size" or 100%, borderless if your printer allows it, on matte card of at least 200gsm.' },
              { title: 'At a print shop', body: 'Upload the PDF and ask for A3 or A2 on matte. Any high street or online printer will do this for a few pounds.' },
            ],
          },
        ],
      };
    },
  },
  {
    match: /digital planner|goodnotes|ipad|hyperlink|notability|sticker/i,
    build: (idea) => ({
      palette: 'ink',
      pages: [
        cover(idea, ['GoodNotes & Notability', 'Undated', 'Hyperlinked']),
        {
          kind: 'grid',
          title: 'Weekly spread',
          columns: DAYS,
          rows: ['Morning', 'Afternoon', 'Evening', 'Top three', 'Notes'],
          cells: 'blank',
          labelWidth: 88,
        },
        {
          kind: 'columns',
          title: 'Daily page',
          blocks: [
            { title: 'Today', prompt: 'Three things, no more.', lines: 20 },
            { title: 'Notes', lines: 20 },
          ],
        },
        {
          kind: 'instructions',
          title: 'Using this on a tablet',
          blocks: [
            { title: 'Import it', body: 'Open the PDF in GoodNotes, Notability, Xodo or any app that accepts PDFs, and choose Import as a new notebook.' },
            { title: 'Write on it', body: 'Use the pen tool as if it were paper. Undated pages mean you can start on any day and never waste a page.' },
            { title: 'Duplicate pages', body: 'Long press a page thumbnail and duplicate it whenever you need another day or week.' },
          ],
        },
      ],
    }),
  },
];

const DEFAULT_BLUEPRINT = (idea) => ({
  pages: [
    cover(idea, ['A4 + Letter', 'Undated', 'Print at home']),
    {
      kind: 'checklist',
      title: 'The checklist',
      subtitle: 'Everything that needs doing, in a sensible order.',
      columnsCount: 2,
      sections: [
        { title: 'First', items: ['', '', '', '', ''] },
        { title: 'Then', items: ['', '', '', '', ''] },
        { title: 'Before you finish', items: ['', '', '', ''] },
        { title: 'Notes', items: ['', '', '', ''] },
      ],
    },
    {
      kind: 'table',
      title: 'Tracker',
      columns: [
        { label: 'Date', weight: 1 },
        { label: 'What I did', weight: 2.6 },
        { label: 'How it went', weight: 1.6 },
        { label: 'Done', weight: 0.7 },
      ],
      rows: 22,
      checkboxColumn: true,
    },
    {
      kind: 'columns',
      title: 'Notes',
      blocks: [{ title: 'Notes', lines: 20 }, { title: 'Ideas', lines: 20 }],
    },
  ],
});

function cover(idea, chips) {
  return {
    kind: 'cover',
    title: idea.title,
    subtitle: idea.pitch || idea.angle || '',
    chips,
    note: PRINT_NOTE,
  };
}

/**
 * Build a spec without any model involved.
 * @param {object} idea row from the ideas table
 * @param {string} brand
 */
export function offlineSpec(idea, brand) {
  const rng = seededRandom(idea.id || idea.title);
  const haystack = `${idea.title} ${idea.category} ${idea.audience || ''} ${(idea.keywords || []).join(' ')}`;
  const blueprint = BLUEPRINTS.find((b) => b.match.test(haystack));
  const built = blueprint ? blueprint.build(idea, rng) : DEFAULT_BLUEPRINT(idea);
  return normaliseSpec(
    {
      title: idea.title,
      subtitle: idea.pitch || '',
      brand,
      palette: built.palette || PALETTE_BY_CATEGORY[idea.category] || 'sage',
      keywords: idea.keywords || [],
      sheets: built.sheets || /spreadsheet|tracker|budget|inventory|log/i.test(haystack),
      pages: built.pages,
    },
    idea,
    brand
  );
}

const PAGE_KINDS = new Set(['cover', 'table', 'checklist', 'grid', 'tracker', 'columns', 'poster', 'instructions']);

/** Sanitise a spec that came from a model so it can never break the renderer. */
export function normaliseSpec(raw, idea, brand) {
  const spec = raw && typeof raw === 'object' ? raw : {};
  const pages = Array.isArray(spec.pages) ? spec.pages : [];
  const cleanPages = pages
    .filter((p) => p && typeof p === 'object')
    .map((p) => {
      const kind = PAGE_KINDS.has(p.kind) ? p.kind : 'table';
      const page = { ...p, kind };
      if (page.title) page.title = String(page.title).slice(0, 90);
      if (page.subtitle) page.subtitle = String(page.subtitle).slice(0, 220);
      if (page.note) page.note = String(page.note).slice(0, 260);
      if (typeof page.rows === 'number') page.rows = Math.max(1, Math.min(40, Math.round(page.rows)));
      if (Array.isArray(page.rows)) page.rows = page.rows.slice(0, 40).map((r) => String(r ?? '').slice(0, 60));
      if (Array.isArray(page.columns)) {
        page.columns = page.columns.slice(0, 8).map((c) =>
          typeof c === 'string'
            ? String(c).slice(0, 30)
            : { label: String(c?.label ?? '').slice(0, 30), weight: Number(c?.weight) > 0 ? Number(c.weight) : 1 }
        );
      }
      if (Array.isArray(page.sections)) {
        page.sections = page.sections.slice(0, 10).map((s) => ({
          title: String(s?.title ?? '').slice(0, 50),
          items: (Array.isArray(s?.items) ? s.items : []).slice(0, 14).map((item) =>
            typeof item === 'string'
              ? String(item).slice(0, 90)
              : { label: String(item?.label ?? '').slice(0, 90), minutes: Number(item?.minutes) || undefined }
          ),
        }));
      }
      if (Array.isArray(page.blocks)) {
        page.blocks = page.blocks.slice(0, 3).map((b) => ({
          title: String(b?.title ?? '').slice(0, 50),
          prompt: b?.prompt ? String(b.prompt).slice(0, 140) : undefined,
          lines: Number(b?.lines) > 0 ? Math.min(30, Math.round(Number(b.lines))) : undefined,
          body: b?.body ? String(b.body).slice(0, 700) : undefined,
        }));
      }
      return page;
    })
    .slice(0, 14);

  if (!cleanPages.length) cleanPages.push(cover(idea, ['A4 + Letter']));
  if (cleanPages[0].kind !== 'cover') cleanPages.unshift(cover(idea, ['A4 + Letter', 'Undated']));

  const palette = PALETTE_NAMES.includes(spec.palette)
    ? spec.palette
    : PALETTE_BY_CATEGORY[idea.category] || 'sage';

  return {
    title: String(spec.title || idea.title).slice(0, 110),
    subtitle: String(spec.subtitle || idea.pitch || '').slice(0, 220),
    brand: brand || spec.brand || '',
    footer: `${brand || ''} — for personal use. Please do not resell or share the files.`.trim(),
    palette,
    keywords: Array.isArray(spec.keywords) ? spec.keywords.slice(0, 12) : idea.keywords || [],
    sheets: Boolean(spec.sheets),
    pages: cleanPages,
  };
}

/** Rows for a companion .csv, derived from the table pages in the spec. */
export function sheetsFromSpec(spec) {
  const sheets = [];
  for (const page of spec.pages) {
    if (page.kind !== 'table' || !Array.isArray(page.columns)) continue;
    const headers = page.columns.map((c) => (typeof c === 'string' ? c : c.label));
    const rowLabels = Array.isArray(page.rows) ? page.rows : [];
    const blankRows = Array.isArray(page.rows) ? page.rows.length : page.rows || 20;
    const rows = [];
    for (let i = 0; i < blankRows; i++) {
      const row = new Array(headers.length).fill('');
      if (rowLabels[i]) row[0] = rowLabels[i];
      rows.push(row);
    }
    sheets.push({ name: titleCase(page.title || 'Sheet'), headers, rows });
  }
  return sheets;
}

export default offlineSpec;
