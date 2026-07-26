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
  // Your logo, laid over every listing image so a screenshot of the preview is
  // not a usable copy of the product. Any path relative to the project root.
  // With no logo the shop name is used instead, which still spoils a lift.
  logoPath: str('SHOP_LOGO'),
  watermarkOpacity: num('WATERMARK_OPACITY', 0.1),
  watermark: str('WATERMARK', 'on').toLowerCase() !== 'off',
  valleyName: str('VALLEY_NAME', str('SHOP_NAME', 'Hartistic') + ' Valley'),
  currency: str('SHOP_CURRENCY', 'GBP'),

  host: str('HOST', '127.0.0.1'),
  port: num('PORT', 4173),

  llm: {
    provider: str('LLM_PROVIDER', 'offline').toLowerCase(),
    anthropicKey: str('ANTHROPIC_API_KEY'),
    anthropicModel: str('ANTHROPIC_MODEL', 'claude-sonnet-5'),
    baseUrl: str('LLM_BASE_URL'),
    model: str('LLM_MODEL'),
    apiKey: str('LLM_API_KEY'),
    // 0 means no cap. When the cap is reached the agents fall back to their
    // offline craft for the rest of the day rather than spending more.
    dailyTokens: num('LLM_DAILY_TOKENS', 0),
    // Your model's rates per million tokens, if you want the meter in money as
    // well as tokens. Rates change too often to hard-code.
    costIn: num('LLM_COST_IN', 0),
    costOut: num('LLM_COST_OUT', 0),
  },

  ventures: {
    // Which research sources the Prospector may use.
    sources: str('VENTURE_SOURCES', 'hackernews,reddit')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    subreddits: str('VENTURE_SUBREDDITS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    feeds: str('VENTURE_FEEDS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    redditToken: str('REDDIT_TOKEN'),
    // How many ventures may be in build at once. One is the honest answer for
    // a person with a day job.
    maxActive: num('VENTURE_MAX_ACTIVE', 1),
    // The Analyst kills anything that cannot plausibly take money within this
    // many days. Ideas without a path to revenue are hobbies.
    maxDaysToRevenue: num('VENTURE_MAX_DAYS_TO_REVENUE', 90),
    dir: str('VENTURE_DIR', 'ventures'),
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
