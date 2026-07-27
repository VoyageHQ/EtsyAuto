// Everything that turns a folder of files into a business somebody can reach
// and pay.
//
// The Builder used to produce a Node server that ran on localhost and appended
// signups to a JSON file. That is a demo. Nobody can reach it, it takes no
// money, and it stops when the laptop closes — three properties that between
// them mean "not a business", however good the idea is.
//
// What this adds:
//
//   worker.js       the API, on Cloudflare's free tier: 100k requests a day,
//                   no card, no cold start. Signups go to KV.
//   wrangler.toml   so deploying is one command rather than a decision.
//   pricing.html    a real page with a real payment link on it.
//   DEPLOY.md       the exact steps, in order, with the free tiers named.
//   SELL.md         where the first customer actually comes from — the part
//                   everybody skips and then wonders why nothing happened.
//   deploy.yml      push to main, it goes live. Free for a public repo.
//
// The one rule running through all of it: **it has to work before the owner
// has signed up for anything.** The signup form posts to the Worker if there
// is one, falls back to a form service if that is configured, and falls back
// again to a mailto: link that needs no account at all. A business that
// requires three signups before it can take its first email is a business
// that never takes its first email.
import { slug, money } from '../core/util.js';
import config from '../core/config.js';
import { FREE_STACK, CHECKED } from './freetier.js';

const esc = (text) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The API, as a Cloudflare Worker.
 *
 * Deliberately tiny and dependency-free: it collects an email, stores it, and
 * refuses everything else. Every line it does not have is a line that cannot
 * leak somebody's address.
 */
export function worker(venture) {
  const name = venture.name;
  return `// ${name} — the API.
//
// Runs on Cloudflare Workers' free tier: 100,000 requests a day, no card.
// Signups go into KV. That is the whole backend, and it is enough to reach a
// few thousand customers.
//
//   npx wrangler deploy
//
// Two bindings, both set up in DEPLOY.md:
//   SIGNUPS   a KV namespace
//   NOTIFY    (optional) your email, so a signup pings you

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });

// Deliberately loose. A regex that rejects a valid address costs you a
// customer; one that accepts a typo costs you nothing you had.
const looksLikeEmail = (value) =>
  typeof value === 'string' && value.length < 200 && /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(value);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    if (url.pathname !== '/api/waitlist' || request.method !== 'POST') {
      return json({ error: 'not found' }, 404);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'send JSON' }, 400);
    }

    const email = String(body?.email || '').trim().toLowerCase();
    if (!looksLikeEmail(email)) return json({ error: 'that does not look like an email' }, 400);

    // Keyed by email so signing up twice is not two records. Somebody who
    // comes back a week later and signs up again is interested, not a
    // duplicate — the timestamp moves, the record does not multiply.
    const record = {
      email,
      tier: String(body?.tier || '').slice(0, 40) || null,
      note: String(body?.note || '').slice(0, 500) || null,
      at: new Date().toISOString(),
      // Which page they came from, so you know what actually brings people in.
      from: String(request.headers.get('referer') || '').slice(0, 200) || null,
    };

    if (env.SIGNUPS) {
      const existing = await env.SIGNUPS.get(email, 'json');
      await env.SIGNUPS.put(email, JSON.stringify({ ...record, first: existing?.first || record.at }));
    }

    return json({ ok: true });
  },
};
`;
}

export function wranglerConfig(venture) {
  const project = slug(venture.name, 40) || 'venture';
  return `# ${venture.name} — deploy config.
#
# Everything here is on Cloudflare's free tier as of ${CHECKED}: no card, no
# monthly fee. DEPLOY.md has the four commands.

name = "${project}"
main = "worker.js"
compatibility_date = "${new Date().toISOString().slice(0, 10)}"

# Created by: npx wrangler kv namespace create SIGNUPS
# Paste the id it prints here.
[[kv_namespaces]]
binding = "SIGNUPS"
id = "PASTE_THE_ID_FROM_WRANGLER_HERE"

[observability]
enabled = true
`;
}

/**
 * The pricing page.
 *
 * A separate page rather than a section, because it is the page you send
 * somebody who has already said yes, and because it is the one that has to be
 * linkable on its own.
 */
