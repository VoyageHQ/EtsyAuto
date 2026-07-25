// Human gates. Agents can do anything they like inside the valley, but
// anything that reaches the outside world — or costs you money, or puts your
// shop name on something — stops here and waits for you.
import { all, insert, one, update, json } from './db.js';
import { uid, now } from './util.js';
import { bus, log, pushState } from './events.js';

/**
 * Ask the owner something and pause the work until they answer.
 * @param {object} req
 * @param {string} req.kind      ideas | listing | question | design
 * @param {string} [req.refId]   the thing being decided on
 * @param {string} [req.agent]
 * @param {string} [req.station]
 * @param {string} req.title     one-line summary shown in the HEADS UP panel
 * @param {string} [req.detail]  markdown-ish body
 * @param {{value:string,label:string}[]} [req.options]
 */
export function ask(req) {
  const id = uid('ask');
  insert('approvals', {
    id,
    kind: req.kind,
    ref_id: req.refId ?? null,
    agent_id: req.agent ?? null,
    station: req.station ?? null,
    title: req.title,
    detail: req.detail ?? null,
    options: req.options ?? [
      { value: 'yes', label: 'Go ahead' },
      { value: 'no', label: 'Skip it' },
    ],
    status: 'open',
    created_at: now(),
  });
  log({
    agent: req.agent,
    station: req.station,
    kind: 'asked',
    level: 'warn',
    message: req.title,
    meta: { approvalId: id, kind: req.kind, detail: req.detail },
  });
  bus.emit('approval:open', { id, ...req });
  pushState('approval');
  return id;
}

export function openApprovals() {
  return all("SELECT * FROM approvals WHERE status = 'open' ORDER BY created_at ASC").map(hydrate);
}

export function getApproval(id) {
  const row = one('SELECT * FROM approvals WHERE id = ?', id);
  return row ? hydrate(row) : null;
}

export function answer(id, value, source = 'dashboard') {
  const approval = getApproval(id);
  if (!approval) throw new Error(`No such request: ${id}`);
  if (approval.status !== 'open') return approval;
  update('approvals', id, { status: 'answered', answer: String(value), answered_at: now() });
  const updated = getApproval(id);
  log({
    agent: approval.agent_id || undefined,
    station: approval.station || undefined,
    kind: 'decided',
    level: 'good',
    message: `You answered "${value}" to: ${approval.title}`,
    meta: { approvalId: id, source },
  });
  bus.emit('approval:answered', updated);
  pushState('approval');
  return updated;
}

export function cancel(id, why = '') {
  const approval = getApproval(id);
  if (!approval || approval.status !== 'open') return;
  update('approvals', id, { status: 'cancelled', answer: why, answered_at: now() });
  pushState('approval');
}

/** Cancel any open request pointing at a thing (e.g. an idea you deleted). */
export function cancelFor(refId, why = 'superseded') {
  for (const a of all("SELECT id FROM approvals WHERE status = 'open' AND ref_id = ?", refId)) {
    cancel(a.id, why);
  }
}

function hydrate(row) {
  return { ...row, options: json(row.options, []) };
}

export default { ask, answer, cancel, cancelFor, openApprovals, getApproval };
