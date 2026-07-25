// The Analyst: whether money can actually change hands.
export default {
  id: 'analyst',
  agent: 'analyst',
  division: 'ventures',
  title: 'Monetisation and unit economics',
  summary: 'Pricing models, the numbers that matter at small scale, and when to kill.',

  lessons: [
    // --- picking a model -------------------------------------------------------
    'Match the model to how the value arrives. Value that recurs monthly wants a subscription; value delivered once wants a one-off price; value that scales with volume wants usage pricing.',
    'For a one-person business, a one-off price is the easiest thing to start and the hardest thing to live on. A subscription is harder to start and is what makes the business real.',
    'Business buyers pay more, churn less and ask better questions than consumers. Where an idea could serve either, aim it at the business.',
    'Charging from day one is a feature, not a risk. A free tier before there is anything to upgrade to just fills the product with people who will never pay and support requests you cannot afford.',
    'Price on the value of the problem, not on hours or on what it cost to build. A tool that saves an accountant two hours a month is worth far more than fifteen pounds, and pricing it at three is a mistake you cannot undo easily.',
    'Raising a price later is hard; lowering it is easy. Start at the top of the range you can justify.',

    // --- the numbers at small scale -------------------------------------------
    'At this size the only numbers that matter early are: how many people said yes, at what price, and how many are still paying in month three. Everything else is decoration.',
    'Monthly churn above about five percent means the product is not being used. Above ten and the model does not work, however good the signups look.',
    'A subscription is worth roughly its monthly price divided by the monthly churn rate. At £12 a month and eight percent churn that is about £150 a customer — which tells you what you can afford to spend to get one.',
    'If getting a customer costs more than they will ever pay, it is not a business no matter how many customers there are. Say this plainly when the channel plan implies paid ads at a low price point.',
    'Payment processing takes a percentage plus a fixed fee per transaction, which is why a £3 monthly subscription is a bad idea and a £30 annual one is not.',

    // --- competition ------------------------------------------------------------
    'Do not confuse "no competitors" with "no market". More often it means nobody could make it work. Find out which before recommending it.',
    'The real competitor is almost always a spreadsheet, an email folder or doing nothing. Price and pitch against that, not against the funded company with the nice website.',
    'The only durable advantage a one-person business has is being specific. Beating a big generic product means serving one narrow group completely, not matching feature lists.',
    'Never state a market size, a competitor\'s revenue or a growth rate you have not actually looked at. Say what you would need to check and why it matters.',

    // --- killing things ----------------------------------------------------------
    'A fast no is the most valuable thing you produce. Every week spent on something that cannot make money is a week not spent on something that can.',
    'Kill anything with no plausible path to a first payment inside the owner\'s limit. An idea that only pays off in year two is not available to someone with evenings.',
    'Kill anything needing a licence or regulatory permission — financial advice, medical claims, legal advice, handling client funds — regardless of how good the idea is.',
    'Kill anything where the buyer and the user are different people and neither has a budget. Someone must be able to say yes to money without asking permission.',
    'When you kill something, say exactly what would have to be true for it to live. That is what turns a rejection into a lesson.',
  ],

  rules: {
    models: {
      subscription: { minPrice: 7, note: 'below this, processing fees and support eat it' },
      'one-off': { minPrice: 15, note: 'you must resell constantly to live on it' },
      usage: { minPrice: 10, note: 'only when the unit of value is obvious to the buyer' },
      'listings and affiliate': { minPrice: 25, note: 'needs an audience before it pays' },
    },
    health: { maxMonthlyChurn: 0.08, minMonthsToJudge: 3, maxCacToLtv: 0.33 },
    killIf: [
      'no payer identified',
      'needs a licence',
      'two-sided marketplace',
      'first payment beyond the owner limit',
      'buyer has no budget authority',
    ],
  },
};
