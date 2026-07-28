// The agents' brain. Three providers:
//
//   offline  - no network, no key, no cost. Agents fall back to their own
//              deterministic craft (built-in idea corpus, rule-based copy).
//              The whole shop still works, it is just less inventive.
//   anthropic- Claude via the Messages API.
//   openai   - any OpenAI-compatible /chat/completions endpoint. That covers
//              a local Ollama (free forever), Groq's free tier, and the
//              ":free" models on OpenRouter.
//
import config from './config.js';
import { extractJson } from './util.js';
import { log } from './events.js';
import { estimate, overBudget, record } from './spend.js';

const provider = config.llm.provider;

export const llm = {
  provider,

  /** True when a real model is reachable. */
  get enabled() {
    if (provider === 'anthropic') return Boolean(config.llm.anthropicKey);
    if (provider === 'openai') return Boolean(config.llm.baseUrl && config.llm.model);
    return false;
  },

  /** Human label shown on the dashboard next to each agent. */
  describe(modelHint) {
    if (provider === 'anthropic') return modelHint || config.llm.anthropicModel;
    if (provider === 'openai') return config.llm.model;
    return 'offline brain';
  },

  /**
   * One-shot completion.
   * @param {object} opts
   * @param {string} opts.system
   * @param {string} opts.prompt
   * @param {number} [opts.maxTokens]
   * @param {number} [opts.temperature]
   * @param {string} [opts.model]
   * @returns {Promise<string>}
   */
  async complete(opts) {
    if (!this.enabled) throw new OfflineError();
    // Out of budget is treated exactly like having no model: the agent falls
    // back to its own craft and the shop keeps running.
    if (overBudget()) throw new OfflineError('daily token cap reached');

    const attempt = async (tryNo) => {
      try {
        return provider === 'anthropic' ? await callAnthropic(opts) : await callOpenAI(opts);
      } catch (err) {
        if (tryNo >= 3 || !isRetryable(err)) throw err;
        await new Promise((r) => setTimeout(r, 800 * 2 ** (tryNo - 1)));
        return attempt(tryNo + 1);
      }
    };

    const { text, usage } = await attempt(1);
    record({
      agent: opts.agent,
      model: opts.model || (provider === 'anthropic' ? config.llm.anthropicModel : config.llm.model),
      inTokens: usage?.input ?? estimate(`${opts.system || ''}${opts.prompt || ''}`),
      outTokens: usage?.output ?? estimate(text),
      estimated: !usage,
    });
    return text;
  },

  /**
   * Completion that must come back as JSON. Returns null if the model
   * refuses to produce anything parseable, so callers can fall back.
   */
  async completeJson(opts) {
    const text = await this.complete({
      ...opts,
      // Ask the endpoint to enforce it, not just the prompt.
      //
      // A big hosted model follows "return JSON" from the system prompt well
      // enough. A local one — Hermes, Llama, Mistral on Ollama — wanders: it
      // opens with "Here's the JSON you asked for:" and closes with a friendly
      // paragraph, and the parse fails, and the agent silently falls back to
      // its offline craft. Every OpenAI-compatible endpoint worth using
      // supports response_format, and the ones that do not are handled below.
      wantsJsonMode: true,
      system:
        (opts.system || '') +
        '\n\nReply with JSON only. No prose, no markdown fences, no commentary.',
    });
    const parsed = extractJson(text);
    if (parsed === null) {
      log({
        kind: 'brain',
        level: 'warn',
        message: 'Model replied with something that was not JSON; falling back.',
        discord: false,
      });
    }
    return parsed;
  },
};

export class OfflineError extends Error {
  constructor(why = 'no model configured (LLM_PROVIDER=offline)') {
    super(`Working offline: ${why}`);
    this.name = 'OfflineError';
    this.offline = true;
  }
}

function isRetryable(err) {
  const status = err?.status;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  return err?.name === 'AbortError' || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT';
}

async function fetchJson(url, init, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
      err.status = res.status;
      throw err;
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic({ system, prompt, maxTokens = 2000, temperature = 1, model }) {
  const body = {
    model: model || config.llm.anthropicModel,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: prompt }],
  };
  const data = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.llm.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  const usage = data.usage
    ? { input: data.usage.input_tokens, output: data.usage.output_tokens }
    : null;
  return { text, usage };
}

/**
 * Does this endpoint understand response_format?
 *
 * Cached rather than assumed, because the answer varies by endpoint and the
 * only honest way to find out is to ask once. Older llama.cpp servers and a
 * few proxies reject it outright; Ollama, OpenRouter and anything OpenAI-shaped
 * accept it.
 */
let jsonModeWorks = true;

async function callOpenAI({ system, prompt, maxTokens = 2000, temperature = 1, model, wantsJsonMode }) {
  const base = config.llm.baseUrl.replace(/\/$/, '');
  const headers = { 'content-type': 'application/json' };
  if (config.llm.apiKey) headers.authorization = `Bearer ${config.llm.apiKey}`;

  const send = (withJsonMode) =>
    fetchJson(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model || config.llm.model,
        max_tokens: maxTokens,
        temperature,
        ...(withJsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    });

  let data;
  const useJsonMode = Boolean(wantsJsonMode) && jsonModeWorks;
  try {
    data = await send(useJsonMode);
  } catch (err) {
    // One retry without it, then remember. Losing JSON mode costs some
    // reliability; refusing to answer at all costs the whole feature.
    if (!useJsonMode || !/response_format|json_object|unsupported|invalid/i.test(String(err.message))) {
      throw err;
    }
    jsonModeWorks = false;
    log({
      kind: 'brain',
      level: 'note',
      message: 'This endpoint does not support JSON mode, so the agents will rely on the prompt for it.',
      discord: false,
    });
    data = await send(false);
  }
  const text = (data.choices?.[0]?.message?.content || '').trim();
  const usage = data.usage
    ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }
    : null;
  return { text, usage };
}

export default llm;
