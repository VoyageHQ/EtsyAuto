// Wake the valley up.
import config from './core/config.js';
import { log } from './core/events.js';
import { count } from './core/db.js';
import { agentList } from './agents/registry.js';
import { startDashboard } from './server/index.js';
import { start as startLoop, stop as stopLoop } from './pipeline/orchestrator.js';
import { enqueue } from './pipeline/queue.js';
import { startDiscord, stopDiscord } from './discord/bot.js';
import { loadKnowledge } from './knowledge/index.js';

const args = new Set(process.argv.slice(2));

log({
  kind: 'valley',
  level: 'good',
  message:
    `${config.valleyName} — ${agentList().length} agents, brain: ${config.llm.provider}, ` +
    `etsy: ${config.etsy.enabled ? config.etsy.publishMode : 'export only'}.`,
  discord: false,
});

// The agents' schooling. Packs live in the repo so knowledge survives a fresh
// database and travels between machines; anything you have deleted stays gone.
loadKnowledge();

// A brand new shop needs something to look at.
if (count('SELECT COUNT(*) FROM ideas') === 0) {
  enqueue({
    agent: 'scout',
    kind: 'scout.brainstorm',
    subject: 'first batch of ideas',
    payload: { count: 12 },
    priority: 1,
  });
  log({ kind: 'valley', message: 'Asked the Scout for a first batch of ideas.', discord: false });
}

const server = startDashboard();

if (config.discord.enabled) {
  startDiscord().catch((err) =>
    log({ kind: 'discord', level: 'error', message: `Discord would not start: ${err.message}`, discord: false })
  );
} else {
  log({
    kind: 'discord',
    message: 'Discord is off. Add DISCORD_BOT_TOKEN to .env to switch it on — see docs/DISCORD.md.',
    discord: false,
  });
}

if (config.autoLoop && !args.has('--no-loop')) startLoop();
else log({ kind: 'valley', message: 'Loop is paused. Press "do one job now" in the Office.', discord: false });

let closing = false;
const shutdown = async (signal) => {
  if (closing) return;
  closing = true;
  log({ kind: 'valley', message: `${signal} — closing up the valley.`, discord: false });
  stopLoop();
  await stopDiscord().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2500);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  log({ kind: 'error', level: 'error', message: `Unhandled: ${err?.message || err}`, discord: false });
});
