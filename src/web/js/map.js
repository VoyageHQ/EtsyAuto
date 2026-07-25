// The valley itself. Everything is drawn from code — no image files, no
// sprite sheets, nothing to license. A fixed seed keeps the trees in the same
// place every time you open it.

const TILE = 12;
const COLS = 64;
const ROWS = 40;

const P = {
  // Kept deliberately close together — a wide spread turns the tile grid into
  // a chequerboard.
  grass: ['#3d5b40', '#405e41', '#3a5640', '#42623f'],
  grassDark: '#33513a',
  grassLight: '#4a6b48',
  tuft: '#537d4f',
  flower: ['#d9d08a', '#d99a9a', '#cfc0d8'],
  path: ['#8b7a58', '#7e6d4d', '#95855f'],
  pathEdge: '#6b5c41',
  water: ['#2f5b6c', '#356577', '#294f5f'],
  waterLight: '#4a7f8d',
  trunk: '#4a3a2a',
  leafDark: '#2c4630',
  leafMid: '#3b5c3f',
  leafLight: '#4e7449',
  stone: '#9aa3a8',
  stoneDark: '#6f797e',
  wall: '#cabd9f',
  wallShade: '#a89c81',
  wood: '#6d5238',
  woodDark: '#54402c',
  roofRed: '#7c4b45',
  roofRedDark: '#5f3833',
  roofBlue: '#4e6272',
  roofBlueDark: '#3b4c59',
  roofThatch: '#9b8355',
  roofThatchDark: '#7a6642',
  windowLit: '#f2d79b',
  windowDark: '#2a3946',
  door: '#4a3526',
  awning: ['#b4726b', '#7f9a86', '#a8905f'],
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

export class Valley {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.overlay = overlay;
    this.canvas.width = COLS * TILE;
    this.canvas.height = ROWS * TILE;

    this.world = null;
    this.agents = [];
    this.walkers = new Map();
    this.counts = {};
    this.phase = 'day';
    this.terrain = null;
    this.labels = new Map();
    this.badges = new Map();
    this.onStation = () => {};
    this.frame = 0;

    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    window.addEventListener('resize', () => this.fit());
  }

  /** Size the canvas so whole pixels stay whole. */
  fit() {
    const box = this.canvas.parentElement;
    if (!box) return;
    const style = getComputedStyle(box);
    const availW = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const scale = Math.max(1, Math.min(availW / this.canvas.width, availH / this.canvas.height));
    const w = Math.floor(this.canvas.width * scale);
    const h = Math.floor(this.canvas.height * scale);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    Object.assign(this.overlay.style, {
      left: `${this.canvas.offsetLeft}px`,
      top: `${this.canvas.offsetTop}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
    this.scale = scale;
    this.placeLabels();
  }

  setWorld(world) {
    this.world = world;
    this.terrain = null;
    this.buildLabels();
    this.fit();
  }

  setState(state) {
    this.counts = state.counts || {};
    this.phase = state.shop?.clock?.phase || 'day';
    this.agents = state.agents || [];
    for (const agent of this.agents) {
      const station = this.stationById(agent.station);
      const target = station ? station.door : { x: 31, y: 22 };
      const existing = this.walkers.get(agent.id);
      if (existing) {
        if (existing.target.x !== target.x || existing.target.y !== target.y) {
          existing.route = this.route(existing, target);
          existing.target = target;
        }
        existing.agent = agent;
      } else {
        const spawn = { x: target.x, y: target.y + 1 };
        this.walkers.set(agent.id, {
          agent,
          x: spawn.x,
          y: spawn.y,
          target,
          route: [],
          facing: 1,
          step: 0,
        });
      }
    }
    this.updateLabels();
  }

  stationById(id) {
    return (this.world?.stations || []).find((s) => s.id === id) || null;
  }

  /** Villagers walk on the roads, not through the trees. */
  route(from, target) {
    const roadY = target.y <= 26 ? 21 : 31;
    const points = [];
    if (Math.abs(from.y - target.y) > 2 || Math.abs(from.x - target.x) > 3) {
      points.push({ x: Math.round(from.x), y: roadY });
      points.push({ x: target.x, y: roadY });
    }
    points.push({ x: target.x, y: target.y + 1 });
    return points;
  }

  // --- terrain ------------------------------------------------------------

  buildTerrain() {
    const rng = mulberry32(20260725);
    const grid = [];
    for (let y = 0; y < ROWS; y++) {
      grid[y] = [];
      for (let x = 0; x < COLS; x++) {
        grid[y][x] = { kind: 'grass', shade: pick(rng, P.grass), deco: null };
      }
    }

    // pond
    const pond = this.world?.pond;
    if (pond) {
      for (let y = pond.y; y < Math.min(ROWS, pond.y + pond.h); y++) {
        for (let x = pond.x; x < Math.min(COLS, pond.x + pond.w); x++) {
          const edge =
            x === pond.x || y === pond.y || x === pond.x + pond.w - 1 || y === pond.y + pond.h - 1;
          if (edge && rng() < 0.45) continue;
          grid[y][x] = { kind: 'water', shade: pick(rng, P.water), deco: null };
        }
      }
    }

    // paths, two tiles wide with a scruffy edge
    for (const path of this.world?.paths || []) {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        for (let s = 0; s <= steps; s++) {
          const x = Math.round(a.x + ((b.x - a.x) * s) / steps);
          const y = Math.round(a.y + ((b.y - a.y) * s) / steps);
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const tx = x + dx;
            const ty = y + dy;
            if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue;
            if (grid[ty][tx].kind === 'water') continue;
            if ((dx || dy) && rng() < 0.12) continue;
            grid[ty][tx] = { kind: 'path', shade: pick(rng, P.path), deco: null };
          }
        }
      }
    }

    // building footprints are off limits to trees
    const blocked = new Set();
    const footprints = [];
    for (const station of this.world?.stations || []) {
      const size = BUILDINGS[station.building]?.size || { w: 5, h: 4 };
      footprints.push({ ...station, size });
      for (let y = station.tile.y - 1; y < station.tile.y + size.h + 2; y++) {
        for (let x = station.tile.x - 1; x < station.tile.x + size.w + 1; x++) {
          blocked.add(`${x},${y}`);
        }
      }
    }

    // trees and scenery
    const trees = [];
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        const cell = grid[y][x];
        if (cell.kind !== 'grass') continue;
        if (blocked.has(`${x},${y}`)) continue;
        if (nearKind(grid, x, y, 'path', 1)) {
          if (rng() < 0.06) cell.deco = 'tuft';
          continue;
        }
        const r = rng();
        if (r < 0.17) {
          trees.push({ x, y, kind: rng() < 0.62 ? 'conifer' : 'round', size: 0.8 + rng() * 0.5 });
          blocked.add(`${x},${y}`);
          blocked.add(`${x + 1},${y}`);
          blocked.add(`${x},${y + 1}`);
        } else if (r < 0.2) {
          cell.deco = 'tuft';
        } else if (r < 0.205) {
          cell.deco = 'flower';
        } else if (r < 0.208) {
          cell.deco = 'rock';
        }
      }
    }

    this.terrain = { grid, trees, footprints, rng: mulberry32(7) };
    this.renderBase();
  }

  /** The static half of the picture, drawn once into an offscreen canvas. */
  renderBase() {
    const base = document.createElement('canvas');
    base.width = this.canvas.width;
    base.height = this.canvas.height;
    const ctx = base.getContext('2d');
    const rng = mulberry32(99);
    const { grid, trees } = this.terrain;

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = grid[y][x];
        ctx.fillStyle = cell.shade;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

        if (cell.kind === 'grass') {
          // Break the tile up so the grid does not read as squares: a few
          // sub-blocks of a neighbouring shade, then some darker blades.
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = rng() < 0.5 ? P.grassDark : P.grassLight;
            const bw = 2 + Math.floor(rng() * 4);
            ctx.fillRect(
              x * TILE + Math.floor(rng() * (TILE - bw)),
              y * TILE + Math.floor(rng() * (TILE - 3)),
              bw,
              2 + Math.floor(rng() * 2)
            );
          }
          ctx.fillStyle = P.grassDark;
          for (let i = 0; i < 2; i++) {
            ctx.fillRect(x * TILE + Math.floor(rng() * TILE), y * TILE + Math.floor(rng() * TILE), 1, 2);
          }
        }
        if (cell.kind === 'path') {
          ctx.fillStyle = P.pathEdge;
          for (let i = 0; i < 3; i++) {
            ctx.fillRect(x * TILE + Math.floor(rng() * TILE), y * TILE + Math.floor(rng() * TILE), 1, 1);
          }
        }
        if (cell.deco === 'tuft') {
          ctx.fillStyle = P.tuft;
          const px = x * TILE + 4;
          const py = y * TILE + 7;
          ctx.fillRect(px, py, 1, 3);
          ctx.fillRect(px + 2, py - 1, 1, 4);
          ctx.fillRect(px + 4, py, 1, 3);
        }
        if (cell.deco === 'flower') {
          ctx.fillStyle = P.tuft;
          ctx.fillRect(x * TILE + 5, y * TILE + 7, 1, 3);
          ctx.fillStyle = pick(rng, P.flower);
          ctx.fillRect(x * TILE + 4, y * TILE + 5, 3, 2);
        }
        if (cell.deco === 'rock') {
          ctx.fillStyle = P.stoneDark;
          ctx.fillRect(x * TILE + 3, y * TILE + 6, 6, 4);
          ctx.fillStyle = P.stone;
          ctx.fillRect(x * TILE + 4, y * TILE + 5, 4, 3);
        }
      }
    }

    // water sparkle
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x].kind !== 'water') continue;
        if (rng() < 0.25) {
          ctx.fillStyle = P.waterLight;
          ctx.fillRect(x * TILE + Math.floor(rng() * 6) + 2, y * TILE + Math.floor(rng() * 8) + 2, 4, 1);
        }
      }
    }

    // a little rowing boat, because why not
    const pond = this.world?.pond;
    if (pond) {
      const bx = (pond.x + 3) * TILE;
      const by = (pond.y + 3) * TILE;
      ctx.fillStyle = P.woodDark;
      ctx.fillRect(bx, by + 4, 16, 4);
      ctx.fillStyle = P.wood;
      ctx.fillRect(bx + 1, by + 3, 14, 3);
      ctx.fillStyle = P.stoneDark;
      ctx.fillRect(bx + 8, by - 2, 1, 6);
    }

    trees.sort((a, b) => a.y - b.y);
    for (const tree of trees) drawTree(ctx, tree);

    // buildings, back to front
    const sorted = [...this.terrain.footprints].sort((a, b) => a.tile.y - b.tile.y);
    for (const station of sorted) {
      const def = BUILDINGS[station.building] || BUILDINGS.cabin;
      def.draw(ctx, station.tile.x * TILE, station.tile.y * TILE, station);
    }

    drawFountain(ctx, this.world.plaza);

    // A gentle vignette so the valley sits inside its frame instead of being
    // cropped out of a bigger world.
    const vignette = ctx.createRadialGradient(
      base.width / 2,
      base.height / 2,
      base.height * 0.35,
      base.width / 2,
      base.height / 2,
      base.width * 0.72
    );
    vignette.addColorStop(0, 'rgba(10, 18, 14, 0)');
    vignette.addColorStop(1, 'rgba(10, 18, 14, 0.38)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, base.width, base.height);

    this.base = base;
  }

  // --- animation ----------------------------------------------------------

  draw(dt) {
    if (!this.world) return;
    if (!this.terrain) this.buildTerrain();
    const ctx = this.ctx;
    this.frame++;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);

    // chimney smoke from the workshop when the Maker is in
    const maker = this.agents.find((a) => a.id === 'maker');
    if (maker?.status === 'working') {
      const workshop = this.stationById('workshop');
      if (workshop) drawSmoke(ctx, workshop.tile.x * TILE + 14, workshop.tile.y * TILE - 4, this.frame);
    }

    for (const walker of this.walkers.values()) this.stepWalker(walker, dt);
    const order = [...this.walkers.values()].sort((a, b) => a.y - b.y);
    for (const walker of order) drawVillager(ctx, walker, this.frame);

    this.tint(ctx);
    this.placeBadges();
  }

  stepWalker(walker, dt) {
    const next = walker.route[0];
    if (!next) {
      walker.step = 0;
      return;
    }
    const speed = 3.4 * dt;
    const dx = next.x - walker.x;
    const dy = next.y - walker.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.12) {
      walker.x = next.x;
      walker.y = next.y;
      walker.route.shift();
      return;
    }
    walker.x += (dx / dist) * speed;
    walker.y += (dy / dist) * speed;
    if (Math.abs(dx) > 0.2) walker.facing = dx > 0 ? 1 : -1;
    walker.step += speed * 3;
  }

  /** Time of day. Evening is when the windows come on. */
  tint(ctx) {
    const tints = {
      dawn: 'rgba(88, 76, 120, 0.18)',
      day: null,
      dusk: 'rgba(72, 62, 110, 0.26)',
      night: 'rgba(24, 32, 74, 0.42)',
    };
    const tint = tints[this.phase];
    if (!tint) return;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.phase === 'night' || this.phase === 'dusk') {
      ctx.globalCompositeOperation = 'lighter';
      for (const station of this.world.stations) {
        const busy = this.agents.some((a) => a.station === station.id);
        const def = BUILDINGS[station.building] || BUILDINGS.cabin;
        const cx = station.tile.x * TILE + (def.size.w * TILE) / 2;
        const cy = station.tile.y * TILE + def.size.h * TILE * 0.62;
        const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, busy ? 46 : 26);
        glow.addColorStop(0, busy ? 'rgba(255, 214, 140, 0.42)' : 'rgba(255, 210, 140, 0.2)');
        glow.addColorStop(1, 'rgba(255, 200, 120, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - 50, cy - 50, 100, 100);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // --- labels -------------------------------------------------------------

  buildLabels() {
    this.overlay.innerHTML = '';
    this.labels.clear();
    this.badges.clear();
    for (const station of this.world.stations) {
      const el = document.createElement('button');
      el.className = 'label';
      el.type = 'button';
      el.innerHTML = `<span class="label-name"></span><span class="label-sub"></span>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onStation(station.id);
      });
      this.overlay.appendChild(el);
      this.labels.set(station.id, el);
    }
    this.updateLabels();
  }

  updateLabels() {
    for (const station of this.world?.stations || []) {
      const el = this.labels.get(station.id);
      if (!el) continue;
      const value = this.counts[station.counter];
      el.querySelector('.label-name').textContent = station.name;
      el.querySelector('.label-sub').textContent = labelFor(station, value);
      const hot = typeof value === 'number' ? value > 0 : Boolean(value);
      el.classList.toggle('hot', hot);
    }

    for (const walker of this.walkers.values()) {
      if (this.badges.has(walker.agent.id)) continue;
      const badge = document.createElement('div');
      badge.className = 'namebadge';
      badge.textContent = walker.agent.name.replace(/^The /, '');
      this.overlay.appendChild(badge);
      this.badges.set(walker.agent.id, badge);
    }
    this.placeLabels();
  }

  placeLabels() {
    if (!this.world || !this.scale) return;
    for (const station of this.world.stations) {
      const el = this.labels.get(station.id);
      if (!el) continue;
      const def = BUILDINGS[station.building] || BUILDINGS.cabin;
      const x = (station.tile.x + def.size.w / 2) * TILE * this.scale;
      const y = (station.tile.y - 0.4) * TILE * this.scale;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
    this.placeBadges();
  }

  placeBadges() {
    if (!this.scale) return;
    for (const walker of this.walkers.values()) {
      const badge = this.badges.get(walker.agent.id);
      if (!badge) continue;
      badge.style.left = `${(walker.x + 0.5) * TILE * this.scale}px`;
      badge.style.top = `${(walker.y + 1.1) * TILE * this.scale}px`;
    }
  }

  handleClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * COLS;
    const y = ((event.clientY - rect.top) / rect.height) * ROWS;
    for (const station of this.world?.stations || []) {
      const def = BUILDINGS[station.building] || BUILDINGS.cabin;
      if (
        x >= station.tile.x &&
        x <= station.tile.x + def.size.w &&
        y >= station.tile.y &&
        y <= station.tile.y + def.size.h + 1
      ) {
        this.onStation(station.id);
        return;
      }
    }
  }
}

