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
import { buildDigest, renderDigest, markSeen } from './core/digest.js';
import { writeBackup, readBackup } from './core/backup.js';

const [command, ...rest] = process.argv.slice(2);
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const commands = {
  /**
   * What changed since you last looked.
   *
   * Printing it marks it read, because someone who has just read the night's
   * news does not want to be told it again tomorrow. Pass --keep to look
   * without clearing it.
   */
  digest() {
    const d = buildDigest();
    console.log('\n' + renderDigest(d) + '\n');
    if (!rest.includes('--keep')) markSeen();
    else console.log(dim('  (left unread — drop --keep to mark it caught up)\n'));
  },

  /**
   * Write everything that exists nowhere else to a file you can keep.
   *
   *   npm run backup
   *   npm run backup -- ~/Dropbox/hartistic.json
   */
  backup() {
    const result = writeBackup(rest[0] || null);
    console.log(`\n  ${bold(String(result.rows))} rows written to ${result.path}\n`);
    for (const [table, n] of Object.entries(result.counts)) {
      if (n) console.log(`  ${table.padEnd(18)} ${dim(String(n))}`);
    }
    console.log(dim('\n  data/valley.db is gitignored, so this file is the only copy off this machine.\n'));
  },

  /**
   * Read one back in. Merges by id and never deletes, so this is safe to run
   * against a shop that has carried on since the backup was taken.
   *
   *   npm run restore -- ~/Dropbox/hartistic.json
   *   npm run restore -- backup.json --dry-run
   *   npm run restore -- backup.json --overwrite
   */
  restore() {
    const path = rest.find((a) => !a.startsWith('--'));
    if (!path) {
      console.log('\n  Which file? npm run restore -- path/to/backup.json\n');
      process.exitCode = 1;
      return;
    }
    const report = readBackup(path, {
      overwrite: rest.includes('--overwrite'),
      dryRun: rest.includes('--dry-run'),
    });
    console.log(`\n  ${bold(String(report.total))} row(s)${report.dryRun ? ' would be' : ''} restored from ${path}\n`);
    for (const table of new Set([...Object.keys(report.added), ...Object.keys(report.replaced), ...Object.keys(report.skipped)])) {
      const bits = [];
      if (report.added[table]) bits.push(`${report.added[table]} new`);
      if (report.replaced[table]) bits.push(`${report.replaced[table]} replaced`);
      if (report.skipped[table]) bits.push(dim(`${report.skipped[table]} already here`));
      console.log(`  ${table.padEnd(18)} ${bits.join(', ')}`);
    }
    if (report.missingFiles) {
      console.log(
        `\n  ${report.missingFiles} file(s) referred to by this backup are not on disk. ` +
          'Copy out/ across from the other machine, or press rebuild in the Workshop.'
      );
    }
    if (!report.dryRun) console.log(dim('\n  Nothing was deleted. Rows already here were left alone unless you passed --overwrite.\n'));
    else console.log(dim('\n  Nothing was changed. Drop --dry-run to do it for real.\n'));
  },

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
  npm run digest                   what changed while you were away
  npm run backup [-- <path>]       everything that exists nowhere else
  npm run restore -- <path>        read a backup back in (merges, never deletes)
  node scripts/discord-setup.js    the Discord walkthrough
  node scripts/etsy-auth.js        get your Etsy access token
`);
  },
};

const run = commands[command] || commands.help;
try {
  await run();
} catch (err) {
  // A wrong path or a file that turns out not to be a backup is an ordinary
  // mistake at a prompt, not a crash. Print what went wrong and stop.
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
}
process.exit(0);
