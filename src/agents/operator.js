// THE OPERATOR — the one who runs it after it is built.
//
// Every agent in the harbour before this one hands something over and walks
// away: the Prospector finds the idea, the Analyst checks it can pay, the
// Architect scopes it, the Builder writes the files, the Marketer writes the
// plan. Then the venture goes "live" and nothing happens to it ever again,
// because live meant "the files exist", not "somebody is running it".
//
// A business that nobody runs is a folder. This is the agent that opens the
// folder every day: is the site actually up, has anybody signed up, has
// anybody paid, and what is the single next thing the owner should do.
//
// What it will not do, on purpose:
//
//   · It does not email your signups. Sending mail as you, to strangers, from
//     an unattended loop is how a domain gets blocked and how somebody gets a
//     reply they never asked for. It drafts; you send.
//   · It does not post anywhere. Same reason, and the accounts are yours.
//   · It does not spend anything. It cannot — there is nothing wired to a card.
//
// What it does do is notice, which is most of what running something is.
import Agent from './base.js';
import config from '../core/config.js';
import { getVenture, listVentures, recordVentureRevenue, ventureRevenue } from '../ventures/pipeline.js';
import { getSetting, setSetting, one } from '../core/db.js';
import { ask } from '../core/approvals.js';
import { money, truncate } from '../core/util.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DAY = 86400000;

export class Operator extends Agent {
  constructor() {
    super({
      id: 'operator',
      name: 'The Operator',
      title: 'runs what is live',
      division: 'ventures',
      station: 'warehouse',
      colour: '#d8c48f',
      handles: ['operator.check', 'operator.report'],
      voice:
        'Plain and short. One number, one next action. Never says "consider" — says what to do.',
      purpose: `
You run the ventures that are live. Nobody else does, and before you existed
they were folders on a disk that nothing ever opened.

Every check, you answer four questions in this order:
1. Is it reachable? A site nobody can load earns nothing, and the owner is
   usually the last to find out.
2. Has anybody signed up since last time?
3. Has anybody paid?
4. What is the single next thing the owner should do today?

Rules you do not break:
- You never send email to a customer or post anywhere public. You draft; the
  owner sends. Mail sent as somebody else, unattended, is how a domain gets
  blocked.
- You never spend money.
- You say "no signups" plainly when there are none. Six weeks of nothing is
  the most useful thing you can tell somebody, and the hardest to hear.
- One next action, not a list. A list is a way of not choosing.`,
    });
  }

  async handle(job) {
    if (job.kind === 'operator.report') return this.report(job);
    return this.check(job);
  }