function labelFor(station, value) {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_LABELS[station.counter] || '—';
  }
  if (typeof value === 'number') {
    const suffix = COUNT_LABELS[station.counter] || 'waiting';
    return value ? `${value} ${suffix}` : DEFAULT_LABELS[station.counter] || 'clear';
  }
  return String(value);
}

const COUNT_LABELS = {
  jobsQueued: 'in flight',
  ideasProposed: 'rankable',
  ideasShelved: 'shelved',
  productsInDesign: 'on the bench',
  productsInReview: 'to check',
  listingsLive: 'live',
};

const DEFAULT_LABELS = {
  jobsQueued: 'link up',
  ideasProposed: 'nothing new',
  ideasShelved: 'empty shelves',
  productsInDesign: 'tools down',
  productsInReview: 'nothing waiting',
  listingsLive: 'shutters down',
  campaign: 'no season set',
  salesTotal: 'no data',
  lookout: 'scanning',
};

// --- building sprites ------------------------------------------------------

function wall(ctx, x, y, w, h) {
  ctx.fillStyle = P.wall;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.wallShade;
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x + w - 2, y, 2, h);
}

function gable(ctx, x, y, w, h, light, dark) {
  for (let row = 0; row < h; row++) {
    const inset = Math.floor((row * (w / 2)) / h);
    ctx.fillStyle = row === h - 1 ? dark : light;
    ctx.fillRect(x + inset, y + (h - 1 - row), w - inset * 2, 1);
  }
  ctx.fillStyle = dark;
  ctx.fillRect(x - 1, y + h - 1, w + 2, 2);
}

