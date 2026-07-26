// The things that exist nowhere else.
//
// `data/valley.db` is gitignored on purpose — it holds the owner's own shop,
// not the project — which means it never leaves the machine it was made on.
// That is right, and it also means a lost laptop takes with it every lesson
// the agents were taught, every reason an idea was turned down, and every sale
// ever recorded. None of that can be regenerated: the packs ship in git, but
// corrections do not, and neither does history.
//
// So: one readable JSON file, written wherever the owner wants it.
//
//   npm run backup                     # writes backups/valley-<date>.json
//   npm run backup -- ~/Dropbox/hv.json
//   npm run restore -- ~/Dropbox/hv.json
//
// Restore merges by id and never deletes, because the likeliest use is pulling
// a machine's history into a shop that has since moved on rather than winding
// one back.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { all, insert, one, run } from './db.js';
import { log } from './events.js';
import config from './config.js';

export const FORMAT = 1;

/**
 * What is worth carrying between machines, and why.
 *
 * Deliberately not everything. `events`, `jobs` and `agent_state` are the
 * valley's short-term memory — restoring a stranger's job queue into a running
 * shop would start work nobody asked for, and an activity feed from another
 * machine is noise rather than history.
 *
 * `assets` and `venture_assets` are included even though this file holds no
 * files. The commonest reason to restore is a lost database on a machine whose
 * out/ folder is still sitting right there, and leaving the rows out gives you
 * back a shop full of finished products that claim to have no files. Restore
 * counts how many point at something that is genuinely missing and says so,
 * which is the honest answer to the other case — moving machines without
 * bringing out/ along.
 */
export const TABLES = [
  // The irreplaceable part: what you taught them, and what they worked out.
  'lessons',
  'failures',
  // Your decisions, and the reasons you gave — this is what shapes the Scout.
  'ideas',
  'approvals',
  // The shop itself.
  'products',
  'listings',
  'assets',
  'sales',
  'proposals',
  'campaigns',
  // The harbour.
  'ventures',
  'signals',
  'marketing',
  'venture_revenue',
  'venture_assets',
  // Counters and notes the shop needs to carry on where it left off.
  'settings',
  'spend',
];

/**
 * Everything worth keeping, as a plain object.
 *
 * @param {object} [options]
 * @param {string[]} [options.tables] override what is included
 */
export function exportAll({ tables = TABLES } = {}) {
  const data = {};
  let rows = 0;
  for (const table of tables) {
    try {
      data[table] = all(`SELECT * FROM ${table}`);
      rows += data[table].length;
    } catch {
      // A table from a newer or older version of the schema. Skipping beats
      // failing the whole backup over one of them.
      data[table] = [];
    }
  }

  return {
    format: FORMAT,
    shop: config.shopName,
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(data).map(([t, r]) => [t, r.length])),
    rows,
    data,
  };
}

/** Write a backup to disk, making the folder if it is not there yet. */
export function writeBackup(path) {
  const target = path || join(config.root, 'backups', `valley-${stamp()}.json`);
  mkdirSync(dirname(target), { recursive: true });
  const payload = exportAll();
  writeFileSync(target, JSON.stringify(payload, null, 2));
  log({
    kind: 'backup',
    level: 'good',
    message: `Backed up ${payload.rows} rows to ${target}`,
    discord: false,
  });
  return { path: target, ...payload, data: undefined };
}

/**
 * Read a backup back in.
 *
 * Merges: a row whose id is already here is left alone, because the copy in
 * front of you is the newer one. Nothing is ever deleted — restoring a backup
 * should never be able to lose work that happened after it was taken.
 *
 * @param {string} path
 * @param {object} [options]
 * @param {boolean} [options.overwrite] let the backup win on conflicts
 * @param {boolean} [options.dryRun] report what would happen, change nothing
 */
export function readBackup(path, { overwrite = false, dryRun = false } = {}) {
  let payload;
  try {
    payload = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read that backup: ${err.message}`);
  }
  if (!payload?.data || typeof payload.data !== 'object') {
    throw new Error('That file is not a valley backup.');
  }
  if (Number(payload.format) > FORMAT) {
    throw new Error(
      `That backup was written by a newer version (format ${payload.format}, this understands ${FORMAT}).`
    );
  }

  const report = { added: {}, skipped: {}, replaced: {}, total: 0, dryRun, missingFiles: 0 };

  for (const table of TABLES) {
    const rows = payload.data[table];
    if (!Array.isArray(rows) || !rows.length) continue;

    let added = 0;
    let skipped = 0;
    let replaced = 0;

    for (const row of rows) {
      // `settings` is keyed by name rather than by id, and is the one table
      // where the incoming value is usually the one you want — it carries the
      // SKU counter, so ignoring it would restart numbering at HV-0001 and
      // collide with products you already have.
      if (table === 'settings') {
        const existing = one('SELECT key FROM settings WHERE key = ?', row.key);
        if (existing && !overwrite && !isCounter(row.key)) {
          skipped++;
          continue;
        }
        const value = isCounter(row.key) && existing ? highest(row) : row.value;
        // Writing a value that is already there is not a restore, and counting
        // it as one makes a repeat run look like it did something.
        if (existing && String(one('SELECT value FROM settings WHERE key = ?', row.key)?.value) === String(value)) {
          skipped++;
          continue;
        }
        if (!dryRun) {
          run(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            row.key,
            value
          );
        }
        existing ? replaced++ : added++;
        continue;
      }

      if (!row?.id) continue;

      // An asset row is a promise that a file is on disk. Restoring one whose
      // file did not come along leaves the shop pointing at nothing, so count
      // those and say how many — the fix is to copy out/ across, or press
      // rebuild, and the owner can only choose if they are told.
      if ((table === 'assets' || table === 'venture_assets') && row.path) {
        if (!existsSync(join(config.root, row.path))) report.missingFiles++;
      }

      const existing = one(`SELECT id FROM ${table} WHERE id = ?`, row.id);
      if (existing && !overwrite) {
        skipped++;
        continue;
      }
      if (!dryRun) {
        if (existing) run(`DELETE FROM ${table} WHERE id = ?`, row.id);
        try {
          insert(table, row);
        } catch {
          // A row referring to something that is not here — a listing whose
          // product never came across, say. One row lost is better than a
          // half-finished restore.
          skipped++;
          continue;
        }
      }
      existing ? replaced++ : added++;
    }

    if (added) report.added[table] = added;
    if (skipped) report.skipped[table] = skipped;
    if (replaced) report.replaced[table] = replaced;
    report.total += added + replaced;
  }

  if (!dryRun) {
    log({
      kind: 'backup',
      level: 'good',
      message: `Restored ${report.total} row(s) from ${path}`,
      discord: false,
    });
  }
  return report;
}

/** The SKU counter must only ever go up, or the shop starts reusing numbers. */
const isCounter = (key) => key === 'sku_counter';
const highest = (row) => {
  const mine = Number(one('SELECT value FROM settings WHERE key = ?', row.key)?.value || 0);
  return String(Math.max(mine, Number(row.value) || 0));
};

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

export default writeBackup;
