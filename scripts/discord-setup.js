// Walks you through the Discord side and checks your work.
//
//   node scripts/discord-setup.js
//
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import config from '../src/core/config.js';
import { agentList } from '../src/agents/registry.js';
import { avatarFor } from '../src/discord/avatars.js';
import { inviteUrl, tokenFor, INVITE_PERMISSIONS } from '../src/discord/bot.js';
import { currentApp, currentUser } from '../src/discord/rest.js';
import { slug } from '../src/core/util.js';

const agents = agentList();
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

console.log(`\n${bold(config.valleyName)} — Discord set-up\n`);

// 1. The avatars, saved so you can upload them by hand if you prefer.
const avatarDir = join(config.outDir, 'discord-avatars');
mkdirSync(avatarDir, { recursive: true });
for (const agent of agents) {
  writeFileSync(join(avatarDir, `${agent.id}.png`), avatarFor(agent));
}
console.log(`${green('✓')} Avatars written to ${dim('out/discord-avatars/')} (256×256 PNG)\n`);

// 2. The roster.
console.log(bold('Your agents\n'));
console.log(
  ['  #', 'BOT NAME'.padEnd(18), 'CHANNEL'.padEnd(18), 'ENV VARIABLE'].join(' ') + '\n' + dim('  ' + '─'.repeat(72))
);
agents.forEach((agent, i) => {
  const has = tokenFor(agent.id) ? green('set') : amber('not set');
  console.log(
    `  ${i + 1}  ${agent.name.padEnd(18)} #${slug(agent.name).padEnd(17)} DISCORD_TOKEN_${agent.id.toUpperCase().padEnd(12)} ${has}`
  );
});
console.log(`\n  Plus one channel called ${bold('#valley-hq')} where anything needing your decision lands.\n`);

// 3. What to do in the developer portal.
console.log(bold('In the Discord developer portal (https://discord.com/developers/applications)\n'));
console.log(`  For each agent above, once each:
   1. New Application → name it exactly as in the BOT NAME column.
   2. Bot → Reset Token → copy it into .env under the matching ENV VARIABLE.
   3. Nothing else. Leave every privileged intent OFF — the agents only post,
      they never read your messages.
   4. Come back and run this script again to get its invite link.

  ${dim('The avatar and the name get set automatically when the agent starts up,')}
  ${dim('so you can skip filling those in by hand.')}
`);

// 4. Check whatever tokens are already in place.
const configured = agents.filter((agent) => tokenFor(agent.id));
if (config.discord.token) configured.push({ id: '_shared', name: 'Shared bot', token: config.discord.token });

if (!configured.length) {
  console.log(amber('  No tokens in .env yet. Add one and run this again.\n'));
} else {
  console.log(bold('Invite links — open each one and add it to your server\n'));
  for (const agent of configured) {
    const token = agent.token || tokenFor(agent.id);
    try {
      const [app, user] = await Promise.all([currentApp(token), currentUser(token)]);
      console.log(`  ${green('✓')} ${bold(agent.name)} ${dim(`(app "${app.name}", currently @${user.username})`)}`);
      console.log(`     ${inviteUrl(app.id)}\n`);
    } catch (err) {
      console.log(`  ${red('×')} ${bold(agent.name)} — ${err.message}`);
      console.log(`     ${dim('That token was rejected. Reset it in the portal and paste it again.')}\n`);
    }
  }
  console.log(
    dim(`  Permissions asked for: ${INVITE_PERMISSIONS} — view channels, send messages, embed\n` +
      '  links, manage channels and manage webhooks. The last two are only so the\n' +
      '  agents can make their own channels if you have not made them yet.\n')
  );
}

console.log(bold('Then\n'));
console.log(`  npm start        ${dim('and watch them report in')}
  /ideas           ${dim('in Discord, to get a list of products to sell')}
  /queue           ${dim('see the list, then /approve 1,3 to pick')}\n`);

if (!config.discord.guildId) {
  console.log(dim('  DISCORD_GUILD_ID is blank, which is fine — the bots find your server themselves.\n'));
}
