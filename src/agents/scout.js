// THE SCOUT — the idea agent. Its only job is to bring you product ideas and
// wait for you to say which ones to build. It never designs anything.
import Agent from './base.js';
import { SEEDS, TWISTS, CATEGORIES } from './ideas-corpus.js';
import { all, insert, count } from '../core/db.js';
import { slug, uid, now, pick, shuffle, truncate, titleCase } from '../core/util.js';
import { ask, cancelFor, openApprovals } from '../core/approvals.js';
import { catalogue, closestMatch, tokens, TOO_SIMILAR } from '../core/similarity.js';
import { matchesAvoidPattern, findTrademarks, tidyPrice, bandFor } from '../knowledge/apply.js';
import config from '../core/config.js';
import { pushState } from '../core/events.js';
import { marketBlock, openings } from '../etsy/market.js';
import { llm } from '../core/llm.js';

export class Scout extends Agent {
  constructor() {
    super({
      id: 'scout',
      name: 'The Scout',
      title: 'head of new product ideas',
      station: 'research-bench',
      colour: '#e0b877',
      handles: ['scout.brainstorm'],
      voice:
        'Short and concrete. One line per idea: who it is for and why they would buy it. No hype words, no "unlock", no "elevate".',
      purpose: `
Your only job is to invent digital product ideas the shop could sell, and to
put them in front of the owner as a ranked list. You never design files and
you never write listings — other villagers do that.

What a good idea looks like:
- It names a specific person with a specific problem, not "everyone".
- It is something a person would search Etsy for in those words.
- It can be delivered as a printable PDF, a spreadsheet or a digital planner.
- It is not a near-duplicate of something the shop already has.
- You can say in one sentence why someone would pay for it rather than
  scribble it on the back of an envelope.

Be honest about effort and demand. A hard, low-demand idea is worth proposing
only if it is unusually uncontested.`,
    });
  }

  async handle(job) {
    const wanted = Number(job.payload?.count) || 8;
    const theme = job.payload?.theme || null;
    this.moveTo('research-bench', theme ? `hunting: ${theme}` : 'hunting for ideas');

    const existing = all('SELECT title FROM ideas').map((r) => r.title.toLowerCase());
    const ideas = await this.thinkOr(
      () => this.offlineIdeas(wanted, theme, existing),
      {
        task: 'brainstorming',
        json: true,
        temperature: 1,
        maxTokens: 3000,
        prompt: this.brainstormPrompt(wanted, theme, existing),
      }
    );

    const list = this.normalise(ideas, existing).slice(0, wanted);
    if (!list.length) {
      // "Nothing worth proposing" sounds like a judgement about the market.
      // It is almost always a limit of mine, and saying which one is the
      // difference between "the shop is thinking" and "the shop has stopped".
      const gaps = openings(1).length;
      this.say(
        llm.enabled
          ? 'Nothing new this round — everything I thought of is already on the bench.'
          : `I am out of new ideas offline. I have proposed every product in my built-in ` +
            `notebook and every variation of them, ${existing.length} in all. ` +
            (gaps
              ? 'Fresh market readings will give me new gaps to aim at within the hour.'
              : 'Set LLM_PROVIDER in .env, or add ETSY_KEYSTRING so I can read the real ' +
                'marketplace and find gaps nobody has filled.'),
        { kind: 'ideas', level: 'warn' }
      );
      this.goHome();
      return { result: { added: 0, exhausted: true } };
    }

    const batch = uid('batch');
    for (const idea of list) {
      insert('ideas', {
        id: uid('idea'),
        title: idea.title,
        category: idea.category,
        audience: idea.audience,
        pitch: idea.pitch,
        angle: idea.angle,
        format: idea.format,
        keywords: idea.keywords,
        effort: idea.effort,
        demand: idea.demand,
        price_low: idea.priceLow,
        price_high: idea.priceHigh,
        score: idea.score,
        status: 'proposed',
        source_agent: this.id,
        batch,
        similar_to: idea.similarTo ?? null,
        similarity: idea.similarity ?? null,
        // Shown in the Review Hall before you decide. The subjects flagged
        // here cost somebody more than a refund if the shop gets them wrong.
        note: idea.careful
          ? 'Read this one before approving: medical, legal, tax or grief content. Say what it is not, and never give advice.'
          : null,
        created_at: now(),
      });
    }

    const top = list.slice(0, 3).map((i) => `• ${i.title} — ${i.pitch}`).join('\n');
    this.say(`${list.length} new ideas on the bench. My top three:\n${top}`, {
      kind: 'ideas',
      level: 'good',
      meta: { batch, count: list.length },
    });

    this.ensureAskToRank();
    this.goHome();
    pushState('ideas');
    return { result: { added: list.length, batch } };
  }

