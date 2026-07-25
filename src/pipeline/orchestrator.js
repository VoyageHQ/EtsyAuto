// The clock. Ticks, hands out jobs, and reacts to your decisions.
import config from '../core/config.js';
import { bus, log, pushState } from '../core/events.js';
import { getAgent } from '../agents/registry.js';
import { claimNext, finish, fail, enqueue } from './queue.js';
import { getProduct, setStage, scheduleStage, getIdea } from './products.js';
import { update, one, all } from '../core/db.js';
import { now } from '../core/util.js';
import { teach } from '../core/memory.js';

let running = false;
let timer = null;
let busy = false;

/** Do one unit of work. Returns true if something was done. */
export async function tick() {
  if (busy) return false;
  busy = true;
  try {
    const job = claimNext();
    if (!job) return false;
    const agent = getAgent(job.agent_id);
    if (!agent) {
      fail(job.id, new Error(`No agent called "${job.agent_id}"`), false);
      return true;
    }
    try {
      const outcome = await agent.handle(job);
      finish(job.id, outcome?.result ?? null);
      agent.setStatus('idle', null);
    } catch (err) {
      const retrying = fail(job.id, err);
      agent.say(
        `${job.kind} failed: ${err.message}${retrying ? ' — I will try again.' : ' — giving up on this one.'}`,
        { level: 'error', kind: 'error' }
      );
      agent.setStatus('idle', null);
    }
    return true;
  } finally {
    busy = false;
  }
}

/** Keep ticking until the queue is empty. Used by the CLI and tests. */
export async function drain(limit = 50) {
  let done = 0;
  while (done < limit) {
    const did = await tick();
    if (!did) break;
    done++;
  }
  return done;
}

export function start() {
  if (running) return;
  running = true;
  const interval = Math.max(2, config.tickSeconds) * 1000;

  const loop = async () => {
    try {
      // The Manager plans, then whoever has queued work gets on with it.
      enqueue({ agent: 'manager', kind: 'manager.plan', subject: 'planning', priority: 8 });
      await drain(6);
    } catch (err) {
      log({ kind: 'error', level: 'error', message: `Tick blew up: ${err.message}` });
    }
    if (running) timer = setTimeout(loop, interval);
  };

  log({
    kind: 'valley',
    level: 'good',
    message: `${config.valleyName} is awake. Ticking every ${config.tickSeconds}s.`,
  });
  loop();
}

export function stop() {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

export const isRunning = () => running;

// --- reacting to your decisions -------------------------------------------

bus.on('approval:answered', (approval) => {
  try {
    route(approval);
  } catch (err) {
    log({ kind: 'error', level: 'error', message: `Could not act on your answer: ${err.message}` });
  }
});

function route(approval) {
  if (approval.kind === 'listing') {
    const product = getProduct(approval.ref_id);
    if (!product) return;
    if (approval.answer === 'publish') {
      enqueue({
        agent: 'lister',
        kind: 'lister.publish',
        subject: `${product.sku} ${product.title}`,
        payload: { productId: product.id },
        priority: 2,
      });
    } else if (approval.answer === 'changes') {
      setStage(product.id, 'design', { status: 'active' });
      scheduleStage(getProduct(product.id));
    } else if (approval.answer === 'hold') {
      update('products', product.id, { status: 'parked', updated_at: now() });
    }
    pushState('approval-route');
    return;
  }

  if (approval.kind === 'question') {
    const product = getProduct(approval.ref_id);
    if (!product) return;
    if (approval.answer === 'rebuild') {
      setStage(product.id, 'design', { status: 'active' });
      scheduleStage(getProduct(product.id));
    } else if (approval.answer === 'park') {
      update('products', product.id, { status: 'parked', updated_at: now() });
    } else if (approval.answer === 'abandon') {
      update('products', product.id, { status: 'abandoned', updated_at: now() });
    }
    pushState('approval-route');
  }
}

/**
 * Your yes or no on an idea. A reason attached to a rejection becomes a
 * lesson, so the Scout stops bringing you that kind of thing.
 * @param {string} ideaId
 * @param {'approved'|'rejected'|'shelved'} decision
 * @param {string} [note]
 * @param {string} [source]
 */
export function decideIdea(ideaId, decision, note = '', source = 'dashboard') {
  const idea = getIdea(ideaId);
  if (!idea) throw new Error('No such idea.');
  if (!['approved', 'rejected', 'shelved'].includes(decision)) {
    throw new Error(`Unknown decision "${decision}".`);
  }
  update('ideas', ideaId, {
    status: decision,
    note: note || null,
    decided_at: now(),
  });

  log({
    agent: 'scout',
    station: 'research-bench',
    kind: decision === 'approved' ? 'approved' : decision === 'shelved' ? 'shelved' : 'rejected',
    level: decision === 'approved' ? 'good' : 'info',
    message: `"${idea.title}" ${decision}${note ? ` — ${note}` : ''}`,
    meta: { ideaId },
  });

  if (decision === 'rejected' && note.trim()) {
    teach('scout', `Do not propose ideas like "${idea.title}": ${note.trim()}`, source);
  }
  if (decision === 'approved') {
    enqueue({ agent: 'manager', kind: 'manager.plan', subject: 'start approved work', priority: 3 });
  }
  pushState('idea-decision');
  return { ...idea, status: decision };
}

/** Bulk decide, which is how the Discord and dashboard lists work. */
export function decideIdeas(ids, decision, note = '', source = 'dashboard') {
  return ids.map((id) => decideIdea(id, decision, note, source));
}

/** Rebuild a product's files from scratch, keeping its listing copy. */
export function rebuild(productId) {
  const product = getProduct(productId);
  if (!product) throw new Error('No such product.');
  setStage(productId, 'design', { status: 'active' });
  scheduleStage(getProduct(productId));
  return getProduct(productId);
}

/** Ask the Scout for ideas right now, optionally on a theme. */
export function requestIdeas(count = 8, theme = null) {
  return enqueue({
    agent: 'scout',
    kind: 'scout.brainstorm',
    subject: theme ? `ideas: ${theme}` : `${count} ideas`,
    payload: { count, theme },
    priority: 2,
    unique: false,
  });
}

export const stuckProducts = () =>
  all("SELECT * FROM products WHERE status IN ('blocked','parked') ORDER BY updated_at DESC");

export default { start, stop, tick, drain, decideIdea, decideIdeas, requestIdeas, rebuild };
