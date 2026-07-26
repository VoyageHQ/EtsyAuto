// The Signwriter: being found. Not what the listing says, but whether anybody
// ever reaches it.
export default {
  id: 'signwriter',
  agent: 'signwriter',
  division: 'etsy',
  title: 'Search, and the shop as a whole',
  summary: 'How Etsy decides who sees a listing, and how a shop stops competing with itself.',

  lessons: [
    'Etsy matches a query against the title, the tags, the category and the attributes. A phrase present in both the title and a tag ranks far above one that appears in only one of them.',
    'Exact phrase matches beat scattered word matches. "adhd cleaning chart" as a tag will outrank a listing that merely contains all three words somewhere.',
    'There are thirteen tags and no way to earn more. An unused tag is a search you have chosen not to appear in.',
    'Single-word tags are almost always wasted. "planner" puts you against a million listings; "adhd evening planner" puts you against a hundred, and those hundred are the ones actually looking for you.',
    'Two tags that mean the same thing count as one. Etsy collapses near-identical tags, so "budget planner" and "budget planners" is a slot spent twice on the same search.',
    'Spelling is not a synonym. "organiser" and "organizer" are different words to Etsy, and covering both is free. But "planner" and "diary" are different products, and swapping them is not an SEO trick, it is a wrong description.',
    'The first forty to sixty characters of the title are what a buyer reads under a search thumbnail. Everything after that is for the algorithm; everything before it is for the human.',
    'Long titles are not spam if every phrase is real. Titles that read as a list of unrelated keywords are, and Etsy suppresses them.',
    'Never repeat a phrase in a title hoping to rank twice for it. Etsy does not reward it, and it costs you the characters a second real phrase would have used.',
    'The first 160 characters of the description are the Google snippet and the strongest part of the description for Etsy. Lead with what the thing is, for whom.',
    'Changing a live listing resets what Etsy has learned about it — the click rate, the favourites, the position it had earned. Change one thing, then wait four weeks before judging it.',
    'That rule is why churn is worse than an imperfect title. A listing edited every week never accumulates the signals that make it rank at all.',
    'A shop appears once per search. Two listings chasing the same phrase do not double your chances, they split them, and Etsy picks whichever it thinks is better — which may be the weaker one.',
    'When two listings collide, the fix is rarely to delete one. Point it at a different buyer, a different occasion, or a different format, and it stops being the same listing.',
    'Breadth is what makes a shop findable. Fifteen products aimed at fifteen searches beat fifteen aimed at one, even when the one is a good search.',
    'New listings get a short placement boost while Etsy gathers data. Judge nothing in the first week; that traffic is a loan, not a signal.',
    'Views without sales is a conversion problem — images, price, description. Sales with few views is a keyword problem. Neither views nor sales usually means the product does not match anything real people search for.',
    'Do not chase the highest-volume phrase in a category. A new shop cannot win it, and a phrase with a tenth of the traffic and a hundredth of the competition sells more.',
    'Seasonal terms have to be listed before the season, not during. By the time a search peaks, the listings ranking for it have had months of signals.',
    'The shop name, the "about" section and the policies are indexed too. An empty policies page is both a Star Seller blocker and a missed relevance signal.',
  ],

  rules: {
    seo: {
      // How long a live listing is left alone after a change, so it can earn
      // the signals that make it rank.
      settleDays: 28,
      // Titles below this are leaving search surface unused.
      titleMinChars: 70,
      // What the first screenful is worth: this is the part a human reads.
      leadChars: 60,
      // Tags that ought to echo a phrase from the title, which is the pairing
      // Etsy ranks highest.
      anchoredTagsWanted: 3,
      maxSingleWordTags: 2,
      // Above this, two tags are the same tag.
      tagOverlapLimit: 0.7,
      // Above this, two listings are the same listing as far as search cares.
      listingOverlapLimit: 0.55,
      sharedTagLimit: 7,
      // How many distinct search words a shop of N listings ought to cover.
      termsPerListing: 4,
    },
  },
};
