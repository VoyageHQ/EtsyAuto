// The dashboard server. Plain node:http — no framework, no build step.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import config from '../core/config.js';
import { bus, log } from '../core/events.js';
import { buildState, productDetail } from './state.js';
import { buildDigest, renderDigest, markSeen } from '../core/digest.js';
import { checkShop, renderHealth } from '../core/health.js';
import { sweep } from '../etsy/seo-audit.js';
import { answer as answerApproval } from '../core/approvals.js';
import { teach, forget, lessonsFor } from '../core/memory.js';
import { loadKnowledge } from '../knowledge/index.js';
import { getAgent } from '../agents/registry.js';
import { decideIdeas, requestIdeas, rebuild, relist, tick, start, stop, isRunning } from '../pipeline/orchestrator.js';
import { decideVenture, setCampaignStatus } from '../ventures/pipeline.js';
import { enqueue } from '../pipeline/queue.js';
import { all, insert, setSetting, getSetting, update, one } from '../core/db.js';
import { uid, now } from '../core/util.js';
import { assetsFor, getProduct } from '../pipeline/products.js';

const WEB_DIR = join(config.root, 'src', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const json = (res, body, status = 200) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw httpError(413, 'That is too big to send.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    // Saying so beats silently pretending an empty body arrived, which turns a
    // typo in one field into a confusing complaint about a different one.
    throw httpError(400, 'That request body was not valid JSON.');
  }
}

/** SSE: one connection per open dashboard, pushed on every event. */
const streams = new Set();

function openStream(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write(': hello\n\n');
  const client = { res, alive: true };
  streams.add(client);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    client.alive = false;
    streams.delete(client);
  });
}

function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of streams) {
    if (!client.alive) continue;
    try {
      client.res.write(payload);
    } catch {
      streams.delete(client);
    }
  }
}

bus.on('event', (e) =>
  broadcast('activity', {
    id: e.id,
    ts: e.ts,
    agent: e.agent_id ?? e.agent ?? null,
    station: e.station ?? null,
    kind: e.kind,
    level: e.level,
    message: e.message,
  })
);
bus.on('state', (e) => broadcast('state', e));

// --- routes ----------------------------------------------------------------

