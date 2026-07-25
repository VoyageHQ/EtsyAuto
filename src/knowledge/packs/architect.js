// The Architect: cutting an idea down to something that gets finished.
export default {
  id: 'architect',
  agent: 'architect',
  division: 'ventures',
  title: 'Scoping an MVP that ships',
  summary: 'The riskiest assumption, what to leave out, and build order.',

  lessons: [
    'Scope to the riskiest assumption, not to the fullest product. The first version exists to find out whether anyone will pay, and everything that does not test that is decoration.',
    'The first version does one job completely for one person. Two jobs done adequately is the most common way an evening project dies.',
    'Write down what you are deliberately not building, and why it can wait. That list is the plan; the feature list is just the consequence.',
    'If a feature is not needed to take the first payment, it is not in version one. That includes settings, themes, dashboards and anything called "management".',
    'Skip user accounts until the product genuinely cannot work without them. An email address and a payment link get you much further than a login screen, and accounts bring password resets, sessions and a support burden.',
    'Skip integrations until three separate people have asked for the same one. Every integration is a permanent maintenance commitment to someone else\'s API.',
    'Skip the admin dashboard. You are the admin; read the database.',
    'Prefer boring technology you can debug at eleven at night. Plain server-rendered pages, files on disk, no build step. Fashionable stacks are how side projects stall on tooling instead of shipping.',
    'Two weeks of evenings is roughly twenty to thirty hours. Scope to that and cut until it fits, rather than planning something that needs a sabbatical.',
    'Order the build so something is usable at the end of every week. Week one should end with a real page a real person can visit.',
    'Define done as a number, not a feeling: ten paying users, fifty signups who describe the problem unprompted, one customer who renews. Without a number you cannot tell success from stubbornness.',
    'Say where the first customer comes from before the build starts. If the answer is "we will do marketing", the plan is not finished.',
    'Design the data so it can be exported from day one. The first question any business buyer asks is whether they can get their data out.',
    'Do not design for scale you do not have. A single file, a single process and a single machine is the correct architecture for zero customers.',
  ],

  rules: {
    scope: { maxWeeks: 2, hoursPerWeek: 12, maxMustHave: 5, requireNotBuilding: true },
    defaultOmissions: [
      'user accounts',
      'admin dashboard',
      'integrations',
      'mobile app',
      'themes and settings',
      'analytics beyond a counter',
      'multi-language',
    ],
    stack: { prefer: ['plain node', 'static html', 'files on disk', 'sqlite'], avoid: ['build steps', 'kubernetes', 'microservices'] },
  },
};