function window2(ctx, x, y, lit = true, w = 5, h = 5) {
  ctx.fillStyle = P.woodDark;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = lit ? P.windowLit : P.windowDark;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.woodDark;
  ctx.fillRect(x + Math.floor(w / 2), y, 1, h);
}

function door(ctx, x, y, w = 7, h = 10) {
  ctx.fillStyle = P.woodDark;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 1);
  ctx.fillStyle = P.door;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.windowLit;
  ctx.fillRect(x + w - 2, y + 5, 1, 1);
}

const BUILDINGS = {
  manor: {
    size: { w: 7, h: 6 },
    draw(ctx, x, y) {
      const w = 7 * TILE;
      wall(ctx, x + 4, y + 22, w - 8, 48);
      gable(ctx, x + 2, y + 6, w - 4, 18, P.roofBlue, P.roofBlueDark);
      // wings
      wall(ctx, x - 4, y + 40, 16, 30);
      gable(ctx, x - 6, y + 30, 20, 12, P.roofBlue, P.roofBlueDark);
      wall(ctx, x + w - 12, y + 40, 16, 30);
      gable(ctx, x + w - 14, y + 30, 20, 12, P.roofBlue, P.roofBlueDark);
      // windows
      window2(ctx, x + 14, y + 28, true);
      window2(ctx, x + 28, y + 28, true);
      window2(ctx, x + 42, y + 28, false);
      window2(ctx, x + 56, y + 28, true);
      window2(ctx, x + 14, y + 46, true);
      window2(ctx, x + 56, y + 46, false);
      window2(ctx, x - 1, y + 48, true, 4, 4);
      window2(ctx, x + w - 8, y + 48, true, 4, 4);
      door(ctx, x + 34, y + 58, 8, 12);
      // steps
      ctx.fillStyle = P.stone;
      ctx.fillRect(x + 31, y + 70, 14, 3);
      // chimneys
      ctx.fillStyle = P.roofRedDark;
      ctx.fillRect(x + 12, y, 5, 10);
      ctx.fillRect(x + 52, y + 2, 5, 8);
    },
  },
  cabin: {
    size: { w: 5, h: 4 },
    draw(ctx, x, y) {
      const w = 5 * TILE;
      ctx.fillStyle = P.wood;
      ctx.fillRect(x + 4, y + 20, w - 8, 28);
      ctx.fillStyle = P.woodDark;
      for (let i = 0; i < 5; i++) ctx.fillRect(x + 4, y + 22 + i * 6, w - 8, 1);
      gable(ctx, x + 1, y + 6, w - 2, 15, P.roofThatch, P.roofThatchDark);
      window2(ctx, x + 10, y + 26, true);
      window2(ctx, x + 40, y + 26, true);
      door(ctx, x + 25, y + 36, 8, 12);
      ctx.fillStyle = P.stoneDark;
      ctx.fillRect(x + 23, y + 48, 12, 2);
    },
  },
  workshop: {
    size: { w: 5, h: 4 },
    draw(ctx, x, y) {
      const w = 5 * TILE;
      wall(ctx, x + 3, y + 18, w - 6, 32);
      gable(ctx, x + 1, y + 6, w - 2, 13, P.roofRed, P.roofRedDark);
      ctx.fillStyle = P.stoneDark;
      ctx.fillRect(x + w - 14, y - 2, 6, 14);
      ctx.fillStyle = P.stone;
      ctx.fillRect(x + w - 13, y - 3, 4, 2);
      // big shutter door
      ctx.fillStyle = P.woodDark;
      ctx.fillRect(x + 14, y + 30, 22, 20);
      ctx.fillStyle = P.wood;
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 15, y + 32 + i * 5, 20, 3);
      window2(ctx, x + 42, y + 24, true, 4, 4);
      // workbench outside
      ctx.fillStyle = P.woodDark;
      ctx.fillRect(x + 2, y + 46, 10, 3);
      ctx.fillRect(x + 3, y + 49, 2, 4);
      ctx.fillRect(x + 9, y + 49, 2, 4);
    },
  },
  library: {
    size: { w: 6, h: 5 },
    draw(ctx, x, y) {
      const w = 6 * TILE;
      ctx.fillStyle = P.stone;
      ctx.fillRect(x + 3, y + 20, w - 6, 40);
      ctx.fillStyle = P.stoneDark;
      ctx.fillRect(x + 3, y + 58, w - 6, 2);
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 3, y + 26 + i * 9, w - 6, 1);
      gable(ctx, x + 1, y + 8, w - 2, 14, P.roofBlue, P.roofBlueDark);
      // arched windows
      for (const wx of [10, 26, 42, 58]) {
        ctx.fillStyle = P.windowDark;
        ctx.fillRect(x + wx, y + 28, 6, 16);
        ctx.fillStyle = P.windowLit;
        ctx.fillRect(x + wx + 1, y + 30, 4, 13);
      }
      door(ctx, x + 30, y + 46, 10, 14);
      ctx.fillStyle = P.stoneDark;
      ctx.fillRect(x + 26, y + 60, 18, 3);
    },
  },
  tower: {
    size: { w: 3, h: 7 },
    draw(ctx, x, y) {
      const w = 3 * TILE;
      ctx.fillStyle = P.stone;
      ctx.fillRect(x + 6, y + 16, w - 12, 68);
      ctx.fillStyle = P.stoneDark;
      for (let i = 0; i < 7; i++) ctx.fillRect(x + 6, y + 22 + i * 9, w - 12, 1);
      ctx.fillRect(x + w - 8, y + 16, 2, 68);
      // conical roof
      for (let row = 0; row < 14; row++) {
        const half = Math.floor((row / 14) * 13);
        ctx.fillStyle = row > 11 ? P.roofRedDark : P.roofRed;
        ctx.fillRect(x + 18 - half, y + 16 - (14 - row), half * 2 + 1, 1);
      }
      // flag
      ctx.fillStyle = P.woodDark;
      ctx.fillRect(x + 18, y - 8, 1, 10);
      ctx.fillStyle = P.roofRed;
      ctx.fillRect(x + 19, y - 8, 6, 4);
      window2(ctx, x + 13, y + 26, true, 5, 6);
      window2(ctx, x + 13, y + 48, false, 5, 6);
      door(ctx, x + 13, y + 72, 7, 12);
    },
  },
  hut: {
    size: { w: 4, h: 3 },
    draw(ctx, x, y) {
      const w = 4 * TILE;
      ctx.fillStyle = P.wood;
      ctx.fillRect(x + 4, y + 16, w - 8, 20);
      ctx.fillStyle = P.woodDark;
      ctx.fillRect(x + 4, y + 34, w - 8, 2);
      gable(ctx, x + 2, y + 6, w - 4, 11, P.roofThatch, P.roofThatchDark);
      window2(ctx, x + 9, y + 21, false, 4, 4);
      door(ctx, x + 24, y + 25, 7, 11);
    },
  },
  hall: {
    size: { w: 7, h: 5 },
    draw(ctx, x, y) {
      const w = 7 * TILE;
      wall(ctx, x + 3, y + 22, w - 6, 38);
      gable(ctx, x + 1, y + 8, w - 2, 15, P.roofRed, P.roofRedDark);
      for (const wx of [10, 24, 56, 70]) window2(ctx, x + wx, y + 30, wx < 40);
      // double doors
      ctx.fillStyle = P.woodDark;
      ctx.fillRect(x + 34, y + 40, 18, 20);
      ctx.fillStyle = P.door;
      ctx.fillRect(x + 35, y + 41, 7, 19);
      ctx.fillRect(x + 44, y + 41, 7, 19);
      ctx.fillStyle = P.windowLit;
      ctx.fillRect(x + 41, y + 50, 1, 2);
      ctx.fillRect(x + 45, y + 50, 1, 2);
      ctx.fillStyle = P.stone;
      ctx.fillRect(x + 30, y + 60, 26, 3);
      // lanterns either side
      ctx.fillStyle = P.windowLit;
      ctx.fillRect(x + 30, y + 42, 2, 3);
      ctx.fillRect(x + 54, y + 42, 2, 3);
    },
  },
  stalls: {
    size: { w: 8, h: 3 },
    draw(ctx, x, y) {
      for (let i = 0; i < 3; i++) {
        const sx = x + i * 32;
        // awning
        for (let s = 0; s < 10; s += 2) {
          ctx.fillStyle = P.awning[i % P.awning.length];
          ctx.fillRect(sx + 2 + s * 3, y + 8, 3, 8);
          ctx.fillStyle = '#f0e6d2';
          ctx.fillRect(sx + 5 + s * 3, y + 8, 3, 8);
        }
        ctx.fillStyle = P.woodDark;
        ctx.fillRect(sx + 2, y + 6, 30, 3);
        // counter
        ctx.fillStyle = P.wood;
        ctx.fillRect(sx + 4, y + 22, 26, 6);
        ctx.fillStyle = P.woodDark;
        ctx.fillRect(sx + 4, y + 28, 26, 8);
        ctx.fillRect(sx + 3, y + 9, 2, 13);
        ctx.fillRect(sx + 29, y + 9, 2, 13);
        // goods on the counter
        for (let g = 0; g < 4; g++) {
          ctx.fillStyle = ['#f2e7cf', '#dcc9a2', '#e8d7b4'][g % 3];
          ctx.fillRect(sx + 7 + g * 6, y + 18, 4, 4);
        }
      }
    },
  },
};

