// Persistence. Uses Node's built-in SQLite so the project needs no npm
// install and no database server.
import { DatabaseSync } from 'node:sqlite';
import config from './config.js';
import { uid, now } from './util.js';

export const db = new DatabaseSync(config.dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS ideas (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  audience      TEXT,
  pitch         TEXT,
  angle         TEXT,
  format        TEXT,
  keywords      TEXT,           -- json array
  effort        INTEGER,        -- 1 easy .. 5 hard
  demand        INTEGER,        -- 1 niche .. 5 hot
  price_low     REAL,
  price_high    REAL,
  score         REAL,
  status        TEXT NOT NULL,  -- proposed | approved | rejected | shelved | built
  source_agent  TEXT,
  batch         TEXT,
  note          TEXT,           -- your feedback when you approve or reject
  created_at    INTEGER NOT NULL,
  decided_at    INTEGER
);

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  sku         TEXT NOT NULL UNIQUE,
  idea_id     TEXT REFERENCES ideas(id),
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  stage       TEXT NOT NULL,   -- research|design|copy|review|ready|listed|parked
  status      TEXT NOT NULL,   -- active|blocked|done|abandoned
  spec        TEXT,            -- json: what the Maker should build
  research    TEXT,            -- json: keywords, competitors, pricing
  price       REAL,
  dir         TEXT,            -- folder under out/
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,    -- pdf | svg | png | csv | txt | brief
  role       TEXT NOT NULL,    -- deliverable | mockup | thumbnail | instructions
  label      TEXT,
  path       TEXT NOT NULL,
  bytes      INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  tags            TEXT,        -- json array, max 13
  materials       TEXT,        -- json array
  price           REAL,
  status          TEXT NOT NULL, -- draft | exported | live | error
  etsy_listing_id TEXT,
  export_path     TEXT,
  upload_ok_at    INTEGER,       -- the owner said yes; spent on the next upload
  upload_ok_by    TEXT,          -- what that yes was: approval | send-to-etsy | cli
  uploaded_at     INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- What Etsy actually looks like for a phrase a buyer would type. Read from
-- Etsy's public search, not guessed. One row per phrase, overwritten each
-- sweep, with the previous count kept so movement is visible.
CREATE TABLE IF NOT EXISTS market (
  id            TEXT PRIMARY KEY,
  keyword       TEXT NOT NULL UNIQUE,
  listings      INTEGER NOT NULL,
  was_listings  INTEGER,
  competition   TEXT,          -- crowded | moderate | quiet
  price_low     REAL,
  price_median  REAL,
  price_high    REAL,
  sampled       INTEGER,
  phrases       TEXT,          -- json [{word, inListings}]
  checked_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,
  subject     TEXT,
  payload     TEXT,           -- json
  status      TEXT NOT NULL,  -- queued | running | done | failed | blocked
  priority    INTEGER NOT NULL DEFAULT 5,
  attempts    INTEGER NOT NULL DEFAULT 0,
  result      TEXT,
  error       TEXT,
  created_at  INTEGER NOT NULL,
  started_at  INTEGER,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id        TEXT PRIMARY KEY,
  ts        INTEGER NOT NULL,
  agent_id  TEXT,
  station   TEXT,
  kind      TEXT NOT NULL,   -- short chip label in the activity feed
  level     TEXT NOT NULL,   -- info | good | warn | error
  message   TEXT NOT NULL,
  meta      TEXT
);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts DESC);

CREATE TABLE IF NOT EXISTS lessons (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT,            -- null = everyone learns it
  text       TEXT NOT NULL,
  source     TEXT,            -- dashboard | discord | cli | agent
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,  -- ideas | listing | question
  ref_id      TEXT,
  agent_id    TEXT,
  station     TEXT,
  title       TEXT NOT NULL,
  detail      TEXT,
  options     TEXT,           -- json array of {value,label}
  status      TEXT NOT NULL,  -- open | answered | cancelled
  answer      TEXT,
  created_at  INTEGER NOT NULL,
  answered_at INTEGER
);

CREATE TABLE IF NOT EXISTS agent_state (
  id         TEXT PRIMARY KEY,
  status     TEXT NOT NULL,   -- idle | working | waiting | offline
  station    TEXT NOT NULL,
  activity   TEXT,
  job_id     TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id         TEXT PRIMARY KEY,
  listing_id TEXT,
  sku        TEXT,
  amount     REAL NOT NULL,
  currency   TEXT,
  occurred_at INTEGER NOT NULL,
  source     TEXT
);

