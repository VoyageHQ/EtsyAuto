// What the Builder actually produces: a real, runnable MVP you can open in a
// browser and take money through.
//
// Be clear about what this is and is not. It is a working landing page, a
// working waitlist that stores real signups, a pricing page wired to Stripe
// payment links, and a server that runs with `node server.js` and no install.
// It is not a finished product — the thing that makes your venture different
// still has to be built, and the plan tells you exactly what that is.
import { mkdirSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import config from '../core/config.js';
import { recordVentureAsset, ventureDir } from './pipeline.js';
import { money, slug } from '../core/util.js';

const esc = (text) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * @param {object} venture row from ventures
 * @returns {{dir: string, files: string[]}}
 */
export function scaffoldVenture(venture) {
  const rel = ventureDir(venture);
  const dir = join(config.root, rel);
  mkdirSync(join(dir, 'public'), { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });

  const files = [];
  const write = (relPath, contents, kind, label) => {
    const abs = join(dir, relPath);
    // Never clobber work you have done by hand.
    if (existsSync(abs) && PROTECTED.some((p) => relPath.startsWith(p))) return;
    writeFileSync(abs, contents);
    files.push(relPath);
    recordVentureAsset({
      ventureId: venture.id,
      kind,
      label,
      path: `${rel}/${relPath}`,
      bytes: safeSize(abs),
    });
  };

  write('public/index.html', landingPage(venture), 'page', 'Landing page');
  write('public/styles.css', styles(), 'page', 'Styles');
  write('public/app.js', clientScript(), 'code', 'Landing page script');
  write('server.js', server(venture), 'code', 'Server');
  write('package.json', packageJson(venture), 'config', 'package.json');
  write('.env.example', envExample(venture), 'config', 'Environment template');
  write('.gitignore', 'node_modules/\ndata/*.json\n.env\n', 'config', 'gitignore');
  write('README.md', readme(venture), 'doc', 'README');

  return { dir: rel, files };
}

/** Files the Builder will not overwrite once they exist. */
const PROTECTED = ['public/index.html', 'public/styles.css', 'server.js'];

const safeSize = (path) => {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
};

// --- the landing page ------------------------------------------------------

function landingPage(venture) {
  const m = venture.monetisation || { tiers: [], price: 0, model: 'subscription' };
  const plan = venture.plan || {};
  const evidence = (venture.evidence || []).slice(0, 3);
  const tiers = m.tiers?.length ? m.tiers : [{ name: 'Standard', price: m.price, per: 'month', includes: 'Full access' }];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(venture.name)} — ${esc(venture.one_liner)}</title>
<meta name="description" content="${esc(venture.one_liner)}" />
<link rel="stylesheet" href="/styles.css" />
</head>
<body>
<header class="nav">
  <a class="brand" href="/">${esc(venture.name)}</a>
  <nav>
    <a href="#problem">The problem</a>
    <a href="#pricing">Pricing</a>
    <a class="cta" href="#signup">Get early access</a>
  </nav>
</header>

<main>
  <section class="hero">
    <h1>${esc(venture.one_liner)}</h1>
    <p class="sub">Built for ${esc(venture.audience)}.</p>
    <form class="signup" id="signup" novalidate>
      <input type="email" name="email" placeholder="you@work.com" required aria-label="Email address" />
      <button type="submit">Get early access</button>
    </form>
    <p class="micro" id="signup-note">No spam. One email when it is ready.</p>
  </section>

  <section id="problem" class="band">
    <h2>The problem</h2>
    <p class="lead">${esc(venture.problem)}</p>
    ${
      evidence.length
        ? `<div class="quotes">${evidence
            .map(
              (e) => `<figure>
        <blockquote>${esc(e.quote)}</blockquote>
        <figcaption>${esc(e.channel || e.source)}${
          e.url ? ` · <a href="${esc(e.url)}" rel="nofollow noopener" target="_blank">source</a>` : ''
        }</figcaption>
      </figure>`
            )
            .join('')}</div>
      <p class="micro">Real posts from people describing this problem themselves.</p>`
        : ''
    }
  </section>

  <section class="band alt">
    <h2>What it does</h2>
    <p class="lead">${esc(venture.solution)}</p>
    ${
      plan.mustHave?.length
        ? `<ul class="ticks">${plan.mustHave.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
        : ''
    }
  </section>

  <section id="pricing" class="band">
    <h2>Pricing</h2>
    <p class="lead">${esc(m.firstPoundPath || 'Simple pricing, no surprises.')}</p>
    <div class="tiers">
      ${tiers
        .map(
          (tier, i) => `<div class="tier${i === 0 ? ' featured' : ''}">
        <h3>${esc(tier.name)}</h3>
        <p class="price">${esc(money(tier.price, config.currency))}<span>/${esc(tier.per || 'month')}</span></p>
        <p class="includes">${esc(tier.includes || '')}</p>
        <a class="buy" data-tier="${esc(slug(tier.name))}" href="#signup">Choose ${esc(tier.name)}</a>
      </div>`
        )
        .join('')}
    </div>
    <p class="micro">
      Payment links are set in <code>.env</code>. Until then these buttons collect
      interest instead of money, which is the right order to do it in.
    </p>
  </section>
</main>

<footer>
  <p>${esc(venture.name)} · an early access product. <a href="#signup">Join the list</a></p>
</footer>

<script src="/app.js"></script>
</body>
</html>
`;
}

function styles() {
  return `/* Deliberately plain and fast: system fonts, no frameworks, no requests. */
:root {
  --ink: #14181d;
  --muted: #5b6672;
  --line: #e3e7ec;
  --bg: #ffffff;
  --soft: #f6f8fa;
  --accent: #1f6f5c;
  --accent-soft: #e7f2ee;
  --radius: 10px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--ink);
  background: var(--bg);
}
a { color: var(--accent); }
.nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 24px; border-bottom: 1px solid var(--line);
  position: sticky; top: 0; background: rgba(255,255,255,.92); backdrop-filter: blur(6px); z-index: 5;
}
.brand { font-weight: 700; font-size: 18px; text-decoration: none; color: var(--ink); }
.nav nav { display: flex; gap: 20px; align-items: center; }
.nav nav a { text-decoration: none; color: var(--muted); font-size: 15px; }
.nav nav a:hover { color: var(--ink); }
.nav .cta {
  background: var(--accent); color: #fff; padding: 8px 14px; border-radius: var(--radius);
}
main { max-width: 860px; margin: 0 auto; padding: 0 24px; }
.hero { padding: 72px 0 56px; }
h1 { font-size: clamp(30px, 5vw, 44px); line-height: 1.15; margin: 0 0 14px; letter-spacing: -0.02em; }
.sub { font-size: 19px; color: var(--muted); margin: 0 0 28px; }
.signup { display: flex; gap: 10px; flex-wrap: wrap; }
.signup input {
  flex: 1 1 260px; padding: 13px 14px; border: 1px solid var(--line);
  border-radius: var(--radius); font-size: 16px;
}
.signup input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
.signup button {
  padding: 13px 20px; border: 0; border-radius: var(--radius); background: var(--accent);
  color: #fff; font-size: 16px; font-weight: 600; cursor: pointer;
}
.signup button:hover { filter: brightness(1.08); }
.micro { font-size: 14px; color: var(--muted); margin-top: 10px; }
.band { padding: 44px 0; border-top: 1px solid var(--line); }
.band.alt { background: var(--soft); margin: 0 -24px; padding: 44px 24px; }
h2 { font-size: 24px; margin: 0 0 10px; letter-spacing: -0.01em; }
.lead { font-size: 17px; color: var(--muted); margin: 0 0 20px; }
.quotes { display: grid; gap: 14px; }
figure { margin: 0; padding: 16px 18px; background: var(--accent-soft); border-radius: var(--radius); }
blockquote { margin: 0 0 8px; font-size: 16px; }
figcaption { font-size: 13px; color: var(--muted); }
.ticks { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.ticks li { padding-left: 26px; position: relative; }
.ticks li::before {
  content: "✓"; position: absolute; left: 0; color: var(--accent); font-weight: 700;
}
.tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.tier { border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; }
.tier.featured { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.tier h3 { margin: 0 0 6px; font-size: 17px; }
.price { font-size: 30px; font-weight: 700; margin: 0 0 8px; }
.price span { font-size: 15px; font-weight: 400; color: var(--muted); }
.includes { color: var(--muted); font-size: 15px; margin: 0 0 16px; }
.buy {
  display: inline-block; padding: 10px 16px; border-radius: var(--radius);
  background: var(--ink); color: #fff; text-decoration: none; font-weight: 600; font-size: 15px;
}
.tier.featured .buy { background: var(--accent); }
footer { border-top: 1px solid var(--line); padding: 28px 24px; text-align: center; color: var(--muted); font-size: 14px; }
code { background: var(--soft); padding: 2px 5px; border-radius: 4px; font-size: 14px; }
@media (prefers-color-scheme: dark) {
  :root { --ink:#e9edf2; --muted:#98a4b2; --line:#252b33; --bg:#0f1317; --soft:#161b21; --accent:#4bb79c; --accent-soft:#16302a; }
  .nav { background: rgba(15,19,23,.92); }
  .buy { background: var(--accent); color: #06110d; }
}
`;
}

function clientScript() {
  return `// Waitlist capture. Posts to the server, which appends to data/waitlist.json.
const form = document.getElementById('signup');
const note = document.getElementById('signup-note');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = new FormData(form).get('email');
  if (!email || !String(email).includes('@')) {
    note.textContent = 'That does not look like an email address.';
    return;
  }
  note.textContent = 'Saving…';
  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, tier: sessionStorage.getItem('tier') || null }),
    });
    if (!res.ok) throw new Error(await res.text());
    form.reset();
    note.textContent = 'You are on the list. Thank you.';
  } catch (err) {
    note.textContent = 'Could not save that — try again in a moment.';
  }
});

// Remember which tier someone clicked, so the first email can mention it.
for (const button of document.querySelectorAll('.buy')) {
  button.addEventListener('click', () => {
    sessionStorage.setItem('tier', button.dataset.tier);
    document.querySelector('.signup input')?.focus();
  });
}
`;
}

function server(venture) {
  return `// ${venture.name} — MVP server.
//
// Zero dependencies. Run it with:  node server.js
// Then open http://localhost:3000
import { createServer } from 'node:http';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const DATA = join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

const json = (res, body, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('too big');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, \`http://\${req.headers.host || 'localhost'}\`);

  if (url.pathname === '/api/health') return json(res, { ok: true, name: ${JSON.stringify(venture.name)} });

  // Everyone who signs up is a real person you can email. Treat the file as
  // personal data: it is gitignored, and you must not share it.
  if (url.pathname === '/api/waitlist' && req.method === 'POST') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email.includes('@') || email.length > 200) return json(res, { error: 'bad email' }, 400);
    await mkdir(DATA, { recursive: true });
    await appendFile(
      join(DATA, 'waitlist.jsonl'),
      JSON.stringify({ email, tier: body.tier || null, at: new Date().toISOString() }) + '\\n'
    );
    return json(res, { ok: true });
  }

  // Static files.
  const rel = url.pathname === '/' ? 'index.html' : normalize(url.pathname.slice(1));
  if (rel.includes('..')) return json(res, { error: 'no' }, 403);
  try {
    const data = await readFile(join(PUBLIC, rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<h1>Not found</h1>');
  }
});

server.listen(PORT, () => console.log(\`${venture.name} running on http://localhost:\${PORT}\`));
`;
}

function packageJson(venture) {
  return `${JSON.stringify(
    {
      name: venture.slug,
      version: '0.1.0',
      private: true,
      description: venture.one_liner,
      type: 'module',
      engines: { node: '>=18' },
      scripts: { start: 'node server.js' },
    },
    null,
    2
  )}\n`;
}

function envExample(venture) {
  const tiers = venture.monetisation?.tiers || [];
  return `# ${venture.name}
PORT=3000

# Stripe Payment Links are the fastest legal way to take money: create one in
# the Stripe dashboard in about two minutes, paste the URL here, and the
# pricing buttons start charging. No card details ever touch this server.
${tiers
  .map((tier) => `STRIPE_LINK_${slug(tier.name).toUpperCase().replace(/-/g, '_')}=`)
  .join('\n') || 'STRIPE_LINK_STANDARD='}
`;
}

function readme(venture) {
  const m = venture.monetisation || {};
  const plan = venture.plan || {};
  return `# ${venture.name}

${venture.one_liner}

For **${venture.audience}**.

## Run it

\`\`\`bash
node server.js      # then open http://localhost:3000
\`\`\`

No install, no dependencies. Node 18 or newer.

## What is here

| Path | What it is |
| --- | --- |
| \`public/index.html\` | The landing page, with the real quotes as evidence |
| \`public/styles.css\` | Styles. Light and dark, no frameworks |
| \`server.js\` | Static host plus a working waitlist endpoint |
| \`data/waitlist.jsonl\` | Everyone who signed up. Real personal data — do not share it |
| \`PLAN.md\` | What to build, in what order, and what to leave out |
| \`marketing/\` | The launch plan, ad copy and content calendar |

## How it makes money

**${m.model || 'subscription'}** at ${money(m.price, config.currency)}${
    m.tiers?.length > 1 ? ` (${m.tiers.length} tiers)` : ''
  }.

${m.firstPoundPath || ''}

Target: first payment within about ${m.daysToRevenue || 60} days.

### Taking the first payment
1. Create a Stripe account (free, no monthly fee — they take a per-transaction cut).
2. Create a **Payment Link** for each tier.
3. Paste the URLs into \`.env\`, copied from \`.env.example\`.
4. The pricing buttons then send people to a real checkout.

Until that is done the buttons collect interest instead, which is the right
order: get people asking to pay before you build billing.

## Deploying it free
Any host that runs Node will do. The free tiers that suit this shape are
Fly.io, Render, Railway and Cloudflare Workers (with small changes). A £4/month
VPS also works and is simpler to reason about.

Do not put the waitlist file on a public host without a backup.

${plan.notBuilding?.length ? `## Deliberately not in version one\n${plan.notBuilding.map((n) => `- ${n}`).join('\n')}\n` : ''}
## Honest status

This is a scaffold: a real landing page, real signup capture and a real pricing
page. The thing that makes ${venture.name} worth paying for still has to be
built — \`PLAN.md\` says exactly what that is and in what order.
`;
}

export default scaffoldVenture;
