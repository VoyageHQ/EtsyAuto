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
    const tag = cleanTag(raw);
    if (!tag || tag.length < 3 || seen.has(tag)) return;
    // Etsy ignores near-identical tags, so skip anything already covered.
    seen.add(tag);
    tags.push(tag);
  };

  for (const keyword of keywords) add(keyword);
  if (context.category) add(context.category);
  if (context.audience) add(shortAudience(context.audience));
  for (const extra of UNIVERSAL) {
    if (tags.length >= LIMITS.tagCount) break;
    add(extra);
  }
  return tags.slice(0, LIMITS.tagCount);
}

function shortAudience(audience) {
  const words = String(audience)
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !STOPWORDS.has(w));
  return words.slice(0, 3).join(' ');
}

/**
 * Etsy shows roughly the first 40 characters in search, so the searchable
 * phrase goes first, then the detail, then the format.
 */
export function buildTitle({ name, keyword, audience, format }) {
  const lead = titleCase(name);
  const parts = [lead];
  const bits = [];
  if (keyword && !lead.toLowerCase().includes(String(keyword).toLowerCase())) {
    bits.push(titleCase(keyword));
  }
  if (audience) bits.push(shortAudience(audience).replace(/^./, (c) => c.toUpperCase()));
  if (format) bits.push(format);
  bits.push('Printable PDF', 'Instant Download', 'A4 & US Letter');

  let title = parts[0];
  for (const bit of bits) {
    const candidate = `${title} | ${bit}`;
    if (candidate.length > LIMITS.title) continue;
    if (title.toLowerCase().includes(bit.toLowerCase())) continue;
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
