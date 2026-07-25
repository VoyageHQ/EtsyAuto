// Everything the dashboard needs, in one payload.
import config from '../core/config.js';
import { all, count, getSetting, json, one } from '../core/db.js';
import { STATIONS, PLAZA, POND, PATHS } from '../core/stations.js';
import { roster } from '../agents/registry.js';
import { recentEvents } from '../core/events.js';
import { openApprovals } from '../core/approvals.js';
import { allLessons } from '../core/memory.js';
import { queuedCount, recentJobs } from '../pipeline/queue.js';
import { listProducts, getListing, assetsFor } from '../pipeline/products.js';
import { llm } from '../core/llm.js';
import { etsyEnabled } from '../etsy/api.js';
import { insightsSummary } from '../core/insights.js';
import { todayUsage, usageByAgent } from '../core/spend.js';
import { failureSummary } from '../core/retro.js';
import { money } from '../core/util.js';

export function clock(date = new Date()) {
  const hour = date.getHours();
  const phase = hour < 6 ? 'night' : hour < 9 ? 'dawn' : hour < 18 ? 'day' : hour < 21 ? 'dusk' : 'night';
  return {
    time: date.toTimeString().slice(0, 5),
    label: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    phase,
    iso: date.toISOString(),
  };
}

function stationCounts() {
  const campaign = one('SELECT * FROM campaigns ORDER BY starts_at DESC LIMIT 1');
  const salesTotal = Number(one('SELECT IFNULL(SUM(amount),0) AS t FROM sales')?.t || 0);
  return {
    jobsQueued: queuedCount(),
    ideasProposed: count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'"),
    ideasShelved: count("SELECT COUNT(*) FROM ideas WHERE status IN ('approved','shelved')"),
    productsInDesign: count("SELECT COUNT(*) FROM products WHERE stage IN ('research','design') AND status = 'active'"),
    productsInReview: count("SELECT COUNT(*) FROM products WHERE stage IN ('copy','review') AND status = 'active'"),
    listingsLive: count("SELECT COUNT(*) FROM listings WHERE status IN ('live','exported')"),
    campaign: campaign ? `${campaign.name.toLowerCase()} ${daysLeft(campaign.ends_at)}` : null,
    salesTotal: salesTotal ? money(salesTotal, config.currency) : null,
    lookout: getSetting('lookout_note'),
    bundles:
      count("SELECT COUNT(*) FROM proposals WHERE status IN ('open','accepted')") +
      count("SELECT COUNT(*) FROM products WHERE category = 'Bundles' AND stage != 'listed'"),
  };
}

const daysLeft = (ts) => {
  const days = Math.max(0, Math.round((Number(ts) - Date.now()) / 86400000));
  return `${days}d`;
};

export function buildState() {
  const counts = stationCounts();
  const products = listProducts().map((p) => {
    const listing = getListing(p.id);
    return {
      id: p.id,
      sku: p.sku,
      title: p.title,
      category: p.category,
      stage: p.stage,
      status: p.status,
      price: p.price,
      dir: p.dir,
      pages: p.spec?.pages?.length || 0,
      updatedAt: p.updated_at,
      listing: listing
        ? {
            id: listing.id,
            title: listing.title,
            tags: listing.tags,
            price: listing.price,
            status: listing.status,
            etsyListingId: listing.etsy_listing_id,
            exportPath: listing.export_path,
          }
        : null,
    };
  });

  return {
    shop: {
      name: config.shopName,
      valley: config.valleyName,
      currency: config.currency,
      clock: clock(),
      brain: { provider: llm.provider, live: llm.enabled, model: llm.describe() },
      etsy: { connected: etsyEnabled(), mode: config.etsy.publishMode },
      discord: { connected: Boolean(getSetting('discord_ready')) },
      autoLoop: config.autoLoop,
    },
    world: { stations: STATIONS, plaza: PLAZA, pond: POND, paths: PATHS },
    counts,
    agents: roster(),
    attention: openApprovals().map((a) => ({
      id: a.id,
      kind: a.kind,
      refId: a.ref_id,
      agent: a.agent_id,
      station: a.station,
      title: a.title,
      detail: a.detail,
      options: a.options,
      createdAt: a.created_at,
    })),
    activity: recentEvents(50).map((e) => ({
      id: e.id,
      ts: e.ts,
      agent: e.agent_id,
      station: e.station,
      kind: e.kind,
      level: e.level,
      message: e.message,
    })),
    ideas: {
      proposed: ideaRows("WHERE status = 'proposed' ORDER BY score DESC, created_at DESC", 60),
      approved: ideaRows("WHERE status = 'approved' ORDER BY score DESC", 30),
      shelved: ideaRows("WHERE status = 'shelved' ORDER BY decided_at DESC", 30),
      recentlyRejected: ideaRows("WHERE status = 'rejected' ORDER BY decided_at DESC", 12),
      built: count("SELECT COUNT(*) FROM ideas WHERE status = 'built'"),
    },
    products,
    jobs: recentJobs(20).map((j) => ({
      id: j.id,
      agent: j.agent_id,
      kind: j.kind,
      subject: j.subject,
      status: j.status,
      error: j.error,
      createdAt: j.created_at,
    })),
    lessons: allLessons().map((l) => ({
      id: l.id,
      agent: l.agent_id,
      text: l.text,
      source: l.source,
      createdAt: l.created_at,
    })),
    ledger: {
      total: Number(one('SELECT IFNULL(SUM(amount),0) AS t FROM sales')?.t || 0),
      sales: all('SELECT * FROM sales ORDER BY occurred_at DESC LIMIT 20'),
    },
    insights: insightsSummary(),
    budget: { ...todayUsage(), byAgent: usageByAgent() },
    failures: failureSummary(6),
    proposals: all("SELECT * FROM proposals WHERE status IN ('open','accepted') ORDER BY created_at DESC").map(
      (row) => ({ ...row, payload: json(row.payload, {}) })
    ),
    campaign: one('SELECT * FROM campaigns ORDER BY starts_at DESC LIMIT 1'),
  };
}

function ideaRows(where, limit) {
  return all(`SELECT * FROM ideas ${where} LIMIT ?`, limit).map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    audience: row.audience,
    pitch: row.pitch,
    angle: row.angle,
    format: row.format,
    keywords: json(row.keywords, []),
    effort: row.effort,
    demand: row.demand,
    priceLow: row.price_low,
    priceHigh: row.price_high,
    score: row.score,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export function productDetail(id) {
  const product = listProducts('WHERE id = ' + quote(id))[0];
  if (!product) return null;
  const listing = getListing(id);
  return {
    ...product,
    spec: product.spec,
    research: product.research,
    listing,
    assets: assetsFor(id).map((a) => ({
      id: a.id,
      kind: a.kind,
      role: a.role,
      label: a.label,
      path: a.path,
      bytes: a.bytes,
    })),
  };
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

export default buildState;
