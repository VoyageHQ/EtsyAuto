// What happened while you were not looking.
//
// The whole point of an agent fleet is that it works when you do not, which
// means the owner routinely comes back to a shop that moved without them.
// Scrolling an activity feed to reconstruct a night is the wrong job for a
// person: the feed is ordered by time, but what the owner needs is ordered by
// consequence — what needs a decision, what got made, what went wrong, what
// the shop learned.
//
// So this reads the same tables the dashboard reads and answers one question:
// since you last looked, what actually changed?
import { all, one, count, getSetting, setSetting } from './db.js';
import { openApprovals } from './approvals.js';
import { money } from './util.js';
import config from './config.js';

const SEEN_KEY = 'owner_last_seen';
const HOUR = 3600000;

/** When the owner last had eyes on the dashboard. */
export const lastSeen = () => Number(getSetting(SEEN_KEY, '0')) || 0;

/**
 * Mark the shop as seen.
 *
 * Deliberately not called on every state poll — an open dashboard on a second
 * monitor would keep clearing the digest nobody has read. The dashboard calls
 * this when the owner dismisses the card, and the CLI calls it after printing.
 */
export function markSeen(at = Date.now()) {
  setSetting(SEEN_KEY, String(at));
  return at;
}

/**
 * Everything worth knowing since a moment in time.
 *
 * @param {number} [since] defaults to when the owner last looked; a first run
 *                         with no record falls back to the last 12 hours so
 *                         the first digest is a night rather than all history.
 */
export function buildDigest(since = null) {
  const seen = since ?? (lastSeen() || Date.now() - 12 * HOUR);
  const rows = (sql, ...params) => all(sql, ...params);

  // --- what needs you --------------------------------------------------
  // Only approvals raised *since* you last looked. Ones you have already seen
  // are sitting in the heads-up panel directly below this card, and repeating
  // them there would both duplicate that panel and mean the digest could never
  // be dismissed — "got it" has to actually work.
  const stillOpen = openApprovals();
  const waiting = stillOpen
    .filter((a) => Number(a.created_at) > seen)
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      agent: a.agent_id,
      waitingHours: Math.round((Date.now() - Number(a.created_at)) / HOUR),
    }));

  // --- what got made ---------------------------------------------------
  const ideas = rows("SELECT title, category, score FROM ideas WHERE status = 'proposed' AND created_at > ? ORDER BY score DESC", seen);
  const finished = rows("SELECT sku, title, price, stage FROM products WHERE stage IN ('ready','listed') AND updated_at > ? ORDER BY updated_at DESC", seen);
  const started = count("SELECT COUNT(*) FROM products WHERE created_at > ?", seen);
  const listings = rows("SELECT title, status FROM listings WHERE updated_at > ? AND status IN ('exported','live','draft')", seen);

  // --- what it earned --------------------------------------------------
  const sales = rows('SELECT sku, amount, occurred_at FROM sales WHERE occurred_at > ?', seen);
  const takings = sales.reduce((total, s) => total + Number(s.amount || 0), 0);

  // --- the harbour -----------------------------------------------------
  const ventures = rows('SELECT name, status, stage FROM ventures WHERE updated_at > ?', seen);
  const signals = count('SELECT COUNT(*) FROM signals WHERE harvested_at > ?', seen);

  // --- what went wrong -------------------------------------------------
  // Only genuine faults. A rejected listing is the Inspector working, not a
  // problem, so it is counted separately and reported as work rather than
  // as an alarm.
  const problems = rows(
    "SELECT kind, message, ts FROM events WHERE ts > ? AND level = 'error' ORDER BY ts DESC LIMIT 8",
    seen
  );
  const rejections = count("SELECT COUNT(*) FROM events WHERE ts > ? AND kind = 'rejected'", seen);

  // --- what it learned -------------------------------------------------
  // Lessons the agents wrote for themselves are the interesting ones: they
  // mean the fleet noticed a repeated mistake without being told.
  const learned = rows(
    "SELECT text, agent_id FROM lessons WHERE created_at > ? AND active = 1 AND source NOT LIKE 'pack:%' ORDER BY created_at DESC LIMIT 6",
    seen
  );

  // --- what it cost ----------------------------------------------------
  const spend = one(
    'SELECT IFNULL(SUM(in_tokens),0) AS input, IFNULL(SUM(out_tokens),0) AS output, COUNT(*) AS calls FROM spend WHERE created_at > ?',
    seen
  ) || { input: 0, output: 0, calls: 0 };

  const digest = {
    since: seen,
    hours: Math.max(1, Math.round((Date.now() - seen) / HOUR)),
    waiting,
    // Everything outstanding, new or not, so the digest can say "and 4 others
    // still waiting" without listing them twice.
    waitingTotal: stillOpen.length,
    ideas,
    finished,
    started,
    listings,
    sales: { count: sales.length, takings, formatted: money(takings, config.currency) },
    ventures,
    signals,
    problems,
    rejections,
    learned,
    spend: { calls: spend.calls, tokens: Number(spend.input) + Number(spend.output) },
  };

  digest.headline = headlineFor(digest);
  // Nothing to say is a perfectly good answer, and saying it loudly is worse
  // than saying nothing at all.
  digest.quiet =
    !waiting.length && !ideas.length && !finished.length && !sales.length &&
    !ventures.length && !problems.length && !learned.length;

  return digest;
}

