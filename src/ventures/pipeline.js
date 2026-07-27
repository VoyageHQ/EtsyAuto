// The venture arm's own lifecycle, kept entirely separate from the shop's.
//
//   signal ──▶ venture (proposed) ──you approve──▶ analysis ──▶ plan
//          ──▶ build ──▶ marketing ──▶ live
//
import { all, count, insert, one, json, update } from '../core/db.js';
import { uid, now, slug, BadInput } from '../core/util.js';
import { log, pushState } from '../core/events.js';
import { enqueue } from '../pipeline/queue.js';
import { similarity, TOO_SIMILAR } from '../core/similarity.js';
import config from '../core/config.js';

export const VENTURE_STAGES = ['analysis', 'plan', 'build', 'marketing', 'live'];

const STAGE_OWNER = {
  analysis: { agent: 'analyst', kind: 'analyst.validate' },
  plan: { agent: 'architect', kind: 'architect.plan' },
  build: { agent: 'builder', kind: 'builder.build' },
  marketing: { agent: 'marketer', kind: 'marketer.launch' },
};

// --- signals ---------------------------------------------------------------

/**
 * Store what was harvested, ignoring anything already seen.
 *
 * Signals come from other people's servers — Hacker News, a subreddit, whatever
 * RSS feed you pointed it at — and a feed that changes shape mid-harvest is
 * normal, not exceptional. One malformed post must cost one post, never the
 * whole run, so every field is coerced to something SQLite will accept and a
 * signal with nothing to identify it is skipped rather than thrown.
 */
export function saveSignals(signals) {
  let added = 0;
  for (const raw of Array.isArray(signals) ? signals : []) {
    if (!raw || typeof raw !== 'object') continue;

    const text = (value) => (value === undefined || value === null ? null : String(value));
    const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

    const source = text(raw.source) || 'unknown';
    // Without a stable id we cannot tell a repeat from a new post, so fall back
    // to the URL — the one thing every source has — and drop it if even that is
    // missing rather than filling the table with duplicates.
    const externalId = text(raw.externalId) || text(raw.url);
    if (!externalId) continue;

    const exists = one('SELECT id FROM signals WHERE source = ? AND external_id = ?', source, externalId);
    if (exists) continue;

    insert('signals', {
      id: uid('sig'),
      source,
      external_id: externalId,
      title: text(raw.title),
      text: text(raw.text),
      url: text(raw.url),
      author: text(raw.author),
      score: number(raw.score),
      comments: number(raw.comments),
      phrase: text(raw.phrase),
      channel: text(raw.channel),
      posted_at: number(raw.postedAt) || now(),
      // Some sources say whether anybody ever answered. An unanswered question
      // with real traffic is the clearest gap the harvester can find.
      unanswered: raw.unanswered ? 1 : 0,
      harvested_at: now(),
      used: 0,
    });
    added++;
  }
  if (added) pushState('signals');
  return added;
}

export const recentSignals = (limit = 60) =>
  all('SELECT * FROM signals ORDER BY harvested_at DESC, posted_at DESC LIMIT ?', limit);

export const unusedSignals = (limit = 120) =>
  all('SELECT * FROM signals WHERE used = 0 ORDER BY posted_at DESC LIMIT ?', limit);

export const markUsed = (ids) => {
  for (const id of ids) update('signals', id, { used: 1 });
};

export const signalCount = () => count('SELECT COUNT(*) FROM signals');

// --- ventures --------------------------------------------------------------

/**
 * Ventures this shop has already thought of, closest first.
 *
 * The Etsy side keeps near-duplicate ideas on purpose — the owner asked for
 * that, and the Maker varies the design. A business is not a product: two
 * identical companies is not a range, it is the same plan written out twice.
 * Eighteen copies of one venture is what this shop actually did, and each one
 * ran the whole pipeline and asked to launch.
 */
export function existingVenture(name) {
  const known = all('SELECT id, name, slug, stage, status FROM ventures');
  let best = null;
  for (const row of known) {
    const score = similarity(name, row.name);
    if (!best || score > best.score) best = { ...row, score };
  }
  return best && best.score >= TOO_SIMILAR ? best : null;
}

