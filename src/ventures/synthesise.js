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
    // The want usually sits in the body, but plenty of posts put it in the
    // title instead. Falling straight back to the raw title drags the signal
    // phrase along with it — "a tracker for i wish there was a tool" — so try
    // extracting from the title before settling for it whole.
    const desire =
      extractDesire(signal.text, signal.phrase) ||
      extractDesire(signal.title, signal.phrase) ||
      signal.title ||
      '';
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

    // Sharing one word is not sharing a problem.
    //
    // "Four independent posts" is the number the whole shortlist is judged on,
    // and grouping on a single common word made it a lie: four posts that each
    // said "code" became four people describing the same need. That is how
    // "glm 5.2 vs. opus" arrived carrying four posts' worth of authority.
    //
    // So: the members have to have more than the trigger word in common. Two
    // more shared content words is a low bar and it removes the worst of it —
    // people describing the same problem reuse each other's vocabulary without
    // trying, and people describing different problems do not.
    const shared = sharedVocabulary(members, bags, theme, desires);
    if (shared.length < 2) continue;

    members.forEach((m) => claimed.add(m.id));
    clusters.push({ theme, members, desires, shared });
    if (clusters.length >= wanted * 2) break;
  }

  // There used to be a second pass here that promoted any single long comment
  // into a venture of its own. It is where "Explores Picks — a curated
  // directory of what actually works for explores the smeared line between
  // meanings" came from: one person, once, thinking aloud.
  //
  // The Prospector's own knowledge says one post is an anecdote and not a
  // market, and the Harbour's whole promise to the owner is a shortlist backed
  // by evidence. Proposing nothing is a real answer; proposing nonsense is not.

  const shaped = clusters
    .map((cluster) => shapeCluster(cluster, bags))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  // The Prospector's knowledge pack draws the line at three independent posts:
  // below that it is an anecdote, not a market.
  //
  // There used to be a fallback here — if nothing cleared the bar, the best of
  // what there was went up anyway, "marked by its own evidence count". That
  // fallback was how "Opus Sheet — a focused tracker for glm 5.2 vs. opus"
  // reached a shortlist. One person's passing phrase, dressed in a product
  // name and a price, indistinguishable at a glance from a real find.
  //
  // An empty shortlist is a true statement about a quiet week. A shortlist of
  // six things that read like businesses and are not costs the owner an
  // evening and teaches them to distrust the whole list — which is the more
  // expensive of the two by a distance.
  return shaped.filter((v) => (v.evidence || []).length >= 3).slice(0, wanted);
}

/**
 * Words that appear in most of a cluster, beyond the one that grouped it.
 *
 * The measure of whether several people are describing the same problem, and
 * the one thing the clustering was missing.
 */
