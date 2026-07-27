// THE MANAGER — keeps the valley busy without letting it run away with
// itself. Runs on every tick from the Office.
import Agent from './base.js';
import config from '../core/config.js';
import { all, count, getSetting, setSetting, insert, one, update } from '../core/db.js';
import { enqueue } from '../pipeline/queue.js';
import { createProductFromIdea, listProducts, activeProductCount, scheduleStage } from '../pipeline/products.js';
import { openApprovals, waitingOnOwner } from '../core/approvals.js';
import { awaitingUpload } from '../etsy/permission.js';
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

    // 1. Keep ideas coming, and keep the pile the same size.
    //
    //    This used to stop dead once the backlog hit its target, which is how
    //    a shop with 373 unranked ideas looked like a shop that had given up
    //    looking. Stopping is the wrong answer to a full pile: the owner wants
    //    the best ideas in front of them, not the first ones that happened to
    //    be thought of. So the Scout keeps working on a timer, and the weakest
    //    of the pile makes way for anything better.
    //
    //    Nothing is lost — shelved ideas stay in the Library and can be
    //    brought back — and the target is one line of .env.
    const lastAsk = Number(getSetting('last_idea_ask', '0'));
    if (Date.now() - lastAsk > Math.max(1, config.ideaAskMinutes) * 60000) {
      setSetting('last_idea_ask', String(Date.now()));
      enqueue({
        agent: 'scout',
        kind: 'scout.brainstorm',
        subject: 'fresh ideas',
        payload: { count: 6, theme: this.currentTheme() },
        priority: 6,
      });
      decisions.push('asked the Scout for more ideas');
    }

    const waiting = count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'");
    const over = waiting - config.ideaBacklogTarget;
    if (over > 0) {
      // Weakest first, and oldest as the tie-break, so a good idea does not
      // get shelved just for having arrived early.
      const weakest = all(
        `SELECT id FROM ideas WHERE status = 'proposed'
          ORDER BY score ASC, created_at ASC LIMIT ?`,
        Math.min(over, 12)
      );
      for (const idea of weakest) {
        update('ideas', idea.id, {
          status: 'shelved',
          decided_at: now(),
          note:
            'Shelved to keep the shortlist to the best ' +
            `${config.ideaBacklogTarget}. Nothing is lost — it is in the Library, and you can bring it back.`,
        });
      }
      decisions.push(`shelved ${weakest.length} weaker idea(s) to keep the shortlist sharp`);
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

    // 3. Chase anything that has stalled with nobody working on it — where
    //    "nobody" includes you. A product whose agent ended by asking a
    //    question has no job queued and looks stalled, so this used to redo
    //    the work and ask again, once per tick, forever.
    for (const product of listProducts("WHERE status = 'active' AND stage NOT IN ('ready','listed')")) {
      const busy = one(
        "SELECT id FROM jobs WHERE status IN ('queued','running') AND payload LIKE ?",
        `%${product.id}%`
      );
      if (busy) continue;
      if (waitingOnOwner(product.id)) continue;
      scheduleStage(product);
      decisions.push(`nudged ${product.sku} at the ${product.stage} stage`);
    }

    // 3b. Anything you have approved for Etsy that has not gone up yet.
    //
    //     A permission is one-shot, so re-queueing cannot duplicate a listing
    //     — and without this an upload that lost its job, or one held back by
    //     the hourly ceiling, waited forever while the Shopfront said it was
    //     on its way. Making that sentence true is the whole point.
    for (const listing of awaitingUpload()) {
      const busy = one(
        "SELECT id FROM jobs WHERE status IN ('queued','running') AND payload LIKE ?",
        `%${listing.product_id}%`
      );
      if (busy) continue;
      enqueue({
        agent: 'lister',
        kind: 'lister.publish',
        subject: `${listing.sku} ${listing.product_title}`,
        payload: { productId: listing.product_id },
        priority: 3,
      });
      decisions.push(`sending ${listing.sku} to Etsy`);
    }

    // 4. Let the Lookout have a look round once a day.
    const lastScan = Number(getSetting('last_trend_scan', '0'));
    if (Date.now() - lastScan > DAY) {
      setSetting('last_trend_scan', String(Date.now()));
      enqueue({ agent: 'researcher', kind: 'researcher.trends', subject: 'daily scan', priority: 7 });
      decisions.push('sent the Researcher up the Lookout');
    }

    // 4b. And read the actual marketplace, on a much shorter cycle.
    //
    //     This is the only research here that is not an opinion: Etsy's own
    //     live listings for the phrases this shop is betting on. It runs every
    //     few hours rather than daily because it is what the Scout's next
    //     batch of ideas is built on, and a day-old reading means a day of
    //     ideas aimed at the wrong gaps.
    const lastMarket = Number(getSetting('last_market_scan', '0'));
    const marketEvery = Math.max(0.25, config.marketScanHours) * 3600000;
    if (config.etsy.keystring && Date.now() - lastMarket > marketEvery) {
      setSetting('last_market_scan', String(Date.now()));
      enqueue({ agent: 'researcher', kind: 'researcher.market', subject: 'reading the market', priority: 6 });
      decisions.push('sent the Researcher to read the market');
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
