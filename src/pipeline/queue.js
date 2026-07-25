// The work queue. Agents never call each other directly; they leave jobs.
import { all, insert, one, update, count, json } from '../core/db.js';
import { uid, now } from '../core/util.js';
import { pushState } from '../core/events.js';

/**
 * @param {object} spec
 * @param {string} spec.agent   agent id that should do it
 * @param {string} spec.kind    job kind, e.g. "maker.build"
 * @param {string} [spec.subject] human label for the dashboard
 * @param {object} [spec.payload]
 * @param {number} [spec.priority] 1 = urgent, 9 = whenever
 * @param {boolean} [spec.unique] skip if an identical job is already waiting
 */
export function enqueue(spec) {
  if (spec.unique !== false) {
    const existing = one(
      "SELECT id FROM jobs WHERE agent_id = ? AND kind = ? AND status IN ('queued','running') AND IFNULL(payload,'') = ?",
      spec.agent,
      spec.kind,
      spec.payload ? JSON.stringify(spec.payload) : ''
    );
    if (existing) return existing.id;
  }
  const id = uid('job');
  insert('jobs', {
    id,
    agent_id: spec.agent,
    kind: spec.kind,
    subject: spec.subject ?? null,
    payload: spec.payload ?? null,
    status: 'queued',
    priority: spec.priority ?? 5,
    attempts: 0,
    created_at: now(),
  });
  pushState('job');
  return id;
}

export function claimNext() {
  const job = one(
    "SELECT * FROM jobs WHERE status = 'queued' ORDER BY priority ASC, created_at ASC LIMIT 1"
  );
  if (!job) return null;
  update('jobs', job.id, { status: 'running', started_at: now(), attempts: job.attempts + 1 });
  pushState('job');
  return { ...job, payload: json(job.payload, {}) };
}

export function finish(jobId, result) {
  update('jobs', jobId, { status: 'done', result: result ?? null, finished_at: now() });
  pushState('job');
}

export function fail(jobId, error, retry = true) {
  const job = one('SELECT * FROM jobs WHERE id = ?', jobId);
  const attempts = job?.attempts ?? 1;
  const willRetry = retry && attempts < 3;
  update('jobs', jobId, {
    status: willRetry ? 'queued' : 'failed',
    error: String(error?.message || error).slice(0, 800),
    finished_at: willRetry ? null : now(),
  });
  pushState('job');
  return willRetry;
}

/** Park a job until a human answers something. */
export function block(jobId, reason) {
  update('jobs', jobId, { status: 'blocked', error: reason, finished_at: now() });
  pushState('job');
}

export function unblock(jobId) {
  update('jobs', jobId, { status: 'queued', error: null, finished_at: null });
  pushState('job');
}

export const queuedCount = () =>
  count("SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')");

export const recentJobs = (limit = 25) =>
  all('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?', limit).map((j) => ({
    ...j,
    payload: json(j.payload, {}),
  }));

export default { enqueue, claimNext, finish, fail, block, unblock, queuedCount, recentJobs };
