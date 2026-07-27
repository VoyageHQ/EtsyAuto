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
  // Overridable so the test suite never opens the shop's real database.
  // It used to, and the two drifted into each other: a run's check count
  // depended on how many times it had been run before, and one bad assertion
  // away from `npm test` was somebody's actual catalogue.
  dbPath: str('DB_PATH') ? resolve(ROOT, str('DB_PATH')) : join(dataDir, 'valley.db'),

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
    sources: str('VENTURE_SOURCES', 'hackernews,stackexchange,reddit')
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
    // How often the Operator looks at what is live. Often enough that a site
    // being down is noticed the same day, rarely enough that it is not noise.
    checkHours: num('VENTURE_CHECK_HOURS', 6),
  },

  autoLoop: bool('AUTO_LOOP', true),
  tickSeconds: num('TICK_SECONDS', 20),
  ideaBacklogTarget: num('IDEA_BACKLOG_TARGET', 18),
  // How often the Researcher goes and reads Etsy's live listings for the
  // phrases this shop cares about. Short, because the Scout's next batch of
  // ideas is built on it. It is a handful of public GETs, not a scrape.
  marketScanHours: num('MARKET_SCAN_HOURS', 3),
  // How often the Scout is asked for a fresh batch. It never stops now: when
  // the shortlist is full the weakest make way, so the pile stays the same
  // size and gets better rather than longer.
  ideaAskMinutes: num('IDEA_ASK_MINUTES', 30),
  // The notebook holds concepts this engine cannot make — Notion workspaces,
  // Cricut cut files, presets, wall art. They stay there, marked, rather than
  // being proposed: a title promising a Notion file that ships a PDF is a
  // refund waiting to happen. Turn this on if you intend to supply the
  // artwork or the file yourself and just want the ideas.
  proposeArtwork: bool('PROPOSE_ARTWORK', false),
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
    // The circuit breaker, not a speed limit.
    //
    // Every upload already needs a decision from you that is spent when it is
    // used, so this is only here to catch a bug that finds a way to mint those
    // decisions in a loop. Set at six it caught the owner instead: approve a
    // dozen listings after a tidy-up and the seventh onwards silently refused.
    // Generous enough that a real morning's work goes through, tight enough
    // that a runaway hits a wall long before it fills a shop.
    maxUploadsPerHour: num('ETSY_MAX_UPLOADS_PER_HOUR', 30),
    get enabled() {
      return Boolean(this.keystring && this.accessToken && this.shopId);
    },
  },
};

export default config;
