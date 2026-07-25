// THE MARKETER — plans the launch, writes the copy, and never spends a penny
// or posts anything without you pressing approve.
import Agent from './base.js';
import config from '../core/config.js';
import {
  getVenture,
  advanceVenture,
  saveCampaign,
  campaignsFor,
  setVentureStage,
} from '../ventures/pipeline.js';
import { writeMarketingPack } from '../ventures/marketing.js';
import { ask } from '../core/approvals.js';
import { money, truncate } from '../core/util.js';

export class Marketer extends Agent {
  constructor() {
    super({
      id: 'marketer',
      name: 'The Marketer',
      title: 'launch, channels and ads',
      division: 'ventures',
      station: 'billboard',
      colour: '#e0879f',
      handles: ['marketer.launch', 'marketer.report'],
      voice: 'Plain and specific. Names the channel, the post, the day. No growth-hacking language.',
      purpose: `
You get the venture in front of the people whose complaints started it, and you
manage every campaign after that.

The one rule that matters: you write and plan, the owner presses go. You have
no payment method, no posting credentials, and you never ask for them. A
campaign you have prepared sits as a draft until it is approved.

How you think about channels:
- Start where the evidence came from. Those people already said they have the
  problem, in public, recently.
- Reply to individuals before broadcasting to communities.
- Never post the same thing to many communities. That is spam and it gets the
  account banned.
- Paid ads come after ten people have said the landing page makes sense, not
  before. Ads amplify a message; they do not find one.
- Never invent testimonials, user counts, results or urgency.`,
    });
  }

  async handle(job) {
    if (job.kind === 'marketer.report') return this.report(job);

    const venture = getVenture(job.payload.ventureId);
    if (!venture) return { result: { skipped: 'venture gone' } };
    this.moveTo('billboard', `launch plan for ${venture.name}`);

    const plan = await this.thinkOr(() => this.offlinePlan(venture), {
      task: `planning the launch of ${venture.name}`,
      json: true,
      maxTokens: 2600,
      prompt: this.prompt(venture),
    });

    const clean = this.normalise(plan, venture);
    const pack = writeMarketingPack(venture, clean);

    const campaignId = saveCampaign({
      ventureId: venture.id,
      name: `${venture.name} launch`,
      channel: clean.channels?.[0]?.name || 'direct replies',
      status: 'draft',
      budget: 0,
      plan: clean,
    });

    this.say(
      `${venture.name} launch pack ready in ${pack.dir}/ — ` +
        `${clean.channels.length} channel(s), ${clean.ads.length} ad variants, ` +
        `${clean.calendar.length} scheduled posts. Nothing goes out until you say so.`,
      { kind: 'launch', level: 'good', meta: { ventureId: venture.id, campaignId } }
    );

    ask({
      kind: 'campaign',
      refId: campaignId,
      agent: this.id,
      station: 'billboard',
      title: `Start the launch for ${venture.name}?`,
      detail: [
        `**${venture.name}** — ${truncate(venture.one_liner, 120)}`,
        '',
        `**First move** ${clean.sequence[0] || 'reply to the people whose posts started this'}`,
        `**Channels** ${clean.channels.map((c) => c.name).join(', ')}`,
        `**Cost** ${clean.budget ? money(clean.budget, config.currency) : 'nothing — all free channels'}`,
        '',
        'Everything is written and waiting in the marketing folder. Approving',
        'marks the campaign live and gives you the checklist — I cannot post or',
        'spend anything myself, and I do not have the credentials to.',
      ].join('\n'),
      options: [
        { value: 'go', label: 'Start the launch' },
        { value: 'revise', label: 'Rework the plan' },
        { value: 'hold', label: 'Hold it' },
      ],
    });

    advanceVenture(venture, {});
    this.goHome();
    return { result: { campaignId, dir: pack.dir } };
  }

  /** A weekly read on anything running. */
  async report(job) {
    const venture = getVenture(job.payload?.ventureId);
    if (!venture) return { result: { skipped: 'venture gone' } };
    const campaigns = campaignsFor(venture.id);
    const running = campaigns.filter((c) => c.status === 'running' || c.status === 'approved');
    if (!running.length) return { result: { running: 0 } };

    this.moveTo('billboard', `checking ${venture.name}`);
    this.say(
      `${venture.name}: ${running.length} campaign(s) live. ` +
        'Tell me what happened — signups, replies, sales — and I will adjust the plan. ' +
        'I cannot read your analytics, so anything I have not been told, I do not know.',
      { kind: 'campaign' }
    );
    this.goHome();
    return { result: { running: running.length } };
  }

