// Discord REST, hand-rolled. One serial queue, which is more than enough for
// a shop with seven agents, and it respects 429s properly.
import config from '../core/config.js';

const API = 'https://discord.com/api/v10';

let chain = Promise.resolve();

/** Serialise every call so we never trip the rate limiter. */
function serial(task) {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function discordFetch(path, { method = 'GET', body, token, raw } = {}) {
  return serial(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          authorization: `Bot ${token || config.discord.token}`,
          ...(raw ? {} : { 'content-type': 'application/json' }),
          'user-agent': 'EtsyAuto (https://github.com/VoyageHQ/EtsyAuto, 0.1)',
        },
        body: raw ? body : body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 429) {
        const info = await res.json().catch(() => ({ retry_after: 1 }));
        await sleep((info.retry_after || 1) * 1000 + 120);
        continue;
      }
      if (res.status === 204) return {};
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`Discord ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
        err.status = res.status;
        throw err;
      }
      await sleep(60);
      return text ? JSON.parse(text) : {};
    }
    throw new Error(`Discord ${method} ${path} kept rate limiting.`);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Post through a webhook so the message wears the agent's name. */
export async function webhookPost(webhook, payload) {
  return serial(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`${webhook.url}?wait=true`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        const info = await res.json().catch(() => ({ retry_after: 1 }));
        await sleep((info.retry_after || 1) * 1000 + 120);
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new Error(`Webhook post failed ${res.status}: ${text.slice(0, 200)}`);
      await sleep(60);
      return text ? JSON.parse(text) : {};
    }
    throw new Error('Webhook kept rate limiting.');
  });
}

export const guildChannels = (guildId, token) =>
  discordFetch(`/guilds/${guildId}/channels`, { token });

export const createChannel = (guildId, body, token) =>
  discordFetch(`/guilds/${guildId}/channels`, { method: 'POST', body, token });

export const createWebhook = (channelId, name, token) =>
  discordFetch(`/channels/${channelId}/webhooks`, { method: 'POST', body: { name }, token });

export const channelWebhooks = (channelId, token) =>
  discordFetch(`/channels/${channelId}/webhooks`, { token });

export const sendMessage = (channelId, body, token) =>
  discordFetch(`/channels/${channelId}/messages`, { method: 'POST', body, token });

export const registerCommands = (appId, guildId, commands, token) =>
  discordFetch(`/applications/${appId}/guilds/${guildId}/commands`, {
    method: 'PUT',
    body: commands,
    token,
  });

/** Interaction callbacks are unauthenticated, but sending the token is harmless. */
export const respondToInteraction = (id, interactionToken, body, token) =>
  discordFetch(`/interactions/${id}/${interactionToken}/callback`, { method: 'POST', body, token });

/** How a bot renames itself and puts its avatar on. */
export const patchSelf = (body, token) => discordFetch('/users/@me', { method: 'PATCH', body, token });

export const currentApp = (token) => discordFetch('/oauth2/applications/@me', { token });

export const currentUser = (token) => discordFetch('/users/@me', { token });

export default discordFetch;
