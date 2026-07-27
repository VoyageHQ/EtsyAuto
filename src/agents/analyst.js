// THE ANALYST — decides whether an idea can actually make money, and kills it
// if it cannot. The most valuable thing in the harbour is a fast no.
import Agent from './base.js';
import config from '../core/config.js';
import { getVenture, advanceVenture, setVentureStage } from '../ventures/pipeline.js';
import { ask } from '../core/approvals.js';
import { money, truncate } from '../core/util.js';
import { ventureKillReasons, evidenceStrength } from '../knowledge/apply.js';

export class Analyst extends Agent {
  constructor() {
    super({
      id: 'analyst',
      name: 'The Analyst',
      title: 'money and market check',
      division: 'ventures',
      station: 'counting-house',
      colour: '#d8b26a',
      handles: ['analyst.validate'],
      voice: 'Direct. Leads with the verdict, then the reasoning. Never pads a no.',
      purpose: `
You decide whether a proposed venture can take real money from real people
soon, and you say no clearly when it cannot.

You check, in this order:
1. Would anyone pay? Not "is it useful" — would money change hands.
2. Who already does this, and why would anyone switch?
3. What does the first payment actually look like, and how many days away is it?
4. What could make this illegal, unlicensed or unwise for one person to run?

Rules:
- Never invent market sizes, revenue figures or competitor numbers. If you do
  not know, say what you would need to look up.
- An idea with no plausible payment within ${config.ventures.maxDaysToRevenue} days is a hobby. Kill it.
- Anything needing a licence — financial advice, medical claims, legal advice,
  holding client money — gets killed regardless of how good it looks.
- Being harsh early is cheaper than being harsh after it is built.`,
    });
  }

  async handle(job) {
    const venture = getVenture(job.payload.ventureId);
    if (!venture) return { result: { skipped: 'venture gone' } };
    this.moveTo('counting-house', `checking ${venture.name}`);

    const analysis = await this.thinkOr(() => this.offlineAnalysis(venture), {
      task: `analysing ${venture.name}`,
      json: true,
      maxTokens: 1600,
      prompt: this.prompt(venture),
    });

    const clean = this.normalise(analysis, venture);

    // Rules the packs say are non-negotiable, checked in code so they hold
    // whether or not a model looked at this.
    const hardStops = ventureKillReasons(venture, config.ventures.maxDaysToRevenue);
    if (hardStops.length) {
      clean.verdict = 'kill';
      clean.why = hardStops.join(' ');
      clean.risks = [...hardStops, ...(clean.risks || [])].slice(0, 6);
    }

    if (clean.verdict === 'kill') {
      this.say(`${venture.name}: killed. ${clean.why}`, {
        kind: 'killed',
        level: 'warn',
        meta: { ventureId: venture.id },
      });
      setVentureStage(venture.id, 'analysis', { status: 'killed', analysis: clean });
      ask({
        kind: 'question',
        refId: venture.id,
        agent: this.id,
        station: 'counting-house',
        title: `I would drop ${venture.name} — ${truncate(clean.why, 90)}`,
        detail: [
          `**${venture.name}**`,
          venture.one_liner,
          '',
          `**Why I would drop it** ${clean.why}`,
          clean.risks?.length ? `**Risks** ${clean.risks.join('; ')}` : '',
          '',
          'Overrule me if you know something I do not — you probably do.',
        ]
          .filter(Boolean)
          .join('\n'),
        options: [
          { value: 'drop', label: 'Agreed, drop it' },
          { value: 'continue', label: 'Carry on anyway' },
        ],
      });
      this.goHome();
      return { result: clean };
    }

    this.say(
      `${venture.name}: ${clean.verdict}. ${clean.why} ` +
        `Money: ${clean.monetisation.model} at ${money(clean.monetisation.price, config.currency)}, ` +
        `first payment in roughly ${clean.monetisation.daysToRevenue} days.`,
      { kind: 'analysis', level: 'good', meta: { ventureId: venture.id } }
    );

    advanceVenture(venture, { analysis: clean, monetisation: clean.monetisation, status: 'approved' });
    this.goHome();
    return { result: clean };
  }

