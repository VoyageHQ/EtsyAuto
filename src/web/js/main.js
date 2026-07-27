// Wiring: fetch state, draw the valley, keep the sidebar honest.
import { api, subscribe } from './api.js';
import { Valley } from './map.js';
import { renderStation } from './panels.js';

const el = (id) => document.getElementById(id);

const dom = {
  brand: el('brand-name'),
  tabs: el('tabs'),
  clockTime: el('clock-time'),
  clockPhase: el('clock-phase'),
  bell: el('bell'),
  bellDot: el('bell-dot'),
  digestPanel: el('digest-panel'),
  digest: el('digest'),
  attention: el('attention'),
  attentionCount: el('attention-count'),
  agents: el('agents'),
  activity: el('activity'),
  modal: el('modal'),
  modalTitle: el('modal-title'),
  modalBlurb: el('modal-blurb'),
  modalBody: el('modal-body'),
  modalClose: el('modal-close'),
  toast: el('toast'),
  hint: el('maphint'),
  brandSwitch: el('district-switch'),
};

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

let state = null;
let openStation = null;
let refreshTimer = null;

// Which business you are looking at. The other one carries on regardless.
let district = localStorage.getItem('district') || 'valley';
const DIVISION_OF = { valley: 'etsy', harbour: 'ventures' };

function stationsOf(worldId) {
  return state?.worlds?.[worldId]?.stations || [];
}

function worldOfStation(stationId) {
  for (const [id, world] of Object.entries(state?.worlds || {})) {
    if (world.stations.some((s) => s.id === stationId)) return id;
  }
  return 'valley';
}

function setDistrict(next, { redraw = true } = {}) {
  if (!state?.worlds?.[next] || district === next) return;
  district = next;
  localStorage.setItem('district', next);
  if (redraw) valley.setWorld(state.worlds[district]);
  valley.setState(visibleState());
  renderTop();
  renderAgents();
}

/** The map and the agent list only ever show one division at a time. */
function visibleState() {
  const division = DIVISION_OF[district];
  return { ...state, agents: state.agents.filter((a) => a.division === division) };
}

const valley = new Valley(el('map'), el('overlay'));
valley.onStation = (id) => openPanel(id);

function toast(message) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  clearTimeout(toast.timer);
  // "queued" and "why nothing went to Etsy and which line of .env to fix" are
  // both toasts, and 2.6 seconds is not long enough to read the second one.
  const ms = Math.min(12000, Math.max(2600, String(message).length * 70));
  toast.timer = setTimeout(() => (dom.toast.hidden = true), ms);
}

async function refresh(force = false) {
  if (refreshTimer && !force) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => (refreshTimer = null), 400);
  try {
    const next = await api.state();
    const first = !state;
    state = next;
    if (first) valley.setWorld(state.worlds[district] || state.world);
    valley.setState(visibleState());
    renderTop();
    renderDigest();
    renderAttention();
    renderAgents();
    renderActivity();
    if (openStation) renderPanelBody(openStation);
  } catch (err) {
    toast(`lost the valley: ${err.message}`);
  }
}

function renderTop() {
  const division = state.divisions.find((d) => d.world === district) || state.divisions[0];
  document.title = division.name;
  dom.brand.textContent = division.name;
  dom.clockTime.textContent = state.shop.clock.label;
  dom.clockPhase.textContent = state.shop.clock.phase;

  const busyStations = new Set(
    state.agents.filter((a) => a.status === 'working').map((a) => a.station)
  );

  dom.tabs.innerHTML = stationsOf(district)
    .map((station) => {
      const value = state.counts[station.counter];
      const sub = subLabel(station, value);
      return `<button class="tab ${busyStations.has(station.id) ? 'busy' : ''}" data-station="${esc(
        station.id
      )}">
        <span class="tab-name">${esc(station.name)}</span>
        <span class="tab-sub">${esc(sub)}</span>
      </button>`;
    })
    .join('');
}

const SUFFIX = {
  // harbour
  signals: ['scanning', 'signals'],
  venturesActive: ['quiet', 'in hand'],
  venturesUnderReview: ['ledgers closed', 'on the books'],
  venturesPlanning: ['drawings filed', 'on the board'],
  venturesBuilding: ['yard empty', 'in the slipway'],
  venturesLive: ['shutters down', 'live'],
  campaignsLive: ['no campaigns', 'campaigns'],
  bundles: ['crates empty', 'packing'],
  // valley
  jobsQueued: ['link up', 'in flight'],
  ideasProposed: ['nothing new', 'rankable'],
  ideasShelved: ['empty shelves', 'shelved'],
  productsInDesign: ['tools down', 'on the bench'],
  productsInReview: ['nothing waiting', 'to check'],
  listingsLive: ['shutters down', 'live'],
};