function sharedVocabulary(members, bags, theme, desires) {
  const counts = new Map();
  for (const m of members) {
    // Only what the person actually asked for, not the whole post.
    //
    // The full bag carries the words of the question that found them —
    // "is there a tool that" leaves "tool" in every member — and matching on
    // those says nothing. Three posts asking for a tool to render, compile and
    // translate code share "tool" and "code" and no problem whatsoever, and
    // that pair was enough to make them a market.
    const want = desires?.get(m.id);
    const words = want ? new Set(desireTokens(want)) : bags.get(m.id) || [];
    for (const word of words) {
      if (word === theme) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  // In most of them, not just two — otherwise a pair inside a group of six
  // carries the whole cluster.
  const bar = Math.max(2, Math.ceil(members.length * 0.6));
  return [...counts].filter(([, n]) => n >= bar).map(([word]) => word);
}

/**
 * Is this something a product could be built for, or just words that happened
 * to sit next to a signal phrase?
 *
 * The offline synthesiser reads other people's comments, and comments contain
 * jokes, tangents and the occasional bit of poetry. "explores the smeared line
 * between meanings" matched "is there an app that" perfectly well and meant
 * nothing buildable. Anything that reads as half a sentence rather than a
 * thing gets dropped, because the owner is being asked to spend a fortnight of
 * evenings on whatever comes out of here.
 */
function usableSubject(subject) {
  const text = String(subject || '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 8) return false;

  // A comma means the clause was still going when it was cut. "takes an
  // executable, collects all" is half a sentence, and reads as one.
  if (text.includes(',')) return false;

  // Every template splices this into a noun slot — "a focused tracker for
  // <subject>". A phrase that starts with a verb comes out as "a tracker for
  // takes an executable", which is not English. Better to drop the candidate
  // than to put that in front of the owner as something to build.
  if (LEADING_VERBS.test(words[0])) return false;

  // A trailing preposition or bare quantifier is the same tell.
  if (/^(to|of|for|with|and|or|in|on|at|all|any|some|that|which|this)$/i.test(words.at(-1))) return false;

  // The scaffolding of the question itself is not a want. If it survived this
  // far, extraction failed and the whole post came through unfiltered.
  if (/^(i wish|is there|are there|does anyone|anyone know|has anyone|we still use|looking for|any recommendations)\b/i.test(text)) {
    return false;
  }

  // --- fragments of a longer sentence ------------------------------------
  // Stack Exchange brought a new shape of source: titles that are questions
  // rather than complaints. Those fail differently, and they failed silently
  // — "A focused tracker for specify that these days" and "a tracker for
  // pseudo english looking characters used" both reached the shortlist, and
  // neither is a thing anybody would build.

  // A wh-word opens a question, never a noun phrase. "how to copy from a
  // protected" is the front of somebody's title, not the name of a market.
  if (/^(how|what|why|when|where|which|who|whether)\b/i.test(words[0])) return false;

  // A subordinator in the middle means the clause carried on past the cut.
  // "specify that these days" is the first half of a sentence.
  if (words.slice(1, -1).some((w) => /^(that|which|when|because|while|whether|if)$/i.test(w))) {
    return false;
  }

  // Ending on a past participle or a bare adjective leaves the noun behind:
  // "characters used", "a protected", "the required". Whatever it was used or
  // protected *for* was the actual subject, and it did not survive.
  if (/^(used|needed|required|protected|supported|allowed|enabled|missing|broken|available)$/i.test(words.at(-1))) {
    return false;
  }

  // A determiner at the end is the same tell one word earlier.
  if (/^(a|an|the|my|your|our|their|its)$/i.test(words.at(-1))) return false;

  // Punctuation that only exists inside a longer sentence. A subject with a
  // question mark in it came straight off somebody's title — "list all current
  // windows 10 hotkeys?" was proposed as a business.
  if (/[?:;!]/.test(text)) return false;

  // A quantifier phrase is a statistic somebody quoted, not a thing to build.
  // "up to tenth of amazon shoppers" is a sentence about a market, and it read
  // as one on the shortlist.
  if (/\b(up to|around|about|roughly|nearly|almost|over|more than|less than)\b/i.test(text)) {
    return false;
  }

  // At least one word has to carry meaning of its own. "the kind of thing" is
  // six words and says nothing.
  return desireTokens(text).length >= 1;
}

/**
 * Verbs seen leading extracted wants. Not a complete list of English verbs —
 * it does not need to be. It needs to catch the shapes that come out of "is
 * there a tool that ..." and "I wish there was something that ...", which is
 * where almost all of these start.
 */
const LEADING_VERBS =
  /^(explores?|instructs?|takes?|uses?|collects?|produces?|handles?|allows?|lets?|makes?|does?|is|are|was|were|has|have|had|can|could|would|should|will|might|seems?|looks?|feels?|means?|gets?|goes?|works?|runs?|shows?|gives?|keeps?|puts?|turns?|sends?|reads?|writes?|converts?|generates?|supports?|helps?|automatically|manually|properly|easily|quickly|simply)$/i;

function shapeCluster(cluster, bags) {
  const { theme, members, desires } = cluster;
  const evidenceText = members.map((m) => `${m.title} ${m.text}`).join(' ');
  const pattern = PATTERNS.find((p) => p.test.test(evidenceText)) || DEFAULT_PATTERN;

  // Describe it the way the people asking for it did, but trimmed to something
  // that reads as a noun phrase rather than half a sentence.
  const wants = members.map((m) => desires?.get(m.id)).filter(Boolean);
  // Several people described this. If the first one phrased it awkwardly, that
  // is no reason to throw the whole cluster away — try what the others said.
  const subject = wants.map(tidySubject).find(usableSubject) || '';
  if (!subject) return null;

  const audience = audienceFor(members);
  const rng = seededRandom(members.map((m) => m.id).join(''));
  // Name it after what it is for. Naming it after a single token pulled out of
  // a comment produced "Parento Log" and "Defend Ledger", which tell the owner
  // nothing about what they are being asked to approve.
  // English puts the head noun at the end of a phrase, so "chase unpaid
  // invoices" names itself "Unpaid Invoices", not "Chase Unpaid".
  const name = nameFor(nameWords(subject).slice(-2).join(' ') || theme, pattern.id, rng);

  const quotes = members.slice(0, 4).map((m) => ({
    signalId: m.id,
    source: m.source,
    channel: m.channel,
    url: m.url,
    phrase: m.phrase,
    quote: truncate(firstSentenceWith(m.text, m.phrase) || m.text, 240),
    want: desires?.get(m.id) || null,
    // How many other people arrived at the same problem. Only some sources
    // measure it; where they do it is far better evidence than the post count.
    views: Number(m.score) || 0,
    unanswered: Boolean(m.unanswered),
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
/**
 * Verbs that turn up at the front of a want often enough to be worth handling
 * properly. Anything not here and still verb-led is caught by usableSubject
 * and dropped, which is the safe direction to be wrong in.
 */
const ACTION_VERBS = new Set([
  'chase', 'track', 'manage', 'organise', 'organize', 'schedule', 'log', 'record',
  'sync', 'import', 'export', 'merge', 'split', 'compare', 'monitor', 'archive',
  'search', 'filter', 'sort', 'share', 'publish', 'remind', 'notify', 'batch',
  'reconcile', 'invoice', 'budget', 'plan', 'book', 'renew', 'chase-up',
]);

/** English gerunds, to the depth this actually needs. */
function toGerund(verb) {
  if (verb.endsWith('e') && !verb.endsWith('ee')) return `${verb.slice(0, -1)}ing`;
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(verb)) return `${verb}${verb.at(-1)}ing`;
  return `${verb}ing`;
}

function tidySubject(desire) {
  if (!desire) return '';
  const cleaned = String(desire)
    .replace(/\([^)]*\)?/g, ' ')
    .replace(/["“”']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  // "I wish there was **a way to** chase unpaid invoices" — the scaffolding
  // belongs to the sentence it was lifted from, not to the thing being asked
  // for, and it reads badly once spliced into "a tracker for ...".
  const withoutScaffold = cleaned
    .replace(
      /^(?:a |an |the )?(?:way|method|means|option|ability|tool|app|thing|system)\s+(?:to|for|of)\s+/,
      ''
    )
    // "is there a tool that **will** chase unpaid invoices" — the modal belongs
    // to the question, not to the thing being asked for.
    .replace(/^(?:will|would|can|could|should|might|must|may|shall)\s+/, '');
  // Every template reads "a tracker for <subject>", so a subject that opens
  // with a bare verb comes out as "a tracker for chase unpaid invoices". The
  // want is good — it is the grammar that is wrong — so make it a gerund
  // rather than throwing the candidate away.
  const gerunded = withoutScaffold.replace(/^([a-z]+)\b/, (word) =>
    ACTION_VERBS.has(word) ? toGerund(word) : word
  );
  const words = gerunded.split(' ').slice(0, 6);
  // Never end on a dangling connector, or on the adjective that was clearly
  // still describing something: "chasing unpaid invoices for a small" was cut
  // one word before "studio".
  while (
    words.length &&
    /^(to|the|a|an|of|for|with|and|or|in|on|at|that|which|from|by|small|large|big|new|old|other|whole|entire|same|different|single|multiple|several)$/.test(
      words.at(-1)
    )
  ) {
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

/**
 * The words in a want that are worth naming a business after.
 *
 * "chasing unpaid invoices automatically every month" ends in a frequency, not
 * in the thing itself, and taking the last two words literally produced "Every
 * Month Sheet". Time and manner words describe when and how, never what.
 */
const TEMPORAL = new Set([
  'every', 'each', 'daily', 'weekly', 'monthly', 'yearly', 'annually', 'hourly',
  'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years', 'time',
  'again', 'always', 'never', 'often', 'sometimes', 'automatically', 'manually',
  'quickly', 'easily', 'properly', 'instead', 'without', 'together',
]);

const nameWords = (subject) => desireTokens(subject).filter((word) => !TEMPORAL.has(word));

function nameFor(theme, patternId, rng) {
  // An adverb in a product name is always wrong. "Invoices Automatically
  // Board" came from a want that ended in one.
  theme = String(theme)
    .split(/\s+/)
    .filter((word) => !/ly$/i.test(word))
    .join(' ') || theme;

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
