// The house rules of the platform the shop lives on. Breaking these does not
// cost a sale, it costs the shop.
export default {
  id: 'etsy-policy',
  division: 'etsy',
  title: 'Etsy policy, and the ways a shop gets closed',
  summary: 'What may not be sold, what must be disclosed, and what suspends an account.',

  lessons: [
    'Suspension is not proportionate to the mistake. One infringing listing can close a shop with two hundred good ones, and appeals are slow and often unanswered.',
    'Everything sold must be made by you, designed by you, or sourced through the handmade and vintage rules. A resold digital file bought from a bundle site is none of those.',
    'Digital downloads must be marked as digital in the listing type, not just described that way in the text. A digital file sold as a physical listing is a policy breach and a guaranteed refund.',
    'Etsy requires that the listing describe what the buyer receives, including the file formats and how many files. Vagueness here is the single largest cause of "item not as described" cases.',
    'Products giving medical, legal or financial advice are a problem however they are worded. A meal planner is fine; a meal plan claiming to treat a condition is not. A budget template is fine; telling someone what to invest in is not.',
    'Never claim a product diagnoses, treats, cures or prevents anything. This applies to ADHD, autism, anxiety and every other condition this shop makes supportive products for. Supportive is legal, therapeutic is not.',
    'Weight-loss products carry extra scrutiny and extra refund risk. A fitness tracker recording what someone did is safe; a plan promising a result is not.',
    'Do not sell exam papers, answer keys, or anything drawn from a copyrighted curriculum or textbook. Education is a huge printables category and a legally noisy one.',
    'Reselling another seller\'s design with the colours changed is infringement, and other sellers do report it. This shop should never be near it, and the Scout should never propose "like X but pink".',
    'Etsy prohibits redirecting buyers off-platform to complete a sale. A link to your own shop inside a listing or a message is a real suspension risk, however innocently meant.',
    'Do not ask for reviews in exchange for anything — a discount, a refund, a free file. Incentivised reviews are against policy and Etsy removes them along with your standing.',
    'You may not use another shop\'s name, or a well-known brand, as a tag or in a title to catch their traffic. "Similar to Erin Condren" in a tag is a trademark complaint waiting to happen.',
    'Etsy takes VAT on digital downloads sold to UK and EU buyers as the deemed supplier, so the platform handles that collection. This does not remove the seller\'s own income tax obligations, which are the owner\'s to handle and not an agent\'s.',
    'Listings must not use "handmade" language for something generated. Honest description of what it is beats a word that pattern-matches to Etsy\'s categories.',
    'Automated tools that scrape Etsy search results or hammer the API breach the terms of use. This shop reads its own data, not other people\'s shops.',
    'If Etsy sends a policy notice, act the same day. The clock on these is short and silence is treated as agreement that the listing is bad.',
    'Keep the shop\'s policies page filled in: what your refund position is on digital files, and how quickly you answer messages. An empty policies page is a Star Seller blocker and a trust problem.',
    'Digital downloads are generally not refundable once downloaded, but saying so rudely produces the case you were trying to avoid. State it once, plainly, and offer to fix genuine file problems.',
  ],

  rules: {
    // Claims that turn a supportive product into a regulated one. Checked in
    // listing copy and on the pages themselves.
    medicalClaims: [
      'treats adhd',
      'cures anxiety',
      'cure anxiety',
      'treats anxiety',
      'diagnose',
      'diagnosis tool',
      'clinically proven',
      'medically proven',
      'doctor recommended',
      'therapist approved',
      'prevents burnout',
      'reverses',
      'heals',
    ],

    // Things this shop does not make, whatever the demand looks like.
    prohibitedProducts: [
      'exam paper',
      'answer key',
      'past paper',
      'test bank',
      'investment advice',
      'legal advice',
      'medical advice',
      'tax advice',
      'prescription',
      'meal plan for weight loss',
    ],

    // Wording that invites a suspension rather than a bad review.
    // Deliberately narrow. A blunt list here rejects the shop's own honest
    // copy — "similar to a bullet journal" is a fair description, while
    // "similar to Erin Condren" is a trademark complaint.
    policyTraps: [
      'inspired by disney',
      'dupe of',
      'knock off',
      'erin condren compatible',
      'compatible with erin condren',
      'leave a review for a discount',
      'review for a refund',
      'contact me outside etsy',
      'buy direct from my website',
      'message me to buy',
    ],
  },
};