  /**
   * Is the site up?
   *
   * Cheap, and the thing most likely to be quietly wrong: a deploy that
   * failed, a Worker that was never published, a project renamed. The owner
   * finds out weeks later from a friend, if at all.
   */
  async reachable(url) {
    if (!url) return { checked: false, why: 'no URL recorded yet' };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      clearTimeout(timer);
      const body = res.ok ? await res.text() : '';
      return {
        checked: true,
        ok: res.ok,
        status: res.status,
        // A 200 that serves Cloudflare's placeholder is not the site being up.
        looksReal: body.length > 500 && !/placeholder|not.{0,3}found|coming soon/i.test(body.slice(0, 2000)),
      };
    } catch (err) {
      return { checked: true, ok: false, status: 0, why: err.message };
    }
  }

  async check(job) {
    const venture = job.payload?.ventureId
      ? getVenture(job.payload.ventureId)
      : listVentures("WHERE stage = 'live' ORDER BY updated_at ASC")[0];
    if (!venture) return { result: { skipped: 'nothing live yet' } };

    this.moveTo('warehouse', `checking ${venture.name}`);

    const site = await this.reachable(venture.url);
    const revenue = ventureRevenue(venture.id);
    const signups = this.countSignups(venture);
    const age = Math.floor((Date.now() - Number(venture.created_at || Date.now())) / DAY);

    // --- the site is down --------------------------------------------------
    // Loudest thing this agent can say, because everything else is moot.
    if (site.checked && !site.ok) {
      this.say(
        `${venture.name} is not loading${site.status ? ` (HTTP ${site.status})` : ''}${
          site.why ? `: ${site.why}` : ''
        }. Nothing can sell while it is down — check the deploy before anything else.`,
        { kind: 'venture', level: 'error', meta: { ventureId: venture.id, url: venture.url } }
      );
      this.goHome();
      return { result: { down: true, status: site.status } };
    }

    // --- it is up but nothing is happening ---------------------------------
    const next = this.nextAction({ venture, signups, revenue, age, site });
    this.say(
      `${venture.name}: ${site.checked ? 'up' : 'not deployed yet'}, ${signups} signup(s), ` +
        `${money(revenue, config.currency)} earned, ${age} days old. Next: ${next.what}`,
      {
        kind: 'venture',
        level: revenue > 0 ? 'good' : signups > 0 ? 'info' : 'warn',
        meta: { ventureId: venture.id, signups, revenue },
      }
    );

    // --- the honest conversation -------------------------------------------
    // Somebody has to say it. A venture that has been up for a month with
    // nothing to show is not a venture that needs more features.
    if (next.askOwner) {
      ask({
        kind: 'venture-call',
        refId: venture.id,
        agent: this.id,
        station: 'warehouse',
        title: `${venture.name}: ${age} days, ${signups} signups, ${money(revenue, config.currency)}. Keep going?`,
        detail: next.detail,
        options: [
          { value: 'keep', label: 'Keep going — I will do the next thing' },
          { value: 'pivot', label: 'Same problem, different approach' },
          { value: 'stop', label: 'Stop it and free the slot' },
        ],
      });
    }

    this.goHome();
    return { result: { signups, revenue, next: next.what } };
  }

  /**
   * Signups, read from wherever they actually are.
   *
   * The local dev server writes a JSON file; the deployed Worker writes to KV,
   * which this cannot read without a token it deliberately does not have. So
   * this reports what it can see and says so, rather than reporting zero and
   * being wrong.
   */
  countSignups(venture) {
    if (!venture.dir) return 0;
    const path = join(config.root, venture.dir, 'data', 'waitlist.json');
    if (!existsSync(path)) return 0;
    try {
      const rows = JSON.parse(readFileSync(path, 'utf8'));
      return Array.isArray(rows) ? rows.length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * The one thing to do next.
   *
   * Ordered by what actually stops a venture: not being online, then nobody
   * knowing, then nobody paying. A list of five things is a way of choosing
   * none of them, so this returns exactly one.
   */
  nextAction({ venture, signups, revenue, age, site }) {
    const dir = venture.dir || 'the venture folder';

    if (!venture.url) {
      return {
        what: `put it online — \`npx wrangler pages deploy public\` in ${dir}, then paste the URL into the Warehouse.`,
        detail:
          `${venture.name} has been built but never deployed, so nobody can reach it. ` +
          `${dir}/DEPLOY.md is four steps and costs nothing.`,
        askOwner: age > 7,
      };
    }

    if (site.checked && site.ok && !site.looksReal) {
      return {
        what: 'the URL loads but does not look like the site — check the deploy went to the right project.',
        detail: 'A placeholder page is worse than a 404: it looks fine to you and dead to everyone else.',
        askOwner: false,
      };
    }

    if (!signups) {
      return {
        what: `reply to the people in ${dir}/SELL.md. Nobody has signed up, and nobody knows it exists.`,
        detail:
          `${venture.name} has been up for ${age} days with no signups. That is not a product problem yet — ` +
          `it is that nobody has been told. ${dir}/SELL.md lists the exact threads the evidence came from, ` +
          'with the people who described this problem in their own words. Reply to them, individually, ' +
          'helpfully. If nothing comes back from that, the idea is the problem and it is worth knowing.',
        askOwner: age >= 21,
      };
    }

    if (!revenue) {
      return {
        what: `ask the ${signups} people who signed up what they would expect it to cost.`,
        detail:
          `${signups} people want it and none have paid. Ask them what they would expect to pay — the ` +
          'number tells you more than a yes does. If the payment link is not up yet, ' +
          `${dir}/DEPLOY.md step 4 is a Stripe Payment Link, which is free to set up and takes a cut only ` +
          'when somebody pays.',
        askOwner: age >= 30,
      };
    }

    return {
      what: `it is earning. Ask the paying customers what they nearly did not buy, and fix that.`,
      detail: `${venture.name} has taken ${money(revenue, config.currency)}. The next thing is not a feature — ` +
        'it is finding out what almost stopped each of them buying.',
      askOwner: false,
    };
  }

  /** A weekly line for the Warehouse, so a quiet venture is still visible. */
  async report(job) {
    const live = listVentures("WHERE stage = 'live'");
    if (!live.length) {
      this.say('Nothing is live yet.', { kind: 'venture', discord: false });
      return { result: { live: 0 } };
    }
    const lines = live.map((v) => {
      const earned = ventureRevenue(v.id);
      return `${v.name}: ${money(earned, config.currency)}${v.url ? '' : ' (never deployed)'}`;
    });
    this.say(`Live ventures — ${lines.join(' · ')}`, { kind: 'venture', level: 'info' });
    setSetting('last_operator_report', String(Date.now()));
    return { result: { live: live.length } };
  }
}

export default Operator;
