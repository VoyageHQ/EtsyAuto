// The shop's year, month by month. Timing is most of the game in printables:
// the same product listed eight weeks early earns, and listed two weeks late
// does not.
export default {
  id: 'seasonal',
  agent: null,
  division: 'etsy',
  title: 'The shop year',
  summary: 'What to list, when to list it, and how far ahead to start.',

  lessons: [
    'Etsy needs weeks to learn a new listing, so a seasonal product must be live six to ten weeks before people start searching. Work backwards from when the searching starts, never from the date of the event.',
    'January is the biggest month of the year for planners, budgets, fitness trackers and goal workbooks. Those listings must be up and settled by the second week of December.',
    'February is half term activities, Valentine printables and the post-Christmas budget reset. Small, cheap, impulse-priced.',
    'March and April are spring cleaning, Mother\'s Day, Easter activities and the UK tax year end. Cleaning schedules and home admin sell hardest here.',
    'April to June is exam season: revision timetables, study planners, Cornell notes. Parents and students both buy, and they buy in a panic.',
    'May and June are weddings and summer holiday planning. Wedding buyers plan a year ahead, so wedding products sell year-round with a spring peak.',
    'July and August are the six-week holidays: kids activity packs, road trip games, boredom jars, summer bucket lists. Then back to school and teacher planners, which is the second biggest window after January.',
    'September is the quiet reset: routines, meal planning, budgets, fitness. It behaves like a second January and far fewer sellers treat it that way.',
    'October is Halloween, and it is short and sharp. List by mid-August or do not bother.',
    'October and November are when Christmas planners, advent activities and gift budget trackers actually sell. December is too late for anything but last-minute printables.',
    'Late December belongs to next year: new year planners, goal workbooks, dry January trackers. List them before Christmas, not after.',
    'Evergreen products pay the rent. Aim for roughly three evergreen listings for every seasonal one, or the shop starves between peaks.',
    'A seasonal listing does not die when the season ends. Leave it live, keep it undated where possible, and it wakes up next year with its ranking intact.',
    'Never date a product with a year unless it genuinely must be. "2026 Planner" is dead stock in January 2027; "Undated Yearly Planner" sells forever.',
    'School terms, tax years, public holidays and seasons all differ by country. If a product depends on any of them, say which country it is for in the title.',
  ],

  rules: {
    // Month index (0 = January) when work on each theme must already be under way.
    listByMonth: {
      'new year and goals': 10,
      'budgets and money': 10,
      fitness: 10,
      'spring cleaning': 1,
      "mother's day": 1,
      easter: 1,
      'tax year end': 1,
      'exam revision': 2,
      weddings: 2,
      'summer holidays': 4,
      'road trips': 4,
      'back to school': 5,
      'teacher planners': 5,
      halloween: 7,
      'christmas planning': 7,
      advent: 8,
    },
    leadWeeks: { min: 6, ideal: 8, max: 10 },
    evergreenRatio: 3,
  },
};
