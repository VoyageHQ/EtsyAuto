// Run the valley from a terminal, without the dashboard.
//
//   npm run ideas -- 10 christmas
//   npm run status
//   npm run teach -- scout never propose religious products
//   npm run make
//
import config from './core/config.js';
import { all, count, one } from './core/db.js';
import { agentList } from './agents/registry.js';
import { drain, requestIdeas, decideIdeas } from './pipeline/orchestrator.js';
import { enqueue } from './pipeline/queue.js';
import { teach, allLessons, lessonsFor } from './core/memory.js';
import { loadKnowledge, packSummary } from './knowledge/index.js';
import { openApprovals, answer } from './core/approvals.js';
import { listProducts } from './pipeline/products.js';
import { money } from './core/util.js';

const [command, ...rest] = process.argv.slice(2);
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const commands = {
  async ideas() {
    const wanted = Number(rest[0]) || 8;
    const theme = rest.slice(Number(rest[0]) ? 1 : 0).join(' ') || null;
    requestIdeas(wanted, theme);
    await drain(4);
    commands.queue();
  },

  queue() {
    const ideas = all(
      "SELECT * FROM ideas WHERE status = 'proposed' ORDER BY score DESC, created_at DESC LIMIT 20"
    );
    if (!ideas.length) return console.log('\nNothing waiting. Run: npm run ideas\n');
    console.log(`\n${bold(`${ideas.length} ideas waiting for your yes or no`)}\n`);
    ideas.forEach((idea, i) => {
      console.log(`${String(i + 1).padStart(2)}. ${bold(idea.title)}  ${dim(`score ${idea.score}`)}`);
      console.log(`    ${dim(idea.pitch || '')}`);
      console.log(
        dim(
          `    ${idea.category} · effort ${idea.effort}/5 · demand ${idea.demand}/5 · ` +
            `${money(idea.price_low, config.currency)}–${money(idea.price_high, config.currency)}`
        )
      );
      console.log(dim(`    ${idea.id}`));
    });
    console.log(`\n${dim('Approve with: npm run approve -- <id> [id...]')}\n`);
  },

  async approve() {
    if (!rest.length) return console.log('Which ones? Pass idea ids from `npm run queue`.');
    decideIdeas(rest, 'approved', '', 'cli');
    console.log(`${rest.length} approved. Building…`);
    enqueue({ agent: 'manager', kind: 'manager.plan', subject: 'cli approve', priority: 1 });
    await drain(30);
    commands.list();
  },

  async reject() {
    const [id, ...why] = rest;
    if (!id) return console.log('Which one? Pass an idea id.');
    decideIdeas([id], 'rejected', why.join(' '), 'cli');
    console.log('Turned down.' + (why.length ? ' The Scout has learned why.' : ''));
  },

  status() {
    const waiting = count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'");
    const products = listProducts();
    const needsYou = openApprovals();

    console.log(`\n${bold(config.valleyName)}`);
    console.log(dim(`brain: ${config.llm.provider} · etsy: ${config.etsy.enabled ? config.etsy.publishMode : 'export only'}\n`));

    console.log(bold('Agents'));
    for (const agent of agentList()) {
      const state = one('SELECT * FROM agent_state WHERE id = ?', agent.id);
      console.log(`  ${agent.name.padEnd(18)} ${dim((state?.status || 'idle').padEnd(9))} ${dim(state?.activity || '')}`);
    }

    console.log(`\n${bold('Work')}`);
    console.log(`  ${waiting} idea(s) waiting for you`);
    if (products.length) {
      for (const product of products) {
        console.log(
          `  ${product.sku}  ${product.title.slice(0, 42).padEnd(44)} ${dim(`${product.stage}/${product.status}`)}`
        );
      }
    } else {
      console.log(dim('  nothing in production'));
    }

    if (needsYou.length) {
      console.log(`\n${bold('Needs a decision')}`);
      for (const item of needsYou) {
        console.log(`  ${item.title}`);
        console.log(dim(`    npm run answer -- ${item.id} ${item.options.map((o) => o.value).join('|')}`));
      }
    }

    const lessons = allLessons();
    if (lessons.length) {
      console.log(`\n${bold('House rules')}`);
      for (const lesson of lessons) console.log(`  ${dim(`[${lesson.agent || 'all'}]`)} ${lesson.text}`);
    }
    console.log('');
  },

  async answer() {
    const [id, value] = rest;
    if (!id || !value) return console.log('Usage: npm run answer -- <approvalId> <value>');
    answer(id, value, 'cli');
    await drain(30);
    commands.list();
  },

  teach() {
    const [who, ...words] = rest;
    if (!who || !words.length) {
      return console.log('Usage: npm run teach -- <agent|everyone> <the lesson>');
    }
    const target = who === 'everyone' || who === 'all' ? null : who;
    teach(target, words.join(' '), 'cli');
  },

  async make() {
    enqueue({ agent: 'manager', kind: 'manager.plan', subject: 'cli make', priority: 1 });
    const done = await drain(Number(rest[0]) || 40);
    console.log(`\n${done} job(s) done.\n`);
    commands.list();
  },

  list() {
    const products = listProducts();
    if (!products.length) return console.log(dim('\nNo products yet.\n'));
    console.log(`\n${bold('Products')}\n`);
    for (const product of products) {
      const listing = one('SELECT * FROM listings WHERE product_id = ?', product.id);
      console.log(`${product.sku}  ${bold(product.title)}`);
      console.log(
        dim(
          `  ${product.stage}/${product.status} · ${product.spec?.pages?.length || 0} pages · ` +
            `${money(product.price, config.currency)}${listing ? ` · listing ${listing.status}` : ''}`
        )
      );
      if (product.dir) console.log(dim(`  out/${product.dir}/`));
    }
    console.log('');
  },

  reset() {
    if (rest[0] !== '--yes') {
      return console.log('This wipes every idea, product and listing record. Run: npm run reset -- --yes');
    }
    for (const table of ['assets', 'listings', 'products', 'ideas', 'jobs', 'events', 'approvals', 'campaigns', 'sales']) {
      one(`DELETE FROM ${table}`);
    }
    console.log('Wiped. Files in out/ are left alone.');
  },

  knowledge() {
    if (rest[0] === '--restore') {
      const { added } = loadKnowledge({ restoreDeleted: true });
      console.log(`\nRestored ${added} lesson(s) you had deleted.\n`);
      return;
    }
    const { added } = loadKnowledge();
    const packs = packSummary();
    console.log(`\n${bold('Knowledge packs')} ${dim(`(${added} newly loaded)`)}\n`);
    for (const pack of packs) {
      const removed = pack.removed ? dim(` · ${pack.removed} removed by you`) : '';
      console.log(
        `  ${pack.title.padEnd(38)} ${dim(pack.agent.padEnd(15))} ${String(pack.active).padStart(3)} active${removed}`
      );
      console.log(dim(`    ${pack.summary}`));
    }
    const total = packs.reduce((n, p) => n + p.active, 0);
    console.log(`\n  ${bold(String(total))} lessons in force across ${packs.length} packs.`);
    console.log(dim('  npm run knowledge -- --restore   brings back anything you deleted\n'));

    if (rest[0] && rest[0] !== '--restore') {
      const agent = rest[0];
      const lessons = lessonsFor(agent, agentList().find((a) => a.id === agent)?.division);
      console.log(`${bold(`What ${agent} knows`)} ${dim(`(${lessons.length} lessons)`)}\n`);
      for (const lesson of lessons) {
        console.log(`  ${dim('·')} ${lesson.text}`);
      }
      console.log('');
    }
  },

  help() {
    console.log(`
${bold(config.valleyName)}

  npm start                        the dashboard and the whole fleet
  npm run ideas -- [n] [theme]     ask the Scout for products to sell
  npm run queue                    see what is waiting for your decision
  npm run approve -- <ideaId...>   build the ones you like
  npm run reject -- <ideaId> why   turn one down, and teach it why
  npm run make                     work through the queue now
  npm run status                   what everyone is doing
  npm run teach -- <agent> <rule>  correct an agent for good
  npm run list                     every product and where it is up to
  npm run knowledge [-- <agent>]   what the packs have taught everyone
  node scripts/discord-setup.js    the Discord walkthrough
  node scripts/etsy-auth.js        get your Etsy access token
`);
  },
};

const run = commands[command] || commands.help;
await run();
process.exit(0);
