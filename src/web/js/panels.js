// What you see when you walk into a building.
import { api } from './api.js';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (amount, currency = 'GBP') => {
  const symbols = { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$' };
  if (amount === null || amount === undefined) return '—';
  return `${symbols[currency] || ''}${Number(amount).toFixed(2)}`;
};

const when = (ts) => {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

/**
 * @param {string} stationId
 * @param {object} state
 * @param {{refresh: Function, toast: Function}} ctx
 * @returns {{html: string, mount?: (root: HTMLElement) => void}}
 */
export function renderStation(stationId, state, ctx) {
  const panel = PANELS[stationId];
  if (!panel) return { html: '<p class="quiet">Nothing here yet.</p>' };
  return panel(state, ctx);
}

const PANELS = {
  'research-bench': ideasPanel,
  office: officePanel,
  workshop: workshopPanel,
  library: libraryPanel,
  'review-hall': reviewPanel,
  shopfront: shopfrontPanel,
  calendar: calendarPanel,
  ledger: ledgerPanel,
  lookout: lookoutPanel,
  signpost: signpostPanel,
  packhouse: packhousePanel,
  // The harbour.
  lighthouse: lighthousePanel,
  'harbour-office': harbourOfficePanel,
  'counting-house': countingHousePanel,
  'drawing-office': drawingOfficePanel,
  boatyard: boatyardPanel,
  billboard: billboardPanel,
  warehouse: warehousePanel,
};

// --- the harbour -----------------------------------------------------------

const ventureCard = (v, state, extra = '') => `
  <div class="tile" style="margin-bottom:10px">
    <div style="display:flex;align-items:baseline;gap:8px;justify-content:space-between">
      <h4>${esc(v.name)}</h4>
      <span class="stage-chip ${esc(v.status === 'killed' ? 'blocked' : v.stage)}">${esc(v.stage)} · ${esc(v.status)}</span>
    </div>
    <p>${esc(v.oneLiner)}</p>
    <p><b>Who pays</b> ${esc(v.audience)} ·
      <b>Money</b> ${esc(v.monetisation?.model || '?')} at ${money(v.monetisation?.price, state.shop.currency)} ·
      <b>First payment</b> ~${esc(v.monetisation?.daysToRevenue ?? '?')} days</p>
    ${extra}
    ${
      v.dir
        ? `<div class="actions"><a class="tiny" style="text-decoration:none;padding:4px 7px;border:1px solid var(--line)"
             href="/${esc(v.dir)}/README.md" target="_blank">readme</a>
           <a class="tiny" style="text-decoration:none;padding:4px 7px;border:1px solid var(--line)"
             href="/${esc(v.dir)}/PLAN.md" target="_blank">plan</a>
           <a class="tiny" style="text-decoration:none;padding:4px 7px;border:1px solid var(--line)"
             href="/${esc(v.dir)}/public/index.html" target="_blank">landing page</a></div>`
        : ''
    }
  </div>`;

function evidenceList(v) {
  if (!v.evidence?.length) return '<p class="quiet">No evidence recorded, which is a reason to be careful.</p>';
  return v.evidence
    .map(
      (e) => `<figure style="margin:0 0 8px;padding:8px 10px;background:var(--panel);border:1px solid var(--line)">
        <blockquote style="margin:0 0 4px;font-size:10.5px;color:var(--text);line-height:1.5">"${esc(e.quote)}"</blockquote>
        <figcaption style="font-size:8.5px;color:var(--dimmer)">${esc(e.channel || e.source)}
          ${e.url ? `· <a href="${esc(e.url)}" target="_blank" rel="noopener">source</a>` : ''}
          ${e.phrase ? `· matched "${esc(e.phrase)}"` : ''}</figcaption>
      </figure>`
    )
    .join('');
}

function lighthousePanel(state, ctx) {
  const proposed = (state.ventures || []).filter((v) => v.status === 'proposed');
  const best = proposed[0];
  const sources = state.sources || [];

  return {
    html: `
      <div class="bar">
        <span class="quiet" style="flex:1">Listening to ${sources
          .filter((s) => s.enabled)
          .map((s) => esc(s.name))
          .join(', ') || 'nothing — set VENTURE_SOURCES in .env'}. ${state.counts.signals || 0} signals on file.</span>
        <button class="tiny" data-act="harvest">go and listen now</button>
      </div>

      ${
        best
          ? `<div class="card hot" style="margin-bottom:14px">
              <div class="card-head"><span class="dot"></span><span class="card-who">my pick</span></div>
              <h4 style="margin:0 0 4px;font-size:13px">${esc(best.name)}</h4>
              <p class="card-body">${esc(best.oneLiner)}</p>
              <p class="card-body"><b>Who pays</b> ${esc(best.audience)}<br />
                <b>How it makes money</b> ${esc(best.monetisation?.model)} at
                ${money(best.monetisation?.price, state.shop.currency)} —
                ${esc(best.monetisation?.firstPoundPath || '')}<br />
                <b>First payment in</b> about ${esc(best.monetisation?.daysToRevenue)} days ·
                <b>Effort</b> ${best.effort}/5 · <b>Score</b> ${best.score}</p>
              <div class="actions">
                <button class="primary" data-decide="${esc(best.id)}" data-value="approved" style="width:auto">build this one</button>
                <button class="tiny danger" data-decide="${esc(best.id)}" data-value="rejected">not this</button>
                <button class="tiny" data-decide="${esc(best.id)}" data-value="shelved">later</button>
              </div>
            </div>
            <h4 style="margin:0 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">the evidence</h4>
            ${evidenceList(best)}
            <textarea id="ven-note" placeholder="optional: why not? this teaches the Prospector"></textarea>`
          : '<p class="quiet">Nothing proposed yet. Press "go and listen now" and the Prospector will go and read.</p>'
      }

      ${
        proposed.length > 1
          ? `<h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">the rest of the shortlist</h4>
             ${proposed
               .slice(1)
               .map((v) =>
                 ventureCard(
                   v,
                   state,
                   `<div class="actions">
                      <button class="tiny" data-decide="${esc(v.id)}" data-value="approved">build this instead</button>
                      <button class="tiny danger" data-decide="${esc(v.id)}" data-value="rejected">no</button>
                    </div>`
                 )
               )
               .join('')}`
          : ''
      }

      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">latest signals heard</h4>
      ${
        (state.signals || []).length
          ? state.signals
              .slice(0, 10)
              .map(
                (s) => `<div class="lesson"><div><b>${esc(s.channel || s.source)}</b><br />
                  ${esc((s.text || s.title || '').slice(0, 160))}</div>
                  ${s.url ? `<a class="tiny" style="text-decoration:none" href="${esc(s.url)}" target="_blank">open</a>` : ''}</div>`
              )
              .join('')
          : '<p class="quiet">Nothing harvested yet.</p>'
      }`,
    mount(root) {
      root.addEventListener('click', async (e) => {
        if (e.target.dataset?.act === 'harvest') {
          await api.harvestSignals();
          ctx.toast('the Prospector is listening');
          return;
        }
        const id = e.target.dataset?.decide;
        if (!id) return;
        const note = root.querySelector('#ven-note')?.value.trim() || '';
        await api.decideVenture(id, e.target.dataset.value, note);
        ctx.toast(e.target.dataset.value);
        ctx.refresh(true);
      });
    },
  };
}

function harbourOfficePanel(state, ctx) {
  const ventures = state.ventures || [];
  const live = ventures.filter((v) => v.stage === 'live');
  return {
    html: `
      <div class="grid2" style="margin-bottom:14px">
        <div class="tile">
          <h4>Ventures</h4>
          <p>${ventures.length} on the books · ${state.counts.venturesActive || 0} in hand ·
            ${live.length} live</p>
          <p>One venture is built at a time. Two half-built products are worth
          less than one finished one.</p>
        </div>
        <div class="tile">
          <h4>Research sources</h4>
          ${(state.sources || [])
            .map(
              (s) =>
                `<p><b style="color:${s.enabled ? 'var(--green)' : 'var(--dimmer)'}">${
                  s.enabled ? 'on' : 'off'
                }</b> ${esc(s.name)} — ${esc(s.note)}</p>`
            )
            .join('')}
        </div>
      </div>
      ${ventures.length ? ventures.map((v) => ventureCard(v, state)).join('') : '<p class="quiet">Nothing yet.</p>'}`,
  };
}

function countingHousePanel(state) {
  const ventures = (state.ventures || []).filter((v) => v.analysis || v.stage === 'analysis');
  return {
    html: ventures.length
      ? ventures
          .map((v) => {
            const a = v.analysis;
            return ventureCard(
              v,
              state,
              a
                ? `<p><b>Verdict</b> ${esc(a.verdict)} — ${esc(a.why)}</p>
                   <p><b>Who would pay</b> ${esc(a.wouldPay || '')}</p>
                   <p><b>Already doing this</b> ${(a.competitors || []).map(esc).join('; ')}</p>
                   ${a.risks?.length ? `<p><b>Risks</b> ${a.risks.map(esc).join('; ')}</p>` : ''}
                   ${a.legal?.length ? `<p style="color:var(--rose)"><b>Legal</b> ${a.legal.map(esc).join('; ')}</p>` : ''}`
                : '<p class="quiet">Not analysed yet.</p>'
            );
          })
          .join('')
      : '<p class="quiet">Nothing on the books.</p>',
  };
}

function drawingOfficePanel(state) {
  const ventures = (state.ventures || []).filter((v) => v.plan);
  return {
    html: ventures.length
      ? ventures
          .map((v) => {
            const p = v.plan;
            return ventureCard(
              v,
              state,
              `<p><b>Goal</b> ${esc(p.mvpGoal)}</p>
               <p><b>Building</b></p><ul class="tagline" style="display:block;padding-left:16px">${(p.mustHave || [])
                 .map((f) => `<li style="font-size:10.5px;color:var(--dim);margin-bottom:3px">${esc(f)}</li>`)
                 .join('')}</ul>
               <p><b>Deliberately not building</b> ${(p.notBuilding || []).map(esc).join('; ')}</p>
               <p><b>Done means</b> ${esc(p.successMetric)}</p>
               <p><b>First customer</b> ${esc(p.firstCustomerPlan)}</p>`
            );
          })
          .join('')
      : '<p class="quiet">Nothing on the drawing board.</p>',
  };
}

function boatyardPanel(state, ctx) {
  const ventures = (state.ventures || []).filter((v) => v.dir);
  return {
    html: `
      <p class="quiet" style="margin-bottom:14px">What the Builder produces is a real running start:
      a landing page with the buyers' own words on it, working signup capture, and a pricing page
      ready for Stripe payment links. The feature that makes it worth paying for is still yours to
      write — the plan says which one.</p>
      ${
        ventures.length
          ? ventures
              .map((v) =>
                ventureCard(
                  v,
                  state,
                  `<p><b>Files</b> ${v.assets.length} in <code>${esc(v.dir)}/</code></p>
                   <p class="quiet">Run it: <code>cd ${esc(v.dir)} && node server.js</code></p>`
                )
              )
              .join('')
          : '<p class="quiet">Nothing in the slipway.</p>'
      }`,
  };
}

function billboardPanel(state, ctx) {
  const campaigns = state.campaigns || [];
  return {
    html: `
      <p class="quiet" style="margin-bottom:14px">The Marketer writes and plans. You press go. It has
      no payment method and no posting credentials, by design — a campaign sits as a draft until you
      approve it, and even then it hands you a checklist rather than posting anything itself.</p>
      ${
        campaigns.length
          ? campaigns
              .map((c) => {
                const venture = (state.ventures || []).find((v) => v.id === c.venture_id);
                const plan = c.plan || {};
                return `<div class="tile" style="margin-bottom:10px">
                <div style="display:flex;align-items:baseline;gap:8px;justify-content:space-between">
                  <h4>${esc(c.name)}</h4>
                  <span class="stage-chip ${c.status === 'running' ? 'ready' : ''}">${esc(c.status)}</span>
                </div>
                <p><b>Tagline</b> ${esc(plan.tagline || '')}</p>
                <p><b>Channels</b> ${(plan.channels || []).map((ch) => esc(ch.name)).join(', ')}</p>
                <p><b>First move</b> ${esc((plan.sequence || [])[0] || '')}</p>
                <p><b>Budget</b> ${c.budget ? money(c.budget, state.shop.currency) : 'nothing — free channels only'}</p>
                ${
                  venture?.dir
                    ? `<div class="actions">
                        <a class="tiny" style="text-decoration:none;padding:4px 7px;border:1px solid var(--line)"
                          href="/${esc(venture.dir)}/marketing/LAUNCH-PLAN.md" target="_blank">launch plan</a>
                        <a class="tiny" style="text-decoration:none;padding:4px 7px;border:1px solid var(--line)"
                          href="/${esc(venture.dir)}/marketing/AD-COPY.md" target="_blank">ad copy</a>
                        <a class="tiny" style="text-decoration:none;padding:4px 7px;border:1px solid var(--line)"
                          href="/${esc(venture.dir)}/marketing/CONTENT-CALENDAR.csv" target="_blank">calendar</a>
                        <button class="tiny" data-campaign="${esc(c.id)}" data-status="${
                          c.status === 'running' ? 'paused' : 'running'
                        }">${c.status === 'running' ? 'pause it' : 'mark it running'}</button>
                      </div>`
                    : ''
                }
              </div>`;
              })
              .join('')
          : '<p class="quiet">No campaigns yet. They appear once a venture reaches the marketing stage.</p>'
      }`,
    mount(root) {
      root.addEventListener('click', async (e) => {
        const id = e.target.dataset?.campaign;
        if (!id) return;
        await api.setCampaignStatus(id, e.target.dataset.status);
        ctx.toast('updated');
        ctx.refresh(true);
      });
    },
  };
}

function warehousePanel(state, ctx) {
  const live = (state.ventures || []).filter((v) => v.stage === 'live' || v.revenue > 0);
  const total = live.reduce((sum, v) => sum + Number(v.revenue || 0), 0);
  return {
    html: `
      <div class="tile" style="margin-bottom:12px">
        <h4>${money(total, state.shop.currency)}</h4>
        <p>${live.length} venture(s) live. Record what each one earns and the Prospector stops
        guessing about what works.</p>
      </div>
      ${
        live.length
          ? live
              .map((v) =>
                ventureCard(
                  v,
                  state,
                  `<p><b>Earned</b> ${money(v.revenue, state.shop.currency)}</p>
                   <div class="bar" style="border:0;padding:6px 0">
                     <input type="number" step="0.01" placeholder="amount" data-amount="${esc(v.id)}" style="width:100px" />
                     <button class="tiny" data-revenue="${esc(v.id)}">record</button>
                   </div>`
                )
              )
              .join('')
          : '<p class="quiet">Nothing live yet.</p>'
      }`,
    mount(root) {
      root.addEventListener('click', async (e) => {
        const id = e.target.dataset?.revenue;
        if (!id) return;
        const input = root.querySelector(`[data-amount="${id}"]`);
        const amount = Number(input?.value);
        if (!(amount > 0)) return ctx.toast('what amount?');
        await api.recordVentureRevenue(id, amount);
        ctx.toast('recorded');
        ctx.refresh(true);
      });
    },
  };
}

// --- research bench: the idea list ----------------------------------------

function ideasPanel(state, ctx) {
  const ideas = state.ideas.proposed;
  const currency = state.shop.currency;

  const rows = ideas
    .map(
      (idea) => `
      <label class="idea">
        <input type="checkbox" value="${esc(idea.id)}" />
        <div>
          <p class="idea-title">${esc(idea.title)}</p>
          <p class="idea-meta">${esc(idea.category)} · for ${esc(idea.audience || 'anyone')} ·
            effort ${idea.effort}/5 · demand ${idea.demand}/5 ·
            ${money(idea.priceLow, currency)}–${money(idea.priceHigh, currency)}</p>
          <p class="idea-pitch">${esc(idea.pitch || '')}</p>
          ${
            idea.similarTo
              ? `<p class="idea-meta" style="color:var(--amber)">Close to "${esc(idea.similarTo)}" —
                 approve it and the Maker builds it differently: another palette, another set of pages.</p>`
              : ''
          }
          <div class="tagline">${(idea.keywords || [])
            .slice(0, 6)
            .map((k) => `<span class="tag">${esc(k)}</span>`)
            .join('')}</div>
        </div>
        <div class="score">${idea.score ?? '—'}<span>score</span></div>
      </label>`
    )
    .join('');

  const html = `
    <div class="bar">
      <button class="tiny" data-act="all">select all</button>
      <button class="tiny" data-act="none">clear</button>
      <span style="flex:1"></span>
      <input type="text" id="theme" placeholder="theme, e.g. adhd or christmas" style="width:200px" />
      <input type="number" id="count" value="8" min="1" max="20" style="width:56px" />
      <button class="tiny" data-act="more">ask the scout</button>
    </div>

    ${ideas.length ? rows : '<p class="quiet">Nothing waiting. Ask the Scout for a fresh batch.</p>'}

    ${
      ideas.length
        ? `<div class="bar" style="border:0;margin-top:14px;padding-bottom:0">
            <button class="primary" data-act="approve" style="width:auto">build the selected</button>
            <button class="tiny" data-act="shelve">shelve for later</button>
            <button class="tiny danger" data-act="reject">not for me</button>
          </div>
          <p class="quiet" style="margin-top:8px">A reason typed below turns into a lesson, so the Scout
          stops bringing you that kind of thing.</p>
          <textarea id="note" placeholder="optional: why not? e.g. too crowded, or I do not want religious products"></textarea>`
        : ''
    }

    ${
      state.ideas.recentlyRejected.length
        ? `<h4 style="margin:18px 0 6px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--dimmer)">recently turned down</h4>
           <p class="quiet">${state.ideas.recentlyRejected.map((i) => esc(i.title)).join(' · ')}</p>`
        : ''
    }
  `;

  return {
    html,
    mount(root) {
      const boxes = () => [...root.querySelectorAll('input[type=checkbox]')];
      const selected = () => boxes().filter((b) => b.checked).map((b) => b.value);

      root.addEventListener('click', async (e) => {
        const act = e.target.dataset?.act;
        if (!act) return;
        if (act === 'all') return boxes().forEach((b) => (b.checked = true));
        if (act === 'none') return boxes().forEach((b) => (b.checked = false));
        if (act === 'more') {
          const theme = root.querySelector('#theme').value.trim();
          const count = Number(root.querySelector('#count').value) || 8;
          await api.requestIdeas(count, theme || null);
          ctx.toast('the scout is on it');
          return;
        }
        const ids = selected();
        if (!ids.length) return ctx.toast('tick some ideas first');
        const note = root.querySelector('#note')?.value.trim() || '';
        const decision = act === 'approve' ? 'approved' : act === 'shelve' ? 'shelved' : 'rejected';
        await api.decideIdeas(ids, decision, note);
        ctx.toast(`${ids.length} ${decision}`);
        ctx.refresh(true);
      });
    },
  };
}

// --- office: the manager, the brain, and teaching -------------------------

function officePanel(state, ctx) {
  const jobs = state.jobs
    .slice(0, 12)
    .map(
      (job) => `
      <div class="event ${job.status === 'failed' ? 'error' : job.status === 'done' ? 'good' : ''}">
        <span class="event-kind">${esc(job.status)}</span>
        <span class="event-msg"><b style="color:var(--text);font-weight:400">${esc(job.agent)}</b>
          ${esc(job.kind)}${job.subject ? ` — ${esc(job.subject)}` : ''}
          ${job.error ? `<br /><span style="color:var(--rose)">${esc(job.error)}</span>` : ''}</span>
        <span class="event-time">${when(job.createdAt)}</span>
      </div>`
    )
    .join('');

  const lessons = state.lessons.length
    ? state.lessons
        .map(
          (lesson) => `
        <div class="lesson">
          <div><b>${esc(lesson.agent || 'everyone')}</b><br />${esc(lesson.text)}</div>
          <button class="tiny danger" data-forget="${esc(lesson.id)}">forget</button>
        </div>`
        )
        .join('')
    : '<p class="quiet">Nothing taught yet. Anything you write here sticks for good.</p>';

  const agentOptions = ['<option value="">everyone</option>']
    .concat(state.agents.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`))
    .join('');

  return {
    html: `
      <div class="grid2" style="margin-bottom:14px">
        <div class="tile">
          <h4>Brain</h4>
          <p>${state.shop.brain.live ? 'Live model' : 'Offline brain'} — <code>${esc(state.shop.brain.model)}</code></p>
          <p>${
            state.shop.brain.live
              ? 'Agents are writing their own ideas and copy.'
              : 'Agents are working from their built-in craft. Set LLM_PROVIDER in .env to give them a model.'
          }</p>
        </div>
        <div class="tile">
          <h4>Etsy</h4>
          <p>${
            state.shop.etsy.connected
              ? `Connected. New listings go up as <b>${esc(state.shop.etsy.mode)}</b>.`
              : 'Not connected. Approved listings get packed into <code>out/</code> for you to paste in.'
          }</p>
        </div>
        <div class="tile">
          <h4>The loop</h4>
          <p>${
            state.shop.loopRunning
              ? 'Running — the agents pick up work on their own.'
              : 'Paused. Nothing moves until you press <b>do one job now</b> or start it.'
          }</p>
          <div class="actions">
            <button class="tiny" data-act="tick">do one job now</button>
            <button class="tiny" data-act="loop-on"${state.shop.loopRunning ? ' disabled' : ''}>start loop</button>
            <button class="tiny" data-act="loop-off"${state.shop.loopRunning ? '' : ' disabled'}>pause loop</button>
          </div>
        </div>
        <div class="tile">
          <h4>Discord</h4>
          <p>${
            state.shop.discord.connected
              ? 'Connected. Each agent is posting in its own channel.'
              : 'Not connected. See <code>docs/DISCORD.md</code> — about five minutes.'
          }</p>
        </div>
        <div class="tile">
          <h4>Today's brain use</h4>
          <p>${state.budget.calls} call${state.budget.calls === 1 ? '' : 's'} ·
            ${state.budget.total.toLocaleString()} tokens${
              state.budget.cap ? ` of ${state.budget.cap.toLocaleString()}` : ''
            }${state.budget.cost !== null ? ` · ${money(state.budget.cost, state.shop.currency)}` : ''}</p>
          ${
            state.budget.cap
              ? `<div style="height:4px;background:var(--ink);border:1px solid var(--line)">
                   <div style="height:100%;width:${Math.min(
                     100,
                     Math.round((state.budget.total / state.budget.cap) * 100)
                   )}%;background:${
                     state.budget.total >= state.budget.cap ? 'var(--rose)' : 'var(--amber)'
                   }"></div>
                 </div>
                 <p style="margin-top:6px">At the cap the agents carry on with their offline craft
                 rather than spending more.</p>`
              : '<p>No cap set. Add <code>LLM_DAILY_TOKENS</code> to .env if you want one.</p>'
          }
          ${
            state.budget.byAgent.length
              ? `<p>${state.budget.byAgent
                  .map((a) => `${esc(a.agent || 'other')} ${(a.input + a.output).toLocaleString()}`)
                  .join(' · ')}</p>`
              : ''
          }
        </div>
      </div>

      <h4 style="margin:0 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">is anything wrong?</h4>
      <p class="quiet" style="margin-bottom:8px">The Inspector guards the gate. This looks at what has gone
      wrong <i>since</i> — listings that lost their tags, work that stalled, prices under the floor,
      decisions still waiting on you.</p>
      <div class="bar" style="border:0;padding-top:0">
        <button class="tiny" data-act="health">check the shop</button>
        <span style="flex:1"></span>
      </div>
      <div id="health-report"></div>

      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">teach an agent</h4>
      <div class="bar" style="border:0;padding-top:0">
        <select id="teach-agent">${agentOptions}</select>
        <span style="flex:1"></span>
        <button class="tiny" data-act="teach">teach it</button>
      </div>
      <textarea id="teach-text" placeholder="e.g. always use Monday as the first day of the week, or never propose anything with cartoon characters"></textarea>

      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">your house rules (${state.lessons.length})</h4>
      ${lessons}

      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">what they already know</h4>
      <p class="quiet" style="margin-bottom:8px">${state.knowledge.total} lessons from ${
        state.knowledge.packs.length
      } knowledge packs that ship with the project${
        state.knowledge.removed ? `, and ${state.knowledge.removed} you have removed` : ''
      }. Click a pack to read it.</p>
      ${state.knowledge.packs
        .map(
          (pack) => `<div class="lesson">
            <div><b>${esc(pack.agent)}</b><br />${esc(pack.title)} — ${esc(pack.summary)}</div>
            <button class="tiny" data-pack="${esc(pack.agent)}">${pack.active} lessons</button>
          </div>`
        )
        .join('')}
      ${
        state.knowledge.removed
          ? `<div class="actions" style="margin-top:10px"><button class="tiny" data-act="restore">bring back the ${state.knowledge.removed} I removed</button></div>`
          : ''
      }
      <div id="pack-reader"></div>

      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">recent jobs</h4>
      ${jobs || '<p class="quiet">Nothing has run yet.</p>'}
    `,
    mount(root) {
      root.addEventListener('click', async (e) => {
        // Read one agent's knowledge on demand rather than shipping ~280
        // lessons in every state refresh.
        const packAgent = e.target.dataset?.pack;
        if (packAgent) {
          const reader = root.querySelector('#pack-reader');
          if (reader.dataset.open === packAgent) {
            reader.innerHTML = '';
            reader.dataset.open = '';
            return;
          }
          const { name, lessons: known } = await api.knowledge(
            packAgent === 'everyone' ? 'everyone' : packAgent
          );
          reader.dataset.open = packAgent;
          reader.innerHTML = `
            <h4 style="margin:14px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">${esc(
              name
            )} knows ${known.length} things</h4>
            ${known
              .map(
                (l) => `<div class="lesson"><div>${esc(l.text)}</div>
                  <button class="tiny danger" data-forget="${esc(l.id)}">forget</button></div>`
              )
              .join('')}`;
          return;
        }
        const forget = e.target.dataset?.forget;
        if (forget) {
          await api.forget(forget);
          ctx.toast('forgotten');
          return ctx.refresh(true);
        }
        const act = e.target.dataset?.act;
        if (!act) return;
        if (act === 'tick') {
          const { worked } = await api.tick();
          ctx.toast(worked ? 'one job done' : 'nothing waiting');
        }
        // Refresh so the tile and its buttons show what the loop is actually
        // doing, rather than leaving a "start loop" button lit on a running loop.
        if (act === 'loop-on') {
          await api.loop(true);
          ctx.toast('loop running');
          return ctx.refresh(true);
        }
        if (act === 'loop-off') {
          await api.loop(false);
          ctx.toast('loop paused');
          return ctx.refresh(true);
        }
        if (act === 'health') {
          const holder = root.querySelector('#health-report');
          holder.innerHTML = '<p class="quiet">looking…</p>';
          const report = await api.health();
          if (!report.findings.length) {
            holder.innerHTML = '<p class="quiet">Nothing wrong that I can see.</p>';
            return;
          }
          const colour = { bad: 'var(--rose)', poor: 'var(--amber)', note: 'var(--dim)' };
          holder.innerHTML = `
            <p style="margin:8px 0;color:${colour[report.score]}">${esc(report.summary)}</p>
            ${report.findings
              .map(
                (f) => `<div class="lesson">
                  <div><b style="color:${colour[f.severity]}">${esc(f.area)}</b> ${esc(f.what)}
                  <br /><span class="quiet">${esc(f.fix)}</span></div>
                </div>`
              )
              .join('')}`;
          return;
        }
        if (act === 'restore') {
          const { added } = await api.restoreKnowledge();
          ctx.toast(`${added} restored`);
          return ctx.refresh(true);
        }
        if (act === 'teach') {
          const text = root.querySelector('#teach-text').value.trim();
          if (!text) return ctx.toast('write the lesson first');
          await api.teach(root.querySelector('#teach-agent').value || null, text);
          root.querySelector('#teach-text').value = '';
          ctx.toast('taught');
          ctx.refresh(true);
        }
      });
    },
  };
}

// --- products ------------------------------------------------------------

function productCard(product, state, opts = {}) {
  const currency = state.shop.currency;
  const previews = (opts.previews || [])
    .slice(0, 4)
    .map((p) => `<img src="/${esc(p)}" alt="page preview" loading="lazy" />`)
    .join('');

  return `
    <div class="tile" data-product="${esc(product.id)}" style="margin-bottom:10px">
      <div style="display:flex;align-items:baseline;gap:8px;justify-content:space-between">
        <h4>${esc(product.title)}</h4>
        <span class="stage-chip ${esc(product.status === 'blocked' ? 'blocked' : product.stage)}">${esc(
          product.status === 'blocked' ? 'blocked' : product.stage
        )}</span>
      </div>
      <p>${esc(product.sku)} · ${product.pages || '?'} pages · ${money(product.price, currency)}
        ${product.listing?.tags?.length ? `· ${product.listing.tags.length} tags` : ''}</p>
      ${previews ? `<div class="previews">${previews}</div>` : ''}
      ${opts.extra || ''}
      <div class="actions">
        ${opts.actions || ''}
        ${
          product.listing
            ? `<button class="tiny" data-relist="${esc(product.id)}"
                 title="Delete the Etsy draft if it is still there, then create a fresh one">send to etsy</button>`
            : ''
        }
        <button class="tiny" data-open="${esc(product.id)}">open the folder</button>
        <button class="tiny" data-rebuild="${esc(product.id)}">rebuild files</button>
      </div>
    </div>`;
}

function wireProducts(root, ctx) {
  root.addEventListener('click', async (e) => {
    const rebuild = e.target.dataset?.rebuild;
    if (rebuild) {
      await api.rebuild(rebuild);
      ctx.toast('back to the workshop');
      return ctx.refresh(true);
    }
    const open = e.target.dataset?.open;
    if (open) {
      const detail = await api.product(open);
      window.open(`/out/${detail.dir}/`, '_blank');
      return;
    }
    const relist = e.target.dataset?.relist;
    if (relist) {
      e.target.disabled = true;
      e.target.textContent = 'sending…';
      try {
        const { note } = await api.relist(relist);
        ctx.toast(note || 'queued for Etsy');
      } catch (err) {
        ctx.toast(err.message);
      }
      e.target.disabled = false;
      e.target.textContent = 'send to etsy';
      return ctx.refresh(true);
    }
    const png = e.target.dataset?.png;
    if (png) {
      e.target.disabled = true;
      e.target.textContent = 'rendering…';
      try {
        const saved = await savePngs(png);
        ctx.toast(`${saved} png${saved === 1 ? '' : 's'} saved`);
      } catch (err) {
        ctx.toast(err.message);
      }
      e.target.disabled = false;
      e.target.textContent = 'save pngs';
    }
  });
}

/**
 * Turn the SVG listing images into the PNGs Etsy accepts, in the browser.
 * No paid tools, no headless anything — the canvas does it for free.
 */
async function savePngs(productId) {
  const detail = await api.product(productId);
  const mockups = detail.assets.filter((a) => a.role === 'mockup' && a.kind === 'svg');
  const images = [];
  for (const mockup of mockups) {
    const svg = await (await fetch(`/${mockup.path}`)).text();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('could not render that image'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 2400;
    canvas.height = img.naturalHeight || 1800;
    const ctx2d = canvas.getContext('2d');
    ctx2d.fillStyle = '#ffffff';
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    images.push({ name: mockup.label, dataUrl: canvas.toDataURL('image/png') });
  }
  if (!images.length) throw new Error('no listing images to convert');
  const { saved } = await api.saveMockups(productId, images);
  return saved.length;
}

function workshopPanel(state, ctx) {
  const products = state.products.filter((p) => ['research', 'design'].includes(p.stage));
  return {
    html: products.length
      ? products.map((p) => productCard(p, state)).join('')
      : '<p class="quiet">The bench is clear. Approve an idea at the Research Bench and the Maker will start on it.</p>',
    mount: (root) => wireProducts(root, ctx),
  };
}

function reviewPanel(state, ctx) {
  const products = state.products.filter((p) => ['copy', 'review', 'ready'].includes(p.stage));
  const pending = state.attention.filter((a) => a.kind === 'listing' || a.kind === 'question');

  return {
    html: `
      ${
        pending.length
          ? pending
              .map(
                (a) => `
        <div class="card hot">
          <div class="card-head"><span class="dot"></span><span class="card-who">${esc(a.agent || 'valley')}</span></div>
          <p class="card-body">${esc(a.title)}</p>
          <pre style="max-height:180px">${esc(a.detail || '')}</pre>
          <div class="actions">
            ${a.options
              .map(
                (o) =>
                  `<button class="tiny" data-answer="${esc(a.id)}" data-value="${esc(o.value)}">${esc(o.label)}</button>`
              )
              .join('')}
          </div>
        </div>`
              )
              .join('')
          : ''
      }
      ${
        products.length
          ? products.map((p) => productCard(p, state)).join('')
          : '<p class="quiet">Nothing waiting to be checked.</p>'
      }

      ${
        (state.failures || []).length
          ? `<h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">what keeps going wrong</h4>
             <p class="quiet" style="margin-bottom:8px">The second time the Inspector sees one of these
             it teaches the agent responsible, so it stops happening. The lessons it writes are in the
             Office and you can delete any you disagree with.</p>
             ${state.failures
               .map(
                 (f) =>
                   `<div class="lesson"><div><b>${esc(f.agent || 'unassigned')}</b><br />${esc(
                     f.example || f.pattern
                   )}</div><span>×${f.times}</span></div>`
               )
               .join('')}`
          : ''
      }`,
    mount(root) {
      wireProducts(root, ctx);
      root.addEventListener('click', async (e) => {
        const id = e.target.dataset?.answer;
        if (!id) return;
        await api.answer(id, e.target.dataset.value);
        ctx.toast('noted');
        ctx.refresh(true);
      });
    },
  };
}

/**
 * A listing as a buyer meets it, not as a row of numbers.
 *
 * Etsy shows a thumbnail about 230px wide with the title clipped under it, and
 * that is the whole of the decision for most people. "Only 6 tags" and "title
 * is 132 characters" are true but abstract; seeing your own title cut off
 * mid-word next to a picture you cannot read is not. This renders the search
 * result at the size it will actually appear.
 */
const ETSY_THUMB = 230;
const ETSY_TITLE_CLIP = 60; // roughly what survives under a search thumbnail

function searchPreview(product, state) {
  const listing = product.listing;
  if (!listing) return '';
  const title = String(listing.title || product.title);
  const clipped = title.length > ETSY_TITLE_CLIP ? `${title.slice(0, ETSY_TITLE_CLIP - 1)}…` : title;
  const lost = title.length > ETSY_TITLE_CLIP ? title.slice(ETSY_TITLE_CLIP - 1) : '';

  return `
    <div class="preview">
      <div class="preview-card" style="width:${ETSY_THUMB}px">
        <img src="/${esc(product.dir ? `out/${product.dir}/images/1-hero.svg` : '')}"
             alt="" width="${ETSY_THUMB}" height="${Math.round(ETSY_THUMB * 0.8)}"
             style="object-fit:cover;background:var(--panel-2);display:block" />
        <p class="preview-title">${esc(clipped)}</p>
        <p class="preview-price">${money(listing.price, state.shop.currency)}</p>
      </div>
      <div class="preview-notes">
        <p class="quiet">This is roughly what a buyer sees in search: ${ETSY_THUMB}px wide, one second of
        attention, forty others beside it.</p>
        ${
          lost
            ? `<p class="quiet">Cut off in search: <span style="color:var(--rose)">${esc(lost)}</span>
               — put what matters in the first ${ETSY_TITLE_CLIP} characters.</p>`
            : '<p class="quiet">The whole title survives the crop.</p>'
        }
        <p class="quiet">${(listing.tags || []).length} of 13 tags used.</p>
      </div>
    </div>`;
}

function shopfrontPanel(state, ctx) {
  // Blocked products belong here too. A listing held back because its images
  // would not render is finished work earning nothing, and the Shopkeeper tells
  // you to come to the Shopfront and press "send to etsy" — so it has to be
  // here to press.
  const products = state.products.filter(
    (p) => p.stage === 'listed' || p.listing?.status === 'live' || (p.status === 'blocked' && p.listing)
  );
  return {
    html: products.length
      ? products
          .map((p) =>
            productCard(p, state, {
              extra: searchPreview(p, state),
              actions: `
                ${
                  p.listing?.exportPath
                    ? `<a class="tiny" style="text-decoration:none;padding:4px 7px;border:1px solid var(--line)"
                        href="/${esc(p.listing.exportPath)}/LISTING.md" target="_blank">listing.md</a>`
                    : ''
                }
                <button class="tiny" data-png="${esc(p.id)}">save pngs</button>
                ${
                  p.listing?.etsyListingId
                    ? `<a class="tiny" style="text-decoration:none;padding:4px 7px;border:1px solid var(--line)"
                        href="https://www.etsy.com/listing/${esc(p.listing.etsyListingId)}" target="_blank">on etsy</a>`
                    : p.listing
                      ? `<button class="tiny" data-url="${esc(p.listing.id)}">paste etsy url</button>`
                      : ''
                }`,
            })
          )
          .join('')
      : '<p class="quiet">Nothing in the shop yet. Approve a finished product in the Review Hall.</p>',
    mount(root) {
      wireProducts(root, ctx);
      root.addEventListener('click', async (e) => {
        const listingId = e.target.dataset?.url;
        if (!listingId) return;
        const url = prompt('Paste the Etsy listing URL');
        if (!url) return;
        try {
          await api.setListingUrl(listingId, url);
          ctx.toast('linked');
          ctx.refresh(true);
        } catch (err) {
          ctx.toast(err.message);
        }
      });
    },
  };
}

function libraryPanel(state, ctx) {
  const approved = state.ideas.approved;
  const shelved = state.ideas.shelved;
  const written = state.products.filter((p) => p.listing);

  const list = (ideas, empty) =>
    ideas.length
      ? ideas
          .map(
            (i) =>
              `<div class="lesson"><div><b>${esc(i.category)}</b><br />${esc(i.title)}</div>
               <span class="score" style="font-size:11px">${i.score ?? ''}</span></div>`
          )
          .join('')
      : `<p class="quiet">${empty}</p>`;

  return {
    html: `
      <h4 style="margin:0 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">waiting to be built (${approved.length})</h4>
      ${list(approved, 'Nothing approved and waiting.')}
      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">shelved for later (${shelved.length})</h4>
      ${list(shelved, 'Nothing shelved.')}
      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">listing copy written (${written.length})</h4>
      ${
        written.length
          ? written
              .map(
                (p) => `
            <div class="tile" style="margin-bottom:10px">
              <h4>${esc(p.listing.title)}</h4>
              <p>${esc(p.sku)} · ${money(p.listing.price, state.shop.currency)} ·
                ${p.listing.title.length}/140 characters</p>
              <div class="tagline">${(p.listing.tags || [])
                .map((t) => `<span class="tag">${esc(t)}</span>`)
                .join('')}</div>
            </div>`
              )
              .join('')
          : '<p class="quiet">Nothing written yet.</p>'
      }`,
  };
}

function calendarPanel(state) {
  const campaign = state.campaign;
  return {
    html: campaign
      ? `<div class="tile">
           <h4>${esc(campaign.name)}</h4>
           <p>Theme: ${esc(campaign.theme)}</p>
           <p>Runs until ${new Date(Number(campaign.ends_at)).toDateString()}.</p>
           <p>${esc(campaign.notes || '')}</p>
         </div>
         <p class="quiet" style="margin-top:12px">The Scout leans into this theme when it brings you
         ideas, because digital downloads sell on a calendar. Christmas planners sell in October.</p>`
      : '<p class="quiet">No season set yet. The Manager sets one on its next round.</p>',
  };
}

function ledgerPanel(state, ctx) {
  const currency = state.shop.currency;
  const insights = state.insights || {};
  const sellers = (insights.topSellers || []).filter((s) => Number(s.revenue) > 0);
  const quiet = insights.quietListings || [];
  const taste = (insights.taste || []).filter((t) => t.yes + t.no >= 2);

  return {
    html: `
      <div class="tile" style="margin-bottom:12px">
        <h4>${money(state.ledger.total, currency)}</h4>
        <p>${state.ledger.sales.length} sale${state.ledger.sales.length === 1 ? '' : 's'} recorded.
        ${
          state.shop.etsy.connected
            ? 'Etsy receipts sync automatically.'
            : 'Add sales by hand, or connect Etsy to sync receipts.'
        }</p>
        <p>Everything on this page is fed back into the agents' prompts, so the shop's own
        results steer what gets made next.</p>
      </div>

      ${
        sellers.length
          ? `<h4 style="margin:0 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">what actually sells</h4>
             ${sellers
               .map(
                 (s) =>
                   `<div class="lesson"><div><b>${esc(s.category)}</b><br />${esc(s.title)}</div>
                    <span>${s.sales} × ${money(s.revenue, currency)}</span></div>`
               )
               .join('')}`
          : ''
      }

      ${
        quiet.length
          ? `<h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">listed a month, no sales</h4>
             <p class="quiet">${quiet.map((q) => esc(q.title)).join(' · ')}</p>`
          : ''
      }

      ${
        taste.length
          ? `<h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">what you say yes to</h4>
             ${taste
               .map(
                 (t) =>
                   `<div class="lesson"><div><b>${esc(t.category)}</b><br />${esc(t.verdict)}</div>
                    <span>${t.yes} yes · ${t.no} no</span></div>`
               )
               .join('')}`
          : ''
      }

      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">record a sale</h4>
      <div class="bar" style="border:0">
        <input type="text" id="sale-sku" placeholder="sku" style="width:110px" />
        <input type="number" id="sale-amount" placeholder="amount" step="0.01" style="width:100px" />
        <button class="tiny" data-act="sale">record it</button>
      </div>
      ${
        state.ledger.sales.length
          ? state.ledger.sales
              .map(
                (s) =>
                  `<div class="lesson"><div><b>${esc(s.sku || 'sale')}</b><br />${new Date(
                    Number(s.occurred_at)
                  ).toDateString()}</div><span>${money(s.amount, s.currency || currency)}</span></div>`
              )
              .join('')
          : '<p class="quiet">No sales yet. It takes a few weeks for new listings to get found.</p>'
      }`,
    mount(root) {
      root.addEventListener('click', async (e) => {
        if (e.target.dataset?.act !== 'sale') return;
        const sku = root.querySelector('#sale-sku').value.trim();
        const amount = Number(root.querySelector('#sale-amount').value);
        if (!(amount > 0)) return ctx.toast('what amount?');
        await api.recordSale({ sku, amount });
        ctx.toast('recorded');
        ctx.refresh(true);
      });
    },
  };
}

function packhousePanel(state, ctx) {
  const proposals = state.proposals || [];
  const bundles = state.products.filter((p) => p.category === 'Bundles');
  const variants = state.ideas.proposed.filter((i) => / — /.test(i.title));

  return {
    html: `
      <p class="quiet" style="margin-bottom:14px">Bundles need no new design work: the Curator merges
      pages from products you already sell, prices the set about 30% under buying them separately,
      and it goes through the Scribe and the Inspector like anything else.</p>

      ${
        proposals.length
          ? proposals
              .map((p) => {
                const approval = state.attention.find((a) => a.refId === p.id);
                return `
          <div class="tile" style="margin-bottom:10px">
            <h4>${esc(p.title)}</h4>
            <p>${esc(p.detail || '').split('\n').map(esc).join('<br />')}</p>
            <p><b style="color:var(--amber)">${money(p.payload?.price, state.shop.currency)}</b>
              instead of ${money(p.payload?.separate, state.shop.currency)} ·
              status ${esc(p.status)}</p>
            ${
              approval
                ? `<div class="actions">${approval.options
                    .map(
                      (o) =>
                        `<button class="tiny" data-answer="${esc(approval.id)}" data-value="${esc(
                          o.value
                        )}">${esc(o.label)}</button>`
                    )
                    .join('')}</div>`
                : ''
            }
          </div>`;
              })
              .join('')
          : '<p class="quiet">No bundles suggested yet. The Curator needs at least two finished products in the same category.</p>'
      }

      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">bundles built (${bundles.length})</h4>
      ${
        bundles.length
          ? bundles.map((p) => productCard(p, state)).join('')
          : '<p class="quiet">None yet.</p>'
      }

      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">spin-offs waiting at the bench (${variants.length})</h4>
      ${
        variants.length
          ? variants
              .map(
                (i) =>
                  `<div class="lesson"><div><b>${esc(i.category)}</b><br />${esc(i.title)}</div>
                   <span class="score" style="font-size:11px">${i.score ?? ''}</span></div>`
              )
              .join('')
          : '<p class="quiet">None. The Curator only spins off products that have proven themselves.</p>'
      }`,
    mount(root) {
      wireProducts(root, ctx);
      root.addEventListener('click', async (e) => {
        const id = e.target.dataset?.answer;
        if (!id) return;
        await api.answer(id, e.target.dataset.value);
        ctx.toast('noted');
        ctx.refresh(true);
      });
    },
  };
}

/**
 * Everything standing between the shop and being found.
 *
 * Grouped by what it costs rather than by listing: an owner with ten minutes
 * wants the thing losing them searches, not a tidy per-product report.
 */
function signpostPanel(state, ctx) {
  const report = state.seo;
  const colour = { bad: 'var(--rose)', poor: 'var(--amber)', note: 'var(--dim)' };
  const heading = { bad: 'costing you searches', poor: 'worth fixing', note: 'worth knowing' };

  const explain = `<p class="quiet" style="margin-top:16px">The Signwriter never rewrites a live
    listing itself. Changing one resets what Etsy has learned about it, so it says what to change and
    leaves the timing to you — and it stays quiet about anything edited in the last four weeks.</p>`;

  if (!report) {
    return {
      html: `<p class="quiet">The Signwriter has not read the shop yet. It sweeps every few hours on
        its own, or send it now.</p>
        <div class="bar" style="border:0"><button class="tiny" data-act="seo">check the shop's search</button></div>
        ${explain}`,
      mount: (root) => wireSeo(root, ctx),
    };
  }

  const groups = ['bad', 'poor', 'note']
    .map((severity) => {
      const items = (report.findings || []).filter((f) => f.severity === severity);
      if (!items.length) return '';
      return `
        <h4 style="margin:16px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:${colour[severity]}">
          ${heading[severity]} (${items.length})</h4>
        ${items
          .map(
            (f) => `<div class="lesson"><div>
              ${f.sku ? `<b>${esc(f.sku)}</b> ` : ''}<b style="color:${colour[severity]}">${esc(f.area)}</b><br />
              ${esc(f.what)}<br /><span class="quiet">${esc(f.fix)}</span>
            </div></div>`
          )
          .join('')}`;
    })
    .join('');

  return {
    html: `
      <div class="bar">
        <span class="quiet" style="flex:1">${esc(report.summary || '')}${
          report.at ? ` · last read ${esc(when(report.at))}` : ''
        }</span>
        <button class="tiny" data-act="seo">check again</button>
      </div>
      ${groups || '<p class="quiet">Nothing is hurting your search position. That is the goal, not an empty page.</p>'}
      ${explain}`,
    mount: (root) => wireSeo(root, ctx),
  };
}

function wireSeo(root, ctx) {
  root.addEventListener('click', async (e) => {
    if (e.target.dataset?.act !== 'seo') return;
    e.target.disabled = true;
    e.target.textContent = 'reading…';
    try {
      const report = await api.checkSeo();
      ctx.toast(report.summary || 'done');
    } catch (err) {
      ctx.toast(err.message);
    }
    e.target.disabled = false;
    e.target.textContent = 'check again';
    ctx.refresh(true);
  });
}

function lookoutPanel(state) {
  const withResearch = state.products.filter((p) => p.stage !== 'research');
  return {
    html: `
      <div class="tile" style="margin-bottom:12px">
        <h4>What to list right now</h4>
        <p>${esc(state.counts.lookout || 'The Researcher has not been up here yet today.')}</p>
      </div>
      ${
        withResearch.length
          ? withResearch
              .map(
                (p) => `<div class="tile" style="margin-bottom:10px">
                  <h4>${esc(p.title)}</h4>
                  <p>${esc(p.sku)} · ${esc(p.stage)}</p>
                  <div class="tagline">${(p.listing?.tags || [])
                    .map((t) => `<span class="tag">${esc(t)}</span>`)
                    .join('')}</div>
                </div>`
              )
              .join('')
          : '<p class="quiet">Nothing researched yet.</p>'
      }`,
  };
}

export default renderStation;
