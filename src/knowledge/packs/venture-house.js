// What everyone in the venture arm needs to know.
export default {
  id: 'venture-house',
  agent: null,
  division: 'ventures',
  title: 'House knowledge — the venture arm',
  summary: 'One-person economics, the law around collecting emails, and the lines nobody crosses.',

  lessons: [
    // --- what kind of business this is ---------------------------------------
    'This is a one-person business with evenings and a few pounds a month, not a startup. The target is a small thing that takes real money from real people, not something that needs a funding round to make sense.',
    'Anything that needs both sides of a market before it works is out. A marketplace with no buyers and no sellers is not an MVP, it is two businesses you cannot start.',
    'Anything that only works at scale is out. If the model needs ten thousand users before the numbers work, one person with evenings will never reach it.',
    'Prefer a boring business with a clear payer over an exciting one with an unclear payer. "Accountants pay £15 a month" beats "everyone could use this".',
    'The best first customer is someone who already told you, in public, that they have the problem. That is why the evidence matters more than the idea.',

    // --- the law, which is not optional ----------------------------------------
    'Every email address collected is personal data. Under UK and EU rules you must say who you are and what you will use it for at the point of collection, only send what they signed up for, and give a working way to unsubscribe in every message.',
    'Never buy, scrape or borrow an email list. It is illegal to mail them in the UK and EU without consent, and it is the fastest way to have your sending domain blocked.',
    'The waitlist file is real people. It never goes in git, never gets shared, and never gets used for anything other than what the signup form said.',
    'If the product will ever handle other people\'s personal data, say so early. It changes what you must build — deletion, export, a privacy notice — and it is much cheaper to know that on day one.',
    'Never build anything that gives financial, medical or legal advice, or that holds other people\'s money. Those need licences one person cannot casually hold.',
    'A sole trader in the UK must register with HMRC once trading income passes the current threshold. Look up the current rules rather than trusting a number written here, and keep every receipt from the start.',

    // --- honesty ----------------------------------------------------------------
    'Never invent users, revenue, testimonials, waiting list numbers or press mentions. Not on the landing page, not in an ad, not "as a placeholder".',
    'Never imply a feature exists before it does. A landing page may describe what you are building if it says so; it may not describe it as if it is finished.',
    'When something is a guess, label it as a guess and say what you would need to check. A labelled guess is useful; an unlabelled one is a decision made on nothing.',
    'Nothing is posted, published, launched or paid for without the owner approving it. No agent here has a payment method or a posting credential, and none should ever ask for one.',
  ],

  rules: {
    outOfScope: [
      'two-sided marketplace',
      'social network',
      'financial advice',
      'medical claims',
      'legal advice',
      'holding client money',
      'crypto trading',
      'anything requiring a licence',
    ],
    dataProtection: {
      lawfulBasis: 'consent, collected at the form with a clear purpose',
      mustHave: ['unsubscribe link', 'who you are', 'what you will send', 'a way to be deleted'],
      neverDo: ['buy a list', 'scrape addresses', 'reuse for another purpose', 'commit the data to git'],
    },
  },
};
