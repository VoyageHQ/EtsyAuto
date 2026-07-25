// THE BUILDER — turns the plan into files that run.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Agent from './base.js';
import config from '../core/config.js';
import { getVenture, advanceVenture, recordVentureAsset, ventureDir } from '../ventures/pipeline.js';
import { scaffoldVenture } from '../ventures/scaffold.js';
import { money } from '../core/util.js';

export class Builder extends Agent {
  constructor() {
    super({
      id: 'builder',
      name: 'The Builder',
      title: 'MVP scaffolder',
      division: 'ventures',
      station: 'boatyard',
      colour: '#c98f6a',
      handles: ['builder.build'],
      voice: 'Says what it built, where it is, and what is still missing. Never claims a scaffold is a product.',
      purpose: `
You produce the first version: a landing page that states the problem in the
buyer's own words, a working signup capture, a pricing page ready for real
payment links, and a server that runs with no install.

You are honest about the boundary. What you produce is a real, running start —
not a finished product. The core feature that makes the venture worth paying
for is written up in the plan for the owner to build, and you say so plainly
rather than implying it is done.`,
    });
  }

  async handle(job) {
    const venture = getVenture(job.payload.ventureId);
    if (!venture) return { result: { skipped: 'venture gone' } };
    this.moveTo('boatyard', `building ${venture.name}`);

    const built = scaffoldVenture(venture);
    this.writePlanDoc(venture);

    const m = venture.monetisation || {};
    this.say(
      `${venture.name} scaffolded in ${built.dir}/ — ${built.files.length} files. ` +
        `Run it with "node server.js". Landing page, waitlist and ${
          m.tiers?.length || 1
        } pricing tier(s) at ${money(m.price, config.currency)}. ` +
        'The core feature itself is still yours to build — PLAN.md says which one and in what order.',
      { kind: 'built', level: 'good', meta: { ventureId: venture.id, dir: built.dir } }
    );

    advanceVenture(venture, { dir: built.dir, status: 'building' });
    this.goHome();
    return { result: { dir: built.dir, files: built.files.length } };
  }

  /** The plan, written where you will actually read it: next to the code. */
  writePlanDoc(venture) {
    const plan = venture.plan || {};
    const m = venture.monetisation || {};
    const rel = `${ventureDir(venture)}/PLAN.md`;
    const body = `# Build plan — ${venture.name}

${plan.mvpGoal || venture.one_liner}

**Done looks like:** ${plan.successMetric || 'first paying customer'}

## Build these, in this order
${(plan.mustHave || []).map((f, i) => `${i + 1}. ${f}`).join('\n') || '1. The core action'}

The scaffold already covers the landing page, the waitlist and the pricing
page. Everything above that is not one of those is yours to write — that is
the part nobody can generate for you, because it is the actual product.

## Timeline
${(plan.milestones || []).map((ms) => `- **Week ${ms.week}** ${ms.deliver}`).join('\n')}

## Deliberately not building yet
${(plan.notBuilding || []).map((n) => `- ${n}`).join('\n')}

Every one of these is a real decision. Adding them back early is the most
common way a two-week build becomes a six-month one.

## Stack
${plan.stack || 'Plain Node and static HTML.'}

## Where the first customer comes from
${plan.firstCustomerPlan || 'Go back to the threads the evidence came from and reply to the people in them.'}

## Money
${m.model || 'subscription'} at ${money(m.price, config.currency)}. ${m.firstPoundPath || ''}
Target: first payment within ${m.daysToRevenue || 60} days of starting.

## Evidence this problem is real
${(venture.evidence || [])
  .map((e) => `- "${e.quote}" — ${e.channel || e.source}${e.url ? ` (${e.url})` : ''}`)
  .join('\n') || '- None recorded, which is a reason to be careful.'}
`;

    writeFileSync(join(config.root, rel), body);
    recordVentureAsset({
      ventureId: venture.id,
      kind: 'doc',
      label: 'Build plan',
      path: rel,
      bytes: body.length,
    });
  }
}

export default Builder;
