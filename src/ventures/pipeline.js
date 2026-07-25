// The venture arm's own lifecycle, kept entirely separate from the shop's.
//
//   signal ──▶ venture (proposed) ──you approve──▶ analysis ──▶ plan
//          ──▶ build ──▶ marketing ──▶ live
//
import { all, count, insert, one, json, update } from '../core/db.js';
import { uid, now, slug } from '../core/util.js';
import { log, pushState } from '../core/events.js';
import { enqueue } from '../pipeline/queue.js';
import config from '../core/config.js';

export const VENTURE_STAGES = ['analysis', 'plan', 'build', 'marketing', 'live'];

const STAGE_OWNER = {
  analysis: { agent: 'analyst', kind: 'analyst.validate' },
  plan: { agent: 'architect', kind: 'architect.plan' },
  build: { agent: 'builder', kind: 'builder.build' },
  marketing: { agent: 'marketer', kind: 'marketer.launch' },
};

// --- signals ---------------------------------------------------------------

/** Store what was harvested, ignoring anything already seen. */
export function saveSignals(signals) {
  let added = 0;
  for (const signal of signals) {
    const exists = one(
      'SELECT id FROM signals WHERE source = ? AND external_id = ?',
      signal.source,
      signal.externalId
    );
    if (exists) continue;
    insert('signals', {
      id: uid('sig'),
      source: signal.source,
      external_id: signal.externalId,
      title: signal.title,
      text: signal.text,
      url: signal.url,
      author: signal.author,
      score: signal.score,
      comments: signal.comments,
      phrase: signal.phrase,
      channel: signal.channel,
      posted_at: signal.postedAt,
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

export function createVenture(idea) {
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
