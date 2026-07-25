// The Scribe: the words that decide whether anyone finds it or buys it.
export default {
  id: 'copywriter',
  agent: 'copywriter',
  division: 'etsy',
  title: 'Listing copy that gets found and gets bought',
  summary: 'Title structure, description shape, and the sentences that prevent refunds.',

  lessons: [
    // --- titles ----------------------------------------------------------------
    'The first forty characters of the title are what a buyer sees in search results on a phone. Put the phrase they searched for in those first forty characters and nothing else.',
    'Write the title for a human first and the algorithm second. A title that reads as a list of keywords separated by pipes converts badly even when it ranks.',
    'Structure that works: what it is, who it is for, then the format. "ADHD Cleaning Chart | Five Minute Tasks for Adults | Printable PDF A4 & US Letter".',
    'Never put the shop name in the title. It is already on the page and it costs you searchable characters.',
    'No emoji, no capitals for emphasis, no exclamation marks, no repeated words. Etsy suppresses listings that read as spam and buyers distrust them.',

    // --- the description --------------------------------------------------------
    'The first two lines of the description are what Google shows as the snippet. Make them a plain sentence describing the product and who it is for, not a greeting.',
    'Open with the buyer\'s problem in their own words, not with the product name. "Sunday night, nothing planned, and everyone asks what is for dinner" beats "Introducing our meal planner".',
    'Say what is physically on the pages. Buyers scanning a digital listing want to know what they get before they want to know how it will change their life.',
    'Structure that works: the problem, what is included, how to use it, how to print it, the digital download notice, then terms. In that order, every time.',
    'Repeat the main search phrase naturally twice in the description and no more. Beyond that it reads as stuffing and Etsy penalises it.',
    'Use short paragraphs and plain separators. Long unbroken blocks do not get read on a phone, and that is where most of the traffic is.',

    // --- preventing the messages that cost you --------------------------------
    'State that it is an instant digital download, that nothing is posted, and that no physical item is included — within the first three lines. Vagueness here is the single biggest cause of refund requests on digital listings.',
    'Name the file types and the paper sizes explicitly. "One PDF, A4 and US Letter, five pages" removes three quarters of the pre-purchase questions.',
    'Tell people what they cannot do: no reselling, no sharing the files, no commercial use. Say it plainly and briefly rather than in legal language.',
    'Add the sentence that saves your reviews: if anything looks wrong, message the shop before leaving a review, because it is almost always a printer setting. It works, and it is honest.',
    'If the product will not suit someone — wrong country, wrong paper, needs a colour printer, needs a tablet — say so in the listing rather than letting them find out after paying.',

    // --- voice ------------------------------------------------------------------
    'Write as one person talking to one person. British spelling in the prose; American spellings belong in the tags, not the sentences.',
    'Never invent a testimonial, a customer count, a rating or a result. Not as an example, not as a placeholder, not "for illustration".',
    'Do not describe the product as "perfect for" a list of eight audiences. One audience, described precisely, sells more than eight described vaguely.',
    'Cut every sentence that would still be true if the product did not exist. "Staying organised is important" tells the buyer nothing.',
    'When the product is aimed at neurodivergent or unwell buyers, the tone matters more than the layout: no shame, no implication they have failed before, no talk of discipline or willpower.',
  ],

  rules: {
    title: {
      maxChars: 140,
      leadChars: 40,
      forbid: ['!', '🌟', '✨', '🔥', '💯'],
      neverInclude: ['shop name', 'best', 'sale', 'free'],
    },
    description: {
      minChars: 400,
      mustMention: ['digital download', 'nothing is posted', 'print'],
      sectionOrder: ['problem', 'what you get', 'how to use', 'printing', 'digital notice', 'terms'],
      maxKeywordRepeats: 2,
    },
    // Phrases that mark a listing as machine-written.
    tellTaleFiller: [
      'introducing our',
      'look no further',
      'perfect for everyone',
      'whether you are a',
      'this beautiful',
      'this stunning',
      'must have',
      'take your .* to the next level',
    ],
  },
};
