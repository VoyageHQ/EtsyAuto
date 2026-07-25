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

const valley = new Valley(el('map'), el('overlay'));
valley.onStation = (id) => openPanel(id);

function toast(message) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (dom.toast.hidden = true), 2600);
}

async function refresh(force = false) {
  if (refreshTimer && !force) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => (refreshTimer = null), 400);
  try {
    const next = await api.state();
    const first = !state;
    state = next;
    if (first) valley.setWorld(state.world);
    valley.setState(state);
    renderTop();
    renderAttention();
    renderAgents();
    renderActivity();
    if (openStation) renderPanelBody(openStation);
  } catch (err) {
    toast(`lost the valley: ${err.message}`);
  }
}

function renderTop() {
  document.title = `${state.shop.valley}`;
  dom.brand.textContent = state.shop.valley;
  dom.clockTime.textContent = state.shop.clock.label;
  dom.clockPhase.textContent = state.shop.clock.phase;

  const busyStations = new Set(
    state.agents.filter((a) => a.status === 'working').map((a) => a.station)
  );

  dom.tabs.innerHTML = state.world.stations
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
  dom.agents.innerHTML = state.agents
    .map((agent) => {
      const station = state.world.stations.find((s) => s.id === agent.station);
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
  openStation = stationId;
  const station = state.world.stations.find((s) => s.id === stationId);
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
