// Where startup ideas actually come from: people complaining in public.
//
// Rules this file sticks to, because getting them wrong gets accounts banned:
//   - Only documented public JSON and RSS endpoints meant to be consumed.
//     No HTML scraping, no logged-in pages, no pretending to be a browser.
//   - A real User-Agent that says who we are, as Reddit and HN both ask.
//   - One request at a time, with a gap between them, and a hard cap per run.
//   - Anything a source refuses is logged and skipped. Never retried in a loop.
//
// Every source is optional and independent. If Reddit is unreachable the
// Prospector still works from Hacker News, and if the whole network is down it
// still works from the built-in corpus.
import config from '../core/config.js';
import { log } from '../core/events.js';
import { now } from '../core/util.js';

const UA = `EtsyAuto-Ventures/0.1 (startup idea research; +https://github.com/VoyageHQ/EtsyAuto)`;
const GAP_MS = 1200;
let lastCall = 0;

/**
 * The phrases that mark a real problem rather than an opinion. These are the
 * whole trick: people describe their own unmet needs in a handful of very
 * predictable ways.
 */
export const SIGNAL_PHRASES = [
  'i wish there was',
  'is there a tool that',
  'is there an app that',
  'why is there no',
  'does anyone know a tool',
  'looking for a tool',
  'any alternative to',
  'i hate that i have to',
  'takes me hours',
  'wasting hours',
  'so much manual work',
  'we still use a spreadsheet',
  'still doing this manually',
  'there has to be a better way',
  'biggest pain point',
  'most frustrating part of',
  'what do you use for',
  'how do you all handle',
];

/** Communities worth listening to, if Reddit is reachable. */
export const DEFAULT_SUBREDDITS = [
  'smallbusiness',
  'Entrepreneur',
  'SaaS',
  'freelance',
  'sysadmin',
  'accounting',
  'restaurateur',
  'RealEstate',
  'nonprofit',
  'Teachers',
];

