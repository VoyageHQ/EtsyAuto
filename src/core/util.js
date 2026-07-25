// Small shared helpers.
import { randomUUID } from 'node:crypto';

export const uid = (prefix = '') => (prefix ? `${prefix}_` : '') + randomUUID().slice(0, 12);

export const now = () => Date.now();

export const nowIso = () => new Date().toISOString();

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function slug(text, max = 60) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

export function titleCase(text) {
  const small = new Set(['a', 'an', 'and', 'the', 'for', 'of', 'to', 'in', 'with', 'on']);
  return String(text || '')
    .split(/\s+/)
    .map((word, i) => {
      // Leave acronyms alone: "US Letter" must not become "Us Letter".
      if (word.length <= 4 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
      const lower = word.toLowerCase();
      if (i > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function pick(list, rng = Math.random) {
  return list[Math.floor(rng() * list.length)];
}

export function shuffle(list, rng = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Deterministic pseudo random from a string seed. Used so a product's
// generated design looks the same every time it is rebuilt.
export function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < String(seed).length; i++) {
    h ^= String(seed).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return function next() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

export function truncate(text, max) {
  const s = String(text ?? '');
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

// Pull the first JSON object or array out of a model response, tolerating
// markdown fences and leading chatter.
export function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const direct = tryParse(cleaned);
  if (direct !== undefined) return direct;

  for (const open of ['[', '{']) {
    const start = cleaned.indexOf(open);
    if (start === -1) continue;
    const close = open === '[' ? ']' : '}';
    for (let end = cleaned.lastIndexOf(close); end > start; end = cleaned.lastIndexOf(close, end - 1)) {
      const parsed = tryParse(cleaned.slice(start, end + 1));
      if (parsed !== undefined) return parsed;
    }
  }
  return null;
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function money(amount, currency = 'GBP') {
  const symbols = { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$' };
  const symbol = symbols[currency] || '';
  return `${symbol}${Number(amount || 0).toFixed(2)}`;
}
