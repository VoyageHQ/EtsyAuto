// What is quietly wrong.
//
// The Inspector guards the gate: nothing gets past it broken. But a shop rots
// after the gate too, and in ways no single agent is looking for — a listing
// that has sat unsold since spring, a product that stalled at the copy stage
// three days ago, a price that ended up under the floor once the fees are
// counted, a venture carrying no evidence.
//
// Each of those is invisible on its own. Together they are the difference
// between a shop and a folder of files. So this asks the whole shop one
// question — what is wrong right now — and answers it in the order a person
// would want to fix things.
import { all, count, one } from './db.js';
import config from './config.js';
import { openApprovals } from './approvals.js';
import { auditListing } from '../etsy/seo.js';
import { connectionGaps } from '../etsy/api.js';
import { uploadsInLastHour } from '../etsy/permission.js';
import { rulesFor } from '../knowledge/index.js';
import { imageProblems, findTrademarks } from '../knowledge/apply.js';
import { money } from './util.js';

const DAY = 86400000;

/**
 * Severity is about what it costs you, not how broken it looks.
 *
 *  bad   — costs money or risks the shop right now
 *  poor  — measurably worse than it should be
 *  note  — worth knowing, not worth interrupting anyone for
 */
const SEVERITY = ['bad', 'poor', 'note'];

/**
 * Everything wrong with the shop, worst first.
 *
 * @param {object} [options]
 * @param {number} [options.staleDays] how long a listing may sit before it counts as stale
 * @returns {{checked: number, findings: object[], score: number, summary: string}}
 */
