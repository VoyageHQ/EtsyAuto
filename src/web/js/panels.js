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
};

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
          <p>Ticking ${state.shop.autoLoop ? 'automatically' : 'only when you say so'}.</p>
          <div class="actions">
            <button class="tiny" data-act="tick">do one job now</button>
            <button class="tiny" data-act="loop-on">start loop</button>
            <button class="tiny" data-act="loop-off">pause loop</button>
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
      </div>

      <h4 style="margin:0 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">teach an agent</h4>
      <div class="bar" style="border:0;padding-top:0">
        <select id="teach-agent">${agentOptions}</select>
        <span style="flex:1"></span>
        <button class="tiny" data-act="teach">teach it</button>
      </div>
      <textarea id="teach-text" placeholder="e.g. always use Monday as the first day of the week, or never propose anything with cartoon characters"></textarea>

      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">house rules</h4>
      ${lessons}

      <h4 style="margin:18px 0 8px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)">recent jobs</h4>
      ${jobs || '<p class="quiet">Nothing has run yet.</p>'}
    `,
    mount(root) {
      root.addEventListener('click', async (e) => {
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
        if (act === 'loop-on') {
          await api.loop(true);
          ctx.toast('loop running');
        }
        if (act === 'loop-off') {
          await api.loop(false);
          ctx.toast('loop paused');
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
      <div class="actions">
        ${opts.actions || ''}
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

function shopfrontPanel(state, ctx) {
  const products = state.products.filter((p) => p.stage === 'listed' || p.listing?.status === 'live');
  return {
    html: products.length
      ? products
          .map((p) =>
            productCard(p, state, {
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
      </div>
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
