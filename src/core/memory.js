// Teaching. Anything you tell an agent here is injected into its prompt for
// every future job, so corrections stick without touching code.
import { all, insert, one, run, update } from './db.js';
import { uid, now } from './util.js';
import { log, pushState } from './events.js';

/**
 * Teach an agent (or the whole valley) something new.
 * @param {string|null} agentId  null teaches every agent
 * @param {string} text          the lesson, written as an instruction
 * @param {string} source        dashboard | discord | cli | agent
 */
export function teach(agentId, text, source = 'dashboard') {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('A lesson needs some text.');
  const id = uid('les');
  insert('lessons', {
    id,
    agent_id: agentId || null,
    text: clean,
    source,
    active: 1,
    created_at: now(),
  });
  log({
    agent: agentId || undefined,
    kind: 'taught',
    level: 'good',
    message: agentId
      ? `${agentId} learned: "${clean}"`
      : `Everyone learned: "${clean}"`,
    meta: { lessonId: id, source },
  });
  pushState('lesson');
  return id;
}

export function forget(lessonId) {
  const lesson = one('SELECT * FROM lessons WHERE id = ?', lessonId);
  if (!lesson) return false;
  update('lessons', lessonId, { active: 0 });
  log({
    agent: lesson.agent_id || undefined,
    kind: 'forgot',
    level: 'warn',
    message: `Dropped lesson: "${lesson.text}"`,
  });
  pushState('lesson');
  return true;
}

export function lessonsFor(agentId) {
  return all(
    'SELECT * FROM lessons WHERE active = 1 AND (agent_id IS NULL OR agent_id = ?) ORDER BY created_at ASC',
    agentId
  );
}

export function allLessons() {
  return all('SELECT * FROM lessons WHERE active = 1 ORDER BY created_at DESC');
}

/** The block of text appended to an agent's system prompt. */
export function lessonBlock(agentId) {
  const lessons = lessonsFor(agentId);
  if (!lessons.length) return '';
  const lines = lessons.map((l, i) => `${i + 1}. ${l.text}`).join('\n');
  return [
    '',
    'HOUSE RULES — the shop owner taught you these. They override your own',
    'instincts and any generic best practice. Follow them exactly.',
    lines,
  ].join('\n');
}

export default { teach, forget, lessonsFor, allLessons, lessonBlock };