  prompt(venture) {
    const evidence = (venture.evidence || [])
      .map((e) => `- (${e.source}) "${truncate(e.quote, 200)}"`)
      .join('\n');
    return `
Assess this venture honestly.

Name: ${venture.name}
What it is: ${venture.one_liner}
Who pays: ${venture.audience}
The problem: ${venture.problem}
Proposed solution: ${venture.solution}
Proposed money: ${JSON.stringify(venture.monetisation)}

Evidence it is a real problem:
${evidence || '- none, which is itself a finding'}

Return JSON:
{
  "wouldPay": "who specifically would pay, and roughly what for",
  "competitors": ["who already solves this, and how they charge"],
  "whySwitch": "the one reason someone leaves what they use now",
  "monetisation": { "model": "", "price": number, "tiers": [{"name":"","price":0,"per":"month","includes":""}],
                    "firstPoundPath": "", "daysToRevenue": number },
  "risks": ["what could go wrong"],
  "legal": ["licences, data protection or regulation that applies, or empty"],
  "verdict": "build | tweak | kill",
  "why": "one sentence, and be willing to say kill"
}`.trim();
  }

  offlineAnalysis(venture) {
    const m = venture.monetisation || {};
    const days = Number(m.daysToRevenue) || 90;
    const evidence = (venture.evidence || []).length;
    const tooSlow = days > config.ventures.maxDaysToRevenue;

    // How many people arrived at this problem, not just how many wrote about
    // it. A Stack Exchange question with tens of thousands of views and no
    // answer is a search with nothing at the end of it, which is the clearest
    // gap this whole arm can find — and counting it as one post threw it away.
    const reach = (venture.evidence || []).reduce(
      (acc, e) => ({
        views: Math.max(acc.views, Number(e.views) || 0),
        unanswered: acc.unanswered || Boolean(e.unanswered),
      }),
      { views: 0, unanswered: false }
    );
    const strength = evidenceStrength(evidence, reach);
    const thin = strength.level === 'anecdote';

    return {
      wouldPay: `${venture.audience} — the ones already spending time on this weekly.`,
      competitors: [
        'A spreadsheet, which is free and already open.',
        'The incumbent tool people complained about, which is why they were complaining.',
      ],
      whySwitch: 'It does the one job properly rather than being a module of something bigger.',
      monetisation: m,
      risks: [
        thin ? 'Only one person has actually described this problem. That is not a market yet.' : null,
        strength.level === 'thin' ? strength.note : null,
        'Nobody has been asked to pay yet, which is the only test that counts.',
      ].filter(Boolean),
      legal: [],
      verdict: tooSlow ? 'kill' : thin ? 'tweak' : 'build',
      why: tooSlow
        ? `No plausible payment for ${days} days, which is beyond the ${config.ventures.maxDaysToRevenue} day limit.`
        : thin
          ? 'Worth building, but only after finding two more people with the same complaint.'
          : 'Several people described the same problem and there is a clear way to charge for it.',
      offline: true,
    };
  }

  normalise(raw, venture) {
    const fallback = this.offlineAnalysis(venture);
    if (!raw || typeof raw !== 'object') return fallback;
    const list = (value, limit) =>
      Array.isArray(value) ? value.map((v) => truncate(String(v), 220)).filter(Boolean).slice(0, limit) : [];

    const monetisation = raw.monetisation && Number(raw.monetisation.price) > 0
      ? {
          model: String(raw.monetisation.model || 'subscription').slice(0, 40),
          price: Number(raw.monetisation.price),
          tiers: Array.isArray(raw.monetisation.tiers) ? raw.monetisation.tiers.slice(0, 4) : venture.monetisation?.tiers || [],
          firstPoundPath: truncate(String(raw.monetisation.firstPoundPath || ''), 240),
          daysToRevenue: Number(raw.monetisation.daysToRevenue) || 60,
        }
      : venture.monetisation || fallback.monetisation;

    const legal = list(raw.legal, 4);
    // A licence problem is a kill regardless of what the model concluded.
    const licenceTrouble = legal.some((l) => /licen[cs]e|regulat|fca|authoris|medical|legal advice/i.test(l));

    let verdict = ['build', 'tweak', 'kill'].includes(raw.verdict) ? raw.verdict : 'tweak';
    if (licenceTrouble) verdict = 'kill';
    if (monetisation.daysToRevenue > config.ventures.maxDaysToRevenue) verdict = 'kill';

    return {
      wouldPay: truncate(String(raw.wouldPay || fallback.wouldPay), 300),
      competitors: list(raw.competitors, 5).length ? list(raw.competitors, 5) : fallback.competitors,
      whySwitch: truncate(String(raw.whySwitch || fallback.whySwitch), 240),
      monetisation,
      risks: list(raw.risks, 5),
      legal,
      verdict,
      why: truncate(
        String(
          licenceTrouble
            ? `Needs a licence one person cannot casually hold: ${legal.join('; ')}`
            : raw.why || fallback.why
        ),
        300
      ),
    };
  }
}

export default Analyst;
