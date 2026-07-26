// Knowledge packs — the agents' schooling, kept in the repo rather than in the
// database.
//
// Anything you teach by hand lives in `data/valley.db`, which never leaves your
// machine. That is right for your own corrections, but it means a lesson taught
// on one computer is lost on the next. Packs solve that: they are ordinary
// files, versioned in git, loaded into the lessons table on every start.
//
// They behave exactly like a lesson you typed yourself:
//   - they appear in the Office next to yours, marked with the pack they came from
//   - you can delete any of them, and they stay deleted
//   - they are injected into that agent's prompt for every job
//
// Some packs also carry `rules`: machine-readable data the offline code paths
// use directly, so the knowledge still applies when no model is configured.
import { all, insert, one, run } from '../core/db.js';
import { uid, now } from '../core/util.js';
import { log } from '../core/events.js';

import shopHouse from './packs/shop-house.js';
import scoutPack from './packs/scout.js';
import researcherPack from './packs/researcher.js';
import makerPack from './packs/maker.js';
import copywriterPack from './packs/copywriter.js';
import qaPack from './packs/qa.js';
import listerPack from './packs/lister.js';
import curatorPack from './packs/curator.js';
import managerPack from './packs/manager.js';
import seasonalPack from './packs/seasonal.js';
import searchPack from './packs/etsy-search.js';
import aftercarePack from './packs/aftercare.js';
import licensingPack from './packs/licensing.js';
import listingImagesPack from './packs/listing-images.js';
import etsyPolicyPack from './packs/etsy-policy.js';
import shopBrandPack from './packs/shop-brand.js';
import supportPack from './packs/support.js';

import ventureHouse from './packs/venture-house.js';
import prospectorPack from './packs/prospector.js';
import analystPack from './packs/analyst.js';
import architectPack from './packs/architect.js';
import builderPack from './packs/builder.js';
import marketerPack from './packs/marketer.js';
import harbourmasterPack from './packs/harbourmaster.js';
import distributionPack from './packs/distribution.js';
import productSensePack from './packs/product-sense.js';
import ventureLegalPack from './packs/venture-legal.js';
import firstCustomersPack from './packs/first-customers.js';

/** Every pack that ships with the project. */
export const PACKS = [
  shopHouse,
  scoutPack,
  researcherPack,
  makerPack,
  copywriterPack,
  qaPack,
  listerPack,
  curatorPack,
  managerPack,
  seasonalPack,
  searchPack,
  aftercarePack,
  licensingPack,
  listingImagesPack,
  etsyPolicyPack,
  shopBrandPack,
  supportPack,
  ventureHouse,
  prospectorPack,
  analystPack,
  architectPack,
  builderPack,
  marketerPack,
  harbourmasterPack,
  distributionPack,
  productSensePack,
  ventureLegalPack,
  firstCustomersPack,
];

/**
 * Load every pack into the lessons table.
 *
 * Idempotent, and deliberately conservative: a lesson you have deleted is
 * never silently reinstated, because overriding your decision would make the
 * delete button a lie.
 *
 * @param {object} [options]
 * @param {boolean} [options.restoreDeleted] bring back lessons you removed
 * @returns {{added: number, packs: number, skipped: number}}
 */
export function loadKnowledge({ restoreDeleted = false } = {}) {
  let added = 0;
  let skipped = 0;

  for (const pack of PACKS) {
    const source = `pack:${pack.id}`;
    for (const lesson of pack.lessons) {
      const text = String(lesson).trim();
      if (!text) continue;

      const existing = one(
        'SELECT id, active FROM lessons WHERE IFNULL(agent_id, ?) = ? AND text = ?',
        '__all__',
        pack.agent ?? '__all__',
        text
      );

      if (existing) {
        // Present already. Only revive it if explicitly asked.
        if (!existing.active && restoreDeleted) {
          run('UPDATE lessons SET active = 1 WHERE id = ?', existing.id);
          added++;
        } else if (!existing.active) {
          skipped++;
        }
        continue;
      }

      insert('lessons', {
        id: uid('les'),
        agent_id: pack.agent ?? null,
        // House packs apply to one side of the business only.
        division: pack.agent ? null : pack.division === 'both' ? null : pack.division ?? null,
        text,
        source,
        active: 1,
        created_at: now(),
      });
      added++;
    }
  }

  if (added || skipped) {
    log({
      kind: 'schooled',
      level: added ? 'good' : 'info',
      message:
        `Knowledge packs loaded: ${added} new lesson(s) across ${PACKS.length} packs` +
        (skipped ? `, ${skipped} left out because you deleted them.` : '.'),
      discord: false,
    });
  }

  return { added, packs: PACKS.length, skipped };
}

/** Structured knowledge the offline code paths can act on directly. */
export function rulesFor(agentId) {
  const merged = {};
  for (const pack of PACKS) {
    if (!pack.rules) continue;
    if (pack.agent && pack.agent !== agentId) continue;
    for (const [key, value] of Object.entries(pack.rules)) {
      if (Array.isArray(value)) merged[key] = [...(merged[key] || []), ...value];
      else if (value && typeof value === 'object') merged[key] = { ...(merged[key] || {}), ...value };
      else merged[key] = value;
    }
  }
  return merged;
}

/**
 * Every rule from every pack, whoever owns it. The checks in apply.js need the
 * lot — a trademark list belongs to the shop's house pack but the Inspector,
 * the Scout and the Lister all have to enforce it.
 */
export function allRules() {
  const merged = {};
  for (const pack of PACKS) {
    if (!pack.rules) continue;
    for (const [key, value] of Object.entries(pack.rules)) {
      if (Array.isArray(value)) merged[key] = [...(merged[key] || []), ...value];
      else if (value && typeof value === 'object') merged[key] = { ...(merged[key] || {}), ...value };
      else merged[key] = value;
    }
  }
  return merged;
}

/** What a pack contains, for the dashboard and the CLI. */
export function packSummary() {
  const counts = new Map();
  for (const row of all("SELECT source, active FROM lessons WHERE source LIKE 'pack:%'")) {
    const key = row.source.replace('pack:', '');
    const entry = counts.get(key) || { active: 0, removed: 0 };
    if (row.active) entry.active++;
    else entry.removed++;
    counts.set(key, entry);
  }

  return PACKS.map((pack) => ({
    id: pack.id,
    title: pack.title,
    agent: pack.agent || 'everyone',
    division: pack.division || 'both',
    lessons: pack.lessons.length,
    active: counts.get(pack.id)?.active ?? 0,
    removed: counts.get(pack.id)?.removed ?? 0,
    hasRules: Boolean(pack.rules),
    summary: pack.summary,
  }));
}

export default loadKnowledge;