const routes = [
  ['GET', /^\/api\/state$/, async () => buildState()],

  ['GET', /^\/api\/products\/([\w-]+)$/, async (req, res, [, id]) => {
    const detail = productDetail(id);
    if (!detail) throw httpError(404, 'No such product.');
    return detail;
  }],

  ['POST', /^\/api\/products\/([\w-]+)\/rebuild$/, async (req, res, [, id]) => rebuild(id)],

  // Send a finished product to Etsy again — after deleting the draft there by
  // hand, or after a rebuild, or when the images could not be made first time.
  ['POST', /^\/api\/products\/([\w-]+)\/relist$/, async (req, res, [, id]) => relist(id)],

  // The browser rasterises the SVG mockups and posts the PNGs back, which is
  // how we get Etsy-ready images without any paid tooling.
  ['POST', /^\/api\/products\/([\w-]+)\/mockups$/, async (req, res, [, id]) => {
    const product = getProduct(id);
    if (!product) throw httpError(404, 'No such product.');
    const body = await readBody(req);
    const images = Array.isArray(body.images) ? body.images : [];
    const saved = [];
    for (const image of images.slice(0, 12)) {
      const name = String(image.name || 'image').replace(/[^\w.-]/g, '');
      const base64 = String(image.dataUrl || '').split(',')[1];
      if (!name || !base64) continue;
      const rel = join('out', product.dir, 'images', `${name}.png`);
      const abs = join(config.root, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, Buffer.from(base64, 'base64'));
      const existing = one('SELECT id FROM assets WHERE product_id = ? AND path = ?', id, rel);
      if (existing) {
        update('assets', existing.id, { bytes: Buffer.from(base64, 'base64').length });
      } else {
        insert('assets', {
          id: uid('as'),
          product_id: id,
          kind: 'png',
          role: 'mockup',
          label: name,
          path: rel,
          bytes: Buffer.from(base64, 'base64').length,
          created_at: now(),
        });
      }
      saved.push(rel);
    }
    log({
      agent: 'lister',
      station: 'shopfront',
      kind: 'images',
      level: 'good',
      message: `${saved.length} listing image(s) saved as PNG for ${product.sku}.`,
      discord: false,
    });
    return { saved };
  }],

  ['POST', /^\/api\/ideas\/decide$/, async (req) => {
    const body = await readBody(req);
    const ids = Array.isArray(body.ids) ? body.ids : [body.id].filter(Boolean);
    if (!ids.length) throw httpError(400, 'No ideas given.');
    return { decided: decideIdeas(ids, body.decision, body.note || '', 'dashboard').length };
  }],

  ['POST', /^\/api\/ideas\/request$/, async (req) => {
    const body = await readBody(req);
    return { jobId: requestIdeas(Number(body.count) || 8, body.theme || null) };
  }],

  ['POST', /^\/api\/approvals\/([\w-]+)\/answer$/, async (req, res, [, id]) => {
    const body = await readBody(req);
    return answerApproval(id, body.value, 'dashboard');
  }],

  ['POST', /^\/api\/teach$/, async (req) => {
    const body = await readBody(req);
    return { id: teach(body.agent || null, body.text, 'dashboard') };
  }],

  ['POST', /^\/api\/lessons\/([\w-]+)\/forget$/, async (req, res, [, id]) => ({ forgotten: forget(id) })],

  // --- the venture arm -----------------------------------------------------

  ['POST', /^\/api\/ventures\/([\w-]+)\/decide$/, async (req, res, [, id]) => {
    const body = await readBody(req);
    return decideVenture(id, body.decision, body.note || '', 'dashboard');
  }],

  ['POST', /^\/api\/ventures\/harvest$/, async (req) => {
    const body = await readBody(req);
    return {
      jobId: enqueue({
        agent: 'prospector',
        kind: 'prospector.harvest',
        subject: 'requested by you',
        payload: { count: Number(body.count) || 5, perPhrase: Number(body.perPhrase) || 5 },
        priority: 2,
        unique: false,
      }),
    };
  }],

  ['POST', /^\/api\/campaigns\/([\w-]+)\/status$/, async (req, res, [, id]) => {
    const body = await readBody(req);
    const allowed = ['draft', 'approved', 'running', 'paused', 'done'];
    if (!allowed.includes(body.status)) throw httpError(400, 'Unknown status.');
    setCampaignStatus(id, body.status);
    return { status: body.status };
  }],

  ['POST', /^\/api\/ventures\/([\w-]+)\/revenue$/, async (req, res, [, id]) => {
    const body = await readBody(req);
    const amount = Number(body.amount);
    if (!(amount > 0)) throw httpError(400, 'Amount must be a number.');
    insert('venture_revenue', {
      id: uid('vrev'),
      venture_id: id,
      amount,
      currency: config.currency,
      kind: body.kind || 'one-off',
      note: body.note || null,
      occurred_at: now(),
    });
    log({ kind: 'revenue', level: 'good', message: `Venture revenue recorded: ${amount}` });
    return { ok: true };
  }],

  ['GET', /^\/api\/knowledge\/([\w-]+)$/, async (req, res, [, agentId]) => {
    const agent = getAgent(agentId);
    // "everyone" means the house rules of both businesses, which are scoped by
    // division and so would not come back from a normal agent lookup.
    const lessons =
      agentId === 'everyone'
        ? all("SELECT * FROM lessons WHERE active = 1 AND agent_id IS NULL ORDER BY division, created_at")
        : lessonsFor(agentId, agent?.division ?? null);
    return {
      agent: agentId,
      name: agent?.name || agentId,
      lessons: lessons.map((l) => ({
        id: l.id,
        text: l.text,
        source: l.source,
        division: l.division || null,
        fromPack: String(l.source || '').startsWith('pack:'),
      })),
    };
  }],

  ['POST', /^\/api\/knowledge\/restore$/, async () => loadKnowledge({ restoreDeleted: true })],

  // Run the Signwriter's sweep now rather than waiting for the next one.
  ['POST', /^\/api\/seo$/, async () => {
    const report = sweep();
    setSetting('seo_report', JSON.stringify({ ...report, at: Date.now() }));
    return report;
  }],

  ['GET', /^\/api\/health$/, async () => {
    const report = checkShop();
    return { ...report, text: renderHealth(report) };
  }],

  ['GET', /^\/api\/digest$/, async () => {
    const digest = buildDigest();
    return { ...digest, text: renderDigest(digest) };
  }],

  // Marking it read is a deliberate act. Polling must never clear it, or a
  // dashboard left open on a second screen quietly eats the night's news.
  ['POST', /^\/api\/digest\/seen$/, async () => ({ seenAt: markSeen() })],

  ['POST', /^\/api\/tick$/, async () => ({ worked: await tick() })],

  ['POST', /^\/api\/loop$/, async (req) => {
    const body = await readBody(req);
    if (body.on === false) stop();
    else start();
    return { running: isRunning() };
  }],

  ['POST', /^\/api\/sales$/, async (req) => {
    const body = await readBody(req);
    const amount = Number(body.amount);
    if (!(amount > 0)) throw httpError(400, 'Amount must be a number.');
    const id = uid('sale');
    insert('sales', {
      id,
      listing_id: body.listingId || null,
      sku: body.sku || null,
      amount,
      currency: config.currency,
      occurred_at: now(),
      source: body.source || 'manual',
    });
    log({ kind: 'ledger', level: 'good', message: `Sale recorded: ${body.sku || ''} ${amount}` });
    return { id };
  }],

  ['POST', /^\/api\/listings\/([\w-]+)\/url$/, async (req, res, [, id]) => {
    const body = await readBody(req);
    const match = String(body.url || '').match(/listing\/(\d+)/);
    if (!match) throw httpError(400, 'That does not look like an Etsy listing URL.');
    update('listings', id, { etsy_listing_id: match[1], status: 'live', updated_at: now() });
    return { etsyListingId: match[1] };
  }],

  ['GET', /^\/api\/assets\/([\w-]+)$/, async (req, res, [, id]) => ({
    assets: assetsFor(id),
  })],
];