  /** One standing "come and rank these" request while a backlog exists. */
  ensureAskToRank() {
    const waiting = count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'");
    const existing = openApprovals().find((a) => a.kind === 'ideas');
    if (!waiting) {
      if (existing) cancelFor(existing.ref_id || 'idea-backlog', 'backlog cleared');
      return;
    }
    if (existing) return;
    ask({
      kind: 'ideas',
      refId: 'idea-backlog',
      agent: this.id,
      station: 'research-bench',
      title: `${waiting} product ideas are waiting for your yes or no.`,
      detail:
        'Open the Research Bench to approve the ones you want built. Anything you approve goes straight into production; anything you reject teaches me what you do not want.',
      options: [{ value: 'seen', label: 'Open the Research Bench' }],
    });
  }

  brainstormPrompt(wanted, theme, existing) {
    const season = seasonHint();
    const recent = existing.slice(-40);
    return `
Propose ${wanted} digital product ideas for the shop.

${theme ? `The owner specifically asked you to focus on: ${theme}\n` : ''}Right now it is ${new Date().toDateString()}. ${season}

Categories the shop already works in (you may go outside them if you have a
genuinely good reason): ${CATEGORIES.join(', ')}.

${marketBlock() || 'No market reading yet, so judge demand on your own reasoning.'}

Where a phrase is crowded, a new listing is invisible however good it is.
Aim at the quiet ones, or at something specific enough that the crowded phrase
is not the one it competes on.

Do NOT propose anything that duplicates these existing ideas:
${recent.length ? recent.map((t) => `- ${t}`).join('\n') : '- (nothing yet)'}

Return a JSON array. Each element:
{
  "title": "listing-style product name, under 70 characters",
  "category": "one of the categories above, or a new one",
  "audience": "the specific person who buys it",
  "pitch": "one sentence: what it is and why they buy it",
  "angle": "what makes it different from the free version they could scribble",
  "format": "printable PDF pack | spreadsheet | printable art set | hyperlinked PDF | printable PDF binder",
  "keywords": ["3-6 phrases a buyer would actually type into Etsy"],
  "effort": 1-5 (how much work to build),
  "demand": 1-5 (how many people are looking for this),
  "priceLow": number in ${config.currency},
  "priceHigh": number in ${config.currency}
}`.trim();
  }

  /**
   * No model? Then the Scout works from its notebook: unused seeds first,
   * then seeds stretched with a twist. Deterministic enough to be useful,
   * random enough to stay interesting.
   */
  /**
   * Ideas built from what the market actually looks like.
   *
   * The seed corpus is finite. Once the shop has proposed every seed and every
   * twist of every seed — which a shop running day and night reaches inside a
   * week — the offline Scout has nothing left to say, and "nothing new worth
   * proposing this round" starts to read as the shop giving up. It had.
   *
   * The market readings are not finite: they change as Etsy changes, and each
   * quiet phrase with real demand behind it is a product nobody has built yet.
   * That makes this the one offline source that renews itself.
   */
  fromMarket(wanted, seen) {
    const out = [];
    for (const gap of openings(12)) {
      if (out.length >= wanted) break;
      // The words other sellers use in this corner, minus the ones the phrase
      // already contains — that is the shape of what buyers expect to see.
      const extra = gap.phrases
        .map((p) => p.word)
        .filter((w) => !gap.keyword.includes(w))
        .slice(0, 3);
      const title = titleCase(`${gap.keyword}${extra[0] ? ` ${extra[0]}` : ''} printable`);
      if (seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());

      const seed = SEEDS.find((s) => gap.keyword.includes(s.c.toLowerCase().split(' ')[0])) || null;
      const price = gap.priceMedian || 4;
      out.push({
        title,
        category: seed?.c || 'Printables',
        audience: seed?.a || `people searching Etsy for "${gap.keyword}"`,
        pitch:
          `Only ${gap.listings.toLocaleString()} live listings for "${gap.keyword}", which is quiet ` +
          `enough for a new one to be seen. Typical price is ${price.toFixed(2)}.`,
        angle: extra.length
          ? `Sellers in this corner all use "${extra.join('", "')}" — match that language and be findable.`
          : 'A corner of Etsy nobody has crowded out yet.',
        format: seed?.f || 'printable PDF pack',
        keywords: [gap.keyword, ...extra].slice(0, 6),
        effort: seed?.e ?? 2,
        // A quiet phrase with a thousand listings behind it has proven demand;
        // a quiet phrase with fifty has none. That is the whole judgement.
        demand: gap.listings > 2000 ? 4 : gap.listings > 500 ? 3 : 2,
        priceLow: Math.max(1.5, price * 0.7),
        priceHigh: Math.max(2.5, price * 1.4),
        fromMarket: true,
      });
    }
    return out;
  }

