// The Marketer: how a venture with no audience gets its first ten paying
// customers, which is a different problem to growth and needs different moves.
export default {
  id: 'first-customers',
  agent: 'marketer',
  division: 'ventures',
  title: 'The first ten customers',
  summary: 'Why the first ten are found by hand, and what actually works with no audience.',

  lessons: [
    'The first ten customers are recruited one at a time, by hand, in conversations. Nothing that scales works yet, because scaling requires something to scale.',
    'Go back to the exact threads the idea came from. The people who described the problem in their own words are the warmest audience that will ever exist for it.',
    'Message them individually and reference what they actually said. A generic pitch to a hundred people converts worse than ten specific ones.',
    'Do not launch into a community you have not been part of. Answer other people\'s questions for a fortnight before you mention what you built, or you are the person who joined to advertise.',
    'Read each community\'s self-promotion rules before posting. Most have a designated thread or day, and ignoring it gets you banned from the one place your buyers were.',
    'A landing page with no traffic is not a test of the idea, it is a test of nothing. Traffic comes first, then the page tells you something.',
    'The strongest early signal is someone paying, not someone signing up. A waitlist measures politeness; a payment measures need.',
    'If people sign up but will not pay, the problem is real and your solution is not worth money yet. That is useful and should be said plainly rather than explained away.',
    'Charge from the first customer. Free users give different feedback to paying ones, and the transition from free to paid loses most of them anyway.',
    'Price above what feels comfortable. At small volume the difference between £5 and £25 is the difference between a hobby and something worth the evenings.',
    'A demo video of the thing working beats a description of it. Sixty seconds, no music, no intro, start with the problem on screen.',
    'Show Hacker News and Reddit the thing, not the idea. "I built this because I got tired of X" is welcome; "would you use a tool that" is not.',
    'Launch days are one day. Being on the front page of somewhere is a spike, not a business, and the useful part is the twenty conversations it produces.',
    'Write down every objection you hear in the first ten conversations. Three of them will be the same, and that one is the thing to fix before talking to anyone else.',
    'Do not buy ads before you know which words make someone buy. Ads amplify a message that already works and waste money on one that does not.',
    'Nothing gets posted, emailed or paid for without the owner approving it. The Marketer writes the copy and the calendar; the owner presses send.',
  ],

  rules: {
    launch: {
      // Below this, everything is hand-to-hand. Above it, channels start to
      // earn their place.
      handRecruitedTarget: 10,
      // A signup is a maybe. A payment is a fact. Weight them accordingly when
      // deciding whether a venture is working.
      signalWeight: { payment: 10, trial: 3, waitlist: 1 },
      // Communities where a launch post is normal, and the rule each has.
      channelEtiquette: {
        reddit: 'read the self-promotion rule; most subs have a weekly thread',
        'hacker news': 'Show HN, the working thing, no marketing language',
        'indie hackers': 'a build log is welcome; a pitch is not',
        'product hunt': 'one launch day, prepare the assets first',
      },
      // Nothing here happens without the owner.
      requiresOwnerApproval: ['post', 'email send', 'ad spend', 'launch', 'price change'],
    },
  },
};
