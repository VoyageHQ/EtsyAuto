// Making the packs bite.
//
// A lesson written in prose only changes behaviour when a model reads it. With
// LLM_PROVIDER=offline nobody reads anything, so the parts of the knowledge
// that can be expressed as a check live here and are called directly by the
// agents' offline paths. Same knowledge, enforced by code instead of by
// instruction.
import { rulesFor, allRules } from './index.js';

const lower = (text) => String(text ?? '').toLowerCase();

/**
 * Find any banned phrase in a piece of text.
 * @param {string} text
 * @param {string[]} phrases
 * @returns {string[]} the ones that matched
 */
export function findPhrases(text, phrases = []) {
  const haystack = lower(text);
  return phrases.filter((phrase) => {
    const needle = lower(phrase);
    // Some entries are patterns rather than plain words. Guessing which from
    // punctuation alone is not safe: a currency symbol like "$" is a perfectly
    // ordinary thing to ban from an image, but as a regex it is an anchor that
    // matches every string ever passed in. So compile it, then throw the
    // pattern away if it turns out to match nothing in particular.
    if (/[\\^$.*+?()[\]{}|]/.test(needle)) {
      try {
        const pattern = new RegExp(needle, 'i');
        if (!pattern.test('')) return pattern.test(haystack);
      } catch {
        // Not a valid pattern, so it was always meant literally.
      }
    }
    return haystack.includes(needle);
  });
}

/** Brand, character and programme names that must never appear anywhere. */
export function findTrademarks(...texts) {
  const rules = allRules();
  const haystack = texts.filter(Boolean).join(' ');
  return findPhrases(haystack, rules.trademarkTraps || []);
}

/** Marketing filler and unprovable claims. */
export function findBannedPhrases(...texts) {
  const rules = allRules();
  const haystack = texts.filter(Boolean).join(' ');
  return [
    ...findPhrases(haystack, rules.bannedPhrases || []),
    ...findPhrases(haystack, rules.forbiddenClaims || []),
  ];
}

/** Filler that marks copy as machine-written. */
export const findFiller = (text) => findPhrases(text, allRules().tellTaleFiller || []);

/** Unfinished content that should never ship. */
export const findPlaceholders = (text) => findPhrases(text, allRules().placeholderMarkers || []);

/** Language that has no place on a product aimed at neurodivergent buyers. */
export const findShameLanguage = (text) => findPhrases(text, rulesFor('maker').shameWords || []);

/**
 * Anything the listing promises that the shop does not actually ship.
 *
 * A shipped CSV genuinely satisfies "editable", "fillable" and every
 * spreadsheet name — it is an editable file. What it does not satisfy is a
 * promise of a Canva template, because none is produced.
 */
const SATISFIED_BY_SHEET = ['editable', 'fillable', 'excel', 'google sheets', 'csv', 'spreadsheet'];
const SATISFIED_BY_PDF = ['goodnotes']; // GoodNotes imports plain PDFs

export function findOverPromises(text, spec) {
  const promised = findPhrases(text, rulesFor('researcher').promiseWords || []);
  if (!promised.length) return [];

  const shipsSheet = Boolean(spec?.sheets);
  const shipsPdf = (spec?.pages || []).length > 0;

  return promised.filter((word) => {
    const w = lower(word);
    if (shipsSheet && SATISFIED_BY_SHEET.includes(w)) return false;
    if (shipsPdf && SATISFIED_BY_PDF.includes(w)) return false;
    return true;
  });
}

/**
 * Bring a price in line with what the shop has learned: never below the floor,
 * always on a charm ending, and inside the band for that kind of product.
 */
export function tidyPrice(price, kind = 'small pack') {
  const scout = rulesFor('scout');
  const researcher = rulesFor('researcher');
  const band = scout.priceBands?.[kind];
  let value = Number(price) || 0;

  if (band) value = Math.min(Math.max(value, band[0]), band[1]);
  value = Math.max(value, researcher.priceFloor ?? 2.5);

  // Land on .99 or .49, whichever is nearer, the way the marketplace prices.
  const whole = Math.floor(value);
  const options = [whole - 0.51, whole + 0.49, whole + 0.99];
  const nearest = options
    .filter((option) => option >= (researcher.priceFloor ?? 2.5))
    .sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0];
  return Number((nearest ?? value).toFixed(2));
}

