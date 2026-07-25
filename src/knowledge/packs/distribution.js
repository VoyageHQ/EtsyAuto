// Where a one-person product actually finds its first hundred users.
export default {
  id: 'distribution',
  agent: null,
  division: 'ventures',
  title: 'Getting the first hundred users',
  summary: 'Channel mechanics for someone with no audience and no budget.',

  lessons: [
    'You do not have a distribution problem, you have a "nobody knows you exist" problem. The fix is talking to individuals, not broadcasting to crowds.',
    'The first ten users come from conversations. The next ninety come from one channel that works. Do not look for the second until you have the first ten.',
    'Answer the question, then mention the tool. A genuinely useful reply that happens to end with "I built something for this" is welcome everywhere; the reverse is spam everywhere.',
    'Being the person who writes the definitive page on a narrow problem is the most durable free channel there is. One page that actually answers a question outranks ten that were written to rank.',
    'Communities have long memories. Contribute for weeks before you mention anything you made, and the mention will be received well.',
    'A launch on a link-aggregator site is a spike, not a channel. Plan for the day after, when the traffic vanishes and you still need customers.',
    'Cold email to businesses is legal in the UK when it is relevant and offers an easy opt out, but it only works if each message is genuinely specific. Twenty researched emails beat two thousand templated ones.',
    'Directories, newsletters and niche communities that serve your exact buyer are worth more than any general audience. Ten thousand random people are worth less than a hundred right ones.',
    'Partnering with someone who already serves your buyer — a newsletter, a consultant, a community — beats advertising to strangers at this scale.',
    'Referrals only work once someone loves the thing. Do not build a referral scheme before you have anyone to refer it.',
    'Track where each signup came from by asking them. At this size a one-line answer in an email is better data than any analytics setup.',
    'If a channel has not produced a paying customer after four honest attempts, it is not your channel. Stop and try another rather than trying harder.',
  ],

  rules: {
    ladder: [
      'reply to the people in the evidence',
      'ten conversations',
      'one written page answering the problem phrase',
      'the niche newsletter or community that serves them',
      'partnerships',
      'paid search, only once something converts',
    ],
    giveUpAfterAttempts: 4,
    coldEmail: { requireRelevance: true, requireOptOut: true, maxPerDay: 20, neverTemplate: true },
  },
};
