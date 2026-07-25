// Configuration. Reads .env with a tiny parser so the project keeps its
// promise of zero npm dependencies.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Real environment always wins over the file.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, '.env'));

const str = (key, fallback = '') => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};
const num = (key, fallback) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
};
const bool = (key, fallback) => {
  const v = str(key, '').toLowerCase();
  if (!v) return fallback;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
};

const dataDir = join(ROOT, 'data');
const outDir = join(ROOT, 'out');
for (const dir of [dataDir, outDir]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export const config = {
  root: ROOT,
  dataDir,
  outDir,
  dbPath: join(dataDir, 'valley.db'),

  shopName: str('SHOP_NAME', 'Hartistic'),
  valleyName: str('VALLEY_NAME', str('SHOP_NAME', 'Hartistic') + ' Valley'),
  currency: str('SHOP_CURRENCY', 'GBP'),

  host: str('HOST', '127.0.0.1'),
  port: num('PORT', 4173),

  llm: {
    provider: str('LLM_PROVIDER', 'offline').toLowerCase(),
    anthropicKey: str('ANTHROPIC_API_KEY'),
    anthropicModel: str('ANTHROPIC_MODEL', 'claude-sonnet-4-5'),
    baseUrl: str('LLM_BASE_URL'),
    model: str('LLM_MODEL'),
    apiKey: str('LLM_API_KEY'),
  },

  autoLoop: bool('AUTO_LOOP', true),
  tickSeconds: num('TICK_SECONDS', 20),
  ideaBacklogTarget: num('IDEA_BACKLOG_TARGET', 18),
  maxActiveProducts: num('MAX_ACTIVE_PRODUCTS', 3),

  discord: {
    token: str('DISCORD_BOT_TOKEN'),
    guildId: str('DISCORD_GUILD_ID'),
    categoryName: str('DISCORD_CATEGORY_NAME', str('VALLEY_NAME', 'Hartistic Valley')),
    ownerId: str('DISCORD_OWNER_ID'),
    get enabled() {
      return Boolean(this.token && this.guildId);
    },
  },

  etsy: {
    keystring: str('ETSY_KEYSTRING'),
    sharedSecret: str('ETSY_SHARED_SECRET'),
    shopId: str('ETSY_SHOP_ID'),
    accessToken: str('ETSY_ACCESS_TOKEN'),
    refreshToken: str('ETSY_REFRESH_TOKEN'),
    publishMode: str('ETSY_PUBLISH_MODE', 'draft'),
    get enabled() {
      return Boolean(this.keystring && this.accessToken && this.shopId);
    },
  },
};

export default config;