/** Which price band a product belongs in, from what it actually is. */
export function bandFor({ pages = 0, sheets = false, format = '' } = {}) {
  const f = lower(format);
  if (f.includes('art')) return 'wall art set';
  if (f.includes('hyperlinked') || f.includes('digital planner')) return 'digital planner';
  if (sheets || f.includes('spreadsheet')) return 'spreadsheet';
  if (pages >= 10 || f.includes('binder')) return 'binder';
  if (pages >= 4) return 'multi-page pack';
  if (pages <= 1) return 'single sheet';
  return 'small pack';
}

/**
 * Extra tags worth adding because the other spelling is a different word to
 * Etsy. Only suggests the counterpart of something already being targeted.
 */
export function spellingVariants(tags = []) {
  const pairs = rulesFor('researcher').spellingPairs || [];
  const have = new Set(tags.map(lower));
  const extra = [];
  for (const tag of tags) {
    for (const [a, b] of pairs) {
      const t = lower(tag);
      if (t.includes(a) && !have.has(t.replace(a, b))) extra.push(t.replace(a, b));
      else if (t.includes(b) && !have.has(t.replace(b, a))) extra.push(t.replace(b, a));
    }
  }
  return [...new Set(extra)];
}

/** Ideas the shop has learned not to bother with. */
export const matchesAvoidPattern = (title) =>
  findPhrases(title, rulesFor('scout').avoidPatterns || []);

/** Reasons the Analyst must kill a venture regardless of anything else. */
export function ventureKillReasons(venture, maxDays) {
  const rules = rulesFor('analyst');
  const reasons = [];
  const haystack = `${venture.name} ${venture.one_liner} ${venture.solution} ${venture.audience}`;

  const outOfScope = findPhrases(haystack, allRules().outOfScope || []);
  if (outOfScope.length) reasons.push(`Out of scope: ${outOfScope.join(', ')}.`);

  const days = Number(venture.monetisation?.daysToRevenue) || 999;
  if (days > maxDays) {
    reasons.push(`No plausible payment for ${days} days, beyond the ${maxDays} day limit.`);
  }

  const model = venture.monetisation?.model || '';
  const floor = rules.models?.[model]?.minPrice;
  const price = Number(venture.monetisation?.price) || 0;
  if (floor && price < floor) {
    reasons.push(
      `${model} at ${price} is below the ${floor} floor — ${rules.models[model].note}.`
    );
  }
  return reasons;
}

/** How strong the evidence behind an idea actually is. */
export function evidenceStrength(count) {
  const rules = rulesFor('prospector').evidence || { weakAt: 1, signalAt: 3 };
  if (count >= rules.signalAt) return { level: 'signal', note: `${count} people described this independently.` };
  if (count > rules.weakAt) return { level: 'thin', note: `Only ${count} posts. Worth watching, not building yet.` };
  return { level: 'anecdote', note: 'One person said this once. That is an anecdote, not a market.' };
}

export default {
  findTrademarks,
  findBannedPhrases,
  findFiller,
  findPlaceholders,
  findShameLanguage,
  findOverPromises,
  tidyPrice,
  bandFor,
  spellingVariants,
  ventureKillReasons,
  evidenceStrength,
};

// --- from the etsy-policy pack ---------------------------------------------

/**
 * Claims that turn a supportive product into a regulated one.
 *
 * The distinction the shop lives on: a chore chart that helps someone with
 * ADHD is a printable, while a chore chart that says it treats ADHD is a
 * medical device claim. The first is the whole business, the second closes it.
 */
export const findMedicalClaims = (text) => findPhrases(text, allRules().medicalClaims || []);

/** Wording that invites a suspension rather than merely a bad review. */
export const findPolicyTraps = (text) => findPhrases(text, allRules().policyTraps || []);

/** Products this shop does not make, whatever the demand looks like. */
export const findProhibitedProduct = (text) => findPhrases(text, allRules().prohibitedProducts || []);

// --- from the licensing pack -----------------------------------------------

/**
 * Licence promises the shop cannot keep.
 *
 * Buyers read "commercial use included" as permission to resell the file. If
 * the product does not genuinely carry that licence, the sentence is the whole
 * dispute.
 */
