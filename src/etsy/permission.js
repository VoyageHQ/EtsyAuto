// The gate between a finished listing and somebody's real shop.
//
// This exists because it failed. An upload path that only asked "are the
// credentials set?" put 130-odd duplicate drafts into a live shop in one
// evening: every retry, every tick, every re-run of a script was free to
// create another listing, and nothing anywhere counted them.
//
// The rule now is a permission that is *spent*, not a flag that is *checked*.
// One owner decision — approving the listing, or pressing "send to etsy" —
// grants exactly one upload. The Shopkeeper consumes it before it calls Etsy,
// so a retry of the same job finds nothing left to spend and stops. There is
// no code path that uploads without one, and no way to grant one except an
// action the owner took.
//
// Underneath that sits a rate limit, which is the part that would have caught
// the original accident: a bug that grants permissions in a loop still hits a
// wall at a handful of drafts an hour rather than filling a shop.
import { one, all, update, count } from '../core/db.js';
import { now } from '../core/util.js';
import config from '../core/config.js';

const HOUR = 3600000;

/**
 * The owner has authorised one upload of this listing.
 *
 * @param {string} listingId
 * @param {'approval'|'send-to-etsy'|'cli'} by  what the owner did
 */
export function grantUpload(listingId, by = 'approval') {
  update('listings', listingId, { upload_ok_at: now(), upload_ok_by: by });
}

/** Take the permission back — used when a queued upload is cancelled. */
export function revokeUpload(listingId) {
  update('listings', listingId, { upload_ok_at: null, upload_ok_by: null });
}

/**
 * How many listings this shop has created on Etsy in the last hour.
 *
 * Counted from uploaded_at rather than from anything the caller passes in, so
 * a runaway cannot talk its way past it.
 */
export const uploadsInLastHour = () =>
  count('SELECT COUNT(*) FROM listings WHERE IFNULL(uploaded_at, 0) > ?', now() - HOUR);

/**
 * May this listing go to Etsy right now?
 *
 * Answers with a reason either way, because "no" here is the thing the owner
 * most needs explained — a silent no is what the pack-instead-of-upload bug
 * was, and a silent yes is what the duplicate-drafts bug was.
 *
 * @param {object} listing a row from the listings table
 * @returns {{allowed: boolean, why: string, code: string}}
 */
export function mayUpload(listing) {
  if (!listing) return { allowed: false, code: 'no-listing', why: 'There is no listing to upload.' };

  if (!listing.upload_ok_at) {
    return {
      allowed: false,
      code: 'not-approved',
      why:
        'You have not approved this one. Nothing goes to Etsy until you answer the Inspector ' +
        'in heads up, or press "send to etsy" in the Shopfront.',
    };
  }

  // Already up. Replacing a draft is a deliberate act with its own button,
  // which deletes the old one first; arriving here means something asked for a
  // plain upload of a listing that already exists, and doing it would make the
  // duplicate rather than prevent it.
  if (listing.etsy_listing_id) {
    return {
      allowed: false,
      code: 'already-listed',
      why:
        `This is already listing ${listing.etsy_listing_id} on Etsy. Use "send to etsy" in the ` +
        'Shopfront to replace it — that deletes the old draft first, so you never end up with two.',
    };
  }

  const recent = uploadsInLastHour();
  if (recent >= config.etsy.maxUploadsPerHour) {
    return {
      allowed: false,
      code: 'rate-limit',
      why:
        `${recent} listings have gone up in the last hour, which is the limit. Something is ` +
        'probably wrong rather than busy. Raise ETSY_MAX_UPLOADS_PER_HOUR in .env if this is ' +
        'genuinely what you wanted.',
    };
  }

  return { allowed: true, code: 'ok', why: '' };
}

/**
 * Spend the permission, and say whether it was there to spend.
 *
 * Deliberately does this *before* the call to Etsy rather than after. If the
 * upload fails halfway the permission is still gone, which means a failure
 * needs a fresh owner decision — annoying once, against a shop full of
 * half-made duplicates if it went the other way.
 *
 * @returns {{allowed: boolean, why: string, code: string}}
 */
export function claimUpload(listing) {
  const verdict = mayUpload(listing);
  if (!verdict.allowed) return verdict;
  update('listings', listing.id, { upload_ok_at: null, upload_ok_by: null });
  return verdict;
}

/** Record that a listing really did go up, for the rate limit to count. */
export function markUploaded(listingId) {
  update('listings', listingId, { uploaded_at: now() });
}

/** Everything the owner has approved and that has not gone up yet. */
export const awaitingUpload = () =>
  all(
    `SELECT l.*, p.sku, p.title AS product_title
       FROM listings l JOIN products p ON p.id = l.product_id
      WHERE l.upload_ok_at IS NOT NULL
      ORDER BY l.upload_ok_at ASC`
  );

/** Is there an answered "publish" approval behind this product? */
export const approvalFor = (productId) =>
  one(
    `SELECT * FROM approvals
      WHERE kind = 'listing' AND ref_id = ? AND status = 'answered' AND answer = 'publish'
      ORDER BY answered_at DESC LIMIT 1`,
    productId
  );

export default { grantUpload, revokeUpload, mayUpload, claimUpload, markUploaded, awaitingUpload };