/** One sentence, leading with whatever the owner would most want to know. */
function headlineFor(d) {
  const bits = [];
  if (d.waiting.length) bits.push(`${d.waiting.length} thing${d.waiting.length === 1 ? '' : 's'} need you`);
  if (d.sales.count) bits.push(`${d.sales.count} sale${d.sales.count === 1 ? '' : 's'} (${d.sales.formatted})`);
  if (d.finished.length) bits.push(`${d.finished.length} product${d.finished.length === 1 ? '' : 's'} finished`);
  if (d.ideas.length) bits.push(`${d.ideas.length} new idea${d.ideas.length === 1 ? '' : 's'}`);
  if (d.ventures.length) bits.push(`${d.ventures.length} venture${d.ventures.length === 1 ? '' : 's'} moved`);
  if (d.problems.length) bits.push(`${d.problems.length} error${d.problems.length === 1 ? '' : 's'}`);
  if (!bits.length) return `Quiet for ${d.hours}h.`;
  return `In the last ${d.hours}h: ${bits.join(', ')}.`;
}

/** The same thing as plain text, for the terminal and for Discord. */
export function renderDigest(d) {
  const lines = [d.headline, ''];

  if (d.waiting.length) {
    lines.push('NEW, AND WAITING ON YOU');
    for (const a of d.waiting) {
      lines.push(`  · ${a.title}${a.waitingHours >= 1 ? `  (${a.waitingHours}h)` : ''}`);
    }
    const older = d.waitingTotal - d.waiting.length;
    if (older > 0) lines.push(`  · …and ${older} you have already seen, still in heads up`);
    lines.push('');
  }

  if (d.finished.length) {
    lines.push('FINISHED');
    for (const p of d.finished) lines.push(`  · ${p.sku} ${p.title} — ${money(p.price, config.currency)}`);
    lines.push('');
  }

  if (d.ideas.length) {
    lines.push(`NEW IDEAS (${d.ideas.length})`);
    for (const i of d.ideas.slice(0, 5)) lines.push(`  · ${i.title}`);
    if (d.ideas.length > 5) lines.push(`  · …and ${d.ideas.length - 5} more`);
    lines.push('');
  }

  if (d.sales.count) {
    lines.push(`SALES — ${d.sales.formatted} across ${d.sales.count}`);
    lines.push('');
  }

  if (d.ventures.length || d.signals) {
    lines.push('THE HARBOUR');
    if (d.signals) lines.push(`  · ${d.signals} new signal(s) heard`);
    for (const v of d.ventures) lines.push(`  · ${v.name} — ${v.status}, at the ${v.stage} stage`);
    lines.push('');
  }

  if (d.learned.length) {
    lines.push('LEARNED');
    for (const l of d.learned) lines.push(`  · ${l.agent_id || 'everyone'}: ${l.text}`);
    lines.push('');
  }

  if (d.problems.length) {
    lines.push('WENT WRONG');
    for (const p of d.problems) lines.push(`  · ${p.message}`);
    lines.push('');
  }

  if (d.rejections) {
    lines.push(`The Inspector sent ${d.rejections} piece(s) of work back. That is it doing its job.`);
    lines.push('');
  }

  if (d.spend.calls) {
    lines.push(`Brain: ${d.spend.calls} call(s), ${d.spend.tokens.toLocaleString()} tokens.`);
  }

  return lines.join('\n').trim();
}

export default buildDigest;
