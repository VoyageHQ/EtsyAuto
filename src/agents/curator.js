// THE CURATOR — works out how to get more shop out of what you already have.
//
// Two moves, both of which are how real digital shops grow:
//
//   Bundles  — three planners that already exist, sold together at a discount.
//              No new design work, a higher order value, and it gives buyers
//              something to trade up to.
//   Variants — a proven product done again for a different buyer: US Letter,
//              ink-saver, teen edition, dyslexia-friendly. Cheap to make and it
//              targets search terms the original cannot.
import Agent from './base.js';
import config from '../core/config.js';
import { all, count, insert, one, json, update } from '../core/db.js';
import { uid, now, money, titleCase, pick, seededRandom } from '../core/util.js';
import { ask } from '../core/approvals.js';
import { TWISTS } from './ideas-corpus.js';
import { createProduct, getProduct, advance, listProducts } from '../pipeline/products.js';
import { buildProduct } from '../design/build.js';
import { normaliseSpec } from '../design/templates/plan.js';
import { topSellers } from '../core/insights.js';
import { closestMatch, catalogue, TOO_SIMILAR } from '../core/similarity.js';
import { pushState } from '../core/events.js';

const MIN_BUNDLE = 2;
const MAX_BUNDLE = 4;
/** Buyers expect a bundle to be visibly cheaper than buying separately. */
const BUNDLE_DISCOUNT = 0.7;

export class Curator extends Agent {
  constructor() {
    super({
      id: 'curator',
      name: 'The Curator',
      title: 'catalogue and bundles',
      station: 'packhouse',
      colour: '#b9a7d0',
      handles: ['curator.scan', 'curator.bundle'],
      voice: 'Practical and specific. Names the products it means and the price it suggests.',
      purpose: `
You grow the shop out of what it already has, rather than starting from nothing.

Bundles: when several finished products suit the same buyer, propose selling
them together at about 30% off the combined price. A bundle must make sense to
one person — "budget planner + bill tracker + savings chart" does; "wedding
planner + puppy training log" does not.

Variants: when something sells, propose the same product again for a different
buyer or a different constraint. Never propose a variant of something that has
not proven itself, and never propose one that would compete with the original
for the same search terms.

You never bundle something that is not finished, and you never decide — you
propose and wait.`,
    });
  }

  async handle(job) {
    if (job.kind === 'curator.bundle') return this.assemble(job);
    return this.scan();
  }

  // --- looking for opportunities -------------------------------------------

  async scan() {
    this.moveTo('packhouse', 'looking for bundles');
    const found = [];

    const bundled = this.alreadyBundled();
    const shippable = listProducts(
      "WHERE stage IN ('ready','listed') AND status != 'abandoned' AND category != 'Bundles'"
    ).filter((p) => (p.spec?.pages?.length || 0) > 1);

    // 1. Bundles, grouped by the buyer they suit.
    const groups = new Map();
    for (const product of shippable) {
      if (bundled.has(product.id)) continue;
      const key = product.category;
      groups.set(key, [...(groups.get(key) || []), product]);
    }

    for (const [category, members] of groups) {
      if (members.length < MIN_BUNDLE) continue;
      if (this.hasOpenProposal('bundle', category)) continue;
      const chosen = members.slice(0, MAX_BUNDLE);
      found.push(this.proposeBundle(category, chosen));
    }

    // 2. Variants of whatever has earned money, or of the best thing built so
    //    far if there are no sales yet to learn from. Only if the bench is not
    //    already stacked with spin-offs waiting for a decision.
    const waiting = count(
      "SELECT COUNT(*) FROM ideas WHERE status = 'proposed' AND source_agent = ?",
      this.id
    );
    if (waiting < 4) {
      for (const product of this.provenProducts().slice(0, 2)) {
        const variant = this.proposeVariant(product);
        if (variant) found.push(variant);
      }
    }

    if (!found.length) {
      this.say('Nothing worth bundling or spinning off yet.', { kind: 'curate', discord: false });
      this.goHome();
      return { result: { proposals: 0 } };
    }

    this.say(found.join(' '), { kind: 'curate', level: 'good' });
    this.goHome();
    pushState('curator');
    return { result: { proposals: found.length } };
  }