/**
 * A plain index of one product folder.
 *
 * The dashboard's "open the folder" button used to 404: the static handler
 * serves files and there was nothing behind a directory. That left the files
 * the whole shop exists to produce reachable only by digging through the
 * project in a file manager.
 *
 * Deliberately plain HTML with no styling to speak of — this is a place to
 * grab a file from, not a page to admire.
 */
function folderPage(abs, rel) {
  const entries = readdirSync(abs, { withFileTypes: true })
    .map((entry) => {
      const child = join(abs, entry.name);
      const stat = statSync(child);
      return {
        name: entry.name,
        dir: entry.isDirectory(),
        size: stat.size,
      };
    })
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));

  const kb = (bytes) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);
  const esc = (value) =>
    String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // What each thing is for, since the filenames alone do not say.
  const WHAT = {
    '.pdf': 'the product — this is what the buyer prints',
    '.csv': 'editable spreadsheet companion',
    '.png': 'listing image, ready for Etsy',
    '.svg': 'listing image source',
    '.txt': 'what the buyer opens first',
    '.md': 'for you, not the buyer',
  };
  const describe = (name) => {
    if (/^LISTING\.md$/i.test(name)) return 'title, tags and description to paste into Etsy';
    if (/^READ-ME-FIRST/i.test(name)) return 'goes to the buyer with the files';
    if (/^design-brief/i.test(name)) return 'rebuild it by hand in Canva if you like';
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    return WHAT[ext] || '';
  };

  const parent = rel.split('/').slice(0, -1).join('/');
  const rows = entries
    .map((entry) => {
      const href = `/${rel.replace(/\/$/, '')}/${encodeURIComponent(entry.name)}`;
      return `<tr>
        <td><a href="${esc(href)}"${entry.dir ? '' : ' download'}>${esc(entry.name)}${entry.dir ? '/' : ''}</a></td>
        <td class="s">${entry.dir ? '' : kb(entry.size)}</td>
        <td class="w">${esc(entry.dir ? 'folder' : describe(entry.name))}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html><meta charset="utf-8"><title>${esc(rel)}</title>
<style>
  body{font:14px/1.6 ui-monospace,Menlo,monospace;background:#0e1620;color:#e7e0cd;margin:0;padding:24px}
  h1{font-size:15px;margin:0 0 4px;color:#e3b878}
  p{margin:0 0 18px;color:#8ea0ad;font-size:12px}
  table{border-collapse:collapse;width:100%;max-width:900px}
  td{padding:6px 10px;border-bottom:1px solid #2c3f52;vertical-align:top}
  a{color:#8fb8d8}
  .s{color:#62737f;white-space:nowrap;text-align:right}
  .w{color:#8ea0ad;font-size:12px}
  .back{display:inline-block;margin-bottom:14px;color:#8ea0ad}
</style>
<h1>${esc(rel)}</h1>
<p>Everything this product produced. Click any file to download it.
${parent && parent !== 'out' ? `<a class="back" href="/${esc(parent)}/">↑ up a level</a>` : ''}</p>
<table>${rows || '<tr><td>empty</td></tr>'}</table>`;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function serveFile(res, absPath) {
  try {
    const data = await readFile(absPath);
    res.writeHead(200, {
      'content-type': MIME[extname(absPath).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

export function createDashboardServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = decodeURIComponent(url.pathname);

    try {
      if (path === '/api/events') return openStream(req, res);

      for (const [method, pattern, handler] of routes) {
        if (req.method !== method) continue;
        const match = path.match(pattern);
        if (!match) continue;
        const body = await handler(req, res, match, url);
        if (!res.headersSent) json(res, body ?? { ok: true });
        return;
      }

      // Generated product files: out/... only, never anywhere else on disk.
      // The venture arm's generated projects, so you can read what was built.
      if (path.startsWith(`/${config.ventures.dir}/`)) {
        const rel = normalize(path.slice(1));
        const base = join(config.root, config.ventures.dir);
        const abs = join(config.root, rel);
        if (!abs.startsWith(base)) throw httpError(403, 'Nope.');
        if (await serveFile(res, abs)) return;
        throw httpError(404, 'No such file.');
      }

      if (path.startsWith('/out/')) {
        const rel = normalize(path.slice(1));
        if (!rel.startsWith('out/')) throw httpError(403, 'Nope.');
        const abs = join(config.root, rel);
        if (!abs.startsWith(config.outDir)) throw httpError(403, 'Nope.');
        if (await serveFile(res, abs)) return;
        // A folder, not a file. "Open the folder" pointed here and got a 404,
        // which left people with no way to reach their own products from the
        // dashboard at all.
        if (existsSync(abs) && statSync(abs).isDirectory()) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          res.end(folderPage(abs, rel));
          return;
        }
        throw httpError(404, 'No such file.');
      }

      // Static dashboard.
      const rel = path === '/' ? 'index.html' : normalize(path.slice(1));
      if (rel.includes('..')) throw httpError(403, 'Nope.');
      const abs = join(WEB_DIR, rel);
      if (abs.startsWith(WEB_DIR) && existsSync(abs) && (await serveFile(res, abs))) return;
      if (await serveFile(res, join(WEB_DIR, 'index.html'))) return;

      throw httpError(404, 'Not found.');
    } catch (err) {
      // A BadInput carries its own 400. Anything without a status really is the
      // valley's fault, and only those belong in the activity feed — otherwise
      // every mistyped price shows up looking like something broke.
      const status = err.status || 500;
      if (status >= 500) {
        log({ kind: 'server', level: 'error', message: `${req.method} ${path}: ${err.message}`, discord: false });
      }
      if (!res.headersSent) json(res, { error: err.message }, status);
      else res.end();
    }
  });

  return server;
}

export function startDashboard() {
  const server = createDashboardServer();
  server.listen(config.port, config.host, () => {
    setSetting('dashboard_url', `http://${config.host}:${config.port}`);
    log({
      kind: 'valley',
      level: 'good',
      message: `Dashboard at http://${config.host}:${config.port}`,
      discord: false,
    });
  });
  return server;
}

export default startDashboard;
