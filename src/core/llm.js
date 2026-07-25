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
    const attempt = async (tryNo) => {
      try {
        return provider === 'anthropic' ? await callAnthropic(opts) : await callOpenAI(opts);
      } catch (err) {
        if (tryNo >= 3 || !isRetryable(err)) throw err;
        await new Promise((r) => setTimeout(r, 800 * 2 ** (tryNo - 1)));
        return attempt(tryNo + 1);
      }
    };
    return attempt(1);
  },

  /**
   * Completion that must come back as JSON. Returns null if the model
   * refuses to produce anything parseable, so callers can fall back.
   */
  async completeJson(opts) {
    const text = await this.complete({
      ...opts,
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
  constructor() {
    super('No model configured (LLM_PROVIDER=offline)');
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
  return (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

async function callOpenAI({ system, prompt, maxTokens = 2000, temperature = 1, model }) {
  const base = config.llm.baseUrl.replace(/\/$/, '');
  const headers = { 'content-type': 'application/json' };
  if (config.llm.apiKey) headers.authorization = `Bearer ${config.llm.apiKey}`;
  const data = await fetchJson(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || config.llm.model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });
  return (data.choices?.[0]?.message?.content || '').trim();
}

export default llm;
