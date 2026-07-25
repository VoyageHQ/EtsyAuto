// THE MANAGER — keeps the valley busy without letting it run away with
// itself. Runs on every tick from the Office.
import Agent from './base.js';
import config from '../core/config.js';
import { all, count, getSetting, setSetting, insert, one } from '../core/db.js';
import { enqueue } from '../pipeline/queue.js';
import { createProductFromIdea, listProducts, activeProductCount, scheduleStage } from '../pipeline/products.js';
import { openApprovals } from '../core/approvals.js';
import { uid, now } from '../core/util.js';
import { seasonHint } from './scout.js';

const DAY = 86400000;

export class Manager extends Agent {
  constructor() {
    super({
      id: 'manager',
      name: 'The Manager',
      title: 'shop foreman',
      station: 'office',
      colour: '#e8d6a8',
      handles: ['manager.plan'],
      voice: 'Brief. Reports decisions, not deliberations.',
      purpose: `
You decide what the valley works on next. You keep a healthy backlog of ideas
in front of the owner, start approved ideas into production a few at a time,
chase anything that has stalled, and keep the seasonal calendar honest.

You never approve ideas or listings yourself. That is the owner's job and you
do not go near it.`,
    });
  }

  async handle() {
    this.moveTo('office', 'planning');
    const decisions = [];

    // 1. Keep ideas flowing until the owner's backlog is full.
    const waiting = count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'");
    if (waiting < config.ideaBacklogTarget) {
      const wanted = Math.min(10, config.ideaBacklogTarget - waiting);
      enqueue({
        agent: 'scout',
        kind: 'scout.brainstorm',
        subject: `${wanted} fresh ideas`,
        payload: { count: wanted, theme: this.currentTheme() },
        priority: 6,
      });
      decisions.push(`asked the Scout for ${wanted} more ideas`);
    }

    // 2. Start approved ideas, a few at a time.
    const capacity = config.maxActiveProducts - activeProductCount();
    if (capacity > 0) {
      const approved = all(
        "SELECT * FROM ideas WHERE status = 'approved' ORDER BY score DESC, decided_at ASC LIMIT ?",
        capacity
      );
      for (const idea of approved) {
        createProductFromIdea({ ...idea, keywords: safeJson(idea.keywords) });
        decisions.push(`started "${idea.title}"`);
      }
    }

    // 3. Chase anything that has stalled with nobody working on it.
    for (const product of listProducts("WHERE status = 'active' AND stage NOT IN ('ready','listed')")) {
      const busy = one(
        "SELECT id FROM jobs WHERE status IN ('queued','running') AND payload LIKE ?",
        `%${product.id}%`
      );
      if (!busy) {
        scheduleStage(product);
        decisions.push(`nudged ${product.sku} at the ${product.stage} stage`);
      }
    }

    // 4. Let the Lookout have a look round once a day.
    const lastScan = Number(getSetting('last_trend_scan', '0'));
    if (Date.now() - lastScan > DAY) {
      setSetting('last_trend_scan', String(Date.now()));
      enqueue({ agent: 'researcher', kind: 'researcher.trends', subject: 'daily scan', priority: 7 });
      decisions.push('sent the Researcher up the Lookout');
    }

    // 5. Let the Curator look for bundles and spin-offs once a day, but only
    //    once there is something finished worth packing.
    const lastCurate = Number(getSetting('last_curator_scan', '0'));
    const finished = count("SELECT COUNT(*) FROM products WHERE stage IN ('ready','listed')");
    if (finished >= 2 && Date.now() - lastCurate > DAY) {
      setSetting('last_curator_scan', String(Date.now()));
      enqueue({ agent: 'curator', kind: 'curator.scan', subject: 'bundle scan', priority: 7 });
      decisions.push('sent the Curator round the Packhouse');
    }

    // 6. Keep the seasonal campaign current.
    this.ensureCampaign();

    if (decisions.length) {
      this.say(decisions.join('; ') + '.', { kind: 'plan', discord: decisions.length > 1 });
    }
    this.setStatus('idle', openApprovals().length ? 'waiting on you' : null);
    return { result: { decisions } };
  }

  /** What the Scout should lean into right now. */
  currentTheme() {
    const campaign = one('SELECT * FROM campaigns ORDER BY starts_at DESC LIMIT 1');
    if (campaign && campaign.ends_at > Date.now()) return campaign.theme;
    return null;
  }

  ensureCampaign() {
    const current = one('SELECT * FROM campaigns ORDER BY starts_at DESC LIMIT 1');
    if (current && current.ends_at > Date.now()) return;
    const season = nextSeason();
    insert('campaigns', {
      id: uid('camp'),
      name: season.name,
      theme: season.theme,
      starts_at: now(),
      ends_at: season.endsAt,
      notes: seasonHint(),
    });
    this.say(`Calendar set: ${season.name} — ${season.theme}.`, { kind: 'calendar' });
  }
}

const safeJson = (value) => {
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
};

/**
 * Digital downloads sell on a calendar. This works out which run-up the shop
 * should be listing for, and gives it a hard end date.
 */
export function nextSeason(date = new Date()) {
  const year = date.getFullYear();
  const seasons = [
    { name: 'New year reset', theme: 'goal setting, budgets, fitness, organising', ends: new Date(year, 0, 31) },
    { name: 'Spring clean', theme: 'cleaning schedules, home admin, Mother\'s Day', ends: new Date(year, 2, 31) },
    { name: 'Exam season', theme: 'revision timetables, study planners, teacher printables', ends: new Date(year, 4, 31) },
    { name: 'Summer holidays', theme: 'kids activity packs, travel planners, bucket lists', ends: new Date(year, 7, 20) },
    { name: 'Back to school', theme: 'teacher planners, routines, school year organisers', ends: new Date(year, 8, 20) },
    { name: 'Halloween', theme: 'halloween party printables and kids activities', ends: new Date(year, 9, 31) },
    { name: 'Christmas run-up', theme: 'christmas planners, advent activities, gift budgets', ends: new Date(year, 11, 20) },
    { name: 'New year reset', theme: 'goal setting, budgets, fitness, organising', ends: new Date(year + 1, 0, 31) },
  ];
  const season = seasons.find((s) => s.ends.getTime() > date.getTime()) || seasons[seasons.length - 1];
  return { name: `${season.name} ${season.ends.getFullYear()}`, theme: season.theme, endsAt: season.ends.getTime() };
}

export default Manager;
