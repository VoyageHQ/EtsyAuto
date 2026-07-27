// THE PROSPECTOR — reads what people are actually complaining about in public
// and brings you the one business worth starting. Nothing else.
import Agent from './base.js';
import config from '../core/config.js';
import { harvest, SIGNAL_PHRASES, SOURCES, DEFAULT_SUBREDDITS } from '../ventures/sources.js';
import { synthesise } from '../ventures/synthesise.js';
import {
  saveSignals,
  unusedSignals,
  markUsed,
  createVenture,
  existingVenture,
  listVentures,
  signalCount,
} from '../ventures/pipeline.js';
import { ask, cancelFor, openApprovals } from '../core/approvals.js';
import { closestMatch, tokens, TOO_SIMILAR } from '../core/similarity.js';
import { setSetting } from '../core/db.js';
import { money, truncate } from '../core/util.js';
import { pushState } from '../core/events.js';
import { llm } from '../core/llm.js';

export class Prospector extends Agent {
  constructor() {
    super({
      id: 'prospector',
      name: 'The Prospector',
      title: 'startup idea scout',
      division: 'ventures',
      station: 'lighthouse',
      colour: '#7fd1c4',
      handles: ['prospector.harvest'],
      voice:
        'Evidence first. Quotes the actual complaint and links it. Says "one person said this" when that is all it is.',
      purpose: `
Your only job is to find businesses worth starting, from evidence that real
people have a real problem, and to put the best one in front of the owner.

You do not build anything and you do not decide anything.

What counts as a good find:
- Several different people describing the same unmet need in their own words,
  recently, in public.
- A problem someone would plausibly pay to remove, not merely dislike.
- Something a single person could get a first paying customer for within about
  three months.
- Not a marketplace, not a social network, not anything needing both sides of a
  market before it works. Those need funding and a team.

What you never do:
- Invent evidence. Every claim traces back to a quote you actually harvested.
- Dress up a hobby as a business. If nobody would pay, say so and drop it.
- Recommend anything that needs a licence you do not have: financial advice,
  medical claims, anything handling other people's money directly.`,
    });
  }

  async handle(job) {
    this.moveTo('lighthouse', 'listening');

    // 1. Go and listen.
    const subreddits = config.ventures.subreddits.length
      ? config.ventures.subreddits
      : DEFAULT_SUBREDDITS;
    config.ventures.subreddits = subreddits;

    const { signals, report } = await harvest({
      phrases: SIGNAL_PHRASES,
      perPhrase: Number(job.payload?.perPhrase) || 5,
    });
    const added = saveSignals(signals);
    setSetting('last_harvest', String(Date.now()));

    const working = report.filter((r) => r.status === 'ok');
    const failed = report.filter((r) => r.status === 'failed');
    this.say(
      `Listened to ${working.map((r) => r.source).join(', ') || 'nothing'} — ` +
        `${added} new signal(s) from ${signals.length} matches.` +
        (failed.length ? ` ${failed.map((f) => f.why).join(' ')}` : ''),
      { kind: 'harvest', level: added ? 'good' : 'info' }
    );

    if (!signalCount()) {
      this.say(
        'No sources reachable and nothing stored, so there is nothing honest for me to propose. ' +
          'Check VENTURE_SOURCES in .env, or add a feed.',
        { level: 'warn', kind: 'harvest' }
      );
      this.goHome();
      return { result: { added: 0, blocked: true } };
    }

    // 2. Turn the pile into candidate businesses.
    const pool = unusedSignals(140);
    const wanted = Number(job.payload?.count) || 5;
    const candidates = await this.thinkOr(() => synthesise(pool, wanted), {
      task: 'shaping ideas',
      json: true,
      maxTokens: 3500,
      prompt: this.shapePrompt(pool, wanted),
    });

    const shaped = this.normalise(candidates, pool);
    if (!shaped.length) {
      // Say which of the two things went wrong, because they need opposite
      // responses. Nothing harvested means look somewhere else; plenty
      // harvested and nothing shaped means the evidence is fine and the
      // shaping is not.
      //
      // Offline, the shaping is pattern matching over other people's
      // sentences, and it cannot turn "list all current windows 10 hotkeys?"
      // into a business — it can only turn it into something that *looks*
      // like one. Six of those on the shortlist is worse than an empty
      // shortlist, because the owner spends an evening reading them before
      // working out that none is real.
      const raw = pool.length;
      this.say(
        llm.enabled || !raw
          ? 'Nothing in this batch is worth your time. I will keep listening.'
          : `I heard ${raw} real complaints this round and could not turn any of them into a business ` +
            'worth showing you. That is my limit, not the evidence: offline I am matching patterns ' +
            'against other people\'s sentences, and the results read like businesses without being ' +
            'any. Set LLM_PROVIDER in .env and I will shape these properly — the evidence is already ' +
            'on file and nothing is wasted.',
        { kind: 'ideas', level: raw ? 'warn' : 'info' }
      );
      this.goHome();
      return { result: { added, proposed: 0, unshaped: raw } };
    }

    // createVenture hands back the existing business when it recognises one,
    // so count what genuinely landed rather than how many were shaped —
    // otherwise "5 new ideas" is a report about work that did not happen.
    const fresh = [];
    for (const idea of shaped) {
      const before = existingVenture(idea.name);
      createVenture(idea);
      markUsed(idea.signalIds || []);
      if (!before) fresh.push(idea);
    }

    if (!fresh.length) {
      this.say(
        `Everything this batch produced is already on the books — ${shaped.length} idea(s), ` +
          'all of them businesses you have already been shown. Nothing new to look at.',
        { kind: 'ideas', level: 'note' }
      );
      this.goHome();
      pushState('ventures');
      return { result: { added, proposed: 0, repeats: shaped.length } };
    }

    // 3. "Tell me the best one." Not a list to wade through — a recommendation.
    const best = fresh[0];
    this.say(
      `My pick: **${best.name}** — ${best.oneLiner} ` +
        `For ${best.audience}. ${money(best.monetisation.price, config.currency)} ` +
        `${best.monetisation.model}, first money in about ${best.monetisation.daysToRevenue} days. ` +
        `Evidence: ${best.evidence.length} real post(s).`,
      { kind: 'pick', level: 'good', meta: { name: best.name } }
    );

    this.askToChoose(best, fresh);
    this.goHome();
    pushState('ventures');
    return { result: { added, proposed: fresh.length, best: best.name } };
  }

