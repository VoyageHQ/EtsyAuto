// Etsy's rules, encoded once so no agent has to remember them.
//
//   title        140 characters max
//   tags         13 max, 20 characters each, no punctuation beyond spaces
//   materials    13 max, 45 characters each
//
// Anything that breaks a rule gets fixed here rather than rejected at upload.
import { truncate, titleCase } from '../core/util.js';

export const LIMITS = {
  title: 140,
  tagCount: 13,
  tagLength: 20,
  materialCount: 13,
  materialLength: 45,
};

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'with', 'of', 'to', 'in', 'my', 'your']);

/**
 * Adjectives that mean the phrase had not finished yet. Cutting an audience
 * after one of these leaves a fragment ("renters new", "parents busy") rather
 * than something a buyer would type.
 */
const DANGLING_ADJECTIVES = new Set([
  'new', 'old', 'busy', 'young', 'small', 'big', 'first', 'early', 'late',
  'tired', 'overwhelmed', 'serious', 'keen', 'fussy', 'newly',
]);

/** Words Etsy shoppers actually type, appended when there is room. */
const UNIVERSAL = [
  'printable',
  'instant download',
  'digital download',
  'pdf printable',
  'print at home',
  'a4 printable',
  'us letter',
  'undated',
];

export function cleanTag(raw) {
  const tag = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!tag) return '';
  if (tag.length <= LIMITS.tagLength) return tag;
  // Trim whole words off the end rather than cutting mid-word.
  const words = tag.split(' ');
  let out = '';
  for (const word of words) {
    const candidate = out ? `${out} ${word}` : word;
    if (candidate.length > LIMITS.tagLength) break;
    out = candidate;
  }
  return out;
}

/**
 * Build a legal, non-repetitive tag set.
 * @param {string[]} keywords the good stuff, most important first
 * @param {object} context { category, audience, format }
 */
export function buildTags(keywords = [], context = {}) {
  const seen = new Set();
  const tags = [];
  const add = (raw) => {
    if (tags.length >= LIMITS.tagCount) return;
    const tag = cleanTag(raw);
    if (!tag || tag.length < 3 || seen.has(tag)) return;
    // Etsy ignores near-identical tags, so skip anything already covered.
    seen.add(tag);
    tags.push(tag);
  };

  for (const keyword of keywords) add(keyword);
  if (context.category) add(context.category);
  if (context.audience) add(shortAudience(context.audience));

  // Leaving tag slots empty is leaving search traffic on the table, so top up
  // from the product's own words before falling back to the generic ones.
  for (const phrase of phrasesFromTitle(context.title)) add(phrase);
  for (const extra of UNIVERSAL) add(extra);

  return tags.slice(0, LIMITS.tagCount);
}

/**
 * Honest extra tags built from what the product is actually called — pairs of
 * neighbouring words, then single words qualified by format.
 *
 * Pairs are only ever taken from *within* one segment of the title. A title
 * reads "Habit Tracker Bundle | Water Planner | Printable PDF", and treating
 * that as one run of words produces "bundle water" and "planner printable" —
 * phrases nobody has ever typed into Etsy, each one burning a tag out of only
 * thirteen. Separators are where meaning stops, so the pairing stops there too.
 */
function phrasesFromTitle(title) {
  const segments = String(title || '')
    .toLowerCase()
    .split(/[|+&,/]|\s-\s/)
    .map((segment) =>
      segment
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    )
    .filter((words) => words.length);

  const phrases = [];
  for (const words of segments) {
    for (let i = 0; i < words.length - 1; i++) {
      phrases.push(`${words[i]} ${words[i + 1]}`);
    }
  }
  for (const word of segments.flat()) {
    for (const qualifier of ['printable', 'template', 'planner pdf']) {
      if (word === qualifier) continue;
      phrases.push(`${word} ${qualifier}`);
    }
  }
  return phrases;
}

/**
 * An audience, cut down to something a person would actually type.
 *
 * The Scout writes audiences as descriptions — "spring cleaners and
 * end-of-tenancy movers", "parents of 11-16 year olds" — and taking the first
 * three words of those gives "spring cleaners end-of-tenancy" and "parents
 * 11-16 year". Both are fragments, and both went straight into titles and tags.
 *
 * Cutting at the first connective instead lands on a whole idea, because that
 * is where English joins two of them.
 */