export function createVenture(idea) {
  // Hand back what is already on the books rather than adding a copy of it.
  // The caller gets a venture either way, so nothing downstream has to learn
  // a new shape; what it does not get is a second row.
  const already = existingVenture(idea.name);
  if (already) {
    log({
      agent: 'prospector',
      kind: 'ideas',
      level: 'note',
      message: `"${idea.name}" is the business already on the books as "${already.name}" — not adding it twice.`,
      meta: { ventureId: already.id, score: Number(already.score.toFixed(2)) },
      discord: false,
    });
    return getVenture(already.id);
  }

  const base = slug(idea.name, 40) || 'venture';
  let candidate = base;
  let n = 2;
  while (one('SELECT id FROM ventures WHERE slug = ?', candidate)) candidate = `${base}-${n++}`;

  const id = uid('ven');
  insert('ventures', {
    id,
    slug: candidate,
    name: idea.name,
    one_liner: idea.oneLiner,
    problem: idea.problem,
    audience: idea.audience,
    solution: idea.solution,
    monetisation: idea.monetisation ?? null,
    analysis: null,
    plan: null,
    evidence: idea.evidence ?? [],
    effort: idea.effort ?? 3,
    confidence: idea.confidence ?? 3,
    score: idea.score ?? 0,
    status: 'proposed',
    stage: 'analysis',
    dir: null,
    created_at: now(),
    updated_at: now(),
  });
  pushState('venture');
  return getVenture(id);
}

export function getVenture(id) {
  const row = one('SELECT * FROM ventures WHERE id = ?', id);
  return row ? hydrate(row) : null;
}

export function getVentureBySlug(slugValue) {
  const row = one('SELECT * FROM ventures WHERE slug = ?', slugValue);
  return row ? hydrate(row) : null;
}

export function listVentures(where = '') {
  return all(`SELECT * FROM ventures ${where} ORDER BY score DESC, created_at DESC`).map(hydrate);
}

function hydrate(row) {
  return {
    ...row,
    monetisation: json(row.monetisation),
    analysis: json(row.analysis),
    plan: json(row.plan),
    evidence: json(row.evidence, []),
  };
}

/** Queue whoever owns the venture's current stage. */
export function scheduleVentureStage(venture) {
  const owner = STAGE_OWNER[venture.stage];
  if (!owner) return null;
  return enqueue({
    agent: owner.agent,
    kind: owner.kind,
    subject: venture.name,
    payload: { ventureId: venture.id },
    priority: 4,
  });
}

export function advanceVenture(venture, patch = {}) {
  const index = VENTURE_STAGES.indexOf(venture.stage);
  const next = VENTURE_STAGES[Math.min(index + 1, VENTURE_STAGES.length - 1)];
  update('ventures', venture.id, { ...patch, stage: next, updated_at: now() });
  const updated = getVenture(venture.id);
  if (next !== 'live') scheduleVentureStage(updated);
  pushState('venture');
  return updated;
}

export function setVentureStage(ventureId, stage, patch = {}) {
  update('ventures', ventureId, { ...patch, stage, updated_at: now() });
  pushState('venture');
  return getVenture(ventureId);
}

export const activeVentureCount = () =>
  count("SELECT COUNT(*) FROM ventures WHERE status IN ('approved','building') AND stage != 'live'");

/**
 * Your yes or no on a venture. A reason attached to a rejection teaches the
 * Prospector, exactly like the shop's ideas do.
 */
export function decideVenture(ventureId, decision, note = '', source = 'dashboard') {
  const venture = getVenture(ventureId);
  if (!venture) throw new Error('No such venture.');
  if (!['approved', 'rejected', 'shelved'].includes(decision)) {
    throw new Error(`Unknown decision "${decision}".`);
  }
  update('ventures', ventureId, {
    status: decision,
    note: note || null,
    decided_at: now(),
    updated_at: now(),
  });

  log({
    agent: 'prospector',
    station: 'lighthouse',
    kind: decision === 'approved' ? 'greenlit' : decision,
    level: decision === 'approved' ? 'good' : 'info',
    message: `"${venture.name}" ${decision}${note ? ` — ${note}` : ''}`,
    meta: { ventureId },
  });

  if (decision === 'approved') {
    scheduleVentureStage(getVenture(ventureId));
    enqueue({ agent: 'harbourmaster', kind: 'harbourmaster.plan', subject: 'greenlight', priority: 3 });
  }
  pushState('venture-decision');
  return getVenture(ventureId);
}

