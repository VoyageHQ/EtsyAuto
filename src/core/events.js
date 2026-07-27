// The valley's nervous system. Everything an agent does is logged here,
// persisted to the activity feed, and pushed live to the dashboard and to
// Discord.
import { EventEmitter } from 'node:events';
import { insert, all, json } from './db.js';
import { uid, now } from './util.js';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

const LEVEL_COLOUR = {
  info: '\x1b[38;5;110m',
  good: '\x1b[38;5;114m',
  warn: '\x1b[38;5;179m',
  error: '\x1b[38;5;174m',
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

/**
 * Record something that happened.
 * @param {object} e
 * @param {string} [e.agent]    agent id, e.g. "scout"
 * @param {string} [e.station]  where on the map it happened
 * @param {string} e.kind       short chip shown in the feed, e.g. "IDEAS"
 * @param {string} e.message    human sentence
 * @param {string} [e.level]    info | good | warn | error
 * @param {object} [e.meta]     anything extra
 * @param {boolean} [e.discord] set false to keep it out of Discord
 */
/**
 * The last few things said, so the same sentence is not said again.
 *
 * A loop that says one thing fifteen times a minute is unreadable, and worse,
 * it buries the lines that matter. The repeat is always a bug somewhere else —
 * but the log is where the owner meets it, so this is where it gets stopped.
 * Collapsed rather than dropped: the count is kept and reported when the run
 * of repeats ends, so nothing is hidden.
 */
const recent = new Map();
const REPEAT_WINDOW = 60000;

function repeatOf(message) {
  const seen = recent.get(message);
  const at = Date.now();
  // Keep the map from growing without bound on a shop that runs all night.
  if (recent.size > 200) {
    for (const [key, value] of recent) if (at - value.at > REPEAT_WINDOW) recent.delete(key);
  }
  if (!seen || at - seen.at > REPEAT_WINDOW) {
    recent.set(message, { at, count: 0 });
    return 0;
  }
  seen.at = at;
  seen.count += 1;
  return seen.count;
}

export function log(e) {
  // The second and third copies are worth seeing — you cannot tell a loop from
  // a coincidence otherwise. After that, silence until it stops.
  const repeats = repeatOf(String(e.message));
  if (repeats === 3) {
    e = { ...e, message: `${e.message}  (repeating — I will stop saying this)` };
  } else if (repeats > 3) {
    return null;
  }

  const record = {
    id: uid('ev'),
    ts: now(),
    agent_id: e.agent ?? null,
    station: e.station ?? null,
    kind: (e.kind || 'note').toUpperCase().slice(0, 12),
    level: e.level || 'info',
    message: e.message,
    meta: e.meta ? JSON.stringify(e.meta) : null,
  };
  insert('events', record);

  const colour = LEVEL_COLOUR[record.level] || '';
  const stamp = new Date(record.ts).toTimeString().slice(0, 5);
  const who = record.agent_id ? ` ${record.agent_id}` : '';
  process.stdout.write(
    `${DIM}${stamp}${RESET} ${colour}${record.kind.padEnd(8)}${RESET}${DIM}${who}${RESET} ${record.message}\n`
  );

  const payload = { ...e, ...record, meta: e.meta ?? null };
  bus.emit('event', payload);
  if (e.discord !== false) bus.emit('discord', payload);
  return record.id;
}

export function recentEvents(limit = 60) {
  return all('SELECT * FROM events ORDER BY ts DESC LIMIT ?', limit).map((row) => ({
    ...row,
    meta: json(row.meta),
  }));
}

/** Tell every connected surface that state changed and they should refetch. */
export function pushState(reason = 'change') {
  bus.emit('state', { reason, ts: now() });
}

export default { bus, log, recentEvents, pushState };
