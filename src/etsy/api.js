// Optional Etsy Open API v3 bridge.
//
// You do not need this. Without credentials the Lister writes an upload pack
// and you paste it in yourself, which takes about two minutes. Fill in the
// ETSY_* variables only if you have an approved app, and note that the safety
// rail keeps every listing in DRAFT unless you deliberately change
// ETSY_PUBLISH_MODE.
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import config from '../core/config.js';
import { log } from '../core/events.js';
import { getSetting, setSetting } from '../core/db.js';

const BASE = 'https://api.etsy.com/v3';

export const etsyEnabled = () => config.etsy.enabled;

/**
 * Which .env lines are stopping the Shopkeeper from uploading.
 *
 * etsyEnabled() answers yes or no, which is the wrong shape for somebody
 * staring at a listing that packed itself into a folder instead of going up.
 * Three variables have to be present and any one of them missing produces the
 * identical silent fallback, so name the one that is actually empty.
 *
 * @returns {string[]} empty when the connection is complete
 */
export function connectionGaps() {
  const gaps = [];
  if (!config.etsy.keystring) gaps.push('ETSY_KEYSTRING');
  if (!config.etsy.accessToken) gaps.push('ETSY_ACCESS_TOKEN');
  if (!config.etsy.shopId) gaps.push('ETSY_SHOP_ID');
  return gaps;
}

/**
 * The same thing as one sentence you could put in a toast.
 *
 * There is a real difference between "no Etsy account is wired up, so packing
 * the files is the whole job" and "three quarters of a connection, so packing
 * the files is a fault". Say which.
 *
 * @returns {string} empty string when connected
 */
export function whyNotConnected() {
  const gaps = connectionGaps();
  if (!gaps.length) return '';
  if (gaps.length === 3) {
    return 'No Etsy account is connected, so listings are packed for you to paste in by hand. ' +
      'Run npm run etsy:auth to have them uploaded instead.';
  }
  const plural = gaps.length > 1;
  return `Etsy is only half connected — ${gaps.join(' and ')} ${plural ? 'are' : 'is'} empty in .env. ` +
    `Run npm run etsy:check to fill ${plural ? 'them' : 'it'} in.`;
}