export function pricingPage(venture) {
  const m = venture.monetisation || {};
  const tiers = m.tiers?.length
    ? m.tiers
    : [{ name: 'Standard', price: m.price, per: m.model === 'one-off' ? 'once' : 'month', includes: 'Everything' }];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pricing — ${esc(venture.name)}</title>
<meta name="description" content="What ${esc(venture.name)} costs." />
<link rel="stylesheet" href="/styles.css" />
</head>
<body>
<main>
  <p class="micro"><a href="/">← ${esc(venture.name)}</a></p>
  <h1>Pricing</h1>
  <p class="lead">${esc(m.firstPoundPath || 'Pay once, use it straight away.')}</p>

  <div class="tiers">
    ${tiers
      .map(
        (t) => `<div class="tier">
      <h3>${esc(t.name)}</h3>
      <p class="price">${esc(String(t.price ?? m.price ?? ''))}<span class="micro"> / ${esc(t.per || 'month')}</span></p>
      <p>${esc(t.includes || '')}</p>
      <!-- Replace this href with your Stripe Payment Link. DEPLOY.md, step 4.
           Until you do, it goes to the waitlist, which is the honest fallback:
           better to collect an address than to take somebody to a dead page. -->
      <a class="buy" data-tier="${esc(slug(t.name))}" href="/#signup">Get ${esc(t.name)}</a>
    </div>`
      )
      .join('')}
  </div>

  <h2>Questions people ask before paying</h2>
  <dl class="faq">
    <dt>Can I get my data out?</dt>
    <dd>Yes, as a CSV, whenever you like. It is your data.</dd>
    <dt>What if it does not do what I need?</dt>
    <dd>Email me and I will refund you. It is early — that is the deal.</dd>
    <dt>Who is behind this?</dt>
    <dd>One person. You will be emailing me directly, not a support queue.</dd>
  </dl>

  <p class="micro">Prices in your local currency at checkout. No subscription tricks — cancel from the receipt email.</p>
</main>
</body>
</html>
`;
}

/** The signup script, which works before the owner has signed up for anything. */
export function signupScript() {
  return `// Waitlist capture, in three descending degrees of setup.
//
// 1. The Worker, if API_BASE is set below. Free tier, no card.
// 2. A form service, if FORM_ENDPOINT is set. Also free.
// 3. mailto:, which needs nothing at all and always works.
//
// The point of the third one is that this page can collect its first
// interested person the minute it is online, before any account exists. A
// business that needs three signups before it can take an email usually never
// takes one.

const API_BASE = '';        // e.g. 'https://your-project.workers.dev'
const FORM_ENDPOINT = '';   // e.g. a Formspree or Web3Forms URL
const CONTACT_EMAIL = '';   // your address, for the last-resort fallback

const form = document.getElementById('signup');
const note = document.getElementById('signup-note');
const tierOf = () => sessionStorage.getItem('tier') || null;

async function send(email) {
  const payload = { email, tier: tierOf() };

  if (API_BASE) {
    const res = await fetch(API_BASE + '/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    return 'saved';
  }

  if (FORM_ENDPOINT) {
    const res = await fetch(FORM_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    return 'saved';
  }

  if (CONTACT_EMAIL) {
    const subject = encodeURIComponent('Early access please');
    const body = encodeURIComponent('My email: ' + email + (tierOf() ? '\\nInterested in: ' + tierOf() : ''));
    window.location.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + subject + '&body=' + body;
    return 'mail';
  }

  throw new Error('nowhere to send it yet');
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = String(new FormData(form).get('email') || '').trim();
  if (!email.includes('@') || !email.includes('.')) {
    note.textContent = 'That does not look like an email address.';
    return;
  }
  note.textContent = 'One moment…';
  try {
    const how = await send(email);
    form.reset();
    note.textContent =
      how === 'mail'
        ? 'Your email app should be opening — send that message and you are on the list.'
        : 'You are on the list. Thank you.';
  } catch (err) {
    // Never a dead end. If the plumbing is not set up, say so plainly rather
    // than showing a stranger a generic failure.
    note.textContent = CONTACT_EMAIL
      ? 'Something went wrong — email ' + CONTACT_EMAIL + ' and I will add you by hand.'
      : 'The signup form is not connected yet. See DEPLOY.md.';
  }
});

for (const button of document.querySelectorAll('.buy')) {
  button.addEventListener('click', () => {
    sessionStorage.setItem('tier', button.dataset.tier);
  });
}
`;
}

/** Push to main, it goes live. Free for a public repository. */
export function deployWorkflow(venture) {
  return `# Push to main and this goes live. GitHub Actions is free for public
# repositories, and well inside the free minutes for private ones at this size.
#
# One secret to add, once: Settings → Secrets → Actions → CLOUDFLARE_API_TOKEN
name: deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      # The site. Static files, unmetered on the free tier.
      - name: Publish the site
        run: npx wrangler@latest pages deploy public --project-name=${slug(venture.name, 40)}
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}

      # The API. Skipped cleanly if you have not set up KV yet, so a missing
      # binding does not fail the whole deploy and take the site down with it.
      - name: Publish the API
        run: |
          if grep -q PASTE_THE_ID wrangler.toml; then
            echo "KV namespace not set up yet — skipping the worker. See DEPLOY.md."
            exit 0
          fi
          npx wrangler@latest deploy
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
`;
}

export function deployDoc(venture) {
  const project = slug(venture.name, 40) || 'venture';
  return `# Putting ${venture.name} online

Four steps. None of them asks for a card, and the whole thing costs nothing to
run until somebody pays you.

Free tiers as of ${CHECKED} — confirm them before you rely on a number, because
they move:

${Object.entries(FREE_STACK)
  .map(([job, s]) => `- **${job}** — ${s.name}. ${s.free}`)
  .join('\n')}

## 1. The site, online in about two minutes

\`\`\`bash
npx wrangler pages deploy public --project-name=${project}
\`\`\`

It prints a URL ending \`.pages.dev\`. That is your site, on TLS, for nothing.
It will ask you to sign in with a browser the first time. No card.

## 2. Somewhere for signups to go

\`\`\`bash
npx wrangler kv namespace create SIGNUPS
\`\`\`

Copy the id it prints into \`wrangler.toml\`, replacing \`PASTE_THE_ID_FROM_WRANGLER_HERE\`.

\`\`\`bash
npx wrangler deploy
\`\`\`

That prints a \`.workers.dev\` URL. Put it in \`public/app.js\` as \`API_BASE\`,
redeploy the site, and the form is live.

**You can skip this entirely for now.** Put your own email address in
\`CONTACT_EMAIL\` in \`public/app.js\` instead and the form opens the visitor's
mail app. It is less tidy and it works today, which beats tidy and next week.

## 3. Reading your signups

\`\`\`bash
npx wrangler kv key list --binding=SIGNUPS
npx wrangler kv key get --binding=SIGNUPS "someone@example.com"
\`\`\`

## 4. Taking money

1. Open a Stripe account. No card, no monthly fee — they take a cut per
   transaction, so you pay only when you are paid.
2. Products → add a product → **Payment link**.
3. Paste the link into \`public/pricing.html\`, replacing the \`/#signup\` hrefs.

That is the whole payment system. No server, no PCI questions, no library.

## Keeping it live

Push to \`main\` and \`.github/workflows/deploy.yml\` republishes both. Add one
secret in the repository: **Settings → Secrets → Actions → \`CLOUDFLARE_API_TOKEN\`**
(Cloudflare → My Profile → API Tokens → *Edit Cloudflare Workers* template).

## What this deliberately does not do

- **No custom domain.** \`${project}.pages.dev\` is free and works. A domain is
  about £10 a year and worth buying once somebody has paid you, not before.
- **No analytics script.** Cloudflare's own dashboard shows requests for free
  and does not slow the page down or need a cookie banner.
- **No email sending.** Until there are enough signups that replying by hand is
  a chore, replying by hand is better — you learn what people actually want.
`;
}

