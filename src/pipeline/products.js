// A product's journey through the valley.
//
//   idea approved -> research -> design -> copy -> review -> ready
//   -> (you approve the listing) -> listed
//
import { all, insert, one, update, json, nextSku, count } from '../core/db.js';
import { uid, now, slug } from '../core/util.js';
import { log, pushState } from '../core/events.js';
import { enqueue } from './queue.js';

export const STAGES = ['research', 'design', 'copy', 'review', 'ready', 'listed'];

const STAGE_OWNER = {
  research: { agent: 'researcher', kind: 'researcher.validate' },
  design: { agent: 'maker', kind: 'maker.build' },
  copy: { agent: 'copywriter', kind: 'copywriter.listing' },
  review: { agent: 'qa', kind: 'qa.review' },
};

export function createProductFromIdea(idea) {
  const existing = one('SELECT * FROM products WHERE idea_id = ?', idea.id);
  if (existing) return hydrate(existing);

  const id = uid('prod');
  const sku = nextSku('HV');
  insert('products', {
    id,
    sku,
    idea_id: idea.id,
    title: idea.title,
    category: idea.category,
    stage: 'research',
    status: 'active',
    spec: null,
    research: null,
    price: null,
    dir: `${sku}-${slug(idea.title, 48)}`,
    // Carried through so the Maker knows to build this one differently rather
    // than produce the same pages under a new SKU.
    variant_of: idea.similar_to ?? idea.similarTo ?? null,
    created_at: now(),
    updated_at: now(),
  });
  update('ideas', idea.id, { status: 'built' });
  log({
    agent: 'manager',
    station: 'office',
    kind: 'started',
    level: 'good',
    message: `${sku} "${idea.title}" is into production.`,
    meta: { productId: id, sku },
  });
  const product = getProduct(id);
  scheduleStage(product);
  pushState('product');
  return product;
}

/**
 * A product that was not designed from a single idea — a bundle assembled from
 * things the shop already sells. It skips research, because everything in it
 * has already been researched.
 * @param {object} args { title, category, spec, price, ideaId, stage }
 */
export function createProduct({ title, category, spec, price, ideaId = null, stage = 'design' }) {
  const id = uid('prod');
  const sku = nextSku('HV');
  insert('products', {
    id,
    sku,
    idea_id: ideaId,
    title,
    category,
    stage,
    status: 'active',
    spec: spec ?? null,
    research: null,
    price: price ?? null,
    dir: `${sku}-${slug(title, 48)}`,
    created_at: now(),
    updated_at: now(),
  });
  pushState('product');
  return getProduct(id);
}

/** Queue whoever owns the product's current stage. */
export function scheduleStage(product) {
  const owner = STAGE_OWNER[product.stage];
  if (!owner) return null;
  return enqueue({
    agent: owner.agent,
    kind: owner.kind,
    subject: `${product.sku} ${product.title}`,
    payload: { productId: product.id },
    priority: 4,
  });
}

export function advance(product, patch = {}) {
  const index = STAGES.indexOf(product.stage);
  const next = STAGES[Math.min(index + 1, STAGES.length - 1)];
  update('products', product.id, { ...patch, stage: next, updated_at: now() });
  const updated = getProduct(product.id);
  if (next !== 'ready' && next !== 'listed') scheduleStage(updated);
  pushState('product');
  return updated;
}

export function setStage(productId, stage, patch = {}) {
  update('products', productId, { ...patch, stage, updated_at: now() });
  pushState('product');
  return getProduct(productId);
}

export function blockProduct(productId, why) {
  update('products', productId, { status: 'blocked', updated_at: now() });
  log({
    agent: 'manager',
    kind: 'blocked',
    level: 'warn',
    message: `${productId} is stuck: ${why}`,
  });
  pushState('product');
}

export function getProduct(id) {
  const row = one('SELECT * FROM products WHERE id = ?', id);
  return row ? hydrate(row) : null;
}

export function getProductBySku(sku) {
  const row = one('SELECT * FROM products WHERE sku = ?', sku);
  return row ? hydrate(row) : null;
}

export function listProducts(where = '') {
  return all(`SELECT * FROM products ${where} ORDER BY created_at DESC`).map(hydrate);
}

export const activeProductCount = () =>
  count("SELECT COUNT(*) FROM products WHERE status = 'active' AND stage NOT IN ('listed')");

export function getIdea(id) {
  const row = one('SELECT * FROM ideas WHERE id = ?', id);
  return row ? { ...row, keywords: json(row.keywords, []) } : null;
}

export function ideaFor(product) {
  return product.idea_id ? getIdea(product.idea_id) : null;
}

function hydrate(row) {
  return { ...row, spec: json(row.spec), research: json(row.research) };
}

export function getListing(productId) {
  const row = one('SELECT * FROM listings WHERE product_id = ? ORDER BY created_at DESC LIMIT 1', productId);
  if (!row) return null;
  return { ...row, tags: json(row.tags, []), materials: json(row.materials, []) };
}

export function saveListing(productId, listing) {
  const existing = getListing(productId);
  if (existing) {
    update('listings', existing.id, {
      title: listing.title,
      description: listing.description,
      tags: listing.tags,
      materials: listing.materials,
      price: listing.price,
      status: listing.status || existing.status,
      updated_at: now(),
    });
    return getListing(productId);
  }
  const id = uid('list');
  insert('listings', {
    id,
    product_id: productId,
    title: listing.title,
    description: listing.description,
    tags: listing.tags,
    materials: listing.materials,
    price: listing.price,
    status: listing.status || 'draft',
    created_at: now(),
    updated_at: now(),
  });
  return getListing(productId);
}

export function assetsFor(productId, role = null) {
  return role
    ? all('SELECT * FROM assets WHERE product_id = ? AND role = ? ORDER BY label', productId, role)
    : all('SELECT * FROM assets WHERE product_id = ? ORDER BY role, label', productId);
}

export default {
  createProductFromIdea,
  advance,
  setStage,
  getProduct,
  getProductBySku,
  listProducts,
  ideaFor,
  getListing,
  saveListing,
  assetsFor,
};
