// How findable the shop is, listing by listing and as a whole.
//
// `seo.js` builds a legal listing and `auditListing` checks it is not broken.
// This is a different question: not "is this valid" but "will anybody find it,
// and is the shop competing with itself".
//
// Two things it is careful about, both from the shop's own knowledge:
//
//   · Changing a live listing's title or tags resets what Etsy has learned
//     about it. So a listing that changed recently is left alone however
//     improvable it looks — churn is worse than an imperfect title.
//   · Findings are ranked by what they cost. "Only 6 of 13 tags" is traffic
//     left on the table; "two listings chasing the same phrase" is the shop
//     bidding against itself. They are not the same size of problem.
import { all, json } from '../core/db.js';
import { LIMITS, cleanTag } from './seo.js';
import { rulesFor } from '../knowledge/index.js';
import { spellingVariants } from '../knowledge/apply.js';
import { tokens, similarity } from '../core/similarity.js';

const DAY = 86400000;

/** Words too generic to count as a term the shop "covers". */
const GENERIC = new Set([
  'printable', 'printables', 'pdf', 'digital', 'download', 'instant', 'template',
  'templates', 'planner', 'tracker', 'chart', 'sheet', 'pack', 'set', 'a4',
  'letter', 'us', 'print', 'home', 'undated', 'page', 'pages',
]);

const meaningful = (tag) =>
  String(tag)
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !GENERIC.has(word));

/**
 * Everything the shop has listed, with its search-facing fields.
 * @returns {{id, sku, title, tags, description, price, category, stage, updatedAt, live}[]}
 */
export function listingsForAudit() {
  return all(
    `SELECT p.id, p.sku, p.title AS product_title, p.category, p.stage, p.price, p.updated_at,
            l.title, l.tags, l.description, l.status, l.updated_at AS listing_updated
       FROM products p
       JOIN listings l ON l.product_id = p.id
      WHERE p.status != 'abandoned'`
  ).map((row) => ({
    id: row.id,
    sku: row.sku,
    title: row.title || row.product_title,
    tags: json(row.tags, []),
    description: row.description || '',
    category: row.category,
    price: row.price,
    stage: row.stage,
    live: row.status === 'live' || row.status === 'exported' || row.stage === 'listed',
    updatedAt: Number(row.listing_updated || row.updated_at || 0),
  }));
}

/**
 * What is wrong with one listing's findability.
 *
 * @param {object} listing from listingsForAudit
 * @param {object} [options]
 * @param {number} [options.settleDays] how long a live listing is left alone after a change
 * @returns {{severity, area, what, fix}[]}
 */
export function auditOne(listing, { settleDays = 28 } = {}) {
  const found = [];
  const add = (severity, area, what, fix) => found.push({ severity, area, what, fix, sku: listing.sku });

  const title = String(listing.title || '');
  const tags = (listing.tags || []).map((tag) => String(tag).toLowerCase());
  const lead = title.slice(0, 60);

  // --- the title ---------------------------------------------------------
  const leadWords = meaningful(lead.replace(/\|/g, ' '));
  if (!leadWords.length) {
    add('bad', 'title', 'The first 60 characters carry no searchable words.',
      'Put the phrase a buyer would type at the very front — it is all they see under a thumbnail.');
  }

  // Etsy matches phrases across title AND tags, and the strongest signal is the
  // same phrase present in both.
  const titleBag = tokens(title);
  const anchored = tags.filter((tag) => meaningful(tag).every((word) => titleBag.has(word)));
  if (tags.length && !anchored.length) {
    add('bad', 'search', 'No tag repeats a phrase from the title.',
      'Etsy ranks a phrase highest when it is in the title and a tag. Make at least three tags match phrases in the title.');
  } else if (anchored.length < 3 && tags.length >= 6) {
    add('poor', 'search', `Only ${anchored.length} tag(s) echo the title.`,
      'Three or four tags that repeat title phrases is what makes those phrases rank.');
  }

  if (title.length > LIMITS.title) {
    add('bad', 'title', `The title is ${title.length} characters; Etsy allows ${LIMITS.title}.`, 'Cut it.');
  } else if (title.length < 70) {
    add('note', 'title', `The title is only ${title.length} characters of ${LIMITS.title}.`,
      'Unused title is unused search surface. Add a second real phrase a different buyer would type.');
  }

  // --- the tags ----------------------------------------------------------
  if (tags.length < LIMITS.tagCount) {
    add(tags.length < 8 ? 'bad' : 'poor', 'tags',
      `${tags.length} of ${LIMITS.tagCount} tags used.`,
      `Every empty tag is a search you cannot appear in. Add ${LIMITS.tagCount - tags.length} more.`);
  }

  const singles = tags.filter((tag) => tag.trim().split(/\s+/).length === 1);
  if (singles.length > 2) {
    add('poor', 'tags', `${singles.length} single-word tags: "${singles.slice(0, 4).join('", "')}".`,
      'Single words compete with the whole marketplace. Two and three word phrases are what people actually type.');
  }

  // Two tags meaning the same thing waste a slot Etsy will not give back.
  const overlapping = [];
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      if (similarity(tags[i], tags[j]) >= 0.7) overlapping.push(`${tags[i]} / ${tags[j]}`);
    }
  }
  if (overlapping.length) {
    add('poor', 'tags', `Tags that say the same thing: ${overlapping.slice(0, 3).join(', ')}.`,
      'Etsy treats these as one. Free the slot for a phrase you are not covering.');
  }

  const missingVariants = spellingVariants(tags).filter((variant) => !tags.includes(variant));
  if (missingVariants.length && tags.length >= LIMITS.tagCount) {
    add('note', 'tags', `Etsy treats "${missingVariants[0]}" as a different word to the one you used.`,
      'Worth swapping a weak tag for it if you sell to both spellings.');
  }

  const tooLong = tags.filter((tag) => tag.length > LIMITS.tagLength);
  if (tooLong.length) {
    add('bad', 'tags', `Tags over ${LIMITS.tagLength} characters: "${tooLong.join('", "')}".`, 'Etsy will refuse these.');
  }

  // --- the description ---------------------------------------------------
  const description = String(listing.description || '');
  const opening = description.slice(0, 160).toLowerCase();
  const headTerm = leadWords.slice(0, 2).join(' ');
  if (headTerm && !opening.includes(leadWords[0])) {
    add('poor', 'description', 'The first 160 characters do not contain the main search phrase.',
      'Google shows those characters as the snippet, and Etsy weighs the opening. Lead with what it is.');
  }
  if (description.length < (rulesFor('copywriter').description?.minChars ?? 400)) {
    add('poor', 'description', `The description is ${description.length} characters.`,
      'Thin descriptions convert worse and give Etsy less to match against.');
  }

  // --- do not churn ------------------------------------------------------
  // Every finding above may be true and still not worth acting on yet.
  const age = Date.now() - Number(listing.updatedAt || 0);
  if (listing.live && age < settleDays * DAY && found.length) {
    const days = Math.ceil((settleDays * DAY - age) / DAY);
    return [
      {
        severity: 'note',
        area: 'settling',
        sku: listing.sku,
        what: `${found.length} thing(s) could be improved, but this listing changed ${Math.floor(age / DAY)} days ago.`,
        fix: `Changing a live listing resets what Etsy has learned about it. Leave it ${days} more days, then act.`,
      },
    ];
  }

  return found;
}

