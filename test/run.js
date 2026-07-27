// Run a suite against a throwaway database.
//
//   node test/run.js smoke | audit | ui
//
// The suites used to open data/valley.db — the owner's actual shop. Two things
// went wrong with that, and both bit during development. The check count
// drifted upward run after run because the run's own output became the next
// run's input, so a failure could mean "the code broke" or "the database has
// been through this forty times". And a suite is one bad line away from
// writing to a real catalogue, which is not a risk worth carrying for a test.
//
// So: a fresh file per run, deleted afterwards. Anything a suite needs to
// survive between runs, it should be setting up itself.
import { spawnSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUITES = {
  smoke: 'test/smoke.js',
  audit: 'test/audit.js',
  ui: 'test/ui-audit.mjs',
};

const suite = SUITES[process.argv[2]];
if (!suite) {
  console.error(`Usage: node test/run.js <${Object.keys(SUITES).join('|')}>`);
  process.exit(2);
}

const dir = join(ROOT, 'data', 'test');
mkdirSync(dir, { recursive: true });
const dbPath = join(dir, `${process.argv[2]}-${process.pid}.db`);

const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', suite], {
  cwd: ROOT,
  stdio: 'inherit',
  // A relative path, because config resolves it against the repo root.
  env: { ...process.env, DB_PATH: `data/test/${process.argv[2]}-${process.pid}.db` },
});

// SQLite leaves these two behind in WAL mode; clear all three or the next run
// starts from a journal it should never have seen.
for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true });

process.exit(result.status ?? 1);