  proposeBundle(category, members) {
    const separate = members.reduce((sum, p) => sum + Number(p.price || 0), 0);
    const price = charm(separate * BUNDLE_DISCOUNT);
    const title = bundleTitle(category, members);
    const id = uid('prop');

    insert('proposals', {
      id,
      kind: 'bundle',
      title,
      detail:
        `${members.length} finished products for the same buyer, sold as one download.\n` +
        members.map((p) => `- ${p.sku} ${p.title} (${money(p.price, config.currency)})`).join('\n'),
      payload: {
        productIds: members.map((p) => p.id),
        category,
        separate,
        price,
      },
      status: 'open',
      created_at: now(),
    });

    ask({
      kind: 'bundle',
      refId: id,
      agent: this.id,
      station: 'packhouse',
      title: `Bundle ${members.length} products as "${title}" for ${money(price, config.currency)}?`,
      detail: [
        `**${title}**`,
        '',
        ...members.map((p) => `- ${p.sku} — ${p.title} (${money(p.price, config.currency)})`),
        '',
        `Separately: ${money(separate, config.currency)}. As a bundle: ${money(price, config.currency)} ` +
          `— ${Math.round((1 - BUNDLE_DISCOUNT) * 100)}% off.`,
        '',
        'No new design work. I merge the pages, the Scribe writes a fresh listing, and',
        'the Inspector checks it like anything else.',
      ].join('\n'),
      options: [
        { value: 'yes', label: 'Build the bundle' },
        { value: 'no', label: 'Not this lot' },
      ],
    });

    return `Proposed a ${members.length}-product ${category.toLowerCase()} bundle at ${money(price, config.currency)}.`;
  }

  proposeVariant(product) {
    const used = new Set(
      all('SELECT title FROM ideas WHERE source_agent = ?', this.id).map((r) => r.title.toLowerCase())
    );
    const rng = seededRandom(product.id + used.size);
    const known = catalogue();

    for (let attempt = 0; attempt < TWISTS.length; attempt++) {
      const twist = pick(TWISTS, rng);
      const title = `${product.title} — ${titleCase(twist.label)}`;
      if (used.has(title.toLowerCase())) continue;

      // A variant is meant to resemble its parent, but not so closely that the
      // two listings would fight. Compare against everything except the parent.
      const others = known.filter((entry) => entry.id !== product.id && entry.title !== product.title);
      const near = closestMatch(title, others);
      if (near.match && near.score >= TOO_SIMILAR) continue;

      const parentIdea = product.idea_id ? one('SELECT * FROM ideas WHERE id = ?', product.idea_id) : null;
      const keywords = json(parentIdea?.keywords, []).slice(0, 4);
      const id = uid('idea');
      insert('ideas', {
        id,
        title,
        category: product.category,
        audience: parentIdea?.audience || 'the same buyers as the original',
        pitch: `${product.title} done again for a different buyer. ${twist.note}`,
        angle: twist.note,
        format: parentIdea?.format || 'printable PDF pack',
        keywords: [...new Set([...keywords, twistKeyword(twist.label)])].filter(Boolean).slice(0, 8),
        effort: Math.max(1, (parentIdea?.effort || 3) - 1),
        demand: parentIdea?.demand || 3,
        price_low: product.price ? Number(product.price) * 0.8 : parentIdea?.price_low || 3,
        price_high: product.price ? Number(product.price) * 1.2 : parentIdea?.price_high || 7,
        score: 7.5,
        status: 'proposed',
        source_agent: this.id,
        batch: 'variants',
        created_at: now(),
      });
      return `Put a spin-off of ${product.sku} on the bench: ${twist.label}.`;
    }
    return null;
  }

  /**
   * What has earned money, or failing that the best thing the shop has built.
   * Never a bundle — a spin-off of a bundle is a mess nobody wants to buy.
   */
  provenProducts() {
    const sellers = topSellers(4)
      .filter((s) => Number(s.revenue) > 0)
      .map((s) => listProducts(`WHERE sku = '${s.sku.replace(/'/g, "''")}'`)[0])
      .filter((p) => p && p.category !== 'Bundles');
    if (sellers.length) return sellers;
    return listProducts("WHERE stage IN ('ready','listed') AND category != 'Bundles'").slice(0, 1);
  }

  alreadyBundled() {
    const ids = new Set();
    for (const row of all("SELECT payload FROM proposals WHERE kind = 'bundle' AND status IN ('open','accepted','done')")) {
      for (const id of json(row.payload, {}).productIds || []) ids.add(id);
    }
    return ids;
  }

