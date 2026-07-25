// The Marketer's output: files you can act on, not a strategy deck.
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import config from '../core/config.js';
import { recordVentureAsset, ventureDir } from './pipeline.js';
import { money } from '../core/util.js';

/**
 * @param {object} venture
 * @param {object} plan the Marketer's plan object
 * @returns {{dir: string, files: string[]}}
 */
export function writeMarketingPack(venture, plan) {
  const rel = `${ventureDir(venture)}/marketing`;
  const dir = join(config.root, rel);
  mkdirSync(dir, { recursive: true });

  const files = [];
  const write = (name, contents, label) => {
    const abs = join(dir, name);
    writeFileSync(abs, contents);
    files.push(`${rel}/${name}`);
    recordVentureAsset({
      ventureId: venture.id,
      kind: 'marketing',
      label,
      path: `${rel}/${name}`,
      bytes: safeSize(abs),
    });
  };

  write('POSITIONING.md', positioning(venture, plan), 'Positioning');
  write('LAUNCH-PLAN.md', launchPlan(venture, plan), 'Launch plan');
  write('AD-COPY.md', adCopy(venture, plan), 'Ad copy');
  write('CONTENT-CALENDAR.csv', calendar(plan), 'Content calendar');
  write('KEYWORDS.md', keywords(venture, plan), 'Keywords');

  return { dir: rel, files };
}

const safeSize = (path) => {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
};

function positioning(venture, plan) {
  return `# Positioning — ${venture.name}

**One line** ${venture.one_liner}

**For** ${venture.audience}
**Who** ${plan.trigger || 'are already losing time to this every week'}
**It is a** ${plan.category || 'small focused tool'}
**That** ${plan.value || venture.solution}
**Unlike** ${plan.alternative || 'the spreadsheet they use now'}
**It** ${plan.differentiator || 'does the one job completely and gets out of the way'}

## The sentence to repeat everywhere
> ${plan.tagline || venture.one_liner}

Use it on the landing page, in the ad, in the reply, in the email footer. Do
not improve it every time you use it — repetition is the point.

## Words to use
${(plan.words || []).map((w) => `- ${w}`).join('\n') || '- the words the buyers used themselves'}

## Words to avoid
- "revolutionary", "seamless", "unlock", "leverage", "game changer"
- Anything you would not say to their face in a pub.

## Proof we can honestly claim today
${(venture.evidence || [])
  .slice(0, 3)
  .map((e) => `- Someone on ${e.channel || e.source} said: "${e.quote}"`)
  .join('\n') || '- None yet. Do not claim any until there is.'}

Never claim customer numbers, testimonials or results until they exist. It is
both wrong and the fastest way to lose the audience you are trying to win.
`;
}

function launchPlan(venture, plan) {
  const m = venture.monetisation || {};
  return `# Launch plan — ${venture.name}

Goal: **${plan.goal || 'first paying customer'}** within ${m.daysToRevenue || 60} days.

## Where these people already are
${(plan.channels || [])
  .map(
    (c) =>
      `### ${c.name}\n- **Why here** ${c.why}\n- **What to do** ${c.action}\n- **Cost** ${c.cost}\n- **Rules** ${c.rules}`
  )
  .join('\n\n') || 'No channels identified yet.'}

## Order of operations
${(plan.sequence || []).map((step, i) => `${i + 1}. ${step}`).join('\n')}

## The one rule for community channels
Reply to the person, do not announce the product. You found these people
because they described a problem in public. Going back with "I built the thing
you asked for" works. Posting a launch announcement to a community you have
never contributed to gets you banned, and deservedly.

## What we will not do
- Buy followers, reviews or engagement.
- Post the same message to twenty subreddits.
- DM people who did not ask.
- Run ads before at least ten people have said the landing page makes sense.

## Budget
${
  plan.budget
    ? `Approved: ${money(plan.budget, config.currency)}. Nothing is spent without you clicking approve, and no agent has access to a payment method.`
    : 'No paid spend proposed. Everything above is free to run.'
}
`;
}

function adCopy(venture, plan) {
  const variants = plan.ads || [];
  return `# Ad and post copy — ${venture.name}

Every variant below is honest: no invented results, no fake urgency, no claims
we cannot back up today. Test them one at a time.

${variants
  .map(
    (ad, i) => `## ${i + 1}. ${ad.channel} — ${ad.angle}

**Headline** ${ad.headline}

**Body** ${ad.body}

**Call to action** ${ad.cta}

_Best for:_ ${ad.bestFor || 'cold audience who have the problem but no vocabulary for it'}
`
  )
  .join('\n')}

## Reply template for the threads the evidence came from

> ${plan.replyTemplate || 'I saw your post about this. I had the same problem and ended up building something small for it — happy to share it if useful, and just as happy to tell you what did not work.'}

Send it as a reply, from a real account, to a real person, once.
`;
}

function calendar(plan) {
  const rows = plan.calendar || [];
  const header = 'week,day,channel,what to post,goal';
  const lines = rows.map(
    (row) =>
      [row.week, row.day, row.channel, row.what, row.goal]
        .map((cell) => {
          const value = String(cell ?? '');
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(',')
  );
  return [header, ...lines].join('\n') + '\n';
}

function keywords(venture, plan) {
  return `# Search terms — ${venture.name}

These come from how the buyers actually described the problem, not from a
keyword tool. That is why they convert.

## What they type when they have the problem
${(plan.keywords?.problem || []).map((k) => `- ${k}`).join('\n') || '- (none yet)'}

## What they type when they are looking for a tool
${(plan.keywords?.solution || []).map((k) => `- ${k}`).join('\n') || '- (none yet)'}

## Competitor and alternative terms
${(plan.keywords?.competitor || []).map((k) => `- ${k}`).join('\n') || '- (none yet)'}

## How to use them
- One page per problem phrase, answering that exact question properly.
- Put the phrase in the page title, the first sentence, and nowhere else
  unnaturally.
- The landing page targets the solution terms; the blog posts target the
  problem terms.
`;
}

export default writeMarketingPack;
