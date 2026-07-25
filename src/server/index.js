// The dashboard server. Plain node:http — no framework, no build step.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import config from '../core/config.js';
import { bus, log } from '../core/events.js';
import { buildState, productDetail } from './state.js';
import { answer as answerApproval } from '../core/approvals.js';
import { teach, forget } from '../core/memory.js';
import { decideIdeas, requestIdeas, rebuild, tick, start, stop, isRunning } from '../pipeline/orchestrator.js';
import { insert, setSetting, getSetting, update, one } from '../core/db.js';
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
    if (size > 12 * 1024 * 1024) throw new Error('Body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return {};
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
      if (path.startsWith('/out/')) {
        const rel = normalize(path.slice(1));
        if (!rel.startsWith('out/')) throw httpError(403, 'Nope.');
        const abs = join(config.root, rel);
        if (!abs.startsWith(config.outDir)) throw httpError(403, 'Nope.');
        if (await serveFile(res, abs)) return;
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
