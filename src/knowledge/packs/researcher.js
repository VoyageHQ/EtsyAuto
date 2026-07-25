// The Researcher: keywords, competition and what a thing is worth.
export default {
  id: 'researcher',
  agent: 'researcher',
  division: 'etsy',
  title: 'Keywords, competition and pricing',
  summary: 'How Etsy search actually matches, and how to price without guessing.',

  lessons: [
    // --- how to build a keyword set -----------------------------------------
    'Build the keyword set in three layers: the head phrase everyone searches ("budget planner"), the long-tail phrase that describes this exact product ("zero based budget planner uk"), and the problem phrase people type when they do not know the product exists ("where does my money go each month").',
    'A tag is capped at twenty characters. Phrases longer than that must be cut at a word boundary, never mid-word, and never padded with a filler word just to fill the slot.',
    'Spelling differs by market and Etsy does not treat variants as the same word. If the product suits both, spend tags on both: organiser and organizer, colour and color, personalised and personalized.',
    'Synonyms are not spellings. "Diary" and "planner" reach different buyers and both deserve a considered tag, but never swap one for the other automatically — a meal planner is not a meal diary.',
    'Include at least two phrases a buyer would type when they do not yet know what the product is called. Those searches have far less competition and much higher intent.',
    'Do not repeat the same head word in more than about three tags. Thirteen variations of "planner" reach one audience; nine different phrases reach nine.',
    'Attributes and category matter as much as tags. A listing in the wrong category will not rank however good the tags are.',

    // --- reading the competition --------------------------------------------
    'Judge competition by what the top listings actually are, not by the number of results. Twenty thousand results where the first page is all generic filler is an easier win than two hundred results where the first page is excellent.',
    'If the first page of results is dominated by huge shops with thousands of sales, do not attack the head phrase. Win a long-tail phrase completely instead and let it feed you.',
    'A category where every listing looks the same is an opportunity: the buyers are there and nobody has bothered to be specific.',
    'Never state a search volume, a sales figure or a market size you have not actually looked at. Say what you would need to check and why, and label every estimate as an estimate.',

    // --- pricing --------------------------------------------------------------
    'Price on perceived value, not on effort. Buyers cannot see how long a file took; they judge by page count, specificity and how good the preview looks.',
    'Under about three pounds a buyer barely deliberates, but the fees take a large share and it signals low value. Under-pricing a good product is the more common mistake, not over-pricing it.',
    'Charm pricing is the marketplace norm: end on .99 or .49. A round number looks like a placeholder next to competitors.',
    'When in doubt price at the top of the range you can justify from the preview images, and lower it later if it does not sell. Raising a price after launch loses the early reviews that make the listing work.',
    'A five-page pack aimed at one specific person is worth more than a twenty-page pack aimed at everyone. Say that in the research note when the shop is tempted to pad.',
    'Always sanity-check the price against fees. Roughly a fifth to a quarter of the sale price disappears, so a £3 product returns closer to £2.30 — fine at volume, poor if it took a day to make.',

    // --- what to warn about ---------------------------------------------------
    'Flag it loudly when a proposed product would compete with one the shop already sells. Two of your own listings fighting for one phrase is worse than one, because Etsy splits the signal between them.',
    'Flag any idea whose keywords are dominated by a brand, character or programme name. That is a trademark trap however innocent the product.',
    'Flag anything where the buyer would reasonably expect an editable file. If people search "editable" for this product type and the shop only ships a flat PDF, that is a refund waiting to happen.',
    'Note which country the keywords belong to. "Diary" is a British word, "planner" is universal, "college ruled" is American — mixing them makes a listing read as machine-made.',
  ],

  rules: {
    tagLimits: { count: 13, chars: 20, minChars: 3 },
    // Spelling pairs worth covering in tags when both markets apply.
    spellingPairs: [
      ['organiser', 'organizer'],
      ['colour', 'color'],
      ['favourite', 'favorite'],
      ['personalised', 'personalized'],
      ['cheque', 'check'],
      ['practise', 'practice'],
      ['grey', 'gray'],
    ],
    // Words that signal the buyer expects something the shop must actually ship.
    promiseWords: ['editable', 'fillable', 'canva', 'google sheets', 'excel', 'goodnotes'],
    // A rough floor: below this the fees make the work pointless.
    priceFloor: 2.5,
    charmEndings: [0.99, 0.49],
  },
};
