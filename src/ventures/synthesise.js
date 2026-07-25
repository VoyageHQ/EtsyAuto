// Turning a pile of complaints into a shortlist of businesses.
//
// With a model the Prospector does this properly. Without one, this does a
// decent job the honest way: cluster the signals by what they are actually
// about, keep the real quotes as evidence, and shape each cluster with a
// business pattern that has a known way of making money.
import { seededRandom, titleCase, truncate } from '../core/util.js';

const STOP = new Set(
  `the a an and or for with of to in on at is are was were be been being have has had do does did
   this that these those it its they them their there here what which who whom how why when where
   all any both each few more most other some such no nor not only own same so than too very can
   will just should now about into over after before you your yours we our ours i me my mine he she
   his her him hers if then else while from up down out off again further once because as until
   would could get got make makes made use uses used using like really actually thing things one two
   people time way lot much many even still much also want need know think see look going good great
   better best bad worse worst new old first last long little own say says said'`
    .split(/\s+/)
    .filter(Boolean)
);

/** Where the complaint came from tells you who is complaining. */
const AUDIENCE_BY_CHANNEL = {
  'r/accounting': 'accountants and bookkeepers',
  'r/smallbusiness': 'small business owners',
  'r/entrepreneur': 'first-time founders',
  'r/saas': 'software founders',
  'r/freelance': 'freelancers',
  'r/sysadmin': 'IT administrators',
  'r/restaurateur': 'restaurant owners',
  'r/realestate': 'estate agents and landlords',
  'r/nonprofit': 'charity and nonprofit staff',
  'r/teachers': 'teachers',
  'hacker news': 'developers and technical teams',
  hackernews: 'developers and technical teams',
};

/**
 * Business patterns. Each one knows how it makes money, which is the only
 * reason it is in the list.
 */
const PATTERNS = [
  {
    id: 'tracker',
    test: /spreadsheet|track|log|record|keep on top|forget|manual entry|copy paste/i,
    shape: (subject) => `A focused tracker for ${subject} that replaces the spreadsheet everyone is quietly using.`,
    monetisation: {
      model: 'subscription',
      price: 12,
      tiers: [
        { name: 'Solo', price: 12, per: 'month', includes: 'one user, unlimited records, CSV export' },
        { name: 'Team', price: 39, per: 'month', includes: 'five users, shared views, audit history' },
      ],
      firstPoundPath: 'Charge from day one. Fourteen day trial, card up front, no free tier.',
      daysToRevenue: 30,
    },
    effort: 3,
  },
  {
    id: 'automation',
    test: /manual|by hand|takes me hours|wasting hours|tedious|repetitive|every week i/i,
    shape: (subject) => `A small tool that does the ${subject} work automatically instead of by hand.`,
    monetisation: {
      model: 'usage',
      price: 19,
      tiers: [
        { name: 'Starter', price: 19, per: 'month', includes: '500 runs a month' },
        { name: 'Pro', price: 59, per: 'month', includes: '5,000 runs, priority queue' },
      ],
      firstPoundPath: 'Price per run so the value is obvious. Bill from the first successful run.',
      daysToRevenue: 45,
    },
    effort: 4,
  },
  {
    id: 'alternative',
    test: /alternative to|too expensive|overpriced|switched away|cheaper than|hate paying/i,
    shape: (subject) => `A cheaper, simpler alternative for the ${subject} job people are overpaying for.`,
    monetisation: {
      model: 'subscription',
      price: 9,
      tiers: [
        { name: 'Standard', price: 9, per: 'month', includes: 'everything, one price, no seats' },
      ],
      firstPoundPath: 'Undercut the incumbent by 60% and say so plainly on the pricing page.',
      daysToRevenue: 30,
    },
    effort: 4,
  },
  {
    id: 'directory',
    test: /is there a tool|does anyone know|looking for a tool|what do you use|recommend/i,
    shape: (subject) => `A curated directory of what actually works for ${subject}, kept genuinely current.`,
    monetisation: {
      model: 'listings and affiliate',
      price: 49,
      tiers: [
        { name: 'Featured listing', price: 49, per: 'month', includes: 'top placement, logo, link' },
      ],
      firstPoundPath: 'Sell the first three featured slots by hand before building any billing.',
      daysToRevenue: 21,
    },
    effort: 2,
  },
  {
    id: 'template',
    test: /template|checklist|boilerplate|starting point|from scratch every time/i,
    shape: (subject) => `A paid pack of templates and checklists for ${subject}, sold once, used forever.`,
    monetisation: {
      model: 'one-off',
      price: 29,
      tiers: [{ name: 'The pack', price: 29, per: 'one-off', includes: 'lifetime access and updates' }],
      firstPoundPath: 'A single payment link and a download. Sellable the day it exists.',
      daysToRevenue: 14,
    },
    effort: 1,
  },
];