function drawTree(ctx, tree) {
  const x = tree.x * TILE;
  const y = tree.y * TILE;
  const h = Math.round(20 * tree.size);
  ctx.fillStyle = 'rgba(12, 20, 16, 0.22)';
  ctx.fillRect(x + 2, y + 12, 10, 3);
  ctx.fillStyle = P.trunk;
  ctx.fillRect(x + 6, y + 4, 2, 10);

  if (tree.kind === 'conifer') {
    for (let layer = 0; layer < 3; layer++) {
      const width = 11 - layer * 2;
      const top = y + 2 - layer * Math.round(h / 5);
      ctx.fillStyle = layer === 2 ? P.leafLight : layer === 1 ? P.leafMid : P.leafDark;
      for (let row = 0; row < 6; row++) {
        const inset = Math.floor(((5 - row) * width) / 12);
        ctx.fillRect(x + 2 + inset, top + row, width - inset * 2, 1);
      }
    }
  } else {
    ctx.fillStyle = P.leafDark;
    ctx.fillRect(x + 1, y - 6, 12, 10);
    ctx.fillRect(x + 3, y - 9, 8, 3);
    ctx.fillStyle = P.leafMid;
    ctx.fillRect(x + 2, y - 5, 8, 6);
    ctx.fillStyle = P.leafLight;
    ctx.fillRect(x + 4, y - 7, 4, 4);
  }
}