  offlineIdeas(wanted, theme, existing) {
    const seen = new Set(existing);

    // Real gaps first, because they are the only ones backed by evidence.
    const out0 = theme ? [] : this.fromMarket(wanted, seen);
    if (out0.length >= wanted) return out0;
    const pool = theme
      ? SEEDS.filter((s) =>
          `${s.t} ${s.c} ${s.a} ${s.k.join(' ')}`.toLowerCase().includes(theme.toLowerCase())
        )
      : SEEDS;
    // Only propose what the files can actually deliver.
    //
    // The owner's master list carries plenty this engine cannot make — Notion
    // workspaces, Cricut cut files, Lightroom presets, wall art. Proposing
    // those means a title that promises one thing and a download that is
    // another, which the Inspector rejects and which leaves the product stuck
    // at the design stage for good. They stay in the notebook, marked, for
    // when there is something that can build them.
    const buildable = (seed) => config.proposeArtwork || seed.build !== 'art';
    const seeds = shuffle((pool.length ? pool : SEEDS).filter(buildable));
    const out = [...out0];

    for (const seed of seeds) {
      if (out.length >= wanted) break;
      if (!seen.has(seed.t.toLowerCase())) {
        out.push(this.fromSeed(seed));
        seen.add(seed.t.toLowerCase());
      }
    }

    // Still short? Stretch seeds with twists.
    let guard = 0;
    while (out.length < wanted && guard++ < wanted * 12) {
      const seed = pick(seeds);
      const twist = pick(TWISTS);
      const title = `${seed.t} — ${titleCase(twist.label)}`;
      if (seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      out.push({
        ...this.fromSeed(seed),
        title,
        angle: twist.note,
        pitch: `${seed.t} rebuilt for ${seed.a}. ${twist.note}`,
        effort: Math.max(1, seed.e - 1),
      });
    }
    return out;
  }

  fromSeed(seed) {
    return {
      title: seed.t,
      category: seed.c,
      audience: seed.a,
      pitch: `${seed.t} for ${seed.a} — ${seed.g}.`,
      angle: seed.g,
      format: seed.f,
      keywords: seed.k,
      effort: seed.e,
      demand: seed.d,
      priceLow: seed.p[0],
      priceHigh: seed.p[1],
      // Carried through to the idea row so the Review Hall can show it. Being
      // wrong about a dose or a tax rule costs somebody more than a refund.
      careful: seed.careful ? true : undefined,
    };
  }

  /** Clean whatever came back — model or notebook — into storable rows. */
  normalise(raw, existing) {
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.ideas) ? raw.ideas : [];
    const seen = new Set(existing);
    // Near-duplicate guard: "Weekly Meal Planner" and "Meal Planner Weekly
    // Printable" are the same product, and exact title matching misses that.
    const known = catalogue();
    const skipped = [];
    const out = [];
    for (const item of list) {
      const title = truncate(String(item?.title || '').trim(), 90);
      if (!title || seen.has(title.toLowerCase())) continue;

      // A near-duplicate is kept, not binned.
      //
      // Dropping them looked sensible and was the reason the bench eventually
      // went empty: the catalogue only grows, so after a while everything the
      // Scout thinks of resembles something already there and nothing survives
      // the filter. It also decided something that is the owner's to decide —
      // a second budget planner for a different buyer is a real product, and
      // the shops that do well have several.
      //
      // So it comes through marked with what it is close to. The Research
      // Bench shows that, and if the owner approves it anyway the Maker builds
      // it deliberately differently rather than producing the same pages twice.
      const near = closestMatch(`${title} ${(item.keywords || []).join(' ')}`, known);
      const similarTo = near.match && near.score >= TOO_SIMILAR ? near.match : null;

      // Things the shop has learned not to bother with, enforced whether or
      // not a model was involved in proposing this.
      const trademark = findTrademarks(title, (item.keywords || []).join(' '));
      if (trademark.length) {
        skipped.push(`${title} (trademark: ${trademark.join(', ')})`);
        continue;
      }
      const avoid = matchesAvoidPattern(title);
      if (avoid.length) {
        skipped.push(`${title} (${avoid.join(', ')} never sells)`);
        continue;
      }

      seen.add(title.toLowerCase());
      known.push({ kind: 'idea', title, bag: tokens(`${title} ${(item.keywords || []).join(' ')}`) });
      const effort = clampInt(item.effort, 1, 5, 3);
      const similarFields = similarTo
        ? { similarTo: similarTo.title, similarity: Number(near.score.toFixed(2)) }
        : {};
      const demand = clampInt(item.demand, 1, 5, 3);
      const priceLow = Number(item.priceLow) > 0 ? Number(item.priceLow) : 3;
      const priceHigh = Number(item.priceHigh) > priceLow ? Number(item.priceHigh) : priceLow + 3;
      out.push({
        title,
        category: String(item.category || 'Printables').trim(),
        audience: truncate(String(item.audience || 'general buyers'), 160),
        pitch: truncate(String(item.pitch || ''), 400),
        angle: truncate(String(item.angle || ''), 400),
        format: String(item.format || 'printable PDF pack'),
        keywords: Array.isArray(item.keywords)
          ? item.keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 8)
          : [slug(title).replace(/-/g, ' ')],
        effort,
        demand,
        priceLow,
        priceHigh,
        score: score({ effort, demand, priceLow, priceHigh }),
        // Kept through the cleaning step so the warning reaches the Review
        // Hall. A model's own suggestion can carry it too, if it says so.
        careful: Boolean(item.careful),
        ...similarFields,
      });
    }

