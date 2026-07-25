// The Scout's offline notebook. When no model is configured the Scout still
// has to earn its keep, so it works from this seed corpus of real digital
// download concepts and recombines them with twists.
//
// Fields: t=title stem, c=category, a=audience, g=angle (why it sells),
// f=format, k=search keywords, e=effort 1-5, d=demand 1-5, p=[low,high] price.

export const SEEDS = [
  // --- budget planners -----------------------------------------------------
  { t: 'Zero-Based Monthly Budget Planner', c: 'Budget planners', a: 'people who overspend before payday', g: 'every pound gets a job, so nothing vanishes', f: 'printable PDF pack', k: ['zero based budget', 'monthly budget planner', 'budget printable'], e: 2, d: 5, p: [3.5, 7] },
  { t: 'Paycheck Budget Tracker', c: 'Budget planners', a: 'weekly and fortnightly earners', g: 'most budget sheets assume one monthly salary and break for shift workers', f: 'printable PDF pack', k: ['paycheck budget', 'biweekly budget', 'weekly pay planner'], e: 2, d: 4, p: [3, 6 ] },
  { t: 'Debt Snowball Payoff Tracker', c: 'Budget planners', a: 'people clearing cards and loans', g: 'colour-in progress makes people stick with it', f: 'printable PDF + colouring tracker', k: ['debt payoff tracker', 'debt snowball', 'debt free chart'], e: 2, d: 5, p: [2.5, 5] },
  { t: 'Sinking Funds Planner', c: 'Budget planners', a: 'cash stuffing and envelope budgeters', g: 'the cash-stuffing crowd buys these in bundles', f: 'printable PDF pack', k: ['sinking funds tracker', 'cash stuffing', 'savings challenge'], e: 2, d: 4, p: [3, 6] },
  { t: 'Household Bills Calendar', c: 'Budget planners', a: 'renters and new homeowners', g: 'one page that stops late fees', f: 'printable PDF', k: ['bill payment tracker', 'bills calendar', 'bill organiser'], e: 1, d: 4, p: [2.5, 5] },
  { t: 'Christmas Budget & Gift Planner', c: 'Budget planners', a: 'parents planning December', g: 'seasonal panic buying from September onwards', f: 'printable PDF pack', k: ['christmas budget planner', 'gift tracker', 'holiday planner'], e: 2, d: 5, p: [3, 6] },

  // --- chore charts --------------------------------------------------------
  { t: 'Kids Chore Chart with Reward Stars', c: 'Chore charts', a: 'parents of 4-10 year olds', g: 'visual rewards actually get chores done', f: 'printable PDF + reusable version', k: ['kids chore chart', 'reward chart', 'chore chart printable'], e: 2, d: 5, p: [2.5, 5] },
  { t: 'Teen Responsibility Chart', c: 'Chore charts', a: 'parents of 11-16 year olds', g: 'teen charts are badly served, everything is aimed at toddlers', f: 'printable PDF', k: ['teen chore chart', 'teenager responsibility', 'chore chart teens'], e: 2, d: 4, p: [3, 5.5] },
  { t: 'Flatmate Cleaning Rota', c: 'Chore charts', a: 'house shares and student flats', g: 'settles arguments without a group chat row', f: 'printable PDF + editable', k: ['roommate chore chart', 'cleaning rota', 'flatmate schedule'], e: 1, d: 3, p: [2.5, 5] },
  { t: 'Weekly Home Reset Checklist', c: 'Chore charts', a: 'busy households', g: 'the Sunday reset trend is huge and evergreen', f: 'printable PDF', k: ['home reset checklist', 'weekly cleaning schedule', 'sunday reset'], e: 1, d: 4, p: [2, 4.5] },
  { t: 'Deep Clean Room-by-Room Checklist', c: 'Chore charts', a: 'spring cleaners and end-of-tenancy movers', g: 'people pay to not have to think about the order', f: 'printable PDF pack', k: ['deep cleaning checklist', 'spring cleaning', 'house cleaning list'], e: 2, d: 4, p: [3, 6] },

  // --- neurodivergent-friendly systems ------------------------------------
  { t: 'ADHD Cleaning Chart', c: 'ADHD & neurodivergent', a: 'adults with ADHD who freeze at "tidy the house"', g: 'tasks broken into 5 minute chunks with no shame language', f: 'printable PDF pack', k: ['adhd cleaning chart', 'adhd planner', 'adhd cleaning checklist'], e: 2, d: 5, p: [3.5, 7] },
  { t: 'ADHD Daily Dopamine Planner', c: 'ADHD & neurodivergent', a: 'ADHD adults', g: 'body doubling, timers and rewards built into the page', f: 'printable PDF pack', k: ['adhd daily planner', 'adhd productivity', 'neurodivergent planner'], e: 3, d: 5, p: [4, 8] },
  { t: 'Executive Function Task Breakdown Sheets', c: 'ADHD & neurodivergent', a: 'ADHD and autistic adults, and their coaches', g: 'turns one big scary task into a short numbered list', f: 'printable PDF pack', k: ['executive function worksheet', 'task breakdown', 'adhd task list'], e: 2, d: 4, p: [3, 6] },
  { t: 'Low Spoons Survival Checklist', c: 'ADHD & neurodivergent', a: 'chronically ill and burnt out people', g: 'a bare-minimum day list, kind rather than demanding', f: 'printable PDF', k: ['low spoons checklist', 'spoon theory', 'chronic illness planner'], e: 1, d: 4, p: [2.5, 5] },
  { t: 'Visual Morning & Bedtime Routine Cards', c: 'ADHD & neurodivergent', a: 'autistic children and their parents', g: 'picture-first routines cut the morning meltdown', f: 'printable PDF cards', k: ['visual schedule', 'routine cards', 'autism visual timetable'], e: 3, d: 5, p: [3.5, 7] },
  { t: 'Emotion Regulation Feelings Wheel Pack', c: 'ADHD & neurodivergent', a: 'parents, teachers and therapists', g: 'therapists buy classroom sets of these', f: 'printable PDF pack', k: ['feelings wheel', 'emotion chart kids', 'calm down corner'], e: 3, d: 4, p: [3.5, 7] },

  // --- meal planners -------------------------------------------------------
  { t: 'Weekly Meal Planner with Shopping List', c: 'Meal planners', a: 'families doing one big shop', g: 'the tear-off list is the bit people actually want', f: 'printable PDF', k: ['meal planner printable', 'weekly meal plan', 'grocery list printable'], e: 1, d: 5, p: [2.5, 5] },
  { t: 'Monthly Meal Plan & Freezer Inventory', c: 'Meal planners', a: 'batch cookers', g: 'stops the "what is in the freezer" waste', f: 'printable PDF pack', k: ['freezer inventory', 'monthly meal planner', 'batch cooking planner'], e: 2, d: 4, p: [3, 6] },
  { t: 'Budget Meal Planner - £30 Week', c: 'Meal planners', a: 'people on a tight food budget', g: 'a concrete number in the title converts', f: 'printable PDF pack', k: ['budget meal planner', 'cheap meal plan', 'frugal meal planning'], e: 2, d: 4, p: [3, 6] },
  { t: 'Slimming Meal Plan & Food Diary', c: 'Meal planners', a: 'people tracking calories loosely', g: 'pairs with fitness trackers as a bundle', f: 'printable PDF pack', k: ['food diary printable', 'meal plan weight loss', 'calorie tracker'], e: 2, d: 4, p: [3, 6] },
  { t: 'Toddler Meal Ideas Planner', c: 'Meal planners', a: 'parents of fussy eaters', g: 'idea prompts included, not just empty boxes', f: 'printable PDF pack', k: ['toddler meal planner', 'kids meal ideas', 'baby led weaning'], e: 2, d: 3, p: [3, 5.5] },

  // --- wedding templates ---------------------------------------------------
  { t: 'Wedding Planning Binder', c: 'Wedding templates', a: 'engaged couples planning alone', g: 'one purchase replaces a dozen scattered downloads', f: 'printable PDF binder', k: ['wedding planner printable', 'wedding binder', 'wedding checklist'], e: 4, d: 5, p: [6, 14] },
  { t: 'Wedding Budget Spreadsheet', c: 'Wedding templates', a: 'couples with a fixed number in mind', g: 'live totals as suppliers get booked', f: 'spreadsheet', k: ['wedding budget spreadsheet', 'wedding cost tracker', 'wedding budget'], e: 3, d: 5, p: [4, 9] },
  { t: 'Seating Plan & Table Chart Kit', c: 'Wedding templates', a: 'couples doing their own seating', g: 'the most-hated job of wedding planning', f: 'printable PDF + editable', k: ['wedding seating chart', 'table plan template', 'seating plan'], e: 3, d: 4, p: [4, 8] },
  { t: 'Wedding Timeline & Day Schedule', c: 'Wedding templates', a: 'couples without a planner', g: 'suppliers ask for this and nobody has one', f: 'printable PDF + editable', k: ['wedding timeline template', 'wedding day schedule', 'wedding itinerary'], e: 2, d: 4, p: [3, 7] },
  { t: 'Hen Party Games Pack', c: 'Wedding templates', a: 'bridesmaids organising the do', g: 'bought in a hurry, low price sensitivity', f: 'printable PDF pack', k: ['hen party games', 'bachelorette games', 'bridal shower games'], e: 2, d: 4, p: [3, 6] },

  // --- kids activities -----------------------------------------------------
  { t: 'Rainy Day Activity Pack', c: 'Kids activities', a: 'parents in the school holidays', g: 'sells every single half term', f: 'printable PDF pack', k: ['kids activity pack', 'rainy day activities', 'printable activities'], e: 3, d: 5, p: [3.5, 7] },
  { t: 'Road Trip Games & Car Bingo', c: 'Kids activities', a: 'families on long journeys', g: 'summer travel spike, instant download suits last minute', f: 'printable PDF pack', k: ['road trip games', 'car bingo printable', 'travel activities kids'], e: 2, d: 4, p: [2.5, 5] },
  { t: 'Handwriting Practice Sheets', c: 'Kids activities', a: 'reception and year 1 parents', g: 'reprintable forever, high perceived value', f: 'printable PDF pack', k: ['handwriting practice', 'tracing worksheets', 'letter formation'], e: 3, d: 5, p: [3, 6] },
  { t: 'Times Tables Practice Pack', c: 'Kids activities', a: 'primary school parents', g: 'homework support parents search for weekly', f: 'printable PDF pack', k: ['times tables worksheets', 'multiplication practice', 'maths printable'], e: 3, d: 4, p: [3, 6] },
  { t: 'Summer Bucket List & Boredom Jar', c: 'Kids activities', a: 'parents facing six weeks off', g: 'strong June and July search volume', f: 'printable PDF pack', k: ['summer bucket list', 'boredom jar', 'summer activities kids'], e: 2, d: 4, p: [2.5, 5] },
  { t: 'Reading Log & Book Review Sheets', c: 'Kids activities', a: 'teachers and home educators', g: 'schools buy classroom licences', f: 'printable PDF pack', k: ['reading log printable', 'book review template', 'reading tracker kids'], e: 2, d: 4, p: [2.5, 5] },
  { t: 'Pocket Money & First Savings Chart', c: 'Kids activities', a: 'parents teaching money basics', g: 'crosses over into the budget audience', f: 'printable PDF', k: ['pocket money chart', 'kids savings tracker', 'money chart kids'], e: 1, d: 3, p: [2.5, 5] },

  // --- business spreadsheets ----------------------------------------------
  { t: 'Small Business Bookkeeping Spreadsheet', c: 'Business spreadsheets', a: 'sole traders and side hustlers', g: 'tax deadline panic every January', f: 'spreadsheet', k: ['bookkeeping spreadsheet', 'small business accounts', 'income expense tracker'], e: 4, d: 5, p: [6, 14] },
  { t: 'Etsy Seller Profit Calculator', c: 'Business spreadsheets', a: 'other Etsy sellers', g: 'sellers buy tools from sellers who clearly know Etsy', f: 'spreadsheet', k: ['etsy profit calculator', 'etsy fee calculator', 'etsy seller spreadsheet'], e: 3, d: 5, p: [5, 11] },
  { t: 'Freelance Invoice & Client Tracker', c: 'Business spreadsheets', a: 'freelancers juggling clients', g: 'invoice numbering and chasing in one place', f: 'spreadsheet + PDF', k: ['invoice template', 'freelance tracker', 'client tracker spreadsheet'], e: 3, d: 4, p: [4, 9] },
  { t: 'Mileage & Expenses Log', c: 'Business spreadsheets', a: 'self-employed drivers and trades', g: 'HMRC-shaped, boring, sells steadily', f: 'spreadsheet + printable', k: ['mileage log', 'expense tracker', 'self employed expenses'], e: 2, d: 4, p: [3, 7] },
  { t: 'Content & Social Media Planner', c: 'Business spreadsheets', a: 'small brands posting for themselves', g: 'monthly grid plus caption bank', f: 'spreadsheet + printable', k: ['social media planner', 'content calendar', 'instagram planner'], e: 3, d: 4, p: [4, 9] },
  { t: 'Craft Fair Stock & Sales Tracker', c: 'Business spreadsheets', a: 'makers doing markets', g: 'niche, underserved, loyal buyers', f: 'spreadsheet', k: ['craft fair planner', 'market stall tracker', 'craft business spreadsheet'], e: 3, d: 3, p: [4, 8] },

  // --- fitness trackers ----------------------------------------------------
  { t: '12 Week Workout Tracker', c: 'Fitness trackers', a: 'gym beginners following a plan', g: 'January and September spikes, evergreen between', f: 'printable PDF pack', k: ['workout tracker printable', 'gym log', 'fitness planner'], e: 2, d: 5, p: [3, 7] },
  { t: 'Weight & Measurements Progress Chart', c: 'Fitness trackers', a: 'people who want proof it is working', g: 'graph paper progress lines are shareable', f: 'printable PDF', k: ['weight loss tracker', 'measurement chart', 'progress tracker'], e: 1, d: 4, p: [2.5, 5] },
  { t: 'Couch to 5K Run Log', c: 'Fitness trackers', a: 'new runners', g: 'ties to a hugely searched programme name', f: 'printable PDF pack', k: ['couch to 5k tracker', 'running log', 'run tracker printable'], e: 2, d: 4, p: [3, 6] },
  { t: 'Water & Habit Tracker Bundle', c: 'Fitness trackers', a: 'habit builders', g: 'cheap impulse buy that leads to bigger bundles', f: 'printable PDF pack', k: ['water tracker', 'habit tracker printable', 'daily habit chart'], e: 1, d: 5, p: [2, 4.5] },
  { t: 'Strength Training Log with PB Board', c: 'Fitness trackers', a: 'lifters', g: 'personal best board is the hook', f: 'printable PDF pack', k: ['strength training log', 'lifting log', 'pr tracker gym'], e: 2, d: 3, p: [3, 6] },
  { t: 'Pregnancy Week-by-Week Journal', c: 'Fitness trackers', a: 'expectant parents', g: 'emotional purchase, high value tolerance', f: 'printable PDF binder', k: ['pregnancy journal', 'pregnancy planner', 'bump tracker'], e: 4, d: 4, p: [5, 11] },

  // --- wall art ------------------------------------------------------------
  { t: 'Minimalist Line Art Trio', c: 'Wall art', a: 'renters styling a gallery wall', g: 'sets of three sell better than singles', f: 'printable art set', k: ['minimalist wall art', 'line art print', 'printable art set'], e: 2, d: 5, p: [4, 9] },
  { t: 'Kitchen Conversion Chart Print', c: 'Wall art', a: 'home bakers', g: 'useful art gets bought as a gift', f: 'printable art', k: ['kitchen conversion chart', 'baking print', 'kitchen wall art'], e: 2, d: 4, p: [3, 7] },
  { t: 'Nursery Alphabet & Animal Set', c: 'Wall art', a: 'new parents decorating', g: 'baby shower gifting, whole-set purchases', f: 'printable art set', k: ['nursery wall art', 'alphabet print', 'kids room decor'], e: 3, d: 5, p: [4, 10] },
  { t: 'Botanical Pressed Flower Prints', c: 'Wall art', a: 'cottagecore and neutral interiors', g: 'timeless, never goes out of season', f: 'printable art set', k: ['botanical print', 'pressed flower art', 'vintage botanical'], e: 2, d: 4, p: [4, 9] },
  { t: 'Custom Family Rules Sign', c: 'Wall art', a: 'people buying housewarming gifts', g: 'personalisation lifts the price a lot', f: 'printable art + editable', k: ['family rules sign', 'house rules print', 'personalised wall art'], e: 2, d: 4, p: [4, 9] },
  { t: 'Typographic Affirmation Set', c: 'Wall art', a: 'therapy rooms and self-care spaces', g: 'bundles into the wellbeing niche', f: 'printable art set', k: ['affirmation print', 'positive quote art', 'self care wall art'], e: 2, d: 3, p: [3, 8] },

  // --- digital planners ----------------------------------------------------
  { t: 'Hyperlinked Digital Daily Planner', c: 'Digital planners', a: 'iPad and GoodNotes users', g: 'no printing, no postage, pure margin', f: 'hyperlinked PDF', k: ['digital planner', 'goodnotes planner', 'ipad planner'], e: 5, d: 5, p: [8, 18] },
  { t: 'Undated Digital Student Planner', c: 'Digital planners', a: 'students and teachers', g: 'undated means it never expires as stock', f: 'hyperlinked PDF', k: ['digital student planner', 'academic planner', 'notability planner'], e: 4, d: 4, p: [6, 14] },
  { t: 'Digital Notebook Sticker Pack', c: 'Digital planners', a: 'digital planner users', g: 'add-on sale to your own planners', f: 'PNG sticker set', k: ['digital stickers', 'goodnotes stickers', 'planner stickers png'], e: 3, d: 4, p: [3, 8] },

  // --- home admin ----------------------------------------------------------
  { t: 'Home Inventory & Insurance Log', c: 'Home admin', a: 'homeowners and new movers', g: 'the sheet nobody has until they need it', f: 'printable PDF + spreadsheet', k: ['home inventory', 'insurance inventory', 'moving house checklist'], e: 3, d: 3, p: [3.5, 8] },
  { t: 'Moving House Checklist Pack', c: 'Home admin', a: 'people moving in 8 weeks', g: 'urgent need, instant download wins', f: 'printable PDF pack', k: ['moving house checklist', 'moving planner', 'change of address list'], e: 2, d: 4, p: [3, 6] },
  { t: 'Car & Home Maintenance Schedule', c: 'Home admin', a: 'first-time owners', g: 'prevents expensive forgetting', f: 'printable PDF', k: ['home maintenance checklist', 'car service log', 'maintenance schedule'], e: 2, d: 3, p: [3, 6] },
  { t: 'Important Documents Organiser', c: 'Home admin', a: 'anyone sorting out life admin', g: 'pairs with the "in case of emergency" binder trend', f: 'printable PDF binder', k: ['document organiser', 'life admin binder', 'important papers'], e: 3, d: 3, p: [4, 9] },

  // --- self care and journals ---------------------------------------------
  { t: 'Self-Care Journal & Mood Tracker', c: 'Self care', a: 'people in therapy or starting out', g: 'daily use means repeat printing and reviews', f: 'printable PDF binder', k: ['self care journal', 'mood tracker', 'mental health planner'], e: 3, d: 5, p: [4, 9] },
  { t: 'Gratitude Journal - 90 Days', c: 'Self care', a: 'journalling beginners', g: 'a fixed number makes it feel like a programme', f: 'printable PDF binder', k: ['gratitude journal', 'daily gratitude', 'journal printable'], e: 2, d: 4, p: [3, 7] },
  { t: 'Sleep Diary & Wind Down Routine', c: 'Self care', a: 'poor sleepers', g: 'doctors ask patients to keep one of these', f: 'printable PDF pack', k: ['sleep diary', 'sleep tracker printable', 'bedtime routine'], e: 2, d: 3, p: [2.5, 6] },
  { t: 'Therapy Session Notes & Reflection Sheets', c: 'Self care', a: 'therapy clients and counsellors', g: 'professionals buy for their whole client list', f: 'printable PDF pack', k: ['therapy worksheets', 'counselling printable', 'session notes'], e: 3, d: 3, p: [4, 9] },

  // --- teacher and study ---------------------------------------------------
  { t: 'Teacher Planner & Class Lists', c: 'Teacher & study', a: 'primary teachers', g: 'August back-to-school rush', f: 'printable PDF binder', k: ['teacher planner', 'lesson plan template', 'class list printable'], e: 4, d: 4, p: [5, 12] },
  { t: 'Revision Timetable & Exam Countdown', c: 'Teacher & study', a: 'GCSE and A-level students', g: 'spring exam season spike', f: 'printable PDF pack', k: ['revision timetable', 'study planner', 'exam planner'], e: 2, d: 4, p: [3, 6] },
  { t: 'Cornell Notes & Study Templates', c: 'Teacher & study', a: 'university students', g: 'named method that people search for directly', f: 'printable PDF pack', k: ['cornell notes template', 'study templates', 'note taking printable'], e: 2, d: 3, p: [2.5, 5] },

  // --- seasonal ------------------------------------------------------------
  { t: 'Christmas Planner Binder', c: 'Seasonal', a: 'people who host at Christmas', g: 'huge October to December window', f: 'printable PDF binder', k: ['christmas planner', 'holiday planner printable', 'christmas organiser'], e: 4, d: 5, p: [5, 11] },
  { t: 'Halloween Party Games & Printables', c: 'Seasonal', a: 'parents hosting parties', g: 'short sharp seasonal spike', f: 'printable PDF pack', k: ['halloween games printable', 'halloween party pack', 'halloween activities'], e: 2, d: 4, p: [3, 6] },
  { t: 'New Year Goal Setting Workbook', c: 'Seasonal', a: 'resolution setters', g: 'January is the single biggest planner month', f: 'printable PDF binder', k: ['goal setting workbook', 'new year planner', 'goal planner printable'], e: 3, d: 5, p: [4, 9] },
  { t: 'Advent Activity Calendar Cards', c: 'Seasonal', a: 'families building traditions', g: '24 cards feels like a lot of value', f: 'printable PDF cards', k: ['advent activities', 'christmas countdown', 'advent calendar printable'], e: 3, d: 4, p: [3.5, 7] },

  // --- pets and travel -----------------------------------------------------
  { t: 'Puppy Training & Vaccination Log', c: 'Pets', a: 'new puppy owners', g: 'emotional new-owner spending', f: 'printable PDF pack', k: ['puppy planner', 'dog training log', 'pet record printable'], e: 2, d: 4, p: [3, 7] },
  { t: 'Pet Care Instructions for Sitters', c: 'Pets', a: 'owners going away', g: 'bought the week before a holiday', f: 'printable PDF + editable', k: ['pet sitter instructions', 'dog care sheet', 'pet info template'], e: 1, d: 3, p: [2.5, 5] },
  { t: 'Travel Itinerary & Packing Planner', c: 'Travel', a: 'holiday planners', g: 'packing lists are the most reprinted page in any pack', f: 'printable PDF pack', k: ['travel planner printable', 'packing list', 'holiday itinerary template'], e: 2, d: 4, p: [3, 7] },
  { t: 'Road Trip Route & Fuel Log', c: 'Travel', a: 'campervan and road trip people', g: 'small devoted niche, little competition', f: 'printable PDF pack', k: ['road trip planner', 'travel log printable', 'campervan planner'], e: 2, d: 3, p: [3, 6] },
];

/** Twists the Scout applies to stretch a seed into a fresh listing. */
export const TWISTS = [
  { label: 'UK edition', note: 'Monday week start, £ symbols, UK spellings and school terms.' },
  { label: 'US Letter edition', note: 'US Letter sizing, Sunday week start, $ symbols.' },
  { label: 'ink-saver edition', note: 'Line art only, no fills, prints in black and white for pennies.' },
  { label: 'one-page edition', note: 'The whole system squeezed onto a single fridge-door page.' },
  { label: 'teen edition', note: 'Grown-up styling, no cartoon characters, language aimed at 11-16s.' },
  { label: 'dyslexia-friendly edition', note: 'Wide spacing, sans-serif, cream background, short lines.' },
  { label: 'large print edition', note: 'Big type and generous boxes for shaky hands or poor eyesight.' },
  { label: 'undated edition', note: 'No dates anywhere, so it never becomes out-of-date stock.' },
  { label: 'bundle edition', note: 'Several related sheets sold together at a higher price point.' },
  { label: 'editable edition', note: 'Fields the buyer can type into before printing.' },
];

export const CATEGORIES = [...new Set(SEEDS.map((s) => s.c))];

export default SEEDS;