function drawFountain(ctx, plaza) {
  if (!plaza) return;
  const x = plaza.x * TILE;
  const y = plaza.y * TILE;
  ctx.fillStyle = P.stoneDark;
  ctx.fillRect(x - 10, y - 6, 28, 18);
  ctx.fillStyle = P.stone;
  ctx.fillRect(x - 8, y - 4, 24, 14);
  ctx.fillStyle = P.water[1];
  ctx.fillRect(x - 6, y - 2, 20, 10);
  ctx.fillStyle = P.waterLight;
  ctx.fillRect(x - 4, y, 6, 1);
  ctx.fillRect(x + 6, y + 4, 5, 1);
  ctx.fillStyle = P.stone;
  ctx.fillRect(x + 2, y - 8, 3, 8);
  ctx.fillStyle = '#cfe6ea';
  ctx.fillRect(x + 3, y - 11, 1, 4);
}

function drawSmoke(ctx, x, y, frame) {
  for (let i = 0; i < 4; i++) {
    const t = (frame / 14 + i * 2) % 12;
    const alpha = 0.3 - t * 0.022;
    if (alpha <= 0) continue;
    ctx.fillStyle = `rgba(226, 226, 220, ${alpha})`;
    const wobble = Math.sin((frame + i * 20) / 18) * 3;
    ctx.fillRect(Math.round(x + wobble), Math.round(y - t * 3), 3 + i, 3);
  }
}