/**
 * Where the first customer actually comes from.
 *
 * Every venture plan says "find customers" and none of them says how, so
 * nothing happens. This says how, for this specific venture, using the
 * evidence that started it.
 */
export function sellDoc(venture) {
  const evidence = (venture.evidence || []).slice(0, 5);
  const m = venture.monetisation || {};
  return `# Getting the first customer for ${venture.name}

Not a launch. A launch is for when you have something to launch to. This is
about the specific people who already told you they have this problem.

## The people who said it themselves

${
  evidence.length
    ? evidence
        .map(
          (e, i) => `${i + 1}. **${e.channel || e.source}** — "${e.quote}"
   ${e.url ? `<${e.url}>` : '(no link recorded)'}
   Reply to this person. Not with a pitch — with the answer to their problem,
   and a sentence at the end saying you built something for it.`
        )
        .join('\n\n')
    : 'No evidence was recorded, which is the first thing to fix. Go and find five people saying this in public before you build anything else.'
}

## The order to do it in

1. **Reply to the ${evidence.length || 'five'} above.** Individually, in the thread,
   helpfully. If your reply is useful even to someone who never clicks the
   link, you have done it right. If it is not, do not post it.
2. **Ask the ones who reply what they would pay.** Not "would you pay" —
   "what would you expect this to cost". The number tells you more than the yes.
3. **Charge the first ones.** ${
    m.price
      ? `${money(m.price, config.currency)}${m.model === 'one-off' ? ' once' : ' a month'}`
      : 'Whatever the answers to (2) converge on'
  }. A free pilot teaches you nothing about whether it is a business.
4. **Only then post anywhere public.** By that point you can write the post
   using the words your first customers used, which is the only reason the
   post will work.

## What not to do

- Do not post the same message in ten subreddits. It is the fastest way to get
  the domain banned, and it is what everybody does.
- Do not build the feature the first person asks for. Wait until three ask for
  the same one.
- Do not spend money on ads before you have sold ten by hand. You cannot buy
  your way out of not knowing why people buy.

## What "working" looks like

${venture.plan?.successMetric || '10 paying customers, or 50 signups from people who described the problem unprompted.'}

Below that, keep talking to people. Above it, build the second version.
`;
}

export default { worker, wranglerConfig, pricingPage, signupScript, deployWorkflow, deployDoc, sellDoc };
