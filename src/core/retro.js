// Learning from mistakes without waiting to be told.
//
// The Inspector rejecting the same kind of thing over and over is a waste of
// everyone's time. So failures are classified, counted, and the second time a
// pattern appears the responsible agent gets taught the rule that would have
// prevented it. You can see every lesson it writes in the Office, and delete
// any you disagree with.
import { all, count, insert, one } from './db.js';
import { uid, now } from './util.js';
import { log } from './events.js';
import { teach, lessonsFor } from './memory.js';

/**
 * Problem classes. Each one knows whose job it was and what the rule should be.
 * Order matters — the first match wins.
 */
const PATTERNS = [
  {
    id: 'broken-pdf',
    test: /not a valid pdf|truncated|missing file/i,
    agent: 'maker',
    lesson:
      'Check every page renders before finishing: no empty pages, and never fewer than two pages of real content.',
  },
  {
    id: 'thin-product',
    test: /single page|suspiciously small|thin for a paid/i,
    agent: 'maker',
    lesson:
      'A paid download needs at least four pages that each do a different job. If an idea only justifies one page, add a tracker page and a notes page rather than shipping it alone.',
  },
  {
    id: 'few-images',
    test: /listing images/i,
    agent: 'maker',
    lesson: 'Every product needs at least four listing images: hero, contents, details and a close-up.',
  },
  {
    id: 'thin-tags',
    test: /tags/i,
    agent: 'copywriter',
    lesson: 'Always use all 13 tags, each under 20 characters, with no two tags meaning the same thing.',
  },
  {
    id: 'thin-description',
    test: /description is thin/i,
    agent: 'copywriter',
    lesson:
      'Descriptions need at least 300 characters of genuinely useful text before the boilerplate: who it is for, what is on the pages, and how they will use it.',
  },
  {
    id: 'not-clearly-digital',
    test: /never says it is a digital download/i,
    agent: 'copywriter',
    lesson:
      'Say in the first three lines that this is an instant digital download and that nothing is posted. Buyers who miss that ask for refunds.',
  },
  {
    id: 'title-rules',
    test: /title/i,
    agent: 'copywriter',
    lesson:
      'Titles stay under 140 characters, lead with the phrase a buyer would search, and never shout in capitals or use exclamation marks.',
  },
  {
    id: 'no-price',
    test: /price/i,
    agent: 'researcher',
    lesson:
      'Always give a price range you can justify from what comparable listings charge, and never leave a product without one.',
  },
];

/** Which class of problem is this, and whose fault was it? */
export function classify(problem) {
  const text = String(problem || '');
  const match = PATTERNS.find((pattern) => pattern.test.test(text));
  if (match) return match;
  return {
    id: 'other-' + text.toLowerCase().replace(/[^a-z0-9]+/g, '-').split('-').slice(0, 4).join('-'),
    agent: null,
    lesson: null,
  };
}

/** How many times this problem has been seen before. */
export const timesSeen = (patternId) =>
  count('SELECT COUNT(*) FROM failures WHERE pattern = ?', patternId);

/**
 * Record a failed review and teach anything that has now happened twice.
 * @param {string} productId
 * @param {string[]} problems
 * @returns {{taught: string[], patterns: string[]}}
 */
export function recordFailures(productId, problems = []) {
  const taught = [];
  const patterns = [];

  for (const problem of problems) {
    const pattern = classify(problem);
    patterns.push(pattern.id);
    insert('failures', {
      id: uid('fail'),
      product_id: productId,
      agent_id: pattern.agent,
      pattern: pattern.id,
      detail: String(problem).slice(0, 300),
      created_at: now(),
    });

    if (!pattern.agent || !pattern.lesson) continue;
    if (timesSeen(pattern.id) < 2) continue;

    // Do not teach the same thing twice.
    const already = lessonsFor(pattern.agent).some((l) => l.text === pattern.lesson);
    if (already) continue;

    teach(pattern.agent, pattern.lesson, 'agent');
    taught.push(pattern.agent);
    log({
      agent: 'qa',
      station: 'review-hall',
      kind: 'retro',
      level: 'warn',
      message:
        `That is the second time I have seen "${pattern.id}", so I have taught ${pattern.agent} ` +
        'the rule that prevents it. Delete it in the Office if you disagree.',
      meta: { pattern: pattern.id, agent: pattern.agent },
    });
  }

  return { taught, patterns };
}

/** For the Review Hall panel: what keeps going wrong. */
export function failureSummary(limit = 8) {
  return all(
    `SELECT pattern, agent_id AS agent, COUNT(*) AS times, MAX(created_at) AS last, MAX(detail) AS example
     FROM failures GROUP BY pattern ORDER BY times DESC, last DESC LIMIT ?`,
    limit
  );
}

export const worstOffender = () => one(
  `SELECT agent_id AS agent, COUNT(*) AS times FROM failures
   WHERE agent_id IS NOT NULL GROUP BY agent_id ORDER BY times DESC LIMIT 1`
);

export default recordFailures;