/** A villager: five pixels wide, and somehow still full of character. */
function drawVillager(ctx, walker, frame) {
  const x = Math.round(walker.x * TILE) + 3;
  const y = Math.round(walker.y * TILE) - 4;
  const moving = walker.route.length > 0;
  const bob = moving ? Math.floor(Math.sin(walker.step / 1.6) * 1.4) : Math.floor(Math.sin(frame / 30));
  const colour = walker.agent.colour || '#9fd0a0';

  ctx.fillStyle = 'rgba(10, 16, 14, 0.28)';
  ctx.fillRect(x, y + 13, 7, 2);

  // legs
  ctx.fillStyle = '#3b3327';
  if (moving && Math.floor(walker.step / 2) % 2 === 0) {
    ctx.fillRect(x + 1, y + 10 + bob, 2, 3);
    ctx.fillRect(x + 4, y + 9 + bob, 2, 4);
  } else {
    ctx.fillRect(x + 1, y + 9 + bob, 2, 4);
    ctx.fillRect(x + 4, y + 10 + bob, 2, 3);
  }

  // body
  ctx.fillStyle = colour;
  ctx.fillRect(x, y + 4 + bob, 7, 6);
  ctx.fillStyle = shade(colour, -18);
  ctx.fillRect(x, y + 8 + bob, 7, 2);

  // head
  ctx.fillStyle = '#e8c9a4';
  ctx.fillRect(x + 1, y + bob, 5, 4);
  ctx.fillStyle = shade(colour, -30);
  ctx.fillRect(x, y - 1 + bob, 7, 2);
  ctx.fillStyle = '#2a2118';
  const eyeX = walker.facing > 0 ? x + 4 : x + 2;
  ctx.fillRect(eyeX, y + 2 + bob, 1, 1);

  if (walker.agent.status === 'working') {
    ctx.fillStyle = 'rgba(255, 216, 140, 0.9)';
    ctx.fillRect(x + 8, y - 2 + bob, 2, 2);
  }
}

function shade(hex, amount) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function nearKind(grid, x, y, kind, radius) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const row = grid[y + dy];
      if (!row) continue;
      const cell = row[x + dx];
      if (cell && cell.kind === kind) return true;
    }
  }
  return false;
}

export default Valley;
