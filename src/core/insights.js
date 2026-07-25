// What the shop has learned from its own results.
//
// Without this the agents work in a vacuum: the Scout keeps proposing the same
// kinds of thing whether they sell or not, and nobody notices that you approve
// every ADHD idea and reject every wedding one. Everything here is derived from
// what has actually happened, and it gets folded into the agents' prompts.
import { all, one, json } from './db.js';
import config from './config.js';
import { money } from './util.js';

const DAY = 86400000;

/** Products that have actually earned money, best first. */
export function topSellers(limit = 6) {
  return all(
    `SELECT p.sku, p.title, p.category, COUNT(s.id) AS sales, IFNULL(SUM(s.amount), 0) AS revenue
     FROM sales s
     JOIN products p ON p.sku = s.sku
     GROUP BY p.sku
     ORDER BY revenue DESC
     LIMIT ?`,
    limit
  );
}

/** Listed a while ago, still nothing. Worth knowing before making more of them. */
export function quietListings(days = 30, limit = 6) {
  const cutoff = Date.now() - days * DAY;
  return all(
    `SELECT p.sku, p.title, p.category, l.updated_at
     FROM products p
     JOIN listings l ON l.product_id = p.id
     WHERE p.stage = 'listed'
       AND l.updated_at < ?
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.sku = p.sku)
     ORDER BY l.updated_at ASC
     LIMIT ?`,
    cutoff,
    limit
  );
}

export function categoryPerformance() {
  return all(
    `SELECT p.category,
            COUNT(DISTINCT p.id) AS built,
            COUNT(s.id) AS sales,
            IFNULL(SUM(s.amount), 0) AS revenue
     FROM products p
     LEFT JOIN sales s ON s.sku = p.sku
     GROUP BY p.category
     ORDER BY revenue DESC, built DESC`
  );
}

/**
 * The most useful signal in the whole file: which categories the owner says
 * yes to, and which they keep turning down.
 */
export function ownerTaste() {
  const rows = all(
    `SELECT category,
            SUM(CASE WHEN status IN ('approved','built') THEN 1 ELSE 0 END) AS yes,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS no,
            SUM(CASE WHEN status = 'shelved' THEN 1 ELSE 0 END) AS later
     FROM ideas
     WHERE status IN ('approved','built','rejected','shelved')
     GROUP BY category
     ORDER BY (yes + no + later) DESC`
  );
  return rows.map((row) => ({
    ...row,
    verdict:
      row.yes && !row.no ? 'always yes' : row.no && !row.yes ? 'always no' : row.yes >= row.no ? 'usually yes' : 'usually no',
  }));
}

