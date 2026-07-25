// The Discord side of the valley.
//
// Two ways to run it, and you can mix them:
//
//  1. A bot account per agent (what you want if they should each appear in the
//     member list with their own name, avatar and presence). Put each token in
//     .env as DISCORD_TOKEN_MANAGER, DISCORD_TOKEN_SCOUT, and so on. Each one
//     connects itself, renames itself, sets its own generated avatar, finds
//     its own channel, and talks only in there.
//
//  2. One shared bot. Any agent without its own token posts through a webhook
//     wearing its name instead. Fewer accounts to make, same reading
//     experience in the channels, but only one member in the list.
//
// Whichever you use, one bot is the "steward": it owns the slash commands and
// posts the approval requests with buttons in the HQ channel.
import config from '../core/config.js';
import { bus, log } from '../core/events.js';
import { getSetting, setSetting } from '../core/db.js';
import { agentList, getAgent } from '../agents/registry.js';
import { Gateway } from './gateway.js';
import {
  channelWebhooks,
  createChannel,
  createWebhook,
  currentApp,
  guildChannels,
  patchSelf,
  registerCommands,
  respondToInteraction,
  sendMessage,
  webhookPost,
} from './rest.js';
import { commandDefinitions, handleCommand, handleComponent, buttonRows } from './commands.js';
import { avatarDataUri } from './avatars.js';
import { truncate, slug } from '../core/util.js';

const HQ_HINTS = ['valley-hq', 'valley', 'hq', 'approvals', 'general'];
const WARN_COLOUR = 0xe3b878;

/** Permissions the invite link asks for: view, send, embed, manage channels + webhooks. */
export const INVITE_PERMISSIONS = 536888912;

export const tokenFor = (agentId) => process.env[`DISCORD_TOKEN_${agentId.toUpperCase()}`] || '';

/** One agent, one bot account, one channel. */
class AgentBot {
  constructor(agent, token) {
    this.agent = agent;
    this.token = token;
    this.gateway = new Gateway(token, 1);
    this.channelId = null;
    this.guildId = config.discord.guildId || null;
    this.appId = null;
    this.ready = false;
  }

  async start() {
    const app = await currentApp(this.token).catch(() => null);
    this.appId = app?.id || null;

    this.gateway.on('dispatch', async (type, data) => {
      try {
        if (type === 'READY') {
          this.guildId = config.discord.guildId || data.guilds?.[0]?.id || this.guildId;
          await this.ensureIdentity(data.user);
        }
        if (type === 'GUILD_CREATE' && (!this.guildId || this.guildId === data.id)) {
          this.guildId = data.id;
          await this.resolveChannel(data);
        }
        if (type === 'INTERACTION_CREATE' && steward === this) await onInteraction(data, this.token);
      } catch (err) {
        log({ kind: 'discord', level: 'warn', message: `${this.agent.id}: ${err.message}`, discord: false });
      }
    });

    this.gateway.on('closed', (code, reason) => {
      this.ready = false;
      if (code === 4004) {
        log({
          kind: 'discord',
          level: 'error',
          message: `${this.agent.name}'s bot token was rejected. Check DISCORD_TOKEN_${this.agent.id.toUpperCase()}.`,
          discord: false,
        });
      } else if (code && code !== 1000) {
        log({ kind: 'discord', level: 'warn', message: `${this.agent.id} gateway closed (${code}) ${reason || ''}`, discord: false });
      }
    });

    this.gateway.connect();
  }

  /** Name itself and put its face on, once. */
  async ensureIdentity(user) {
    const stamp = `${this.agent.name}|1`;
    if (getSetting(`discord_identity_${this.agent.id}`) === stamp) return;

    const body = {};
    if (user?.username !== this.agent.name) body.username = this.agent.name;
    body.avatar = avatarDataUri(this.agent);

    try {
      await patchSelf(body, this.token);
      setSetting(`discord_identity_${this.agent.id}`, stamp);
      log({
        kind: 'discord',
        level: 'good',
        message: `${this.agent.name} is wearing its own name and avatar.`,
        discord: false,
      });
    } catch (err) {
      // Discord only allows two username changes an hour. The avatar usually
      // still lands, and the name can wait.
      log({
        kind: 'discord',
        level: 'warn',
        message: `Could not fully rename ${this.agent.id}: ${err.message}`,
        discord: false,
      });
      if (body.username) {
        await patchSelf({ avatar: body.avatar }, this.token).catch(() => {});
      }
    }
  }

  async resolveChannel(guild) {
    const channels = guild.channels?.length ? guild.channels : await guildChannels(this.guildId, this.token);
    const text = channels.filter((c) => c.type === 0);
    const found = findChannel(text, this.agent);
    this.channelId = found?.id || null;

    if (!this.channelId) {
      const created = await ensureAgentChannel(this.guildId, this.agent, channels, this.token);
      this.channelId = created?.id || null;
    }

    this.ready = Boolean(this.channelId);
    if (!this.ready) {
      log({
        kind: 'discord',
        level: 'warn',
        message: `${this.agent.name} has no channel. Make one called #${slug(this.agent.name)} and it will find it.`,
        discord: false,
      });
      return;
    }
    if (steward === this) await stewardSetUp(guild, channels, this.token, this.appId);
    log({
      kind: 'discord',
      message: `${this.agent.name} is posting in #${found?.name || slug(this.agent.name)}.`,
      discord: false,
    });
  }

