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
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
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
`);

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
