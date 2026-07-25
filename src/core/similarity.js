// Stopping the shop from competing with itself.
//
// Exact title matching is not enough: "Weekly Meal Planner" and "Meal Planner
// Weekly Printable" are the same product with different words. This is a plain
// token-overlap score — no embeddings, no API, no dependency — which is quite
// good enough to catch a near-copy.
import { all, json } from './db.js';

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'of', 'to', 'in', 'my', 'your',
  'printable', 'printables', 'pdf', 'digital', 'download', 'instant', 'template',
  'templates', 'edition', 'pack', 'set', 'planner', // 'planner' alone is too generic
]);

export function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP.has(word))
  );
}

/** Jaccard overlap, 0 to 1. */
export function similarity(a, b) {
  const left = a instanceof Set ? a : tokens(a);
  const right = b instanceof Set ? b : tokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}

/**
 * Everything the shop already has: proposed ideas, built products, and the
 * keywords attached to each. Loaded once per check, which is cheap at this size.
 */
export function catalogue() {
  const entries = [];
  for (const row of all('SELECT id, title, category, keywords, status FROM ideas')) {
    entries.push({
      kind: 'idea',
      id: row.id,
      title: row.title,
      category: row.category,
      status: row.status,
      bag: tokens(`${row.title} ${json(row.keywords, []).join(' ')}`),
    });
  }
  for (const row of all('SELECT id, sku, title, category FROM products')) {
    entries.push({
      kind: 'product',
      id: row.id,
      sku: row.sku,
      title: row.title,
      category: row.category,
      status: 'built',
      bag: tokens(row.title),
    });
  }
  return entries;
}

/**
 * The closest thing the shop already has to `title`.
 * @param {string} title
 * @param {object[]} [known] pass a cached catalogue() to avoid re-querying
 * @returns {{score: number, match: object|null}}
 */
export function closestMatch(title, known = catalogue()) {
  const bag = tokens(title);
  let best = { score: 0, match: null };
  for (const entry of known) {
    const score = similarity(bag, entry.bag);
    if (score > best.score) best = { score, match: entry };
  }
  return best;
}

/** Over this and it is the same product wearing a different hat. */
export const TOO_SIMILAR = 0.62;

/** Close enough that the two listings will fight each other in search. */
export const COMPETES = 0.42;

/**
 * A warning for the Researcher: is this going to cannibalise one of the shop's
 * own listings?
 * @returns {string|null}
 */
export function cannibalWarning(title, keywords = []) {
  const known = catalogue().filter((e) => e.kind === 'product' || e.status === 'built');
  const { score, match } = closestMatch(`${title} ${keywords.join(' ')}`, known);
  if (!match || score < COMPETES) return null;
  return (
    `This overlaps ${Math.round(score * 100)}% with the shop's own ${match.sku || 'product'} ` +
    `"${match.title}". Either aim it at a clearly different buyer, or make it a variant of that ` +
    'product rather than a rival to it.'
  );
}

export default similarity;