async function accessToken() {
  const cached = getSetting('etsy_access_token', config.etsy.accessToken);
  const expires = Number(getSetting('etsy_token_expires', '0'));
  if (cached && (!expires || Date.now() < expires - 60000)) return cached;

  const refresh = getSetting('etsy_refresh_token', config.etsy.refreshToken);
  if (!refresh) return cached;

  const res = await fetch(`${BASE}/public/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.etsy.keystring,
      refresh_token: refresh,
    }),
  });
  if (!res.ok) {
    log({ kind: 'etsy', level: 'error', message: `Token refresh failed: ${res.status}` });
    return cached;
  }
  const data = await res.json();
  setSetting('etsy_access_token', data.access_token);
  setSetting('etsy_refresh_token', data.refresh_token || refresh);
  setSetting('etsy_token_expires', String(Date.now() + (data.expires_in || 3600) * 1000));
  return data.access_token;
}

/**
 * What goes in the x-api-key header.
 *
 * Etsy wants different things depending on where your app is in its lifecycle.
 * An app still in developer mode is refused the keystring on its own —
 * "Shared secret is required in x-api-key header" — and wants
 * `keystring:shared_secret`. An approved commercial app takes the keystring
 * alone. Neither state is discoverable in advance, so the first refusal
 * decides it and the answer is remembered.
 */
const combinedKey = () =>
  config.etsy.sharedSecret
    ? `${config.etsy.keystring}:${config.etsy.sharedSecret}`
    : config.etsy.keystring;

const apiKey = () =>
  getSetting('etsy_api_key_form') === 'combined' ? combinedKey() : config.etsy.keystring;

/** Is this the specific refusal that means "send the shared secret too"? */
const wantsSharedSecret = (status, text) =>
  status === 403 && /shared secret is required/i.test(String(text));

async function call(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const token = await accessToken();

  const attempt = (key) =>
    fetch(`${BASE}${path}`, {
      method,
      headers: {
        'x-api-key': key,
        authorization: `Bearer ${token}`,
        ...(raw ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });

  let res = await attempt(apiKey());
  let text = await res.text();

  // Switch form and try once more, so a developer-mode app works without the
  // owner having to know any of this.
  if (wantsSharedSecret(res.status, text) && config.etsy.sharedSecret) {
    setSetting('etsy_api_key_form', 'combined');
    log({
      kind: 'etsy',
      message: 'Etsy wants the shared secret alongside the keystring — switching to that form.',
      discord: false,
    });
    res = await attempt(combinedKey());
    text = await res.text();
  }

  if (!res.ok) {
    let hint = '';
    if (wantsSharedSecret(res.status, text)) {
      hint =
        ' — your app is in developer mode, which needs ETSY_SHARED_SECRET in .env as well as' +
        ' ETSY_KEYSTRING. Run npm run etsy:check.';
    } else if (res.status === 401) {
      // The commonest failure by a mile, and the one whose reply text says
      // least. Tokens last an hour; the refresh above is silent when it works
      // and only logs when it does not, so by the time anyone reads this the
      // refresh token has usually expired too.
      hint = ' — your Etsy sign-in has expired. Run npm run etsy:auth to sign in again.';
    }
    const err = new Error(`Etsy ${method} ${path} → ${res.status}: ${text.slice(0, 300)}${hint}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

/** What a deliverable actually is, so Etsy labels the download correctly. */
const FILE_TYPES = {
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.zip': 'application/zip',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const fileType = (path) => FILE_TYPES[extname(path).toLowerCase()] || 'application/octet-stream';

/** Find a taxonomy id by name, because Etsy insists on one. */
export async function resolveTaxonomy(hint = 'Digital Prints') {
  const cacheKey = `etsy_taxonomy_${hint.toLowerCase().replace(/\s+/g, '_')}`;
  const cached = getSetting(cacheKey);
  if (cached) return Number(cached);
  if (process.env.ETSY_TAXONOMY_ID) return Number(process.env.ETSY_TAXONOMY_ID);

  const data = await call('/application/seller-taxonomy/nodes');
  const wanted = hint.toLowerCase();
  const flat = [];
  const walk = (nodes) => {
    for (const node of nodes || []) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(data.results);
  const match =
    flat.find((n) => n.name?.toLowerCase() === wanted) ||
    flat.find((n) => n.name?.toLowerCase().includes(wanted)) ||
    flat.find((n) => n.name?.toLowerCase().includes('digital'));
  if (!match) throw new Error(`No Etsy taxonomy matched "${hint}"`);
  setSetting(cacheKey, String(match.id));
  return match.id;
}

function multipart(fields) {
  const boundary = `----EtsyAuto${randomBytes(8).toString('hex')}`;
  const chunks = [];
  for (const field of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (field.filename) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n` +
            `Content-Type: ${field.contentType || 'application/octet-stream'}\r\n\r\n`
        )
      );
      chunks.push(field.data);
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"\r\n\r\n`));
      chunks.push(Buffer.from(String(field.value)));
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * Create a draft digital listing and attach its files and images.
 * @param {object} args { listing, product, deliverables: string[], images: string[] }
 * @returns {Promise<{listingId: string, url: string, state: string}>}
 */
export async function createDraftListing({ listing, product, deliverables = [], images = [] }) {
  if (!etsyEnabled()) throw new Error('Etsy credentials are not configured.');
  const taxonomyId = await resolveTaxonomy(product.taxonomyHint || 'Digital Prints');

  const created = await call(`/application/shops/${config.etsy.shopId}/listings`, {
    method: 'POST',
    body: {
      quantity: 999,
      title: listing.title,
      description: listing.description,
      price: Number(listing.price),
      who_made: 'i_did',
      when_made: 'made_to_order',
      taxonomy_id: taxonomyId,
      listing_type: 'download',
      type: 'download',
      state: 'draft',
      is_supply: false,
      tags: listing.tags,
      materials: listing.materials,
      should_auto_renew: true,
    },
  });

  const listingId = created.listing_id;
  log({
    kind: 'etsy',
    level: 'good',
    message: `Draft listing ${listingId} created for ${product.sku}.`,
    meta: { listingId },
  });

  // A listing with no pictures cannot be published, and one with no files is
  // not a product. Both loops used to swallow their failures into the log,
  // which is how a draft with nothing attached could still be announced as
  // finished. Count what actually landed and hand the total back.
  const problems = [];
  let imagesUploaded = 0;
  let filesUploaded = 0;

  for (const path of images.slice(0, 10)) {
    try {
      const { body, contentType } = multipart([
        { name: 'image', filename: basename(path), contentType: 'image/png', data: readFileSync(path) },
      ]);
      await call(`/application/shops/${config.etsy.shopId}/listings/${listingId}/images`, {
        method: 'POST',
        raw: true,
        body,
        headers: { 'content-type': contentType },
      });
      imagesUploaded += 1;
    } catch (err) {
      problems.push(`image ${basename(path)}: ${err.message}`);
      log({ kind: 'etsy', level: 'warn', message: `Image upload failed (${basename(path)}): ${err.message}` });
    }
  }

  // Etsy takes five files per listing, up to 20MB each.
  for (const path of deliverables.slice(0, 5)) {
    try {
      const { body, contentType } = multipart([
        {
          name: 'file',
          filename: basename(path),
          // Was hardcoded to application/pdf, which mislabelled every
          // spreadsheet the Maker ships alongside the printable.
          contentType: fileType(path),
          data: readFileSync(path),
        },
        { name: 'name', value: basename(path) },
      ]);
      await call(`/application/shops/${config.etsy.shopId}/listings/${listingId}/files`, {
        method: 'POST',
        raw: true,
        body,
        headers: { 'content-type': contentType },
      });
      filesUploaded += 1;
    } catch (err) {
      problems.push(`file ${basename(path)}: ${err.message}`);
      log({ kind: 'etsy', level: 'warn', message: `File upload failed (${basename(path)}): ${err.message}` });
    }
  }

  // The rail: only ever go live if the owner has explicitly asked for it.
  let state = 'draft';
  if (config.etsy.publishMode === 'active') {
    await call(`/application/shops/${config.etsy.shopId}/listings/${listingId}`, {
      method: 'PATCH',
      body: { state: 'active' },
    });
    state = 'active';
  }

  return {
    listingId: String(listingId),
    url: `https://www.etsy.com/listing/${listingId}`,
    state,
    imagesUploaded,
    imagesOffered: Math.min(images.length, 10),
    filesUploaded,
    filesOffered: Math.min(deliverables.length, 5),
    problems,
  };
}

/**
 * What Etsy currently thinks of a listing.
 *
 * Asked before anything destructive happens, because the local database records
 * what this shop did, not what has happened in the shop since. Somebody may
 * have published a draft by hand.
 */
export async function listingState(listingId) {
  if (!etsyEnabled()) throw new Error('Etsy credentials are not configured.');
  const data = await call(`/application/listings/${listingId}`);
  return {
    state: data.state,
    title: data.title,
    images: Number(data.listing_images_count ?? 0),
    url: data.url || `https://www.etsy.com/listing/${listingId}`,
  };
}

/**
 * Delete a listing — but only ever a draft.
 *
 * The check lives here rather than in the caller so there is exactly one place
 * it can be got wrong. An active listing carries views, favourites and possibly
 * sales; deleting one to fix a picture would be a catastrophe dressed as a
 * tidy-up, and Etsy does not undo it.
 */
export async function deleteDraftListing(listingId) {
  if (!etsyEnabled()) throw new Error('Etsy credentials are not configured.');
  const current = await listingState(listingId);
  if (current.state !== 'draft') {
    throw new Error(
      `listing ${listingId} is "${current.state}", not a draft — refusing to delete it, ` +
        'because a live listing carries views and favourites that do not come back'
    );
  }
  await call(`/application/listings/${listingId}`, { method: 'DELETE' });
  log({ kind: 'etsy', level: 'warn', message: `Deleted draft listing ${listingId}.` });
  return current;
}

/** Recent shop receipts, so the Ledger has something real to show. */
export async function fetchReceipts(limit = 25) {
  if (!etsyEnabled()) return [];
  const data = await call(
    `/application/shops/${config.etsy.shopId}/receipts?limit=${limit}&was_paid=true`
  );
  return (data.results || []).map((r) => ({
    id: String(r.receipt_id),
    amount: Number(r.grandtotal?.amount || 0) / Number(r.grandtotal?.divisor || 100),
    currency: r.grandtotal?.currency_code || config.currency,
    occurredAt: Number(r.create_timestamp || 0) * 1000,
  }));
}

export default {
  createDraftListing,
  deleteDraftListing,
  listingState,
  fetchReceipts,
  etsyEnabled,
  connectionGaps,
  whyNotConnected,
  resolveTaxonomy,
};