const DEFAULT_PATTERN = {
  id: 'tool',
  shape: (subject) => `A single-purpose tool that fixes the ${subject} problem properly.`,
  monetisation: {
    model: 'subscription',
    price: 15,
    tiers: [{ name: 'Standard', price: 15, per: 'month', includes: 'full access, one user' }],
    firstPoundPath: 'Charge from launch. No free tier until there is something to upsell to.',
    daysToRevenue: 45,
  },
  effort: 3,
};

/**
 * The most useful few words in any of these posts are the ones immediately
 * after the signal phrase: "I wish there was **a way to reconcile invoices
 * automatically**". Frequency clustering across whole comments finds noise;
 * this finds the actual want.
 */
export function extractDesire(text, phrase) {
  const haystack = String(text || '');
  const at = haystack.toLowerCase().indexOf(String(phrase || '').toLowerCase());
  if (at === -1) return '';
  const after = haystack
    .slice(at + phrase.length)
    // Stop at the end of the clause: the want is rarely longer than that.
    .split(/[.!?;)\n]|,\s+(?:but|although|though|because|so)\b/)[0]
    .replace(/^\s*(?:a|an|the|some|any|to|that|which|for|of)\b\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return after.split(/\s+/).slice(0, 9).join(' ');
}

/** Words that describe a job someone does, rather than filler. */
function desireTokens(desire) {
  return tokens(desire).filter((word) => !GENERIC.has(word));
}

const GENERIC = new Set(
  `way ways able easy simple quick better nice good tool tools app apps thing stuff option options
   feature features something anything everything version support kind sort type using used doing
   done work works working really actually simply basically probably maybe perhaps quite rather`
    .split(/\s+/)
    .filter(Boolean)
);

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && word.length < 22 && !STOP.has(word));
}

/**
 * Cluster the signals and shape each cluster into a candidate business.
 * @param {object[]} signals rows from the signals table
 * @param {number} wanted how many candidates to return
 */
export function synthesise(signals, wanted = 6) {
  if (!signals.length) return [];

  // What each person actually asked for, and the words that carry it.
  const frequency = new Map();
  const bags = new Map();
  const desires = new Map();
  for (const signal of signals) {
    const desire = extractDesire(signal.text, signal.phrase) || signal.title || '';
    desires.set(signal.id, desire);
    // The want is weighted far above the rest of the comment, which is usually
    // context, tangents and arguing.
    const bag = [...desireTokens(desire), ...desireTokens(desire), ...tokens(signal.text).slice(0, 12)];
    bags.set(signal.id, new Set(bag));
    for (const word of new Set(desireTokens(desire))) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }
  }

  // Words that appear in several signals are what people are collectively
  // complaining about; words appearing once are noise.
  const themes = [...frequency.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([word]) => word);

  const clusters = [];
  const claimed = new Set();
  for (const theme of themes) {
    const members = signals.filter((s) => !claimed.has(s.id) && bags.get(s.id)?.has(theme));
    if (members.length < 2) continue;
    members.forEach((m) => claimed.add(m.id));
    clusters.push({ theme, members, desires });
    if (clusters.length >= wanted * 2) break;
  }

  // Anything left over that is unusually detailed is worth a look on its own.
  for (const signal of signals) {
    if (claimed.has(signal.id)) continue;
    if ((signal.text || '').length < 240) continue;
    clusters.push({
      theme: desireTokens(desires.get(signal.id) || '')[0] || tokens(signal.title || signal.text)[0] || 'workflow',
      members: [signal],
      desires,
    });
    claimed.add(signal.id);
    if (clusters.length >= wanted * 2) break;
  }

  return clusters
    .map((cluster) => shapeCluster(cluster, bags))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, wanted);
}