  async post(content) {
    if (!this.ready) return false;
    await sendMessage(this.channelId, { content, allowed_mentions: { parse: [] } }, this.token);
    return true;
  }

  close() {
    this.ready = false;
    this.gateway.close();
  }
}

/** The shared bot: webhook identities for any agent without its own account. */
class SharedBot {
  constructor(token) {
    this.token = token;
    this.gateway = new Gateway(token, 1);
    this.guildId = config.discord.guildId || null;
    this.appId = null;
    this.routes = new Map();
    this.ready = false;
  }

  async start() {
    const app = await currentApp(this.token);
    this.appId = app.id;
    log({ kind: 'discord', message: `Shared bot "${app.name}" connecting.`, discord: false });

    this.gateway.on('dispatch', async (type, data) => {
      try {
        if (type === 'READY') this.guildId = config.discord.guildId || data.guilds?.[0]?.id || this.guildId;
        if (type === 'GUILD_CREATE' && (!this.guildId || this.guildId === data.id)) {
          this.guildId = data.id;
          await this.wire(data);
        }
        if (type === 'INTERACTION_CREATE' && steward === this) await onInteraction(data, this.token);
      } catch (err) {
        log({ kind: 'discord', level: 'warn', message: `shared bot: ${err.message}`, discord: false });
      }
    });

    this.gateway.on('closed', (code) => {
      this.ready = false;
      if (code === 4004) {
        log({
          kind: 'discord',
          level: 'error',
          message: 'Discord rejected DISCORD_BOT_TOKEN.',
          discord: false,
        });
      }
    });

    this.gateway.connect();
  }

  async wire(guild) {
    const channels = guild.channels?.length ? guild.channels : await guildChannels(this.guildId, this.token);
    const text = channels.filter((c) => c.type === 0);

    for (const agent of agentList()) {
      if (bots.has(agent.id)) continue; // it has its own account
      let channel = findChannel(text, agent);
      if (!channel) channel = await ensureAgentChannel(this.guildId, agent, channels, this.token);
      if (!channel) continue;
      const webhook = await ensureWebhook(channel.id, agent, this.token);
      this.routes.set(agent.id, { channelId: channel.id, webhook });
    }

    this.ready = true;
    if (steward === this) await stewardSetUp(guild, channels, this.token, this.appId);
  }

  async post(agentId, content) {
    const route = this.routes.get(agentId);
    if (!route) return false;
    const agent = getAgent(agentId);
    if (route.webhook) {
      await webhookPost(route.webhook, { username: agent?.name || config.valleyName, content });
    } else {
      await sendMessage(route.channelId, { content, allowed_mentions: { parse: [] } }, this.token);
    }
    return true;
  }

  close() {
    this.ready = false;
    this.gateway.close();
  }
}

/** @type {Map<string, AgentBot>} */
const bots = new Map();
let shared = null;
let steward = null;
let hqChannelId = null;
let hqToken = null;

export async function startDiscord() {
  const perAgent = agentList()
    .map((agent) => ({ agent, token: tokenFor(agent.id) }))
    .filter((entry) => entry.token);

  if (!perAgent.length && !config.discord.token) return false;

  for (const { agent, token } of perAgent) {
    bots.set(agent.id, new AgentBot(agent, token));
  }
  if (config.discord.token) shared = new SharedBot(config.discord.token);

  // Whoever owns the slash commands. The shared bot if there is one, because
  // it is the one most likely to have Manage Channels.
  steward = shared || bots.get('manager') || [...bots.values()][0];

  await Promise.all([
    shared?.start(),
    ...[...bots.values()].map((bot) => bot.start().catch((err) =>
      log({ kind: 'discord', level: 'error', message: `${bot.agent.id}: ${err.message}`, discord: false })
    )),
  ]);

  log({
    kind: 'discord',
    message:
      `Discord starting — ${bots.size} agent bot(s)` +
      `${shared ? ' plus a shared bot for the rest' : ''}.`,
    discord: false,
  });
  return true;
}

export async function stopDiscord() {
  setSetting('discord_ready', '');
  for (const bot of bots.values()) bot.close();
  bots.clear();
  shared?.close();
  shared = null;
  steward = null;
}