CREATE TABLE IF NOT EXISTS campaigns (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  theme     TEXT,
  starts_at INTEGER,
  ends_at   INTEGER,
  notes     TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ---------------------------------------------------------------------------
-- The venture arm. Deliberately its own tables: no venture agent reads the
-- shop's data and no shop agent reads the ventures'.
-- ---------------------------------------------------------------------------

-- Raw complaints, wishes and frustrations harvested from public discussions.
CREATE TABLE IF NOT EXISTS signals (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,    -- hackernews | reddit | rss | manual
  external_id  TEXT,             -- so the same post is never harvested twice
  title        TEXT,
  text         TEXT,
  url          TEXT,
  author       TEXT,
  score        INTEGER,
  comments     INTEGER,
  phrase       TEXT,             -- the signal phrase that matched
  channel      TEXT,             -- subreddit, feed name, story title
  posted_at    INTEGER,
  harvested_at INTEGER NOT NULL,
  used         INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS signals_external ON signals(source, external_id);

CREATE TABLE IF NOT EXISTS ventures (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  one_liner     TEXT,
  problem       TEXT,
  audience      TEXT,
  solution      TEXT,
  monetisation  TEXT,            -- json {model, price, tiers, firstPoundPath, daysToRevenue}
  analysis      TEXT,            -- json from the Analyst
  plan          TEXT,            -- json from the Architect
  evidence      TEXT,            -- json array of signal ids and quotes
  effort        INTEGER,
  confidence    INTEGER,
  score         REAL,
  status        TEXT NOT NULL,   -- proposed | approved | rejected | shelved | killed | building | live | parked
  stage         TEXT NOT NULL,   -- analysis | plan | build | marketing | live
  dir           TEXT,
  note          TEXT,
  created_at    INTEGER NOT NULL,
  decided_at    INTEGER,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS venture_assets (
  id         TEXT PRIMARY KEY,
  venture_id TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,   -- code | page | doc | config | marketing
  label      TEXT,
  path       TEXT NOT NULL,
  bytes      INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS marketing (
  id          TEXT PRIMARY KEY,
  venture_id  TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  channel     TEXT,            -- which channel the plan is for
  status      TEXT NOT NULL,   -- draft | approved | running | paused | done
  budget      REAL,            -- what YOU said it may spend, never what it spent
  plan        TEXT,            -- json
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS venture_revenue (
  id          TEXT PRIMARY KEY,
  venture_id  TEXT REFERENCES ventures(id) ON DELETE CASCADE,
  amount      REAL NOT NULL,
  currency    TEXT,
  kind        TEXT,            -- subscription | one-off | ad | affiliate
  note        TEXT,
  occurred_at INTEGER NOT NULL
);

-- What the agents' brain has cost, so a runaway loop cannot quietly spend
-- money. Rows are per model call.
CREATE TABLE IF NOT EXISTS spend (
  id           TEXT PRIMARY KEY,
  day          TEXT NOT NULL,   -- YYYY-MM-DD, local
  agent_id     TEXT,
  provider     TEXT,
  model        TEXT,
  in_tokens    INTEGER NOT NULL DEFAULT 0,
  out_tokens   INTEGER NOT NULL DEFAULT 0,
  estimated    INTEGER NOT NULL DEFAULT 0,  -- 1 when the provider gave no counts
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS spend_day ON spend(day);

-- The Curator's suggestions: bundles of existing products, and spin-off
-- variants of ones that sell. Kept separate from ideas because a bundle is
-- assembled from things the shop already has rather than designed from nothing.
CREATE TABLE IF NOT EXISTS proposals (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,   -- bundle | variant
  title      TEXT NOT NULL,
  detail     TEXT,
  payload    TEXT,            -- json: member product ids, prices, twist
  status     TEXT NOT NULL,   -- open | accepted | declined | done
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);

-- Repeated quality problems, so the Inspector can teach rather than just reject.
CREATE TABLE IF NOT EXISTS failures (
  id         TEXT PRIMARY KEY,
  product_id TEXT,
  agent_id   TEXT,            -- whose fault it was
  pattern    TEXT NOT NULL,   -- normalised problem class
  detail     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS failures_pattern ON failures(pattern);
`);

// --- migrations ------------------------------------------------------------
// The schema above is created with IF NOT EXISTS, so a database made by an
// older version never gains new columns. Adding one is safe to attempt every
// start: SQLite refuses a duplicate and we ignore that.
for (const [table, column, type] of [
  ['lessons', 'division', 'TEXT'], // so shop rules never reach venture agents
  // A near-duplicate is kept now rather than dropped, so it has to carry what
  // it is close to — the owner decides, and the Maker deliberately varies it.
  ['ideas', 'similar_to', 'TEXT'],
  ['ideas', 'similarity', 'REAL'],
  ['products', 'variant_of', 'TEXT'],
  // One owner decision buys exactly one upload. Set when you approve a listing
  // or press "send to etsy", cleared the instant the Shopkeeper acts on it. A
  // retry, a second tick, a re-run of a script — none of them can put a second
  // draft in the shop, because the permission is already spent.
  // Where a live venture can be reached. Without it the Operator cannot tell
  // a business that is running from a folder that was never deployed.
  ['ventures', 'url', 'TEXT'],
  ['listings', 'upload_ok_at', 'INTEGER'],
  ['listings', 'upload_ok_by', 'TEXT'],
  ['listings', 'uploaded_at', 'INTEGER'],
]) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch {
    // already there
  }
}

// --- generic helpers -------------------------------------------------------

export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const one = (sql, ...params) => db.prepare(sql).get(...params) ?? null;
export const run = (sql, ...params) => db.prepare(sql).run(...params);
export const count = (sql, ...params) => {
  const row = one(sql, ...params);
  if (!row) return 0;
  return Number(Object.values(row)[0] ?? 0);
};

export function insert(table, row) {
  const keys = Object.keys(row);
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  run(sql, ...keys.map((k) => normalise(row[k])));
  return row.id;
}

export function update(table, id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  run(sql, ...keys.map((k) => normalise(patch[k])), id);
}

function normalise(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

export function json(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// --- settings --------------------------------------------------------------

export function getSetting(key, fallback = null) {
  const row = one('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    typeof value === 'object' ? JSON.stringify(value) : String(value)
  );
}

// --- agent state -----------------------------------------------------------

export function setAgentState(id, patch) {
  const existing = one('SELECT id FROM agent_state WHERE id = ?', id);
  const row = {
    status: patch.status ?? 'idle',
    station: patch.station ?? 'office',
    activity: patch.activity ?? null,
    job_id: patch.job_id ?? null,
    updated_at: now(),
  };
  if (existing) {
    update('agent_state', id, row);
  } else {
    insert('agent_state', { id, ...row });
  }
}

export function nextSku(prefix = 'HV') {
  const n = Number(getSetting('sku_counter', '0')) + 1;
  setSetting('sku_counter', String(n));
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export { uid };
export default db;
