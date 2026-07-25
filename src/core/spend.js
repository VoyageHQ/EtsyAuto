// The meter on the agents' brain.
//
// A loop that runs all night with a paid model is the one way this project can
// cost you real money. So: every call is counted, there is a daily cap, and
// hitting the cap makes the agents fall back to their offline craft rather than
// stopping the shop or spending more.
import { all, insert, one } from './db.js';
import config from './config.js';
import { uid, now } from './util.js';
import { log } from './events.js';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local

/** Rough token count. Four characters per token is close enough for a cap. */
export const estimate = (text) => Math.ceil(String(text || '').length / 4);

/**
 * @param {object} usage
 * @param {string} [usage.agent]
 * @param {string} [usage.model]
 * @param {number} usage.inTokens
 * @param {number} usage.outTokens
 * @param {boolean} [usage.estimated]
 */
export function record({ agent, model, inTokens, outTokens, estimated }) {
  insert('spend', {
    id: uid('sp'),
    day: today(),
    agent_id: agent || null,
    provider: config.llm.provider,
    model: model || null,
    in_tokens: Math.max(0, Math.round(inTokens || 0)),
    out_tokens: Math.max(0, Math.round(outTokens || 0)),
    estimated: estimated ? 1 : 0,
    created_at: now(),
  });
}

export function todayUsage() {
  const row = one(
    `SELECT IFNULL(SUM(in_tokens), 0) AS input, IFNULL(SUM(out_tokens), 0) AS output, COUNT(*) AS calls
     FROM spend WHERE day = ?`,
    today()
  );
  const input = Number(row?.input || 0);
  const output = Number(row?.output || 0);
  return {
    day: today(),
    calls: Number(row?.calls || 0),
    input,
    output,
    total: input + output,
    cap: config.llm.dailyTokens,
    cost: costOf(input, output),
    currency: config.currency,
  };
}

export function usageByAgent() {
  return all(
    `SELECT agent_id AS agent, COUNT(*) AS calls,
            IFNULL(SUM(in_tokens), 0) AS input, IFNULL(SUM(out_tokens), 0) AS output
     FROM spend WHERE day = ? GROUP BY agent_id ORDER BY (SUM(in_tokens) + SUM(out_tokens)) DESC`,
    today()
  );
}

/**
 * Only meaningful if you have set the rates for your model — they change often
 * enough that hard-coding them would just be wrong. Per million tokens.
 */
export function costOf(inTokens, outTokens) {
  const inRate = config.llm.costIn;
  const outRate = config.llm.costOut;
  if (!inRate && !outRate) return null;
  return (inTokens / 1e6) * inRate + (outTokens / 1e6) * outRate;
}

let warned = null;

/** True when today's cap is spent. */
export function overBudget() {
  const cap = config.llm.dailyTokens;
  if (!cap) return false;
  const { total } = todayUsage();
  if (total < cap) return false;
  if (warned !== today()) {
    warned = today();
    log({
      kind: 'budget',
      level: 'warn',
      message:
        `Today's token cap of ${cap.toLocaleString()} is spent. The agents will carry on using ` +
        'their offline craft until midnight, so nothing stops and nothing more is charged.',
    });
  }
  return true;
}

export function remaining() {
  const cap = config.llm.dailyTokens;
  if (!cap) return null;
  return Math.max(0, cap - todayUsage().total);
}

export default { record, todayUsage, usageByAgent, overBudget, remaining, estimate };