function subLabel(station, value) {
  if (typeof value === 'number') {
    const pair = SUFFIX[station.counter] || ['clear', 'waiting'];
    return value ? `${value} ${pair[1]}` : pair[0];
  }
  if (value) return String(value);
  return { campaign: 'no season', salesTotal: 'no data', lookout: 'scanning' }[station.counter] || '—';
}

/**
 * What moved while nobody was watching.
 *
 * The agents run overnight, so the owner routinely opens this to a shop that
 * changed without them. The activity feed already has every event, but it is
 * ordered by time and what is actually wanted is ordered by consequence. This
 * card answers "what did I miss" in one line, expands to the whole thing, and
 * only goes away when it is dismissed — a poll must never clear it, or a
 * dashboard left open on a second screen eats the night's news.
 */
function renderDigest() {
  const d = state.digest;
  if (!d || d.quiet) {
    dom.digestPanel.hidden = true;
    return;
  }
  dom.digestPanel.hidden = false;

  const counts = [
    ['needs you', d.waiting, 'needs-you'],
    ['finished', d.finished, ''],
    ['new ideas', d.ideas, ''],
    ['sales', d.sales, ''],
    ['went wrong', d.problems, 'went-wrong'],
  ]
    .filter(([, n]) => n > 0)
    .map(([label, n, cls]) => `<span class="digest-count ${cls}"><b>${n}</b> ${label}</span>`)
    .join('');

  dom.digest.innerHTML = `
    <p class="digest-line">${esc(d.headline)}</p>
    <div class="digest-counts">${counts}</div>
    <div class="actions">
      <button class="tiny" data-digest="open">read it all</button>
      <button class="tiny" data-digest="seen">got it</button>
    </div>`;
}

dom.digest.addEventListener('click', async (e) => {
  const act = e.target.dataset?.digest;
  if (!act) return;
  if (act === 'open') {
    const full = await api.digest();
    const holder = document.createElement('pre');
    // The headline is already the line above. Repeating it just costs the
    // reader a paragraph before they reach anything new.
    holder.textContent = String(full.text).split('\n').slice(1).join('\n').trim();
    e.target.closest('.actions').insertAdjacentElement('beforebegin', holder);
    e.target.remove();
    return;
  }
  if (act === 'seen') {
    await api.digestSeen();
    dom.digestPanel.hidden = true;
    toast('caught up');
  }
});

function renderAttention() {
  const items = state.attention;
  dom.attentionCount.textContent = items.length;
  dom.bellDot.hidden = items.length === 0;

  if (!items.length) {
    dom.attention.innerHTML = `<p class="quiet">Nothing needs a decision right now. The agents will
      raise a flag the moment something does.</p>`;
    return;
  }

  const [first, ...rest] = items;
  dom.attention.innerHTML = `
    <div class="card hot">
      <div class="card-head">
        <span class="dot"></span>
        <span class="card-who">${esc(agentName(first.agent) || 'the valley')}</span>
      </div>
      <p class="card-body">${esc(first.title)}</p>
      <div class="actions">
        ${first.options
          .map(
            (option, i) =>
              `<button class="${i === 0 ? 'primary' : 'tiny'}" data-answer="${esc(first.id)}"
                data-value="${esc(option.value)}" data-station="${esc(first.station || '')}"
                style="${i === 0 ? '' : 'width:auto'}">${esc(option.label)}</button>`
          )
          .join('')}
      </div>
    </div>
    ${rest
      .map(
        (item) => `
      <div class="card">
        <div class="card-head">
          <span class="dot" style="background:var(--dim)"></span>
          <span class="card-who">${esc(agentName(item.agent) || 'the valley')}</span>
        </div>
        <p class="card-body">${esc(item.title)}</p>
        <div class="actions">
          ${item.options
            .map(
              (option) =>
                `<button class="tiny" data-answer="${esc(item.id)}" data-value="${esc(option.value)}"
                  data-station="${esc(item.station || '')}">${esc(option.label)}</button>`
            )
            .join('')}
        </div>
      </div>`
      )
      .join('')}`;
}