/**
 * What is wrong across the whole shop.
 *
 * The per-listing checks cannot see this: two listings can each be perfect and
 * still be the shop's own worst competitor.
 */
export function auditShop(listings = listingsForAudit()) {
  const found = [];
  const add = (severity, area, what, fix) => found.push({ severity, area, what, fix, sku: null });

  if (listings.length < 2) return found;

  // --- competing with itself --------------------------------------------
  for (let i = 0; i < listings.length; i++) {
    for (let j = i + 1; j < listings.length; j++) {
      const a = listings[i];
      const b = listings[j];
      const shared = (a.tags || []).filter((tag) => (b.tags || []).includes(tag));
      const score = similarity(`${a.title} ${(a.tags || []).join(' ')}`, `${b.title} ${(b.tags || []).join(' ')}`);
      if (score >= 0.55 || shared.length >= 7) {
        add(
          'bad',
          'cannibalising',
          `${a.sku} and ${b.sku} are chasing the same searches (${shared.length} identical tags).`,
          'Etsy shows one listing per shop per search. Point one at a different buyer — a different audience, ' +
            'a different occasion — or bundle them and sell the pair.'
        );
      }
    }
  }

  // --- how much ground the shop covers ----------------------------------
  // Counted per listing, not per tag. A word used in four of one listing's
  // tags is still one listing covering it, and counting occurrences produced
  // the nonsense "meal appears in 6 of 3 listings".
  const terms = new Map();
  for (const listing of listings) {
    const words = new Set((listing.tags || []).flatMap(meaningful));
    for (const word of words) terms.set(word, (terms.get(word) || 0) + 1);
  }
  const distinct = [...terms.keys()].length;
  if (distinct && distinct < listings.length * 4) {
    add('poor', 'coverage', `The whole shop covers only ${distinct} distinct search words.`,
      'A shop is found through the breadth of what it targets. Products for genuinely different buyers widen it; ' +
        'more of the same narrows it.');
  }

  const dominant = [...terms.entries()].sort((a, b) => b[1] - a[1])[0];
  if (dominant && listings.length >= 3 && dominant[1] >= listings.length * 0.8) {
    add('note', 'coverage', `"${dominant[0]}" appears in ${dominant[1]} of ${listings.length} listings.`,
      'Being known for one thing is good; being invisible outside it is not. Worth one product aimed elsewhere.');
  }

  // --- categories --------------------------------------------------------
  const categories = new Set(listings.map((l) => l.category).filter(Boolean));
  if (listings.length >= 4 && categories.size === 1) {
    add('note', 'coverage', `Every listing is in "${[...categories][0]}".`,
      'One category is a clear shop. Two or three is a shop that gets found more ways.');
  }

  return found;
}

/**
 * The whole sweep, ranked worst first.
 * @returns {{findings: object[], counts: object, checked: number, score: string, summary: string}}
 */
export function sweep({ settleDays = 28 } = {}) {
  const listings = listingsForAudit();
  const findings = [
    ...listings.flatMap((listing) => auditOne(listing, { settleDays })),
    ...auditShop(listings),
  ];

  const order = ['bad', 'poor', 'note'];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  const counts = {
    bad: findings.filter((f) => f.severity === 'bad').length,
    poor: findings.filter((f) => f.severity === 'poor').length,
    note: findings.filter((f) => f.severity === 'note').length,
  };

  return {
    checked: listings.length,
    findings,
    counts,
    score: counts.bad ? 'bad' : counts.poor ? 'poor' : 'good',
    summary: listings.length
      ? counts.bad || counts.poor
        ? `${listings.length} listing(s) checked — ${counts.bad} costing you searches, ${counts.poor} worth fixing.`
        : `${listings.length} listing(s) checked. Nothing hurting your search position.`
      : 'Nothing listed yet.',
  };
}

export default sweep;