/** Common set-up the steward does once: HQ channel and slash commands. */
async function stewardSetUp(guild, channels, token, appId) {
  const text = channels.filter((c) => c.type === 0);
  hqChannelId =
    text.find((c) => HQ_HINTS.some((hint) => c.name.toLowerCase().includes(hint)))?.id ||
    text[0]?.id ||
    null;
  hqToken = token;

  if (appId) {
    await registerCommands(appId, guild.id, commandDefinitions(), token).catch((err) =>
      log({ kind: 'discord', level: 'warn', message: `Slash commands: ${err.message}`, discord: false })
    );
  }

  setSetting('discord_ready', String(Date.now()));
  setSetting('discord_guild_id', guild.id);

  log({
    kind: 'discord',
    level: 'good',
    message: `Discord ready in "${guild.name}".`,
    discord: false,
  });

  if (hqChannelId && getSetting('discord_greeted') !== guild.id) {
    setSetting('discord_greeted', guild.id);
    await sendMessage(
      hqChannelId,
      {
        content:
          `**${config.valleyName} is online.**\n` +
          'Each agent talks in its own channel. In here you get anything that needs a decision.\n\n' +
          '`/ideas` ask the Scout for products to sell · `/queue` see what is waiting · ' +
          '`/approve 1,3` pick the ones to build · `/reject 2 too crowded` teaches it why · ' +
          '`/teach` correct any agent for good · `/status` what is happening.',
      },
      token
    ).catch(() => {});
  }
}

async function ensureAgentChannel(guildId, agent, channels, token) {
  const categories = channels.filter((c) => c.type === 4);
  let category = categories.find(
    (c) => c.name.toLowerCase() === config.discord.categoryName.toLowerCase()
  );
  if (!category) {
    category = await createChannel(
      guildId,
      { name: config.discord.categoryName, type: 4 },
      token
    ).catch(() => null);
  }
  return createChannel(
    guildId,
    {
      name: slug(agent.name),
      type: 0,
      parent_id: category?.id,
      topic: `${agent.title} — ${agent.purpose.trim().split('\n')[0]}`,
    },
    token
  ).catch(() => null);
}

function findChannel(channels, agent) {
  const bare = agent.name.replace(/^The\s+/i, '').toLowerCase();
  const wanted = [slug(agent.name), agent.id, bare, slug(bare)];
  return (
    channels.find((c) => wanted.includes(c.name.toLowerCase())) ||
    channels.find((c) => wanted.some((w) => w.length > 3 && c.name.toLowerCase().includes(w)))
  );
}

async function ensureWebhook(channelId, agent, token) {
  try {
    const existing = await channelWebhooks(channelId, token);
    const mine = existing.find((w) => w.name === 'Valley' && w.token);
    const hook = mine || (await createWebhook(channelId, 'Valley', token));
    if (!hook?.token) return null;
    return { url: `https://discord.com/api/v10/webhooks/${hook.id}/${hook.token}` };
  } catch {
    return null;
  }
}

// --- relaying what the agents do -------------------------------------------

bus.on('discord', async (event) => {
  const agentId = event.agent_id || event.agent;
  const prefix = { good: '✓', warn: '!', error: '×', info: '·' }[event.level] || '·';
  const content = truncate(`${prefix} ${event.message}`, 1900);

  try {
    const own = agentId ? bots.get(agentId) : null;
    if (own?.ready) return void (await own.post(content));
    if (agentId && shared?.ready && (await shared.post(agentId, content))) return;
    if (hqChannelId) await sendMessage(hqChannelId, { content, allowed_mentions: { parse: [] } }, hqToken);
  } catch {
    // A dropped status line is not worth crashing a shop over.
  }
});

bus.on('approval:open', async (approval) => {
  if (!hqChannelId) return;
  const mention = config.discord.ownerId ? `<@${config.discord.ownerId}> ` : '';
  try {
    await sendMessage(
      hqChannelId,
      {
        content: `${mention}**${truncate(approval.title, 240)}**`,
        embeds: approval.detail
          ? [{ description: truncate(approval.detail, 3500), color: WARN_COLOUR }]
          : undefined,
        components: buttonRows([{ id: approval.id, options: approval.options || [] }]),
        allowed_mentions: config.discord.ownerId ? { users: [config.discord.ownerId] } : { parse: [] },
      },
      hqToken
    );
  } catch (err) {
    log({ kind: 'discord', level: 'warn', message: `Could not post the request: ${err.message}`, discord: false });
  }
});

// --- interactions ----------------------------------------------------------

async function onInteraction(interaction, token) {
  if (interaction.type !== 2 && interaction.type !== 3) return;
  const reply =
    interaction.type === 2 ? await handleCommand(interaction) : await handleComponent(interaction);
  await respondToInteraction(
    interaction.id,
    interaction.token,
    {
      type: 4,
      data: {
        content: truncate(reply.content || '…', 1900),
        components: reply.components,
        allowed_mentions: { parse: [] },
      },
    },
    token
  );
}

/** The URL that actually adds a bot to a server — a discord.gg invite will not. */
export function inviteUrl(applicationId) {
  return (
    `https://discord.com/oauth2/authorize?client_id=${applicationId || '<APPLICATION_ID>'}` +
    `&scope=bot%20applications.commands&permissions=${INVITE_PERMISSIONS}`
  );
}

export const discordReady = () => Boolean(getSetting('discord_ready'));

export default { startDiscord, stopDiscord, inviteUrl, discordReady, tokenFor };