/** Every tag the shop already targets, so it can stop bidding against itself. */
export function keywordCoverage(limit = 24) {
  const counts = new Map();
  for (const row of all('SELECT tags FROM listings')) {
    for (const tag of json(row.tags, [])) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

/** Reasons the owner has given for turning things down, most recent first. */
export function rejectionReasons(limit = 8) {
  return all(
    `SELECT title, category, note FROM ideas
     WHERE status = 'rejected' AND note IS NOT NULL AND note != ''
     ORDER BY decided_at DESC LIMIT ?`,
    limit
  );
}

export function shopTotals() {
  const revenue = Number(one('SELECT IFNULL(SUM(amount), 0) AS t FROM sales')?.t || 0);
  const listed = Number(one("SELECT COUNT(*) AS c FROM products WHERE stage = 'listed'")?.c || 0);
  const sales = Number(one('SELECT COUNT(*) AS c FROM sales')?.c || 0);
  return { revenue, listed, sales, averageSale: sales ? revenue / sales : 0 };
}

/**
 * The block that goes into an agent's prompt. Deliberately short — it is
 * context, not a report, and a wall of numbers makes worse decisions than
 * three good sentences.
 *
 * @param {'scout'|'researcher'|'maker'|'copywriter'|'curator'|string} agentId
 * @returns {string} '' when the shop has no history worth mentioning yet
 */
export function insightBlock(agentId, division = 'etsy') {
  // The venture arm gets its own numbers, never the shop's. Letting Etsy
  // results steer startup decisions would be worse than no data at all.
  if (division === 'ventures') return ventureInsightBlock();

  const lines = [];
  const totals = shopTotals();
  const sellers = topSellers(4);
  const quiet = quietListings(30, 3);
  const taste = ownerTaste();
  const coverage = keywordCoverage(14);
  const reasons = rejectionReasons(4);

  if (totals.listed) {
    lines.push(
      `The shop has ${totals.listed} listing(s) out and has taken ${money(totals.revenue, config.currency)} ` +
        `across ${totals.sales} sale(s).`
    );
  }

  if (sellers.length && sellers[0].revenue > 0) {
    lines.push(
      'What has actually sold: ' +
        sellers
          .filter((s) => s.revenue > 0)
          .map((s) => `${s.title} (${s.category}, ${s.sales} sale${s.sales === 1 ? '' : 's'})`)
          .join('; ') +
        '.'
    );
  }

  if (quiet.length && (agentId === 'scout' || agentId === 'researcher' || agentId === 'curator')) {
    lines.push(
      'Listed for over a month with no sales, so do not simply make more of the same: ' +
        quiet.map((q) => `${q.title} (${q.category})`).join('; ') +
        '.'
    );
  }

  if (taste.length && (agentId === 'scout' || agentId === 'curator')) {
    const strong = taste.filter((t) => t.yes + t.no >= 2);
    if (strong.length) {
      lines.push(
        'What the owner says yes and no to: ' +
          strong.map((t) => `${t.category} — ${t.verdict} (${t.yes} yes, ${t.no} no)`).join('; ') +
          '.'
      );
    }
  }

  if (reasons.length && agentId === 'scout') {
    lines.push(
      'Reasons they have turned things down: ' +
        reasons.map((r) => `"${r.title}" — ${r.note}`).join('; ') +
        '.'
    );
  }

  if (coverage.length && (agentId === 'researcher' || agentId === 'copywriter' || agentId === 'scout')) {
    lines.push(
      'Search terms the shop already targets, so avoid competing with itself: ' +
        coverage.map((c) => (c.count > 1 ? `${c.tag} (×${c.count})` : c.tag)).join(', ') +
        '.'
    );
  }

  if (!lines.length) return '';

  return [
    '',
    'WHAT THIS SHOP HAS LEARNED SO FAR — real numbers from its own listings, not',
    'guesses. Weigh this more heavily than your instincts about the market.',
    ...lines.map((line) => `- ${line}`),
  ].join('\n');
}

/**
 * The venture arm's own history. Kept deliberately thin: with one or two
 * ventures there is very little to learn from, and pretending otherwise would
 * be worse than saying nothing.
 */
export function ventureInsightBlock() {
  const lines = [];
  const live = all("SELECT name, slug FROM ventures WHERE stage = 'live'");
  const killed = all(
    "SELECT name, note FROM ventures WHERE status IN ('killed','rejected') ORDER BY decided_at DESC LIMIT 5"
  );
  const revenue = Number(one('SELECT IFNULL(SUM(amount), 0) AS t FROM venture_revenue')?.t || 0);
  const signalTotal = Number(one('SELECT COUNT(*) AS c FROM signals')?.c || 0);

  if (live.length) {
    lines.push(`Already live: ${live.map((v) => v.name).join(', ')}. Do not propose these again.`);
  }
  if (revenue > 0) {
    lines.push(`The venture arm has taken ${money(revenue, config.currency)} so far.`);
  }
  if (killed.length) {
    lines.push(
      'Turned down or killed before, with the reason: ' +
        killed.map((v) => `${v.name}${v.note ? ` — ${v.note}` : ''}`).join('; ') +
        '.'
    );
  }
  if (signalTotal) {
    lines.push(`${signalTotal} harvested complaint(s) are on file to draw evidence from.`);
  }
  if (!lines.length) return '';

  return [
    '',
    'WHAT THE VENTURE ARM HAS LEARNED SO FAR — its own history, not the shop\'s.',
    ...lines.map((line) => `- ${line}`),
  ].join('\n');
}

/** The same data, for the Ledger panel on the dashboard. */
export function insightsSummary() {
  return {
    totals: shopTotals(),
    topSellers: topSellers(6),
    quietListings: quietListings(30, 6),
    categories: categoryPerformance(),
    taste: ownerTaste(),
    coverage: keywordCoverage(20),
  };
}

export default insightBlock;
