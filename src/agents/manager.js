// THE MANAGER — keeps the valley busy without letting it run away with
// itself. Runs on every tick from the Office.
import Agent from './base.js';
import config from '../core/config.js';
import { all, count, getSetting, setSetting, insert, one } from '../core/db.js';
import { enqueue } from '../pipeline/queue.js';
import { createProductFromIdea, listProducts, activeProductCount, scheduleStage } from '../pipeline/products.js';
import { openApprovals } from '../core/approvals.js';
import { uid, now, titleCase } from '../core/util.js';
import { rulesFor } from '../knowledge/index.js';
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

    // 6. Let the Signwriter read the shop for findability. Search position is
    //    slow-moving, so a sweep every few hours is plenty — and it must not
    //    run so often that it nags about listings it has already reported.
    const lastSeo = Number(getSetting('last_seo_sweep', '0'));
    if (count("SELECT COUNT(*) FROM listings") > 0 && Date.now() - lastSeo > DAY / 4) {
      setSetting('last_seo_sweep', String(Date.now()));
      enqueue({ agent: 'signwriter', kind: 'signwriter.audit', subject: 'search sweep', priority: 7 });
      decisions.push('sent the Signwriter round the listings');
    }

    // 7. Keep the seasonal campaign current.
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
 * Digital downloads sell on a calendar, and the calendar the shop works to is
 * the one in the seasonal knowledge pack — so editing the pack changes what
 * the shop actually does, not just what it says in a prompt.
 *
 * The pack records the month by which each theme must already be listed. The
 * season the shop should be working on is therefore the next one whose listing
 * deadline has not yet passed.
 */
export function nextSeason(date = new Date()) {
  const listBy = rulesFor('manager').listByMonth || {};
  const month = date.getMonth();

  // Themes grouped by the month they must be live in, soonest first from here.
  const upcoming = Object.entries(listBy)
    .map(([theme, byMonth]) => ({
      theme,
      byMonth,
      // How many months away, wrapping round the year end.
      distance: (byMonth - month + 12) % 12,
    }))
    .sort((a, b) => a.distance - b.distance);

  if (!upcoming.length) {
    const ends = new Date(date.getFullYear(), month + 2, 1);
    return { name: 'Steady work', theme: 'evergreen planners and trackers', endsAt: ends.getTime() };
  }

  // Everything sharing the nearest deadline becomes one campaign.
  const soonest = upcoming[0].distance;
  const themes = upcoming.filter((entry) => entry.distance === soonest);
  const ends = new Date(date.getFullYear(), month + soonest + 1, 0);
  if (ends.getTime() < date.getTime()) ends.setFullYear(ends.getFullYear() + 1);

  return {
    name: `${titleCase(themes[0].theme)} run-up`,
    theme: themes.map((t) => t.theme).join(', '),
    endsAt: ends.getTime(),
  };
}

export default Manager;