function shapeCluster(cluster, bags) {
  const { theme, members, desires } = cluster;
  const evidenceText = members.map((m) => `${m.title} ${m.text}`).join(' ');
  const pattern = PATTERNS.find((p) => p.test.test(evidenceText)) || DEFAULT_PATTERN;

  // Describe it the way the people asking for it did, but trimmed to something
  // that reads as a noun phrase rather than half a sentence.
  const wants = members.map((m) => desires?.get(m.id)).filter(Boolean);
  const subject = tidySubject(wants[0]) || theme;

  const audience = audienceFor(members);
  const rng = seededRandom(members.map((m) => m.id).join(''));
  const name = nameFor(desireTokens(wants[0] || '')[0] || theme, pattern.id, rng);

  const quotes = members.slice(0, 4).map((m) => ({
    signalId: m.id,
    source: m.source,
    channel: m.channel,
    url: m.url,
    phrase: m.phrase,
    quote: truncate(firstSentenceWith(m.text, m.phrase) || m.text, 240),
    want: desires?.get(m.id) || null,
  }));

  const recencyDays = Math.max(
    0,
    Math.round((Date.now() - Math.max(...members.map((m) => Number(m.posted_at) || 0))) / 86400000)
  );

  const evidenceScore = Math.min(5, members.length);
  const recencyScore = recencyDays < 30 ? 2 : recencyDays < 120 ? 1 : 0;
  const revenueScore = pattern.monetisation.daysToRevenue <= 30 ? 2 : 1;
  const score =
    Math.round((evidenceScore * 1.6 + recencyScore + revenueScore - pattern.effort * 0.5) * 10) / 10;

  return {
    name,
    oneLiner: pattern.shape(subject),
    problem: truncate(
      quotes[0]?.quote || `People keep asking for ${subject} and not finding it.`,
      400
    ),
    audience,
    solution: pattern.shape(subject),
    monetisation: pattern.monetisation,
    evidence: quotes,
    effort: pattern.effort,
    confidence: Math.min(5, Math.max(1, evidenceScore)),
    pattern: pattern.id,
    score: Math.max(0, score),
    signalIds: members.map((m) => m.id),
  };
}

/** "a way to exclude the plain ones (single color" -> "exclude the plain ones" */
function tidySubject(desire) {
  if (!desire) return '';
  const cleaned = String(desire)
    .replace(/\([^)]*\)?/g, ' ')
    .replace(/["“”']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const words = cleaned.split(' ').slice(0, 6);
  // Never end on a dangling connector.
  while (words.length && /^(to|the|a|an|of|for|with|and|or|in|on|at|that|which|from|by)$/.test(words.at(-1))) {
    words.pop();
  }
  return words.join(' ');
}

function audienceFor(members) {
  for (const member of members) {
    const key = `${member.channel || ''} ${member.source || ''}`.toLowerCase();
    for (const [match, audience] of Object.entries(AUDIENCE_BY_CHANNEL)) {
      if (key.includes(match)) return audience;
    }
  }
  return 'the people having this problem in public';
}

function nameFor(theme, patternId, rng) {
  const suffixes = {
    tracker: ['Ledger', 'Log', 'Board', 'Sheet'],
    automation: ['Runner', 'Pilot', 'Flow', 'Relay'],
    alternative: ['Lite', 'Simple', 'Plain', 'Basic'],
    directory: ['Index', 'Directory', 'List', 'Picks'],
    template: ['Kit', 'Pack', 'Starter', 'Toolbox'],
    tool: ['Tool', 'Desk', 'Hub', 'Works'],
  };
  const options = suffixes[patternId] || suffixes.tool;
  const suffix = options[Math.floor(rng() * options.length)];
  return `${titleCase(theme)} ${suffix}`;
}

/** Pull out the sentence containing the phrase, so the quote proves the point. */
function firstSentenceWith(text, phrase) {
  if (!text || !phrase) return null;
  const sentences = String(text).split(/(?<=[.!?])\s+/);
  return sentences.find((s) => s.toLowerCase().includes(phrase)) || null;
}

export default synthesise;