async function throttled(url, options = {}) {
  const wait = Math.max(0, GAP_MS - (Date.now() - lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: 'application/json, text/xml;q=0.9', ...options.headers },
    });
    if (!res.ok) {
      // Carry a little of the body. A 403 from the source and a 403 from the
      // network between you and it are the same status and completely
      // different problems — one is "back off", the other is "your firewall
      // or proxy is in the way", and reporting the first when it is the
      // second sends somebody looking in entirely the wrong place.
      const hint = await res.text().catch(() => '');
      const err = new Error(`${res.status} ${res.statusText}`);
      err.status = res.status;
      err.body = hint.slice(0, 160);
      err.blockedLocally = /egress|proxy|firewall|policy|blocked by/i.test(hint);
      throw err;
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const stripHtml = (text) =>
  String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&#x2019;|&rsquo;/g, "\u2019")
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim();

// --- Hacker News -----------------------------------------------------------
// The Algolia search API is public, documented and free, with no key. It is
// the most reliable source here and it indexes every comment.

async function fetchHackerNews({ phrases, perPhrase = 8 }) {
  const out = [];
  for (const phrase of phrases) {
    const url =
      'https://hn.algolia.com/api/v1/search_by_date?' +
      new URLSearchParams({
        query: `"${phrase}"`,
        tags: 'comment',
        hitsPerPage: String(perPhrase),
      });
    const res = await throttled(url);
    const data = await res.json();
    for (const hit of data.hits || []) {
      const text = stripHtml(hit.comment_text);
      if (text.length < 60) continue;
      out.push({
        source: 'hackernews',
        externalId: String(hit.objectID),
        title: hit.story_title || 'Hacker News comment',
        text: text.slice(0, 1200),
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        author: hit.author || null,
        score: null,
        comments: null,
        phrase,
        channel: hit.story_title || 'Hacker News',
        postedAt: hit.created_at_i ? hit.created_at_i * 1000 : Date.now(),
      });
    }
  }
  return out;
}

// --- Reddit ----------------------------------------------------------------
// Reddit's public .json endpoints work without a key for modest, identified
// use. If you plan to run this hard, register a script app and put a token in
// REDDIT_TOKEN — see docs/VENTURES.md.

async function fetchReddit({ phrases, subreddits, perSub = 25 }) {
  const out = [];
  const headers = config.ventures.redditToken
    ? { authorization: `Bearer ${config.ventures.redditToken}` }
    : {};
  const base = config.ventures.redditToken ? 'https://oauth.reddit.com' : 'https://www.reddit.com';

  for (const sub of subreddits) {
    const url = `${base}/r/${encodeURIComponent(sub)}/top.json?t=week&limit=${perSub}`;
    const res = await throttled(url, { headers });
    const data = await res.json();
    for (const child of data?.data?.children || []) {
      const post = child.data || {};
      const haystack = `${post.title || ''} ${post.selftext || ''}`.toLowerCase();
      const phrase = phrases.find((p) => haystack.includes(p));
      if (!phrase) continue;
      out.push({
        source: 'reddit',
        externalId: String(post.id),
        title: post.title || '',
        text: stripHtml(post.selftext).slice(0, 1200),
        url: post.permalink ? `https://www.reddit.com${post.permalink}` : post.url,
        author: post.author || null,
        score: Number(post.score) || 0,
        comments: Number(post.num_comments) || 0,
        phrase,
        channel: `r/${post.subreddit || sub}`,
        postedAt: post.created_utc ? post.created_utc * 1000 : Date.now(),
      });
    }
  }
  return out;
}

// --- Any RSS feed ----------------------------------------------------------
// Forums, blogs, changelogs — anything that publishes a feed. Set
// VENTURE_FEEDS to a comma separated list of URLs.

async function fetchRss({ phrases, feeds }) {
  const out = [];
  for (const feed of feeds) {
    const res = await throttled(feed, { headers: { accept: 'application/rss+xml, text/xml' } });
    const xml = await res.text();
    const items = xml.split(/<(?:item|entry)[\s>]/i).slice(1);
    for (const item of items.slice(0, 25)) {
      const title = stripHtml(pick(item, 'title'));
      const body = stripHtml(pick(item, 'content:encoded') || pick(item, 'description') || pick(item, 'summary'));
      const link = (item.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || stripHtml(pick(item, 'link'));
      const haystack = `${title} ${body}`.toLowerCase();
      const phrase = phrases.find((p) => haystack.includes(p));
      if (!phrase) continue;
      out.push({
        source: 'rss',
        externalId: link || title,
        title,
        text: body.slice(0, 1200),
        url: link,
        author: stripHtml(pick(item, 'dc:creator')) || null,
        score: null,
        comments: null,
        phrase,
        channel: new URL(feed).hostname,
        postedAt: Date.parse(stripHtml(pick(item, 'pubDate') || pick(item, 'updated'))) || Date.now(),
      });
    }
  }
  return out;
}

const pick = (xml, tag) => {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1] : '';
};

// --- Stack Exchange ---------------------------------------------------------
// The best source here, and it was missing.
//
// softwarerecs.stackexchange.com exists for exactly one purpose: people asking
// "is there a tool that does X". Every question is a stated unmet need, from
// somebody who cared enough to write it up — and unlike a forum post it comes
// with numbers. A question with 170,000 views and no accepted answer is not one
// person's opinion; it is a market with nobody serving it.
//
// The API is free, documented and needs no key at this volume. Nothing here is
// scraped.

const SE_SITES = ['softwarerecs', 'webapps', 'superuser', 'serverfault'];

async function fetchStackExchange({ phrases, perPhrase = 6 }) {
  const out = [];
  for (const site of SE_SITES) {
    for (const phrase of phrases.slice(0, 8)) {
      const url =
        'https://api.stackexchange.com/2.3/search/advanced?' +
        new URLSearchParams({
          order: 'desc',
          sort: 'votes',
          q: phrase,
          site,
          filter: 'withbody',
          pagesize: String(Math.min(20, perPhrase)),
        });
      const res = await throttled(url);
      const data = await res.json();
      for (const item of data.items || []) {
        const body = stripHtml(item.body).slice(0, 1200);
        if (body.length < 60) continue;
        out.push({
          source: 'stackexchange',
          externalId: `${site}:${item.question_id}`,
          title: stripHtml(item.title),
          text: body,
          url: item.link,
          author: item.owner?.display_name || null,
          // Views are the honest demand number: how many other people arrived
          // at this question with the same problem. Score is who bothered to
          // vote, which is always a fraction of who had the problem.
          score: Number(item.view_count || 0),
          comments: Number(item.answer_count || 0),
          phrase,
          channel: `${site}.stackexchange.com`,
          postedAt: Number(item.creation_date || 0) * 1000,
          // An unanswered question with real traffic is the clearest gap this
          // whole file can find.
          unanswered: !item.is_answered,
        });
      }
      // The API tells you when you are close to the quota. Stop rather than
      // spend somebody else's goodwill.
      if (data.quota_remaining !== undefined && data.quota_remaining < 20) return out;
      if (data.backoff) await new Promise((r) => setTimeout(r, Number(data.backoff) * 1000));
    }
  }
  return out;
}

// --- Discourse forums -------------------------------------------------------
// The widest source available, and the one you steer.
//
// Thousands of real communities run Discourse — makers, accountants, teachers,
// photographers, self-hosters, every niche software product's own forum — and
// every one of them exposes /search.json with no key and no account. Point
// VENTURE_FORUMS at the communities your customers actually live in and the
// Prospector listens where you would.
//
// This is the answer to "Reddit keeps blocking us". Reddit is one community
// that happens to be big; Discourse is a thousand communities that happen to
// share software, and none of them mind being read.

async function fetchDiscourse({ phrases, perPhrase = 6, forums = [] }) {
  const out = [];
  for (const host of forums) {
    const base = host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    for (const phrase of phrases.slice(0, 6)) {
      const url = `https://${base}/search.json?` + new URLSearchParams({ q: `"${phrase}"` });
      const res = await throttled(url);
      const data = await res.json();
      // Posts carry the words; topics carry the titles. Neither is much use
      // without the other, so join them up rather than reporting a blurb with
      // no idea what thread it came from.
      const titles = new Map((data.topics || []).map((t) => [t.id, t]));
      for (const post of (data.posts || []).slice(0, perPhrase)) {
        const text = stripHtml(post.blurb || '');
        if (text.length < 60) continue;
        const topic = titles.get(post.topic_id);
        out.push({
          source: 'discourse',
          externalId: `${base}:${post.id}`,
          title: topic?.title || 'forum post',
          text: text.slice(0, 1200),
          url: `https://${base}/t/${post.topic_id}/${post.post_number || 1}`,
          author: post.username || null,
          // Replies are the closest thing a forum has to "other people have
          // this too".
          score: Number(topic?.reply_count || 0),
          comments: Number(topic?.posts_count || 0),
          phrase,
          channel: base,
          postedAt: Date.parse(post.created_at || topic?.created_at || '') || now(),
        });
      }
    }
  }
  return out;
}

// --- Lobsters ---------------------------------------------------------------
// Small, technical, and unusually free of noise. Its front page is a public
// JSON endpoint with no key. Worth reading precisely because it is small: a
// complaint that surfaces here has been through people who build things.

async function fetchLobsters() {
  const out = [];
  for (const feed of ['hottest', 'newest']) {
    const res = await throttled(`https://lobste.rs/${feed}.json`);
    for (const story of (await res.json()) || []) {
      const text = stripHtml(story.description || '');
      if (text.length < 60) continue;
      out.push({
        source: 'lobsters',
        externalId: String(story.short_id),
        title: story.title || 'Lobsters',
        text: text.slice(0, 1200),
        url: story.comments_url || story.url,
        author: story.submitter_user || null,
        score: Number(story.score || 0),
        comments: Number(story.comment_count || 0),
        phrase: 'lobsters front page',
        channel: (story.tags || []).join(', ') || 'lobste.rs',
        postedAt: Date.parse(story.created_at || '') || now(),
      });
    }
  }
  return out;
}

// --- GitHub issues ----------------------------------------------------------
// Where people ask for the thing that does not exist yet, in the project that
// nearly does it. A feature request with fifty thumbs-up and three years of
// silence is a gap with a queue of people already standing in it.
//
// Unauthenticated search allows ten requests a minute, which is plenty at this
// pace. A GITHUB_TOKEN raises it to thirty if you have one spare.

async function fetchGitHub({ phrases, perPhrase = 6 }) {
  const out = [];
  const token = config.ventures.githubToken;
  for (const phrase of phrases.slice(0, 5)) {
    const url =
      'https://api.github.com/search/issues?' +
      new URLSearchParams({
        q: `"${phrase}" in:body state:open is:issue`,
        sort: 'reactions',
        order: 'desc',
        per_page: String(Math.min(20, perPhrase)),
      });
    const res = await throttled(url, {
      headers: {
        accept: 'application/vnd.github+json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    for (const issue of data.items || []) {
      const text = stripHtml(issue.body || '');
      if (text.length < 60) continue;
      out.push({
        source: 'github',
        externalId: String(issue.id),
        title: issue.title || 'issue',
        text: text.slice(0, 1200),
        url: issue.html_url,
        author: issue.user?.login || null,
        // Reactions are people saying "me too" without adding a comment, which
        // is the purest demand signal a tracker produces.
        score: Number(issue.reactions?.total_count || 0),
        comments: Number(issue.comments || 0),
        phrase,
        channel: String(issue.repository_url || '').split('/repos/')[1] || 'github',
        postedAt: Date.parse(issue.created_at || '') || now(),
        // Open for years with reactions on it is the shape worth noticing.
        unanswered: Number(issue.comments || 0) === 0,
      });
    }
  }
  return out;
}

// --- the roster ------------------------------------------------------------

export const SOURCES = [
  {
    id: 'hackernews',
    name: 'Hacker News',
    note: 'Public Algolia search API. No key, no account, explicitly free.',
    enabled: () => config.ventures.sources.includes('hackernews'),
    run: fetchHackerNews,
  },
  {
    id: 'stackexchange',
    name: 'Stack Exchange',
    note: 'softwarerecs, webapps, superuser. People asking for tools that do not exist, with view counts.',
    enabled: () => config.ventures.sources.includes('stackexchange'),
    run: fetchStackExchange,
  },
  {
    id: 'reddit',
    name: 'Reddit',
    note: 'Public .json endpoints. Register a script app for heavy use.',
    enabled: () => config.ventures.sources.includes('reddit'),
    run: (opts) => fetchReddit({ ...opts, subreddits: config.ventures.subreddits }),
  },
  {
    id: 'discourse',
    name: 'Discourse forums',
    note: 'Any Discourse community, by name. Set VENTURE_FORUMS. No key, no account.',
    enabled: () =>
      config.ventures.sources.includes('discourse') && config.ventures.forums.length > 0,
    run: (opts) => fetchDiscourse({ ...opts, forums: config.ventures.forums }),
  },
  {
    id: 'github',
    name: 'GitHub issues',
    note: 'Feature requests nobody has built. Reactions are people saying "me too".',
    enabled: () => config.ventures.sources.includes('github'),
    run: fetchGitHub,
  },
  {
    id: 'lobsters',
    name: 'Lobsters',
    note: 'Small, technical, low noise. Public JSON, no key.',
    enabled: () => config.ventures.sources.includes('lobsters'),
    run: fetchLobsters,
  },
  {
    id: 'rss',
    name: 'Forums & feeds',
    note: 'Any RSS or Atom feed you list in VENTURE_FEEDS.',
    enabled: () => config.ventures.sources.includes('rss') && config.ventures.feeds.length > 0,
    run: (opts) => fetchRss({ ...opts, feeds: config.ventures.feeds }),
  },
];

/**
 * Harvest from every enabled source. Never throws: a source that is down,
 * blocked or rate limited is reported and skipped.
 * @returns {Promise<{signals: object[], report: object[]}>}
 */
export async function harvest({ phrases = SIGNAL_PHRASES, perPhrase = 6 } = {}) {
  const signals = [];
  const report = [];

  for (const source of SOURCES) {
    if (!source.enabled()) {
      report.push({ source: source.id, status: 'off' });
      continue;
    }
    try {
      const found = await source.run({ phrases, perPhrase });
      signals.push(...found);
      report.push({ source: source.id, status: 'ok', found: found.length });
    } catch (err) {
      const why = err.blockedLocally
        ? `${source.name} was blocked before it left this machine: ${err.body}. That is your network ` +
          'or proxy, not the source — nothing here will fix it.'
        : err.status === 403 || err.status === 429
          ? `${source.name} is rate limiting or blocking us (${err.status}). Backing off.`
          : `${source.name} unreachable: ${err.message}`;
      report.push({ source: source.id, status: 'failed', why });
      log({ agent: 'prospector', kind: 'source', level: 'warn', message: why, discord: false });
    }
  }

  return { signals, report };
}

export default harvest;