export const findOverreachingLicence = (text) =>
  findPhrases(text, allRules().overreachingLicenceClaims || []);

/**
 * Has the buyer been told what they may do with it?
 *
 * Any of the cue phrases satisfies this — the requirement is that terms exist
 * at all, not that they are worded a particular way. A file with no stated
 * terms is assumed by a lot of buyers to be theirs to do anything with.
 */
export function licenceTermsStated(text) {
  return findPhrases(text, allRules().licenceStatementCues || []).length > 0;
}

/** Asset origins a human has to sign off before they go in a product. */
export const findAssetsNeedingLicenceCheck = (text) =>
  findPhrases(text, allRules().assetSourcesNeedingCheck || []);

// --- from the listing-images pack ------------------------------------------

/**
 * What is wrong with the images on a listing, in plain words.
 *
 * For a digital download the images are the product — nobody can pick it up,
 * so a thin image set is not a cosmetic problem, it is the main reason an
 * otherwise good listing sits there.
 *
 * The checks that look at wording need the rendered image, not its filename:
 * "1-hero" says nothing about what a buyer sees. Pass `svg` where it is to
 * hand and those checks run; leave it out and only the countable ones do,
 * which is better than inventing a complaint from a filename.
 *
 * @param {{label?: string, role?: string, svg?: string}[]} images
 * @returns {string[]}
 */
export function imageProblems(images = []) {
  const rules = allRules().images || {};
  const problems = [];
  const count = images.length;

  if (count < (rules.minAcceptable ?? 4)) {
    problems.push(
      `Only ${count} listing image(s). Etsy allows ${rules.max ?? 10} and a listing with fewer than ` +
        `${rules.minAcceptable ?? 4} measurably underperforms.`
    );
  }
  if (count > (rules.max ?? 10)) {
    problems.push(`${count} images, but Etsy only accepts ${rules.max ?? 10}.`);
  }

  // A buyer who thinks a parcel is coming leaves a bad review however good the
  // file is, so the first image has to say it is a download.
  const firstSvg = images[0]?.svg;
  const cues = rules.firstImageMustSuggest || [];
  if (count && firstSvg && cues.length && !findPhrases(firstSvg, cues).length) {
    problems.push('The first image never says it is a printable or an instant download.');
  }

  // Prices and offers age badly: Etsy caches images, the shop reprices, and
  // then the picture contradicts the listing.
  const rendered = images.map((i) => i.svg).filter(Boolean).join(' ');
  if (rendered) {
    const baked = findPhrases(rendered, rules.neverOnImages || []);
    if (baked.length) {
      problems.push(`Do not bake "${baked.join('", "')}" into an image — it will outlive the offer.`);
    }
  }

  return problems;
}

// --- from the shop-brand pack ----------------------------------------------

/**
 * The palette a category should stay in.
 *
 * The shop is judged as a grid, not as single listings, so the same kind of
 * product should look the same each time. The table lives in the shop-brand
 * pack, which means editing knowledge changes the catalogue's whole look with
 * no code to touch.
 */
export function paletteForCategory(category) {
  const brand = allRules().brand || {};
  return brand.paletteByCategory?.[category] || brand.defaultPalette || 'sage';
}

/** Structural things a pack of this length owes the reader. */
export function structureProblems(pageCount = 0) {
  const brand = allRules().brand || {};
  const problems = [];
  if (brand.requireContentsPageFrom && pageCount >= brand.requireContentsPageFrom) {
    problems.push(`contents page (${pageCount} pages)`);
  }
  if (brand.requirePageNumbersFrom && pageCount >= brand.requirePageNumbersFrom) {
    problems.push(`page numbers (${pageCount} pages)`);
  }
  return problems;
}

// --- from the venture-legal pack -------------------------------------------

/** Ground a one-person evening project cannot legally stand on. */
export const findHardKills = (text) => findPhrases(text, allRules().hardKills || []);

/** Personal data a small venture has no business collecting. */
export function overCollectingFields(fields = []) {
  const data = allRules().data || {};
  const never = (data.neverCollect || []).map(lower);
  return fields.filter((field) => never.some((n) => lower(field).includes(n)));
}