export function checkShop({ staleDays = 45 } = {}) {
  const findings = [];
  const add = (severity, area, what, fix, ref = null) =>
    findings.push({ severity, area, what, fix, ref });

  // --- things the owner is blocking ------------------------------------
  // The commonest reason a shop full of finished work earns nothing is that
  // nobody pressed the button.
  for (const approval of openApprovals()) {
    const days = Math.floor((Date.now() - Number(approval.created_at)) / DAY);
    if (days >= 3) {
      add(
        days >= 7 ? 'bad' : 'poor',
        'you',
        `"${truncate(approval.title, 60)}" has been waiting ${days} days.`,
        'Answer it in heads up, or in Discord.',
        approval.id
      );
    }
  }

  // --- work that stopped moving ----------------------------------------
  for (const product of all(
    "SELECT id, sku, title, stage, updated_at FROM products WHERE status = 'active' AND stage NOT IN ('ready','listed')"
  )) {
    const hours = Math.floor((Date.now() - Number(product.updated_at)) / 3600000);
    const busy = one(
      "SELECT id FROM jobs WHERE status IN ('queued','running') AND payload LIKE ?",
      `%${product.id}%`
    );
    if (!busy && hours >= 6) {
      add(
        hours >= 48 ? 'bad' : 'poor',
        'stalled',
        `${product.sku} has sat at the ${product.stage} stage for ${hours}h with nobody on it.`,
        'The Manager picks these up on its next tick — start the loop, or press "do one job now".',
        product.id
      );
    }
  }

  // --- a connection that looks set up but is not ------------------------
  // Half a connection is worse than none, because everything downstream
  // behaves as though packing the files were the plan. Two of three variables
  // filled in means somebody meant to upload.
  const gaps = connectionGaps();
  if (gaps.length && gaps.length < 3) {
    add(
      'bad',
      'etsy',
      `Etsy is half connected — ${gaps.join(' and ')} ${gaps.length > 1 ? 'are' : 'is'} empty in .env.`,
      'Run npm run etsy:check. Until then every approved listing is packed into out/ instead of uploaded.'
    );
  }

  // --- something creating listings in bulk ------------------------------
  // The failure this exists for: an upload path with no approval gate put
  // 130-odd duplicate drafts in a live shop overnight. The gate is in place
  // now, but a shop that hits the ceiling is worth saying out loud.
  const recentUploads = uploadsInLastHour();
  if (recentUploads >= config.etsy.maxUploadsPerHour) {
    add(
      'bad',
      'etsy',
      `${recentUploads} listings have gone up in the last hour — the ceiling.`,
      'Nothing more will upload until it clears. Check your Etsy drafts, and npm run etsy:cleanup if there are duplicates.'
    );
  }

  // --- work that is finished but blocked --------------------------------
  // A blocked product is finished work earning nothing, and it is invisible
  // unless something says so: it is not in the Inspector's queue, not waiting
  // on an approval, and not moving.
  for (const product of all(
    "SELECT sku, title, stage FROM products WHERE status = 'blocked'"
  )) {
    add(
      'bad',
      'blocked',
      `${product.sku} is blocked at the ${product.stage} stage.`,
      'Open the Shopfront and press "send to etsy" to try again, or "rebuild files" first.'
    );
  }

  // A product the shop thinks is listed, with no Etsy id against it, means the
  // draft was deleted on Etsy or never landed.
  for (const row of all(
    `SELECT p.sku FROM products p
       JOIN listings l ON l.product_id = p.id
      WHERE p.stage = 'listed' AND (l.etsy_listing_id IS NULL OR l.etsy_listing_id = '')`
  )) {
    add(
      'poor',
      'listing',
      `${row.sku} is marked as listed but has no Etsy listing behind it.`,
      'Press "send to etsy" in the Shopfront to put a fresh draft up.'
    );
  }

  // --- listings that are live but underbuilt ----------------------------
  const bar = rulesFor('qa').thresholds || {};
  for (const listing of all(
    "SELECT l.*, p.sku FROM listings l LEFT JOIN products p ON p.id = l.product_id WHERE l.status IN ('exported','live','draft')"
  )) {
    const tags = safeTags(listing.tags);
    const problems = auditListing({ ...listing, tags });
    for (const problem of problems) {
      add('poor', 'listing', `${listing.sku || 'a listing'}: ${problem}`, 'Rebuild it from the Workshop.', listing.product_id);
    }

    // A trademark that got in before the checks existed is the one thing here
    // that can close the shop rather than merely cost a sale.
    const marks = findTrademarks(`${listing.title} ${listing.description} ${tags.join(' ')}`);
    if (marks.length) {
      add(
        'bad',
        'listing',
        `${listing.sku || 'a listing'} contains "${marks.join('", "')}".`,
        'Take it down and rebuild it. This is what closes shops.',
        listing.product_id
      );
    }
  }

  // --- images ------------------------------------------------------------
  for (const product of all("SELECT id, sku FROM products WHERE stage IN ('ready','listed')")) {
    const mockups = all("SELECT label, role, path FROM assets WHERE product_id = ? AND role = 'mockup'", product.id);
    for (const problem of imageProblems(mockups)) {
      add('poor', 'images', `${product.sku}: ${problem}`, 'Rebuild it, then re-export the PNGs from the Shopfront.', product.id);
    }
  }

  // --- money -------------------------------------------------------------
  const floor = Number(rulesFor('researcher').priceFloor ?? 2.5);
  for (const product of all('SELECT sku, title, price FROM products WHERE price IS NOT NULL')) {
    if (Number(product.price) > 0 && Number(product.price) < floor) {
      add(
        'poor',
        'money',
        `${product.sku} is priced at ${money(product.price, config.currency)}, under the ${money(floor, config.currency)} floor the fees demand.`,
        'Reprice it — at this level Etsy keeps most of it.'
      );
    }
  }

  // --- shop that has stopped selling -------------------------------------
  const stale = all(
    `SELECT p.sku, p.title, p.updated_at FROM products p
      WHERE p.stage = 'listed'
        AND p.updated_at < ?
        AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.sku = p.sku)`,
    Date.now() - staleDays * DAY
  );
  for (const product of stale) {
    add(
      'note',
      'quiet',
      `${product.sku} has been listed ${staleDays}+ days with no sales.`,
      'Either the title is not what people search for, or the first image is not stopping them. Rewrite one and see.'
    );
  }

  // --- the harbour --------------------------------------------------------
  for (const venture of all("SELECT id, name, evidence, stage FROM ventures WHERE status IN ('proposed','approved')")) {
    const evidence = safeJson(venture.evidence);
    if (!evidence.length) {
      add(
        'poor',
        'harbour',
        `"${venture.name}" is on the shortlist with no evidence behind it.`,
        'An idea with no quotes is a guess. Send the Prospector back out.',
        venture.id
      );
    }
  }

  // --- the shop is empty --------------------------------------------------
  const backlog = count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'");
  if (backlog === 0) {
    add('note', 'empty', 'Nothing on the Research Bench.', 'Ask the Scout for more, or start the loop and it will.');
  }
  if (count("SELECT COUNT(*) FROM products WHERE stage = 'listed'") === 0) {
    add('note', 'empty', 'Nothing is listed yet.', 'Approve an idea and the fleet takes it the rest of the way.');
  }

  findings.sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));

  const bad = findings.filter((f) => f.severity === 'bad').length;
  const poor = findings.filter((f) => f.severity === 'poor').length;

  return {
    checked: Date.now(),
    findings,
    counts: { bad, poor, note: findings.length - bad - poor },
    // Not a percentage of anything real — just a way of saying "how loudly
    // should this shout at me", so the dashboard can pick a colour.
    score: bad ? 'bad' : poor ? 'poor' : 'good',
    summary: summarise(bad, poor, findings.length),
  };
}

function summarise(bad, poor, total) {
  if (!total) return 'Nothing wrong that I can see.';
  const bits = [];
  if (bad) bits.push(`${bad} costing you now`);
  if (poor) bits.push(`${poor} worth fixing`);
  const notes = total - bad - poor;
  if (notes) bits.push(`${notes} worth knowing`);
  return bits.join(', ') + '.';
}

/** The same thing as plain text, for the terminal. */
export function renderHealth(report) {
  if (!report.findings.length) return 'Nothing wrong that I can see.';
  const lines = [report.summary, ''];
  let lastSeverity = null;
  for (const f of report.findings) {
    if (f.severity !== lastSeverity) {
      lines.push(
        { bad: 'COSTING YOU NOW', poor: 'WORTH FIXING', note: 'WORTH KNOWING' }[f.severity]
      );
      lastSeverity = f.severity;
    }
    lines.push(`  · ${f.what}`);
    lines.push(`    ${f.fix}`);
  }
  return lines.join('\n');
}

const truncate = (text, max) => (String(text).length > max ? `${String(text).slice(0, max - 1)}…` : String(text));
const safeTags = (value) => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const safeJson = (value) => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default checkShop;