  prompt(venture) {
    const evidence = (venture.evidence || [])
      .map((e) => `- ${e.channel || e.source}: "${truncate(e.quote, 160)}" ${e.url || ''}`)
      .join('\n');
    return `
Plan the launch for this venture.

Name: ${venture.name}
What it is: ${venture.one_liner}
Who pays: ${venture.audience}
Money: ${JSON.stringify(venture.monetisation)}

The evidence this problem is real — and therefore where the first customers are:
${evidence || '- none'}

Return JSON:
{
  "tagline": "the one sentence to repeat everywhere",
  "category": "what someone would call this kind of product",
  "value": "what it does for them",
  "alternative": "what they use instead today",
  "differentiator": "why they would switch",
  "trigger": "the moment they go looking for a solution",
  "words": ["words the buyers themselves use"],
  "goal": "the single goal of the launch",
  "channels": [{"name":"","why":"","action":"","cost":"","rules":"the community's actual rules"}],
  "sequence": ["ordered steps, first one first"],
  "ads": [{"channel":"","angle":"","headline":"","body":"","cta":"","bestFor":""}],
  "calendar": [{"week":1,"day":"Mon","channel":"","what":"","goal":""}],
  "keywords": {"problem":[],"solution":[],"competitor":[]},
  "replyTemplate": "what to send to the person whose post started this",
  "budget": 0
}

Four weeks of calendar, five ad variants, at most four channels. No invented
proof, no fake urgency, no exclamation marks.`.trim();
  }

  offlinePlan(venture) {
    const audience = venture.audience || 'the people with this problem';
    const channels = [...new Set((venture.evidence || []).map((e) => e.channel).filter(Boolean))];
    const primary = channels[0] || 'the forums where the problem was described';

    return {
      tagline: venture.one_liner,
      category: 'a small focused tool',
      value: venture.solution,
      alternative: 'a spreadsheet and a lot of copying and pasting',
      differentiator: 'it does the one job completely instead of being a feature of something bigger',
      trigger: 'the next time the job takes an evening it should not have taken',
      words: ['manual', 'spreadsheet', 'every week', 'hours', 'keep forgetting'],
      goal: 'ten conversations with people who have the problem, and one payment',
      channels: [
        {
          name: primary,
          why: 'The evidence came from here. These people described the problem themselves.',
          action: 'Reply individually to each person whose post you used. One reply, from a real account.',
          cost: 'Free',
          rules: 'Read the community rules first. Most ban self-promotion outright; a helpful reply is not a promotion.',
        },
        {
          name: 'Direct email',
          why: 'The waitlist is the only audience that asked to hear from you.',
          action: 'One short email when there is something to try. Not a newsletter.',
          cost: 'Free',
          rules: 'Include an unsubscribe link and a real postal address if you are in the UK or EU.',
        },
        {
          name: 'One written piece',
          why: 'The problem phrases people search for have almost no good pages answering them.',
          action: `Write one honest page answering "${(venture.evidence?.[0]?.phrase || 'how do I do this')}" properly, and link the tool once at the end.`,
          cost: 'Free',
          rules: 'Genuinely answer the question. A page that exists only to sell ranks badly and reads worse.',
        },
      ],
      sequence: [
        'Reply to every person whose post is in the evidence. Ask if the problem is still live.',
        'Send the landing page only to those who reply yes.',
        'Ask the first five what they would pay. Do not guess.',
        'Publish the written piece and link it once where it is genuinely relevant.',
        'Only then consider paid ads, and only against the phrases that already convert.',
      ],
      ads: [
        {
          channel: 'Search',
          angle: 'Problem aware',
          headline: `Still doing ${venture.name.toLowerCase()} by hand?`,
          body: `${venture.one_liner} Built for ${audience}.`,
          cta: 'See how it works',
          bestFor: 'people actively searching for a fix',
        },
        {
          channel: 'Search',
          angle: 'Alternative seeking',
          headline: 'A simpler way to do this',
          body: 'One job, done properly, without the suite you are paying for.',
          cta: 'Compare it',
          bestFor: 'people already paying for something bloated',
        },
        {
          channel: 'Social',
          angle: 'The quote',
          headline: `"${truncate(venture.evidence?.[0]?.quote || venture.problem, 70)}"`,
          body: 'Someone said this in public. So we built the thing they asked for.',
          cta: 'Have a look',
          bestFor: 'cold audience who recognise themselves in the quote',
        },
        {
          channel: 'Social',
          angle: 'Time saved',
          headline: 'Get your evening back',
          body: `${venture.one_liner}`,
          cta: 'Try it',
          bestFor: 'people who feel the cost in hours, not money',
        },
        {
          channel: 'Newsletter sponsorship',
          angle: 'Direct',
          headline: `For ${audience}`,
          body: `${venture.one_liner} ${money(venture.monetisation?.price, config.currency)} a month.`,
          cta: 'Take a look',
          bestFor: 'a small niche newsletter their whole audience reads',
        },
      ],
      calendar: buildCalendar(venture, primary),
      keywords: {
        problem: (venture.evidence || []).map((e) => e.phrase).filter(Boolean).slice(0, 6),
        solution: [
          `${venture.name.toLowerCase()} tool`,
          `${venture.name.toLowerCase()} software`,
          'simple alternative',
        ],
        competitor: ['alternative to', 'cheaper than', 'vs spreadsheet'],
      },
      replyTemplate: `I saw your post about this — I had the same problem, so I ended up building something small for it. Happy to share it, and just as happy to tell you what did not work if that is more useful.`,
      budget: 0,
      offline: true,
    };
  }