  hasOpenProposal(kind, category) {
    return all("SELECT payload FROM proposals WHERE kind = ? AND status = 'open'", kind).some(
      (row) => json(row.payload, {}).category === category
    );
  }

  // --- building an approved bundle ------------------------------------------

  async assemble(job) {
    const proposal = one('SELECT * FROM proposals WHERE id = ?', job.payload.proposalId);
    if (!proposal) return { result: { skipped: 'proposal gone' } };
    const payload = json(proposal.payload, {});
    const members = (payload.productIds || []).map(getProduct).filter(Boolean);
    if (members.length < MIN_BUNDLE) {
      update('proposals', proposal.id, { status: 'declined', decided_at: now() });
      return { result: { skipped: 'not enough members left' } };
    }

    this.moveTo('packhouse', `assembling ${proposal.title}`);

    const spec = this.mergeSpecs(proposal.title, members, payload);
    const product = createProduct({
      title: proposal.title,
      category: 'Bundles',
      spec,
      price: payload.price,
      stage: 'design',
    });

    const built = buildProduct(product, spec);
    update('proposals', proposal.id, { status: 'done', decided_at: now() });

    this.say(
      `${product.sku} "${proposal.title}" assembled from ${members.length} products — ` +
        `${built.pageCount} pages at ${money(payload.price, config.currency)} ` +
        `(${money(payload.separate, config.currency)} separately).`,
      { kind: 'bundled', level: 'good', meta: { productId: product.id, members: members.map((m) => m.sku) } }
    );

    // From here it is an ordinary product: the Scribe writes it, the Inspector
    // checks it, and you approve the listing.
    advance(product, { spec, dir: built.dir });
    this.goHome();
    return { result: { sku: product.sku, pages: built.pageCount } };
  }

  /** One cover, everything worth keeping from each member, one contents page. */
  mergeSpecs(title, members, payload) {
    const pages = [];
    const contents = [];

    for (const member of members) {
      const memberPages = (member.spec?.pages || []).filter((page) => page.kind !== 'cover');
      contents.push({
        title: member.title,
        body: memberPages
          .map((page) => page.title)
          .filter(Boolean)
          .join(' · ') || `${memberPages.length} pages`,
      });
      for (const page of memberPages) {
        pages.push({ ...page, eyebrow: member.title });
      }
    }

    const trimmed = pages.slice(0, 16);
    const spec = {
      title,
      subtitle: `Everything in one download: ${members.map((m) => m.title).join(', ')}.`,
      brand: config.shopName,
      palette: members[0]?.spec?.palette || 'sage',
      sheets: members.some((m) => m.spec?.sheets),
      pages: [
        {
          kind: 'cover',
          title,
          subtitle: `${members.length} of our planners together — ${trimmed.length} pages in total.`,
          chips: ['Bundle', `${trimmed.length} pages`, 'A4 + Letter'],
          note: 'Print at 100%. Do not scale to fit.',
        },
        {
          kind: 'instructions',
          title: 'What is in this bundle',
          blocks: contents.slice(0, 6),
        },
        ...trimmed,
      ],
    };

    return normaliseSpec(spec, { id: 'bundle', title, category: 'Bundles', keywords: [] }, config.shopName);
  }
}

/** £6.99 rather than £7.00 — the whole marketplace prices this way. */
function charm(amount) {
  const rounded = Math.max(1, Math.round(amount * 2) / 2);
  return Number((rounded - 0.01).toFixed(2));
}

function bundleTitle(category, members) {
  const clean = String(category).replace(/s$/, '');
  const fallback = `The Complete ${titleCase(clean)} Bundle`;

  if (members.length === 2) {
    // Members may themselves be bundles, and "Bundle Bundle" reads like a bug.
    const names = members.map((m) => m.title.replace(/\s*bundle\s*$/i, '').trim());
    const joined = `${names[0]} + ${names[1]} Bundle`;
    // Etsy truncates long titles in search, so fall back to the short form.
    if (joined.length <= 80) return joined;
  }
  return fallback;
}

const twistKeyword = (label) =>
  String(label)
    .toLowerCase()
    .replace(/edition/, '')
    .trim()
    .slice(0, 20);

export default Curator;
