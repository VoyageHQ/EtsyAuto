// THE RESEARCHER — works out whether buyers actually want the thing, what
// they type into the search box, and what it should cost.
import Agent from './base.js';
import { getProduct, ideaFor, advance } from '../pipeline/products.js';
import { setSetting } from '../core/db.js';
import { seasonHint } from './scout.js';
import config from '../core/config.js';
import { suggestPrice } from '../etsy/listing.js';

const MODIFIERS = [
  'printable',
  'pdf',
  'instant download',
  'template',
  'uk',
  'a4',
  'editable',
  'for adults',
  'for kids',
  'bundle',
];

export class Researcher extends Agent {
  constructor() {
    super({
      id: 'researcher',
      name: 'The Researcher',
      title: 'keyword and market watcher',
      station: 'lookout',
      colour: '#8fb8d8',
      handles: ['researcher.validate', 'researcher.trends'],
      voice: 'Factual and cautious. Says "I think" when it is guessing, and says when it does not know.',
      purpose: `
You work out what buyers are really searching for and what the shop can
honestly charge. You are the person who says "this is already saturated" or
"nobody uses that phrase" before any work gets wasted.

You never invent statistics. If you do not know a number, you say so and give
your reasoning instead. Guesses labelled as guesses are useful; invented
figures get the shop into trouble.`,
    });
  }

  async handle(job) {
    if (job.kind === 'researcher.trends') return this.trends();
    return this.validate(job);
  }

  async validate(job) {
    const product = getProduct(job.payload.productId);
    if (!product) return { result: { skipped: 'product gone' } };
    const idea = ideaFor(product) || { title: product.title, keywords: [] };
    this.moveTo('lookout', `checking ${product.sku}`);

    const research = await this.thinkOr(
      () => this.offlineResearch(idea),
      {
        task: `researching ${product.sku}`,
        json: true,
        maxTokens: 1200,
        prompt: `
Assess this product idea for an Etsy digital download shop.

Title: ${idea.title}
Category: ${idea.category}
Audience: ${idea.audience}
Pitch: ${idea.pitch}
The shop's own keyword guesses: ${(idea.keywords || []).join(', ')}

Return JSON:
{
  "keywords": ["8-12 phrases a buyer would type, best first, each under 20 characters where possible"],
  "longTail": ["3-5 lower-competition phrases worth targeting"],
  "competition": "crowded | moderate | quiet, plus one sentence of reasoning",
  "priceLow": number, "priceHigh": number,
  "differentiators": ["2-4 things this must do to beat what is already listed"],
  "risks": ["anything that could go wrong: trademarks, saturation, buyer confusion"],
  "verdict": "build | tweak | skip",
  "verdictWhy": "one sentence"
}`.trim(),
      }
    );

    const clean = this.normalise(research, idea);
    const price = suggestPrice({ ...idea, price_low: clean.priceLow, price_high: clean.priceHigh }, 5);

    this.say(
      `${product.sku}: ${clean.verdict}. ${clean.verdictWhy} Best phrase: "${clean.keywords[0]}". ` +
        `Suggested price ${config.currency} ${price.toFixed(2)}.`,
      { kind: 'research', level: clean.verdict === 'skip' ? 'warn' : 'info', meta: { productId: product.id } }
    );

    advance(product, { research: clean, price });
    this.goHome();
    return { result: clean };
  }

  /** Periodic scan that feeds the Lookout tile on the dashboard. */
  async trends() {
    this.moveTo('lookout', 'scanning');
    const note = await this.thinkOr(
      () => seasonHint(),
      {
        task: 'scanning trends',
        maxTokens: 300,
        prompt: `In one sentence, under 120 characters: what should a digital
downloads shop be listing right now, given today is ${new Date().toDateString()}?
No preamble, just the sentence.`,
      }
    );
    const clean = String(note).replace(/\s+/g, ' ').trim().slice(0, 140);
    setSetting('lookout_note', clean);
    this.say(`Lookout: ${clean}`, { kind: 'lookout' });
    this.goHome();
    return { result: { note: clean } };
  }

  offlineResearch(idea) {
    const base = (idea.keywords || []).length
      ? idea.keywords
      : [String(idea.title).toLowerCase()];
    const expanded = [];
    for (const keyword of base) {
      expanded.push(keyword);
      for (const modifier of MODIFIERS.slice(0, 3)) {
        const phrase = `${keyword} ${modifier}`;
        if (phrase.length <= 20) expanded.push(phrase);
      }
    }
    const demand = Number(idea.demand) || 3;
    return {
      keywords: [...new Set(expanded)].slice(0, 12),
      longTail: [...new Set(expanded)].slice(3, 8),
      competition:
        demand >= 5
          ? 'crowded — high demand always is, so the listing has to be visibly better than the free versions'
          : demand <= 2
            ? 'quiet — little competition, but check anyone is actually searching for it'
            : 'moderate — winnable with a specific angle and honest photos',
      priceLow: Number(idea.price_low) || 3,
      priceHigh: Number(idea.price_high) || 7,
      differentiators: [
        idea.angle || 'Solve one specific problem completely rather than half of five',
        'Include A4 and US Letter so nobody has to ask',
        'Make page one useful on its own, so the preview sells it',
      ],
      risks: [
        'Do not use any brand, TV or character names in the title or tags.',
        'If the same thing is free on ten blogs, the paid version has to be better organised.',
      ],
      verdict: demand >= 3 ? 'build' : 'tweak',
      verdictWhy:
        demand >= 3
          ? 'There is a real audience and a clear angle.'
          : 'Worth building, but narrow it to one specific buyer first.',
      offline: true,
    };
  }

  normalise(raw, idea) {
    const fallback = this.offlineResearch(idea);
    if (!raw || typeof raw !== 'object') return fallback;
    const list = (value, limit) =>
      Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean).slice(0, limit) : [];
    const keywords = list(raw.keywords, 12);
    return {
      keywords: keywords.length ? keywords.map((k) => k.toLowerCase()) : fallback.keywords,
      longTail: list(raw.longTail, 6),
      competition: String(raw.competition || fallback.competition).slice(0, 300),
      priceLow: Number(raw.priceLow) > 0 ? Number(raw.priceLow) : fallback.priceLow,
      priceHigh: Number(raw.priceHigh) > 0 ? Number(raw.priceHigh) : fallback.priceHigh,
      differentiators: list(raw.differentiators, 5).length ? list(raw.differentiators, 5) : fallback.differentiators,
      risks: list(raw.risks, 5),
      verdict: ['build', 'tweak', 'skip'].includes(raw.verdict) ? raw.verdict : 'build',
      verdictWhy: String(raw.verdictWhy || '').slice(0, 240) || fallback.verdictWhy,
    };
  }
}

export default Researcher;
