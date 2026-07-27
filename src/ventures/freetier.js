// What a person with no money can actually run.
//
// "Costs nothing to start" is the constraint the whole harbour is built
// around, and it is easy to say and easy to break. A plan that needs a $20
// database, a $12 domain and a Mac to build on is not a plan for somebody
// starting from nothing — it is a plan with an invoice attached, and the
// invoice arrives after the work.
//
// So this file holds two things: what is genuinely free, and a gate the
// Architect has to get a venture through before anyone builds it. The gate
// names the cost when it refuses, because "no" without a number is not
// useful.
//
// Everything listed here was chosen against the same three tests:
//
//   1. No card at signup. A free tier that asks for a card is a trial.
//   2. Enough headroom to reach the first hundred customers. A limit you hit
//      on day two is a demo, not a foundation.
//   3. An exit. Anything that cannot be moved elsewhere later is a trap,
//      however generous it looks now.
//
// Limits move. These are recorded with the date they were checked so nobody
// treats them as current forever — the Architect quotes them as "as of", and
// the plan tells the owner to confirm before relying on a number.

export const CHECKED = '2026-07';

/**
 * The stack. One choice per job, plus what it costs when you outgrow it,
 * because the moment a venture starts working is the wrong moment to discover
 * the next tier is £200.
 */
export const FREE_STACK = {
  hosting: {
    name: 'Cloudflare Pages',
    free: 'Unlimited static requests, 500 builds a month, free subdomain, TLS included.',
    card: false,
    ceiling: 'Static traffic is genuinely unmetered. Builds are the only limit worth watching.',
    next: '$20/mo for more builds and analytics, long after it matters.',
    alternative: 'GitHub Pages if you would rather not open another account — same cost, no server side.',
  },
  api: {
    name: 'Cloudflare Workers',
    free: '100,000 requests a day, 10ms CPU each.',
    card: false,
    ceiling: '100k/day is roughly 3m a month. A business is working long before it needs more.',
    next: '$5/mo for 10m requests.',
    alternative: 'None needed. A static site with no API is a valid first version.',
  },
  storage: {
    name: 'Cloudflare KV',
    free: '100,000 reads and 1,000 writes a day, 1GB.',
    card: false,
    ceiling: '1,000 writes a day is 1,000 signups a day. That is a good problem.',
    next: 'D1 (SQL) on the same free tier when the shape outgrows key/value.',
    alternative: 'A form service, or email, for anything under a hundred a week.',
  },
  email: {
    name: 'Resend',
    free: '3,000 emails a month, 100 a day.',
    card: false,
    ceiling: 'Fine for transactional mail. Not a newsletter tool.',
    next: '$20/mo for 50,000.',
    alternative: 'Your own inbox and a mailto: link. Crude, free, and works from minute one.',
  },
  payments: {
    name: 'Stripe Payment Links',
    free: 'No monthly fee, no setup fee, no card to open the account.',
    card: false,
    ceiling: "They take a cut per transaction — you pay only when you're paid.",
    next: 'Stripe Checkout on your own domain, same price.',
    alternative:
      'None. Taking money is the one thing worth doing properly from the start, and this is ' +
      'the cheapest way there is: a hosted page, no server, no PCI scope.',
  },
  code: {
    name: 'GitHub',
    free: 'Unlimited private repositories, Actions minutes for public ones.',
    card: false,
    ceiling: 'Nothing you will hit.',
    next: 'Free indefinitely for this.',
    alternative: 'Local git. The repository is only needed for deploys.',
  },
  domain: {
    name: 'The free subdomain',
    free: 'yourproject.pages.dev, included, with TLS.',
    card: false,
    ceiling: 'It looks like what it is. That matters less than you think before revenue.',
    next: 'About £10 a year for a real domain, once somebody has paid you.',
    alternative: 'Buy the domain on day one if you like. It is the only thing here worth paying for early.',
  },
};

/**
 * Things that read as free and are not, or that cost more than money.
 *
 * Each one is here because it is a plausible choice somebody would make on a
 * Tuesday evening and regret in a fortnight.
 */
export const FALSE_ECONOMIES = [
  {
    match: /\b(aws|amazon web services|ec2|rds|azure|google cloud|gcp)\b/i,
    why: 'The free tier expires after twelve months and bills silently after that. People find out from a statement.',
  },
  {
    match: /\b(heroku|render|railway|fly\.io|digitalocean)\b/i,
    why: 'Either no free tier any more, or one that sleeps and needs a card on file.',
  },
  {
    match: /\b(mongodb atlas|planetscale|firebase)\b/i,
    why: 'Free tiers that shrink. Fine to move to later, wrong to start on.',
  },
  {
    match: /\b(openai|anthropic|gpt-4|claude api|gemini api|llm api)\b/i,
    why: 'Per-token cost from the first request, and the bill scales with success rather than with revenue.',
  },
  {
    match: /\b(twilio|sendgrid|mailchimp|hubspot|salesforce)\b/i,
    why: 'Free tiers with a card requirement or a hard cliff at exactly the point it starts working.',
  },
  {
    match: /\b(app store|google play|ios app|android app)\b/i,
    why: 'A developer account costs money before a single user, and review can take weeks. The web is free and instant.',
  },
  {
    match: /\b(incorporat|limited company|ltd|llc|trademark|patent)\b/i,
    why: 'Real fees, and none of it is needed before the first customer. Sole trader and an invoice is enough to start.',
  },
];

/**
 * Is this venture something a person with no money can actually start?
 *
 * @param {object} venture
 * @returns {{ok: boolean, reasons: string[], stack: object}}
 */
export function affordability(venture) {
  const text = [
    venture.name,
    venture.one_liner || venture.oneLiner,
    venture.solution,
    JSON.stringify(venture.plan || {}),
    JSON.stringify(venture.analysis || {}),
  ]
    .filter(Boolean)
    .join(' ');

  const reasons = [];
  for (const trap of FALSE_ECONOMIES) {
    const hit = text.match(trap.match);
    if (hit) reasons.push(`Names ${hit[0]}: ${trap.why}`);
  }

  return { ok: reasons.length === 0, reasons, stack: FREE_STACK };
}

/** The stack as a line the Architect can put in a plan. */
export const stackLine = () =>
  `${FREE_STACK.hosting.name} + ${FREE_STACK.api.name} + ${FREE_STACK.storage.name}, ` +
  `${FREE_STACK.payments.name} for money, ${FREE_STACK.domain.name} to start. ` +
  `Nothing here asks for a card (checked ${CHECKED}).`;

/**
 * What the agents are told, so a plan is written against what exists rather
 * than against what a model half-remembers about hosting.
 */
export function freeTierBlock() {
  const lines = Object.entries(FREE_STACK).map(
    ([job, s]) => `- ${job}: ${s.name} — ${s.free} No card. Beyond it: ${s.next}`
  );
  return [
    `The whole thing has to run on free tiers, with no card on file (checked ${CHECKED}):`,
    ...lines,
    '',
    'Never plan around: ' + FALSE_ECONOMIES.map((t) => t.why.split('.')[0].toLowerCase()).slice(0, 3).join('; ') + '.',
    'If the idea cannot work inside that, it is the wrong idea for somebody starting from nothing.',
  ].join('\n');
}

export default { FREE_STACK, FALSE_ECONOMIES, affordability, stackLine, freeTierBlock };
