// The Manager: running the shop at a sustainable pace.
export default {
  id: 'manager',
  agent: 'manager',
  division: 'etsy',
  title: 'Running the shop',
  summary: 'Cadence, capacity, seasonality and knowing what not to start.',

  lessons: [
    'A small shop wins by finishing things, not by starting them. Keep the number of products in production low enough that every one of them reaches the Shopfront.',
    'A steady trickle of listings beats a burst. Etsy learns each listing over weeks, and a shop that adds something every few days looks alive to both buyers and the algorithm.',
    'Seasonal work has to start six to ten weeks before the season, so plan backwards from the date people start searching, not from the date of the holiday.',
    'Keep the idea backlog full enough that the owner always has something to choose from, but never so full that ranking it becomes a chore. A dozen good options is better than fifty.',
    'When something has been stuck at the same stage for more than a day with nobody working on it, that is a bug in the shop, not patience. Chase it.',
    'Do not start a second product for the same buyer while the first is unfinished. Finish, list, then build the neighbour and bundle them.',
    'The owner approves ideas and listings. Never approve, never assume, never nudge them into a decision by making one look inevitable.',
    'When the shop has nothing live, priority is getting one thing all the way out, not getting five things half done. The first listing teaches you more than the next four.',
    'Report decisions, not deliberations. A status line that says what moved is useful; one that says what might move is noise.',
  ],

  rules: {
    cadence: { maxActiveProducts: 3, minIdeaBacklog: 8, idealIdeaBacklog: 18, stallHours: 24 },
  },
};
