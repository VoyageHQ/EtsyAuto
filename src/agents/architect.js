// THE ARCHITECT — cuts an idea down to something one person can actually
// finish, and writes down what is deliberately not being built.
import Agent from './base.js';
import { getVenture, advanceVenture } from '../ventures/pipeline.js';
import { truncate } from '../core/util.js';

export class Architect extends Agent {
  constructor() {
    super({
      id: 'architect',
      name: 'The Architect',
      title: 'scope and build plan',
      division: 'ventures',
      station: 'drawing-office',
      colour: '#93a8d8',
      handles: ['architect.plan'],
      voice: 'Concrete. Names features, not themes. Always says what is being left out.',
      purpose: `
You turn an approved venture into a plan one person could build in a fortnight
of evenings, and no larger.

How you scope:
- The first version does one job completely. Not three jobs badly.
- Anything that is not needed to take the first payment goes in "not building".
- Prefer boring, free technology the owner can host cheaply and understand.
- No accounts system in version one unless the product genuinely cannot work
  without it. Email plus a payment link gets you further than you think.
- Say what "done" looks like as a number, not a feeling.`,
    });
  }

  async handle(job) {
    const venture = getVenture(job.payload.ventureId);
    if (!venture) return { result: { skipped: 'venture gone' } };
    this.moveTo('drawing-office', `planning ${venture.name}`);

    const plan = await this.thinkOr(() => this.offlinePlan(venture), {
      task: `planning ${venture.name}`,
      json: true,
      maxTokens: 2000,
      prompt: this.prompt(venture),
    });

    const clean = this.normalise(plan, venture);

    this.say(
      `${venture.name} scoped: ${clean.mustHave.length} must-haves, ` +
        `${clean.notBuilding.length} things deliberately left out. ` +
        `Done means: ${clean.successMetric}`,
      { kind: 'planned', level: 'good', meta: { ventureId: venture.id } }
    );

    advanceVenture(venture, { plan: clean });
    this.goHome();
    return { result: clean };
  }

  prompt(venture) {
    return `
Plan the first version of this venture.

Name: ${venture.name}
What it is: ${venture.one_liner}
Who pays: ${venture.audience}
Problem: ${venture.problem}
Money: ${JSON.stringify(venture.monetisation)}
${venture.analysis?.whySwitch ? `Why anyone switches: ${venture.analysis.whySwitch}` : ''}

It must be buildable by one person in about two weeks of evenings, and it must
be able to take a payment at the end of it.

Return JSON:
{
  "mvpGoal": "one sentence: what the first version does",
  "mustHave": ["3 to 5 features, each one a thing a user does"],
  "shouldHave": ["2 to 4 things for version two"],
  "notBuilding": ["3 to 5 things deliberately left out, and why they can wait"],
  "stack": "what to build it with, and why that is the boring choice",
  "milestones": [{"week": 1, "deliver": "what exists at the end of that week"}],
  "successMetric": "a number that tells you to keep going, e.g. 10 paying users",
  "firstCustomerPlan": "exactly where the first paying customer comes from"
}`.trim();
  }

  offlinePlan(venture) {
    const model = venture.monetisation?.model || 'subscription';
    const audience = venture.audience || 'the people with this problem';
    return {
      mvpGoal: `Let ${audience} do the one job in ${venture.name} end to end, and pay for it.`,
      mustHave: [
        'A landing page that states the problem in the buyer\'s own words',
        'The single core action, working properly, with real data',
        'Email capture, so interest is measurable before anything is built',
        model === 'one-off' ? 'A payment link and a download' : 'A payment link and a way to start a trial',
      ],
      shouldHave: [
        'CSV export, because the first question is always "can I get my data out"',
        'A second view of the same data for people who work differently',
      ],
      notBuilding: [
        'User accounts — a magic link or an email is enough to start',
        'A mobile app — the web page works on a phone',
        'Integrations — wait until three people ask for the same one',
        'An admin dashboard — you are the admin, use the database',
      ],
      stack:
        'Plain Node with no dependencies and static HTML. It is free to host, ' +
        'starts instantly, and nothing breaks when a package updates.',
      milestones: [
        { week: 1, deliver: 'Landing page live, waitlist collecting real emails, problem validated by replies' },
        { week: 2, deliver: 'The core action working for one real user, payment link live' },
      ],
      successMetric: '10 paying users, or 50 waitlist signups from people who describe the problem unprompted',
      firstCustomerPlan:
        'Go back to the exact threads the evidence came from, reply helpfully to the person who ' +
        'complained, and offer it to them directly. Not a launch post — a reply.',
      offline: true,
    };
  }

  normalise(raw, venture) {
    const fallback = this.offlinePlan(venture);
    if (!raw || typeof raw !== 'object') return fallback;
    const list = (value, limit, fb) => {
      const cleaned = Array.isArray(value)
        ? value.map((v) => truncate(String(v), 200)).filter(Boolean).slice(0, limit)
        : [];
      return cleaned.length ? cleaned : fb;
    };
    return {
      mvpGoal: truncate(String(raw.mvpGoal || fallback.mvpGoal), 240),
      mustHave: list(raw.mustHave, 6, fallback.mustHave),
      shouldHave: list(raw.shouldHave, 5, fallback.shouldHave),
      notBuilding: list(raw.notBuilding, 6, fallback.notBuilding),
      stack: truncate(String(raw.stack || fallback.stack), 400),
      milestones: Array.isArray(raw.milestones)
        ? raw.milestones.slice(0, 6).map((m, i) => ({
            week: Number(m?.week) || i + 1,
            deliver: truncate(String(m?.deliver || ''), 220),
          }))
        : fallback.milestones,
      successMetric: truncate(String(raw.successMetric || fallback.successMetric), 200),
      firstCustomerPlan: truncate(String(raw.firstCustomerPlan || fallback.firstCustomerPlan), 400),
    };
  }
}

export default Architect;