function agentName(id) {
  return state.agents.find((a) => a.id === id)?.name || id;
}

function renderAgents() {
  const division = DIVISION_OF[district];
  dom.agents.innerHTML = state.agents
    .filter((agent) => agent.division === division)
    .map((agent) => {
      const station = stationsOf(district).find((s) => s.id === agent.station);
      return `
      <div class="agent ${agent.status}" data-agent="${esc(agent.id)}" data-station="${esc(agent.station)}">
        <span class="agent-name"><span class="swatch" style="background:${esc(agent.colour)}"></span>${esc(
          agent.name
        )}</span>
        <span class="agent-state">${esc(agent.status)}</span>
        <span class="agent-model">${esc(agent.model)}</span>
        <span class="agent-where">${esc(agent.activity || station?.name || '')}</span>
      </div>`;
    })
    .join('');
}

function renderActivity() {
  dom.activity.innerHTML = state.activity.map(eventRow).join('');
}

function eventRow(event) {
  const time = new Date(event.ts).toTimeString().slice(0, 5);
  return `<div class="event ${esc(event.level)}">
    <span class="event-kind">${esc(event.kind)}</span>
    <span class="event-msg">${esc(event.message)}</span>
    <span class="event-time">${time}</span>
  </div>`;
}

// --- station panels --------------------------------------------------------

function openPanel(stationId) {
  // A decision from the other business switches you over to it first.
  const world = worldOfStation(stationId);
  if (world !== district) setDistrict(world);

  openStation = stationId;
  const station = stationsOf(district).find((s) => s.id === stationId);
  dom.modalTitle.textContent = station?.name || stationId;
  dom.modalBlurb.textContent = station?.blurb || '';
  dom.modal.hidden = false;
  renderPanelBody(stationId);
}

function renderPanelBody(stationId) {
  const panel = renderStation(stationId, state, { refresh, toast });
  dom.modalBody.innerHTML = panel.html;
  panel.mount?.(dom.modalBody);
}

function closePanel() {
  openStation = null;
  dom.modal.hidden = true;
  dom.modalBody.innerHTML = '';
}

dom.modalClose.addEventListener('click', closePanel);
dom.modal.addEventListener('click', (e) => {
  if (e.target === dom.modal) closePanel();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !dom.modal.hidden) closePanel();
});

dom.brandSwitch?.addEventListener('click', () => {
  const worlds = state?.divisions?.map((d) => d.world) || ['valley'];
  const next = worlds[(worlds.indexOf(district) + 1) % worlds.length];
  setDistrict(next);
  toast(state.divisions.find((d) => d.world === next)?.name || next);
});

dom.tabs.addEventListener('click', (e) => {
  const id = e.target.closest('[data-station]')?.dataset.station;
  if (id) openPanel(id);
});

dom.agents.addEventListener('click', (e) => {
  const row = e.target.closest('[data-station]');
  if (row?.dataset.station) openPanel(row.dataset.station);
});

dom.attention.addEventListener('click', async (e) => {
  const id = e.target.dataset?.answer;
  if (!id) return;
  const value = e.target.dataset.value;
  const station = e.target.dataset.station;
  // "Open the Research Bench" style prompts are a nudge, not a decision.
  if (value === 'seen' && station) {
    openPanel(station);
    return;
  }
  try {
    await api.answer(id, value);
    toast('noted');
    refresh(true);
  } catch (err) {
    toast(err.message);
  }
});

dom.bell.addEventListener('click', () => {
  const first = state?.attention?.[0];
  if (first?.station) openPanel(first.station);
  else toast('nothing waiting');
});

// --- live + animation ------------------------------------------------------

subscribe({
  onActivity(event) {
    if (!state) return;
    state.activity.unshift(event);
    state.activity = state.activity.slice(0, 60);
    dom.activity.insertAdjacentHTML('afterbegin', eventRow(event));
    while (dom.activity.children.length > 60) dom.activity.lastElementChild.remove();
  },
  onState() {
    refresh();
  },
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  valley.draw(dt);
  requestAnimationFrame(frame);
}

refresh(true).then(() => {
  requestAnimationFrame(frame);
  setTimeout(() => (dom.hint.hidden = true), 9000);
});

// A slow poll as a safety net if the event stream is interrupted.
setInterval(() => refresh(), 20000);
