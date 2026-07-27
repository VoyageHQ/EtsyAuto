// THE HARBOURMASTER — runs the venture arm the way the Manager runs the shop,
// and never touches the shop.
import Agent from './base.js';
import config from '../core/config.js';
import { getSetting, setSetting, one } from '../core/db.js';
import { enqueue } from '../pipeline/queue.js';
import {
  listVentures,
  activeVentureCount,
  scheduleVentureStage,
  signalCount,
  campaignsFor,
} from '../ventures/pipeline.js';
import { openApprovals, waitingOnOwner } from '../core/approvals.js';

/**
 * Is this venture already sitting on the owner's desk?
 *
 * An approval about a venture may point at the venture itself or at something
 * it produced — a campaign, most often. Both mean the same thing here: do not
 * touch it, somebody has been asked.
 */
const parked = (venture) =>
  waitingOnOwner(venture.id, campaignsFor(venture.id).map((c) => c.id));

const DAY = 86400000;

export class Harbourmaster extends Agent {
  constructor() {
    super({
      id: 'harbourmaster',
      name: 'The Harbourmaster',
      title: 'venture arm foreman',
      division: 'ventures',
      station: 'harbour-office',
      colour: '#8fd8c2',
      handles: ['harbourmaster.plan'],
      voice: 'Brief. Says what moved and what is waiting.',
      purpose: `
You keep the venture arm moving: the Prospector listening, approved ventures
progressing one at a time, and anything stalled chased up.

You never approve a venture, never decide what gets built, and never touch the
Etsy shop. One venture in build at a time unless the owner says otherwise —
two half-built products are worth less than one finished one.`,
    });
  }

  async handle() {
    this.moveTo('harbour-office', 'planning');
    const decisions = [];

    // 1. Keep listening, but not constantly — these are public APIs and we are
    //    a guest on them.
    const lastHarvest = Number(getSetting('last_harvest', '0'));
    const waiting = listVentures("WHERE status = 'proposed'").length;
    if (Date.now() - lastHarvest > DAY / 2 && waiting < 5) {
      enqueue({
        agent: 'prospector',
        kind: 'prospector.harvest',
        subject: 'listening round',
        payload: { count: 5 },
        priority: 6,
      });
      decisions.push('sent the Prospector out listening');
    }

    // 2. Move approved ventures along, one at a time.
    const capacity = config.ventures.maxActive - activeVentureCount();
    if (capacity > 0) {
      for (const venture of listVentures("WHERE status = 'approved' AND stage != 'live'").slice(0, capacity)) {
        const busy = one(
          "SELECT id FROM jobs WHERE status IN ('queued','running') AND payload LIKE ?",
          `%${venture.id}%`
        );
        if (!busy && !parked(venture)) {
          scheduleVentureStage(venture);
          decisions.push(`moved ${venture.name} on to ${venture.stage}`);
        }
      }
    }

    // 3. Nudge anything mid-build with nobody on it — and nobody means the
    //    owner too. A venture at the marketing stage ends its job by asking
    //    permission to launch, so it has no job queued and looks stalled. This
    //    loop nudged it every tick: eighteen launch packs, eighteen identical
    //    questions in heads up, for one business.
    for (const venture of listVentures("WHERE status = 'building' AND stage != 'live'")) {
      const busy = one(
        "SELECT id FROM jobs WHERE status IN ('queued','running') AND payload LIKE ?",
        `%${venture.id}%`
      );
      if (busy) continue;
      if (parked(venture)) continue;
      scheduleVentureStage(venture);
      decisions.push(`nudged ${venture.name}`);
    }

    // 4. Ask the Marketer how anything live is doing, weekly.
    const lastReport = Number(getSetting('last_marketing_report', '0'));
    if (Date.now() - lastReport > DAY * 7) {
      const live = listVentures("WHERE stage = 'live'")[0];
      if (live) {
        setSetting('last_marketing_report', String(Date.now()));
        enqueue({
          agent: 'marketer',
          kind: 'marketer.report',
          subject: live.name,
          payload: { ventureId: live.id },
          priority: 7,
        });
        decisions.push('asked the Marketer for a read on what is live');
      }
    }

    if (decisions.length) this.say(decisions.join('; ') + '.', { kind: 'plan', discord: decisions.length > 1 });
    this.setStatus('idle', openApprovals().length ? 'waiting on you' : null);
    return { result: { decisions, signals: signalCount() } };
  }
}

export default Harbourmaster;
