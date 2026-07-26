// The Shopkeeper: what happens after the sale, written down so it stops
// costing evenings.
export default {
  id: 'support',
  agent: 'lister',
  division: 'etsy',
  title: 'Messages, refunds and the questions that keep arriving',
  summary: 'The handful of questions that make up most support, and how to design them away.',

  lessons: [
    'Most support messages are not complaints, they are a buyer who cannot find their download. The answer is nearly always the Purchases page, and the file itself cannot fix that — but the listing can say where to look.',
    'Roughly the same five questions arrive forever: where is my file, can I edit it, will it print on Letter, can I use it at work, and it will not open. Every one of them can be answered in the listing before it is ever asked.',
    'A question asked twice is a listing defect, not a customer defect. Fix the listing rather than getting faster at answering.',
    'Answer within 24 hours. Etsy measures it, Star Seller depends on it, and a buyer who waits two days writes a different review to one who waits two hours.',
    'Answer the question that was asked, in the first sentence. Buyers reading on a phone see two lines before they have to tap.',
    'Never argue about a refund on a digital file. The sale is a few pounds, the review is permanent, and the time spent arguing is worth more than the sale.',
    'Refund quickly and ask what went wrong afterwards. The answer to that question is often the most useful product feedback the shop gets all month.',
    '"It will not open" is almost always a phone trying to open a zip. Say in the read-me that a zip needs a computer, and say it before they buy.',
    'A buyer asking whether they can edit it has usually bought the wrong thing. Being explicit that PDFs are print-only and not editable prevents the sale you did not want.',
    'Someone asking for a custom version is telling you about a product you do not have. Log it. Three of those is a listing.',
    'A one-star review with a real problem in it is more valuable than five five-stars, because it is the only free usability testing this shop gets.',
    'You may respond publicly to a review once. Do it calmly and factually, because you are writing to every future buyer who reads it, not to the reviewer.',
    'Never offer anything in exchange for changing a review. It is against policy and it turns one bad review into a suspended shop.',
    'Follow-up messages after a sale are allowed but nearly always unwelcome for a digital download. The buyer got their file; leave them alone.',
    'Keep the read-me short enough to be read. Where the files are, what to print them on, what they may do with them, and how to reach you. Four things.',
  ],

  rules: {
    support: {
      answerWithinHours: 24,
      // The listing has to pre-empt these, because the alternative is answering
      // them one at a time forever.
      questionsToPreempt: [
        'where is my download',
        'is it editable',
        'does it print on us letter',
        'can i use it commercially',
        'the file will not open',
      ],
      // Sentences the read-me must contain in substance for the Inspector to be
      // satisfied the buyer has been told what they need.
      readmeMustCover: ['where the files are', 'what to print on', 'what you may do with it', 'how to get help'],
      refundStance: 'refund quickly on any genuine file problem, then ask what went wrong',
    },
  },
};
