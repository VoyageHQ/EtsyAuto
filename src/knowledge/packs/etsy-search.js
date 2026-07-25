// How the search box actually behaves. This is the difference between a
// listing that is found and one that exists.
export default {
  id: 'etsy-search',
  agent: null,
  division: 'etsy',
  title: 'How Etsy search behaves',
  summary: 'Relevance, quality, and the levers a small shop can actually pull.',

  lessons: [
    'Etsy matches a query against the title, the tags, the categories and the attributes. A phrase present in several of those is a stronger match than one present in only the title.',
    'Exact phrase matches beat scattered word matches. "adhd cleaning chart" as a tag will outrank a listing that merely contains all three words in different places.',
    'After relevance comes listing quality: how often people who see the listing click it, favourite it and buy it. This is why the thumbnail matters more than the description.',
    'New listings get a temporary placement while Etsy gathers data on them. Treat the first week as a paid experiment you did not pay for, and do not waste it on a title you have not thought about.',
    'Shop-level signals matter too: consistent sales, good reviews, complete policies, fast responses. A new shop is fighting its own history as well as the competition.',
    'Changing a live listing\'s title or tags resets what Etsy has learned about it. Change once, wait four weeks, then judge. Fiddling weekly guarantees the listing never settles.',
    'Sales velocity feeds ranking, which is why the first few sales are disproportionately valuable and why a cheap entry product can lift a whole shop.',
    'Search behaviour differs by device. Most printables traffic is mobile, where only the first few words of the title are visible — so the searched phrase goes first.',
    'Etsy Ads bid on your own listings against your own organic placement. Do not run them on a listing that already ranks, and do not run them at all until something converts organically.',
    'Renewing a listing is not a ranking trick. It costs a fee and does nothing that time would not have done for free.',
    'A listing with no sales after eight weeks and reasonable views has a conversion problem — images, price or description — not a keyword problem. Fix the right thing.',
    'A listing with sales but no views has a keyword problem, not a product problem. The people who find it buy it; more people need to find it.',
  ],

  rules: {
    diagnose: {
      'views but no sales': 'conversion: images, price, description, reviews',
      'sales but few views': 'keywords: title, tags, category',
      'neither views nor sales': 'relevance: the product may not match any real search',
    },
    settleWeeks: 4,
    judgeAfterWeeks: 8,
  },
};
