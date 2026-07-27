// What is actually selling on Etsy right now, for a phrase a buyer would type.
//
// Until this file existed the shop's "research" was the Researcher asking a
// model what it reckoned, or falling back to a built-in corpus. Both are
// guesses. Etsy publishes its own active listings against a keyword search
// with nothing but an api key, and that is real data about a real marketplace:
// how many people are already selling this, what they charge, and the exact
// words in the titles that are ranking.
//
// What this deliberately does not do:
//
//   · It does not scrape. This is Etsy's documented public search endpoint,
//     called at a walking pace, and it stops the moment Etsy says no.
//   · It does not copy anybody's listing. The phrases it counts are used to
//     tell the Scout where the gaps are, never to reproduce a competitor's
//     title — the Inspector rejects that anyway.
//   · It does not need a shop, a token or a sign-in. A keystring is enough.
import { all, one, insert, update, count } from '../core/db.js';
import { uid, now } from '../core/util.js';
import { log } from '../core/events.js';
import { publicCall } from './api.js';
import config from '../core/config.js';

const GAP_MS = 1400;
let lastCall = 0;

/** Etsy asks for a gentle pace, and there is no hurry here. */
async function paced(fn) {
  const wait = Math.max(0, GAP_MS - (Date.now() - lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  return fn();
}

/** Words that tell you nothing about what a listing is. */
const NOISE = new Set([
  'the', 'and', 'for', 'with', 'your', 'you', 'this', 'that', 'from', 'our',
  'printable', 'digital', 'download', 'instant', 'pdf', 'print', 'printables',
  'template', 'templates', 'file', 'files', 'a4', 'letter', 'us', 'uk', 'set',
  'new', 'best', 'top', 'sale', 'gift', 'gifts', 'gbp', 'usd',
]);

const words = (text) =>
  String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !NOISE.has(w));

const median = (numbers) => {
  if (!numbers.length) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Ask Etsy what is live for a phrase.
 *
 * @param {string} keyword
 * @param {number} limit how many listings to look at, max 100
 * @returns {Promise<{keyword, listings, prices, titles}>}
 */
export async function searchActive(keyword, limit = 60) {
  const params = new URLSearchParams({
    keywords: keyword,
    limit: String(Math.min(100, limit)),
    sort_on: 'score',
    sort_order: 'desc',
  });
  const data = await paced(() => publicCall(`/application/listings/active?${params}`));
  const results = data.results || [];
  return {
    keyword,
    // What Etsy says the whole result set is, not just this page — that is the
    // number that tells you how crowded a phrase is.
    listings: Number(data.count ?? results.length),
    prices: results
      .map((r) => Number(r.price?.amount || 0) / Number(r.price?.divisor || 100))
      .filter((p) => p > 0),
    titles: results.map((r) => String(r.title || '')),
  };
}

/**
 * One phrase, summarised into something the Scout can act on.
 *
 * "Crowded" and "quiet" are the two things that decide whether a good idea is
 * worth building: a phrase with forty thousand listings is a phrase you will
 * never be seen on, however good the product.
 */
export function summarise(found) {
  const { keyword, listings, prices, titles } = found;
  const counted = new Map();
  for (const title of titles) {
    // Count each word once per listing, not once per mention — otherwise a
    // single keyword-stuffed title decides what the whole market looks like.
    for (const word of new Set(words(title))) {
      counted.set(word, (counted.get(word) || 0) + 1);
    }
  }
  const phrases = [...counted]
    .filter(([, n]) => n >= Math.max(2, Math.round(titles.length * 0.15)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, n]) => ({ word, inListings: n }));

  const competition = listings > 25000 ? 'crowded' : listings > 5000 ? 'moderate' : 'quiet';

  return {
    keyword,
    listings,
    competition,
    priceLow: prices.length ? Math.min(...prices) : 0,
    priceMedian: Number(median(prices).toFixed(2)),
    priceHigh: prices.length ? Math.max(...prices) : 0,
    sampled: titles.length,
    phrases,
  };
}

/** Store a reading, keeping the previous one so movement is visible. */
export function record(summary) {
  const existing = one('SELECT * FROM market WHERE keyword = ?', summary.keyword);
  const row = {
    keyword: summary.keyword,
    listings: summary.listings,
    competition: summary.competition,
    price_low: summary.priceLow,
    price_median: summary.priceMedian,
    price_high: summary.priceHigh,
    sampled: summary.sampled,
    phrases: summary.phrases,
    checked_at: now(),
  };
  if (existing) {
    update('market', existing.id, { ...row, was_listings: existing.listings });
    return { ...row, id: existing.id, wasListings: existing.listings };
  }
  const id = uid('mkt');
  insert('market', { id, ...row, was_listings: null });
  return { ...row, id, wasListings: null };
}

/**
 * Phrases worth checking, drawn from what the shop is actually doing.
 *
 * Research that is not about your own catalogue is a hobby. These come from
 * the tags on your own listings, the categories you sell in, and the ideas
 * waiting for a decision — in that order, because the first is the only one
 * with money behind it.
 */
export function keywordsToCheck(limit = 8) {
  const seen = new Set();
  const out = [];
  const add = (value) => {
    const keyword = String(value || '').toLowerCase().trim();
    if (!keyword || keyword.length < 4 || seen.has(keyword)) return;
    seen.add(keyword);
    out.push(keyword);
  };

  // Tags the shop is already betting on.
  for (const row of all("SELECT tags FROM listings WHERE IFNULL(tags,'') != '' ORDER BY updated_at DESC LIMIT 40")) {
    try {
      for (const tag of JSON.parse(row.tags) || []) add(tag);
    } catch {
      // A malformed tag blob is not worth stopping research for.
    }
  }

  // Then what is waiting to be decided, so the reading arrives before the
  // decision does rather than after it.
  for (const row of all("SELECT title, category FROM ideas WHERE status = 'proposed' ORDER BY score DESC LIMIT 20")) {
    add(row.category);
    add(row.title?.split('—')[0]);
  }

  // Longest first: a specific phrase is worth more than a broad one, and the
  // broad ones are already crowded beyond reach.
  return out.sort((a, b) => b.length - a.length).slice(0, limit);
}

/**
 * Read the market for a handful of phrases.
 *
 * Never throws. A source that refuses is reported and the sweep carries on —
 * a scan that dies on its first 403 is a scan that never runs twice.
 *
 * @returns {Promise<{checked: object[], failed: object[], reason: string}>}
 */
export async function sweep(keywords = keywordsToCheck()) {
  if (!config.etsy.keystring) {
    return {
      checked: [],
      failed: [],
      reason: 'ETSY_KEYSTRING is empty in .env, so there is nothing to ask Etsy with.',
    };
  }
  if (!keywords.length) {
    return { checked: [], failed: [], reason: 'Nothing to look up yet — the shop has no tags or ideas.' };
  }

  const checked = [];
  const failed = [];
  for (const keyword of keywords) {
    try {
      checked.push(record(summarise(await searchActive(keyword))));
    } catch (err) {
      failed.push({ keyword, why: err.message });
      // A 403 or 429 means every following call will fail the same way. Stop.
      if (err.status === 403 || err.status === 429) {
        return {
          checked,
          failed,
          reason: `Etsy stopped answering (${err.status}). Backing off rather than hammering it.`,
        };
      }
    }
  }
  return { checked, failed, reason: '' };
}

/** The latest reading for each phrase, freshest first. */
export const recentMarket = (limit = 20) =>
  all('SELECT * FROM market ORDER BY checked_at DESC LIMIT ?', limit).map(hydrate);

/** The quiet corners: real demand, few sellers. Where a small shop can win. */
export const openings = (limit = 6) =>
  all(
    "SELECT * FROM market WHERE competition != 'crowded' AND listings > 100 ORDER BY listings ASC LIMIT ?",
    limit
  ).map(hydrate);

export const marketSize = () => count('SELECT COUNT(*) FROM market');

function hydrate(row) {
  let phrases = [];
  try {
    phrases = JSON.parse(row.phrases) || [];
  } catch {
    phrases = [];
  }
  return {
    keyword: row.keyword,
    listings: Number(row.listings || 0),
    wasListings: row.was_listings === null ? null : Number(row.was_listings),
    competition: row.competition,
    priceLow: Number(row.price_low || 0),
    priceMedian: Number(row.price_median || 0),
    priceHigh: Number(row.price_high || 0),
    sampled: Number(row.sampled || 0),
    phrases,
    checkedAt: Number(row.checked_at || 0),
  };
}

/**
 * What the Scout and the Researcher get told, in words rather than numbers.
 *
 * A prompt full of figures is a prompt the model averages away. Three
 * sentences about where the gaps are does more.
 */
export function marketBlock(limit = 6) {
  const rows = recentMarket(limit);
  if (!rows.length) return '';
  const lines = rows.map((r) => {
    const move =
      r.wasListings && r.wasListings !== r.listings
        ? ` (${r.listings > r.wasListings ? 'up' : 'down'} from ${r.wasListings.toLocaleString()})`
        : '';
    return `- "${r.keyword}": ${r.listings.toLocaleString()} live listings${move}, ${r.competition}, ` +
      `typical price ${config.currency} ${r.priceMedian.toFixed(2)}`;
  });
  const gaps = openings(3);
  return [
    'What Etsy actually looks like right now, read from live listings:',
    ...lines,
    gaps.length
      ? `The least crowded of these is "${gaps[0].keyword}" — that is where a new listing has a chance of being seen.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export default { searchActive, summarise, sweep, recentMarket, openings, marketBlock };