    // Only real refusals are reported now — trademarks and things the shop has
    // learned never sell. Near-duplicates go on the bench with a note.
    if (skipped.length) {
      this.say(`Left out ${skipped.length}: ${skipped.slice(0, 3).join('; ')}.`, {
        kind: 'dupes',
        discord: false,
      });
    }
    const echoes = out.filter((idea) => idea.similarTo).length;
    if (echoes) {
      this.say(
        `${echoes} of these are close to something the shop already has — marked so you can decide. ` +
          'Approve one and the Maker will build it differently rather than repeat itself.',
        { kind: 'dupes', discord: false }
      );
    }
    return out.sort((a, b) => b.score - a.score);
  }
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Worth-building score. Demand matters most, effort is a real cost, and a
 * higher price ceiling makes the same effort pay better.
 */
export function score({ effort, demand, priceLow, priceHigh }) {
  const mid = (Number(priceLow) + Number(priceHigh)) / 2;
  const raw = demand * 2.2 - effort * 0.9 + Math.min(mid, 15) * 0.18;
  return Math.round(Math.max(0, Math.min(10, raw)) * 10) / 10;
}

/** A nudge so ideas lean into whatever people are shopping for right now. */
export function seasonHint(date = new Date()) {
  const m = date.getMonth();
  const hints = [
    'January: new year goals, budgets, fitness and organising sell hardest.',
    'February: Valentine, half term activities, budget resets.',
    'March: spring cleaning, Mother\'s Day, exam revision starts.',
    'April: Easter activities, tax year admin, garden and wedding season prep.',
    'May: exam revision peaks, summer holiday planning begins.',
    'June: summer bucket lists, end of school year, wedding season.',
    'July: six weeks of school holidays, travel and road trip packs.',
    'August: back to school and teacher planners are the biggest sellers.',
    'September: routines reset, budgets, fitness, Christmas planners start early.',
    'October: Halloween, Christmas planners, advent activities.',
    'November: Christmas budgets, advent, gift planning, Black Friday bundles.',
    'December: last-minute Christmas printables, then new year planners.',
  ];
  return hints[m];
}

export default Scout;