  normalise(raw, venture) {
    const fallback = this.offlinePlan(venture);
    if (!raw || typeof raw !== 'object') return fallback;

    const strings = (value, limit, fb) => {
      const list = Array.isArray(value)
        ? value.map((v) => truncate(String(v), 300)).filter(Boolean).slice(0, limit)
        : [];
      return list.length ? list : fb;
    };

    const channels = Array.isArray(raw.channels)
      ? raw.channels.slice(0, 4).map((c) => ({
          name: truncate(String(c?.name || 'channel'), 60),
          why: truncate(String(c?.why || ''), 240),
          action: truncate(String(c?.action || ''), 300),
          cost: truncate(String(c?.cost || 'Free'), 60),
          rules: truncate(String(c?.rules || 'Read the community rules before posting.'), 240),
        }))
      : fallback.channels;

    const ads = Array.isArray(raw.ads)
      ? raw.ads.slice(0, 6).map((a) => ({
          channel: truncate(String(a?.channel || 'Search'), 40),
          angle: truncate(String(a?.angle || ''), 60),
          headline: truncate(String(a?.headline || ''), 90).replace(/!/g, ''),
          body: truncate(String(a?.body || ''), 220).replace(/!/g, ''),
          cta: truncate(String(a?.cta || 'Take a look'), 40),
          bestFor: truncate(String(a?.bestFor || ''), 120),
        }))
      : fallback.ads;

    const calendar = Array.isArray(raw.calendar)
      ? raw.calendar.slice(0, 24).map((row, i) => ({
          week: Number(row?.week) || Math.floor(i / 3) + 1,
          day: truncate(String(row?.day || 'Mon'), 12),
          channel: truncate(String(row?.channel || ''), 60),
          what: truncate(String(row?.what || ''), 200),
          goal: truncate(String(row?.goal || ''), 120),
        }))
      : fallback.calendar;

    // The budget is yours to set, never the agent's to assume.
    const budget = Number(raw.budget) > 0 ? Number(raw.budget) : 0;

    return {
      tagline: truncate(String(raw.tagline || fallback.tagline), 200),
      category: truncate(String(raw.category || fallback.category), 80),
      value: truncate(String(raw.value || fallback.value), 300),
      alternative: truncate(String(raw.alternative || fallback.alternative), 200),
      differentiator: truncate(String(raw.differentiator || fallback.differentiator), 240),
      trigger: truncate(String(raw.trigger || fallback.trigger), 200),
      words: strings(raw.words, 10, fallback.words),
      goal: truncate(String(raw.goal || fallback.goal), 200),
      channels,
      sequence: strings(raw.sequence, 8, fallback.sequence),
      ads,
      calendar: calendar.length ? calendar : fallback.calendar,
      keywords: {
        problem: strings(raw.keywords?.problem, 8, fallback.keywords.problem),
        solution: strings(raw.keywords?.solution, 8, fallback.keywords.solution),
        competitor: strings(raw.keywords?.competitor, 8, fallback.keywords.competitor),
      },
      replyTemplate: truncate(String(raw.replyTemplate || fallback.replyTemplate), 600),
      budget,
    };
  }
}

function buildCalendar(venture, primary) {
  const rows = [];
  const weeks = [
    { theme: 'Talk to the people in the evidence', channel: primary },
    { theme: 'Publish the written piece', channel: 'Blog' },
    { theme: 'Email the waitlist something useful', channel: 'Email' },
    { theme: 'Ask the first users for one sentence each', channel: 'Email' },
  ];
  weeks.forEach((week, i) => {
    rows.push({
      week: i + 1,
      day: 'Mon',
      channel: week.channel,
      what: week.theme,
      goal: i === 0 ? 'five real conversations' : 'one useful reply',
    });
    rows.push({
      week: i + 1,
      day: 'Thu',
      channel: i % 2 ? 'Social' : week.channel,
      what: `Follow up on Monday's ${week.theme.toLowerCase()}`,
      goal: 'keep the thread alive',
    });
  });
  return rows;
}

export default Marketer;
