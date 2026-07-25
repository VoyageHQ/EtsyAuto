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
    // Some entries are patterns rather than plain words.
    if (/[\\^$.*+?()[\]{}|]/.test(needle)) {
      try {
        return new RegExp(needle, 'i').test(haystack);
      } catch {
        return haystack.includes(needle);
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