// --- assets and money ------------------------------------------------------

export function recordVentureAsset({ ventureId, kind, label, path, bytes }) {
  const id = uid('vas');
  insert('venture_assets', {
    id,
    venture_id: ventureId,
    kind,
    label,
    path,
    bytes: bytes ?? null,
    created_at: now(),
  });
  return id;
}

export const ventureAssets = (ventureId) =>
  all('SELECT * FROM venture_assets WHERE venture_id = ? ORDER BY kind, label', ventureId);

export function clearVentureAssets(ventureId, kind = null) {
  if (kind) {
    all('SELECT id FROM venture_assets WHERE venture_id = ? AND kind = ?', ventureId, kind).forEach(
      (row) => update('venture_assets', row.id, { path: null })
    );
  }
}

/**
 * Money a venture actually took.
 *
 * Recorded by hand or from a Stripe receipt — never inferred. A revenue figure
 * this shop made up would be the most damaging number on the whole dashboard.
 */
export function recordVentureRevenue({ ventureId, amount, currency, kind = 'one-off', note = '' }) {
  const value = Number(amount);
  if (!getVenture(ventureId)) throw new BadInput('No such venture.');
  if (!Number.isFinite(value) || value <= 0) throw new BadInput('That is not an amount.');
  const id = uid('vrev');
  insert('venture_revenue', {
    id,
    venture_id: ventureId,
    amount: value,
    currency: currency || config.currency,
    kind,
    note: String(note).slice(0, 300),
    occurred_at: now(),
  });
  log({
    agent: 'operator',
    kind: 'venture',
    level: 'good',
    message: `${getVenture(ventureId).name} took ${value} ${currency || config.currency}. That is the first number that matters.`,
    meta: { ventureId },
  });
  pushState('venture');
  return id;
}

/** Where a live venture can be reached, so the Operator can check it is up. */
export function setVentureUrl(ventureId, url) {
  const venture = getVenture(ventureId);
  if (!venture) throw new BadInput('No such venture.');
  const clean = String(url || '').trim();
  if (clean && !/^https?:\/\//i.test(clean)) throw new BadInput('That needs to start with http:// or https://');
  update('ventures', ventureId, { url: clean || null, updated_at: now() });
  pushState('venture');
  return getVenture(ventureId);
}

export const ventureRevenue = (ventureId) =>
  Number(
    one('SELECT IFNULL(SUM(amount), 0) AS t FROM venture_revenue WHERE venture_id = ?', ventureId)?.t || 0
  );

export const totalVentureRevenue = () =>
  Number(one('SELECT IFNULL(SUM(amount), 0) AS t FROM venture_revenue')?.t || 0);

// --- marketing -------------------------------------------------------------

export function saveCampaign({ ventureId, name, channel, status, budget, plan }) {
  const id = uid('camp');
  insert('marketing', {
    id,
    venture_id: ventureId,
    name,
    channel: channel ?? null,
    status: status || 'draft',
    budget: budget ?? 0,
    plan: plan ?? null,
    created_at: now(),
    updated_at: now(),
  });
  pushState('marketing');
  return id;
}

export const campaignsFor = (ventureId) =>
  all('SELECT * FROM marketing WHERE venture_id = ? ORDER BY created_at DESC', ventureId).map((row) => ({
    ...row,
    plan: json(row.plan),
  }));

export const allCampaigns = () =>
  all('SELECT * FROM marketing ORDER BY created_at DESC LIMIT 40').map((row) => ({
    ...row,
    plan: json(row.plan),
  }));

export const liveCampaignCount = () =>
  count("SELECT COUNT(*) FROM marketing WHERE status IN ('approved','running')");

export function setCampaignStatus(id, status) {
  update('marketing', id, { status, updated_at: now() });
  pushState('marketing');
}

/** Where a venture's files live, relative to the repo root. */
export const ventureDir = (venture) => `${config.ventures.dir}/${venture.slug}`;

export default {
  saveSignals,
  createVenture,
  getVenture,
  listVentures,
  decideVenture,
  advanceVenture,
  scheduleVentureStage,
};
