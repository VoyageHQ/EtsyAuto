// The shape every villager shares: a home station, a status the dashboard can
// draw, a voice for Discord, and a brain that always carries your lessons.
import config from '../core/config.js';
import { llm, OfflineError } from '../core/llm.js';
import { lessonBlock } from '../core/memory.js';
import { insightBlock } from '../core/insights.js';
import { log, pushState } from '../core/events.js';
import { setAgentState, one } from '../core/db.js';
import { stationById } from '../core/stations.js';

const VENTURE_CONTEXT = `
About the business you work for:
- It is a one-person venture arm. The owner has a day job and evenings, no
  staff, no investors and no budget beyond a few pounds a month for hosting.
- The point is a small business that takes real money from real people, not a
  startup that raises money. Anything needing a funding round is out of scope.
- Ideas come from evidence: people describing an unmet need in public, in their
  own words, recently. Not from brainstorming.
- Anything built must be buildable in about two weeks of evenings and hostable
  free or nearly free.
- Out of scope entirely: two-sided marketplaces, anything needing a licence
  (financial advice, medical, legal), anything holding other people's money,
  and anything that only works at scale.
- Nothing is ever published, posted, launched or paid for without the owner
  approving it first. No agent has a payment method or posting credentials.
`.trim();

const SHOP_CONTEXT = `
About the shop you work for:
- It sells DIGITAL DOWNLOADS only on Etsy. Nothing is ever printed, packed or
  posted. Every product is a file the buyer downloads instantly.
- Typical products: budget planners, chore charts, meal planners, wedding
  templates, kids activity packs, business spreadsheets, fitness trackers,
  wall art, digital planners, and neurodivergent-friendly systems such as
  ADHD cleaning charts.
- Deliverables are A4 + US Letter PDFs, sometimes an editable spreadsheet.
  They must print cleanly in black and white and stay readable at 100%.
- The shop is run by one person with an agent fleet. There is no budget for
  paid stock art, paid fonts or paid software. Everything must be original or
  clearly free to use commercially.
- Nothing gets published without the owner approving it first.
`.trim();

export class Agent {
  /**
   * @param {object} spec
   * @param {string} spec.id           stable id, e.g. "scout"
   * @param {string} spec.name         display name, e.g. "The Scout"
   * @param {string} spec.title        job title
   * @param {string} spec.station      home station id
   * @param {string} spec.purpose      what it is for, in its own prompt
   * @param {string} [spec.voice]      how it writes in Discord
   * @param {string} [spec.colour]     hex, used on the map and in Discord
   * @param {string} [spec.modelHint]  preferred model name
   * @param {string[]} [spec.handles]  job kinds it accepts
   */
  constructor(spec) {
    Object.assign(this, {
      voice: 'Plain, warm, no corporate filler. Short sentences.',
      colour: '#9fd0a0',
      handles: [],
      // Which business this agent works for. The shop is the default because
      // it came first; venture agents say so explicitly.
      division: 'etsy',
      ...spec,
    });
    this.home = spec.station;
    setAgentState(this.id, { status: 'idle', station: this.station, activity: null });
  }

  get model() {
    return llm.describe(this.modelHint);
  }

  get state() {
    return one('SELECT * FROM agent_state WHERE id = ?', this.id);
  }

  /** Walk somewhere. The dashboard animates the trip. */
  moveTo(stationId, activity = null) {
    this.station = stationId;
    setAgentState(this.id, { status: 'working', station: stationId, activity });
    pushState('agent-move');
  }

  setStatus(status, activity = null) {
    setAgentState(this.id, { status, station: this.station, activity });
    pushState('agent-status');
  }

  goHome() {
    this.station = this.home;
    setAgentState(this.id, { status: 'idle', station: this.home, activity: null });
    pushState('agent-home');
  }

  /** Speak into the activity feed and this agent's Discord channel. */
  say(message, opts = {}) {
    return log({
      agent: this.id,
      station: this.station,
      kind: opts.kind || this.id,
      level: opts.level || 'info',
      message,
      meta: opts.meta,
      discord: opts.discord,
    });
  }

  /**
   * Ask the model something, with the shop context and your lessons already
   * attached. Throws OfflineError when no model is configured, which every
   * caller is expected to catch and handle with its own offline craft.
   */
  async think({ prompt, task = '', json = false, maxTokens = 2000, temperature = 1 }) {
    // Order matters: the shop's own results, then the owner's rules last, so
    // the rules win any argument.
    const ventures = this.division === 'ventures';
    const system = [
      ventures
        ? `You are ${this.name}, ${this.title} in the venture arm of a one-person business.`
        : `You are ${this.name}, ${this.title} at ${config.shopName}, a one-person Etsy shop selling digital downloads.`,
      '',
      this.purpose.trim(),
      '',
      ventures ? VENTURE_CONTEXT : SHOP_CONTEXT,
      '',
      `How you write: ${this.voice}`,
      this.usesInsights === false ? '' : insightBlock(this.id, this.division),
      lessonBlock(this.id, this.division),
    ]
      .filter(Boolean)
      .join('\n');

    const label = task || 'thinking';
    this.setStatus('working', label);
    const options = {
      system,
      prompt,
      maxTokens,
      temperature,
      model: this.modelHint,
      agent: this.id,
    };
    try {
      const result = json ? await llm.completeJson(options) : await llm.complete(options);
      return result;
    } catch (err) {
      if (!(err instanceof OfflineError)) {
        this.say(`My brain call failed: ${err.message}`, { level: 'error', kind: 'brain' });
      }
      throw err;
    }
  }

  /** Convenience: try the model, fall back to local craft when it is absent. */
  async thinkOr(fallback, options) {
    try {
      const result = await this.think(options);
      if (result === null || result === undefined) return fallback();
      return result;
    } catch (err) {
      if (err instanceof OfflineError || err.offline) return fallback();
      throw err;
    }
  }

  /** Overridden by each agent. Returns { result, enqueue?, blocked? }. */
  async handle(job) {
    throw new Error(`${this.id} does not know how to do "${job.kind}"`);
  }

  get stationName() {
    return stationById(this.station).name;
  }

  toJSON() {
    const state = this.state || {};
    return {
      id: this.id,
      name: this.name,
      title: this.title,
      division: this.division,
      model: this.model,
      colour: this.colour,
      home: this.home,
      station: state.station || this.home,
      status: state.status || 'idle',
      activity: state.activity || null,
      purpose: this.purpose.trim().split('\n')[0],
    };
  }
}

export default Agent;