function shortAudience(audience) {
  const firstIdea = String(audience)
    .toLowerCase()
    .split(/\s+(?:and|or|plus|of|who|for|with|to)\s+|[,;/&]/)[0]
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word));

  // Two words is a phrase; three is usually a phrase with a tail on it.
  const pair = firstIdea.slice(0, 2);

  // "renters new to paying bills" cuts to "renters new", which is not a thing
  // anyone types. An adjective on the end is the giveaway that the phrase was
  // still going, so drop it and keep the noun that can stand alone.
  if (pair.length === 2 && DANGLING_ADJECTIVES.has(pair[1])) pair.pop();
  return pair.join(' ');
}

/**
 * Etsy shows roughly the first 40 characters in search, so the searchable
 * phrase goes first, then the detail, then the format.
 */
/**
 * Words that carry no meaning on their own, so repeating them costs nothing.
 * "Planner" appearing twice is fine; "Christmas Budget" appearing twice is the
 * problem.
 */
const NOISE_WORDS = new Set(['and', 'the', 'for', 'with', 'a', 'of', 'to', 'in', 'my', 'your', '&']);

const significantWords = (text) =>
  String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !NOISE_WORDS.has(word));

/**
 * Does this phrase mostly repeat what the title already says?
 *
 * An exact substring test is not enough. "Christmas Budget & Gift Planner"
 * does not literally contain "Christmas Budget Planner" — the "& Gift" breaks
 * it — so the keyword gets appended anyway and eats the first sixty
 * characters, which is the only part a buyer sees under a search thumbnail.
 * Repetition there buys nothing: Etsy does not rank a phrase higher for
 * appearing twice, and the buyer learns nothing new.
 */
function mostlyRepeats(title, bit) {
  const have = new Set(significantWords(title));
  const words = significantWords(bit);
  if (!words.length) return true;
  const already = words.filter((word) => have.has(word)).length;
  return already / words.length >= 0.6;
}

export function buildTitle({ name, keyword, audience, format }) {
  const lead = titleCase(name);
  const bits = [];
  if (keyword) bits.push(titleCase(keyword));
  if (audience) bits.push(shortAudience(audience).replace(/^./, (c) => c.toUpperCase()));
  if (format) bits.push(format);
  bits.push('Printable PDF', 'Instant Download', 'A4 & US Letter');

  let title = lead;
  for (const bit of bits) {
    const candidate = `${title} | ${bit}`;
    if (candidate.length > LIMITS.title) continue;
    // Skip anything that just says the same thing again — that slot is worth
    // more spent on a term the title does not already carry.
    if (mostlyRepeats(title, bit)) continue;
    title = candidate;
  }
  return truncate(title, LIMITS.title);
}

export function buildMaterials(spec) {
  const materials = ['PDF', 'Digital file'];
  if (spec?.sheets) materials.push('CSV spreadsheet');
  return materials
    .map((m) => truncate(m, LIMITS.materialLength))
    .slice(0, LIMITS.materialCount);
}

/** Anything wrong that a human should know about before publishing. */
export function auditListing(listing) {
  const problems = [];
  if (!listing.title) problems.push('No title.');
  if (listing.title && listing.title.length > LIMITS.title) {
    problems.push(`Title is ${listing.title.length} characters; Etsy allows ${LIMITS.title}.`);
  }
  if (/[!]{2,}|[A-Z]{6,}/.test(listing.title || '')) {
    problems.push('Title looks shouty. Etsy suppresses listings that read like spam.');
  }
  const tags = listing.tags || [];
  if (tags.length < 8) problems.push(`Only ${tags.length} tags. Use all ${LIMITS.tagCount}.`);
  for (const tag of tags) {
    if (tag.length > LIMITS.tagLength) problems.push(`Tag too long: "${tag}".`);
  }
  if (new Set(tags).size !== tags.length) problems.push('Duplicate tags.');
  if (!listing.description || listing.description.length < 300) {
    problems.push('Description is thin. Buyers of digital files read it before buying.');
  }
  if (listing.description && !/digital|download/i.test(listing.description)) {
    problems.push('Description never says it is a digital download. That causes refund requests.');
  }
  if (!(Number(listing.price) > 0)) problems.push('No price set.');
  return problems;
}

export default { buildTags, buildTitle, buildMaterials, auditListing, cleanTag, LIMITS };