  askToChoose(best, shaped) {
    cancelFor('venture-shortlist', 'superseded by a fresh shortlist');
    const runners = shaped.slice(1, 4);
    ask({
      kind: 'venture',
      refId: 'venture-shortlist',
      agent: this.id,
      station: 'lighthouse',
      title: `Best startup idea I can evidence: ${best.name} — ${truncate(best.oneLiner, 90)}`,
      detail: [
        `**${best.name}**`,
        best.oneLiner,
        '',
        `**Who has the problem** ${best.audience}`,
        `**The problem, in their words** "${truncate(best.evidence[0]?.quote || best.problem, 220)}"`,
        best.evidence[0]?.url ? `_${best.evidence[0].source} · ${best.evidence[0].url}_` : '',
        '',
        `**How it makes money** ${best.monetisation.model}, ` +
          `${money(best.monetisation.price, config.currency)} — ${best.monetisation.firstPoundPath}`,
        `**First money in** roughly ${best.monetisation.daysToRevenue} days`,
        `**Effort** ${best.effort}/5 · **Evidence** ${best.evidence.length} post(s)`,
        '',
        runners.length
          ? `Runners up: ${runners.map((r) => `${r.name} (${r.score})`).join(', ')}. ` +
            'Open the Lighthouse to see the full shortlist and pick a different one.'
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      options: [
        { value: 'build', label: `Build ${truncate(best.name, 40)}` },
        { value: 'shortlist', label: 'Show me the shortlist' },
        { value: 'again', label: 'None of these, look again' },
      ],
    });
  }

  shapePrompt(signals, wanted) {
    const evidence = signals
      .slice(0, 60)
      .map(
        (s, i) =>
          `[${i}] (${s.source}${s.channel ? `, ${s.channel}` : ''}, matched "${s.phrase}") ${truncate(
            `${s.title}: ${s.text}`,
            320
          )}`
      )
      .join('\n');

    return `
Here are real things people posted in public in the last few weeks. Each one
matched a phrase people use when they have an unmet need.

${evidence}

Propose ${wanted} businesses a single person could start, each one grounded in
these posts. Reference the posts by their [number] as evidence — do not invent
any.

Reject anything that: needs a two-sided marketplace, needs venture funding,
needs a licence (financial advice, medical, legal), or has no way of taking
money within ${config.ventures.maxDaysToRevenue} days.

Return a JSON array, best first. Each element:
{
  "name": "short product name",
  "oneLiner": "what it is, in one sentence",
  "problem": "the problem in the complainers' own words",
  "audience": "exactly who pays",
  "solution": "what you would build, concretely, for a first version",
  "monetisation": {
    "model": "subscription | one-off | usage | listings and affiliate",
    "price": number in ${config.currency},
    "tiers": [{"name": "", "price": number, "per": "month|one-off", "includes": ""}],
    "firstPoundPath": "how the very first payment happens",
    "daysToRevenue": number
  },
  "evidenceIndexes": [0, 3],
  "effort": 1-5,
  "confidence": 1-5
}`.trim();
  }

  /** Clean up whatever came back and attach the real evidence rows. */
  normalise(raw, pool) {
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.ideas) ? raw.ideas : [];
    const known = [
      ...listVentures().map((v) => ({ title: v.name, bag: tokens(`${v.name} ${v.one_liner}`) })),
    ];
    const out = [];

    for (const item of list) {
      const name = truncate(String(item?.name || '').trim(), 60);
      if (!name) continue;

      const near = closestMatch(`${name} ${item.oneLiner || ''}`, known);
      if (near.match && near.score >= TOO_SIMILAR) continue;

      // Evidence is not optional. Anything the model made up gets dropped.
      let evidence = Array.isArray(item.evidence) ? item.evidence : [];
      if (Array.isArray(item.evidenceIndexes)) {
        evidence = item.evidenceIndexes
          .map((i) => pool[Number(i)])
          .filter(Boolean)
          .map((s) => ({
            signalId: s.id,
            source: s.source,
            channel: s.channel,
            url: s.url,
            phrase: s.phrase,
            quote: truncate(s.text || s.title, 240),
          }));
      }
      if (!evidence.length) continue;

      const monetisation = this.cleanMonetisation(item.monetisation);
      if (!monetisation) continue;

      const effort = clampInt(item.effort, 1, 5, 3);
      const confidence = clampInt(item.confidence, 1, 5, Math.min(5, evidence.length));
      const score =
        Math.round(
          (Math.min(5, evidence.length) * 1.6 +
            confidence -
            effort * 0.5 +
            (monetisation.daysToRevenue <= 30 ? 2 : 1)) *
            10
        ) / 10;

      known.push({ title: name, bag: tokens(`${name} ${item.oneLiner || ''}`) });
      out.push({
        name,
        oneLiner: truncate(String(item.oneLiner || ''), 200),
        problem: truncate(String(item.problem || ''), 600),
        audience: truncate(String(item.audience || 'unclear'), 160),
        solution: truncate(String(item.solution || item.oneLiner || ''), 900),
        monetisation,
        evidence,
        effort,
        confidence,
        score: Math.max(0, score),
        signalIds: evidence.map((e) => e.signalId).filter(Boolean),
      });
    }

    return out.sort((a, b) => b.score - a.score);
  }

  cleanMonetisation(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const price = Number(raw.price);
    if (!(price > 0)) return null;
    const days = Number(raw.daysToRevenue);
    return {
      model: String(raw.model || 'subscription').slice(0, 40),
      price,
      tiers: Array.isArray(raw.tiers)
        ? raw.tiers.slice(0, 4).map((t) => ({
            name: String(t?.name || 'Standard').slice(0, 30),
            price: Number(t?.price) > 0 ? Number(t.price) : price,
            per: String(t?.per || 'month').slice(0, 12),
            includes: truncate(String(t?.includes || ''), 120),
          }))
        : [{ name: 'Standard', price, per: 'month', includes: 'full access' }],
      firstPoundPath: truncate(String(raw.firstPoundPath || 'Charge from launch.'), 240),
      daysToRevenue: Number.isFinite(days) && days > 0 ? Math.round(days) : 60,
    };
  }

  /** Which sources are switched on, for the dashboard. */
  static sourceStatus() {
    return SOURCES.map((s) => ({ id: s.id, name: s.name, note: s.note, enabled: s.enabled() }));
  }
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export default Prospector;
