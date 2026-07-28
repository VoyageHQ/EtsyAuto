// One command that says where the chain is broken.
//
//   npm run doctor
//
// This exists because "it is not uploading and not coming up with ideas" is
// two symptoms with about eight possible causes between them, and answering it
// meant running etsy:check, brain:check, health and status, then reading the
// activity feed and piecing the story together. That is a diagnosis by
// correspondence, and it took days.
//
// So: walk the actual chain, in the order the work flows, and stop at the
// first thing that is genuinely stopping it. Read the database for state and
// call Etsy for real — "the variables are set" and "the token works" are
// different claims and only one of them matters.
//
// It ends with exactly one next action. Not a list. A list is a way of not
// choosing, and the whole reason this file exists is that the owner has been
// handed too many things to check.
import config from '../src/core/config.js';
import { all, count, one, getSetting } from '../src/core/db.js';
import { llm } from '../src/core/llm.js';
import { connectionGaps, whyNotConnected, publicCall } from '../src/etsy/api.js';
import { awaitingUpload, uploadsInLastHour } from '../src/etsy/permission.js';
import { openApprovals } from '../src/core/approvals.js';
import { isRunning } from '../src/pipeline/orchestrator.js';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;

const ok = (label, detail = '') => console.log(`  ${green('✓')} ${label}${detail ? dim(`  ${detail}`) : ''}`);
const bad = (label, detail = '') => console.log(`  ${red('×')} ${label}${detail ? dim(`  ${detail}`) : ''}`);
const meh = (label, detail = '') => console.log(`  ${amber('!')} ${label}${detail ? dim(`  ${detail}`) : ''}`);

// Everything that is stopping something, tagged with which symptom it
// explains. "It is not uploading and not coming up with ideas" is two
// independent chains, and reporting only the first blocker answered one of
// them and silently hid the other — which is exactly the failure this file was
// written to end.
const blockers = [];
const stop = (symptom, what, why, fix) => blockers.push({ symptom, what, why, fix });
const SYMPTOMS = {
  everything: 'Nothing is running',
  ideas: 'No new ideas',
  uploading: 'Nothing reaching Etsy',
};

console.log(`\n${bold('Doctor')} ${dim('— walking the chain from idea to Etsy')}\n`);

// --- 1. is anything running at all? ----------------------------------------

console.log(bold('The loop'));
const queued = count("SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')");
const recentlyDone = count('SELECT COUNT(*) FROM jobs WHERE finished_at > ?', Date.now() - 3600000);

if (!config.autoLoop) {
  bad('AUTO_LOOP is off in .env', 'nothing moves on its own');
  stop('everything', 'The loop is switched off', 'AUTO_LOOP=false in .env, so no agent is ever given work.', 'Set AUTO_LOOP=true and restart.');
} else {
  ok('AUTO_LOOP is on', `ticking every ${config.tickSeconds}s when the dashboard runs`);
}
// isRunning() only means something inside the running process; from a separate
// command it is always false, so judge by what the queue has actually done.
if (recentlyDone) ok('work has been done in the last hour', `${recentlyDone} job(s) finished`);
else meh('no jobs have finished in the last hour', queued ? `${queued} waiting` : 'queue empty');

// --- 2. the brain ----------------------------------------------------------

console.log(`\n${bold('The brain')}`);
if (llm.enabled) {
  ok('a model is configured', llm.describe());
} else if (llm.provider === 'offline') {
  meh('offline', 'agents use their built-in craft — this works, it is just less inventive');
} else {
  bad(`LLM_PROVIDER=${llm.provider} but it is not usable`, 'missing key or base URL');
  stop(
    'everything',
    'The brain is half configured',
    `LLM_PROVIDER is "${llm.provider}" but the settings it needs are empty, so every agent silently falls back.`,
    'Run npm run brain:check — it names the missing line.'
  );
}

// --- 3. ideas --------------------------------------------------------------

console.log(`\n${bold('Ideas')}`);
const proposed = count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'");
const everMade = count('SELECT COUNT(*) FROM ideas');
const lastAsk = Number(getSetting('last_idea_ask', '0'));

if (proposed >= config.ideaBacklogTarget) {
  meh(
    `${proposed} ideas are waiting for your yes or no`,
    `the target is ${config.ideaBacklogTarget}, so the Scout is trimming rather than adding`
  );
  stop(
    'ideas',
    'The Scout has stopped because you have not ranked anything',
    `${proposed} ideas are on the Research Bench waiting for a decision. It keeps the best ` +
      `${config.ideaBacklogTarget} and shelves the rest rather than growing the pile.`,
    'Open the Research Bench and approve or reject some. It starts adding again immediately.'
  );
} else if (proposed) {
  ok(`${proposed} ideas waiting for you`, `room for ${config.ideaBacklogTarget - proposed} more`);
} else if (everMade > 200 && !llm.enabled) {
  bad('no ideas waiting, and the notebook is used up', `${everMade} proposed over this shop's life`);
  stop(
    'ideas',
    'The Scout has run out of ideas it can have offline',
    `It has proposed ${everMade} ideas, which is every seed in its notebook and every variation of ` +
      'them. Offline it cannot invent past that.',
    'Set LLM_PROVIDER in .env — npm run brain:check has the exact lines — or add ETSY_KEYSTRING so it ' +
      'can read the real marketplace and aim at gaps.'
  );
} else {
  meh('no ideas waiting', lastAsk ? `last asked ${Math.round((Date.now() - lastAsk) / 60000)}m ago` : 'never asked');
}

// --- 4. the pipeline in the middle -----------------------------------------

console.log(`\n${bold('Work in progress')}`);
const activeProducts = count("SELECT COUNT(*) FROM products WHERE status = 'active' AND stage NOT IN ('ready','listed')");
const blocked = all("SELECT sku, stage FROM products WHERE status = 'blocked'");
const waitingOnYou = openApprovals();

ok(`${activeProducts} product(s) being made`);
if (waitingOnYou.length) {
  meh(`${waitingOnYou.length} question(s) waiting on you`, waitingOnYou[0].title.slice(0, 60));
}
if (blocked.length) {
  bad(`${blocked.length} product(s) held`, blocked.slice(0, 3).map((p) => `${p.sku} at ${p.stage}`).join(', '));
}

const failed = all(
  "SELECT kind, error FROM jobs WHERE status = 'failed' AND finished_at > ? ORDER BY finished_at DESC LIMIT 3",
  Date.now() - 86400000
);
for (const job of failed) meh(`${job.kind} failed`, String(job.error || '').slice(0, 90));

// --- 5. Etsy, for real -----------------------------------------------------

console.log(`\n${bold('Etsy')}`);
const gaps = connectionGaps();
if (gaps.length === 3) {
  meh('not connected', 'listings are packed into out/ for you to paste in');
} else if (gaps.length) {
  bad('half connected', gaps.join(', ') + ' empty in .env');
  stop('uploading', 'Etsy is half connected', whyNotConnected(), 'Run npm run etsy:check.');
} else {
  ok('all three variables are set', `shop ${config.etsy.shopId}`);

  // The claim that matters. Variables being present says nothing about
  // whether the token still works, and a token that expired overnight looks
  // identical to a working one from the database.
  try {
    await publicCall('/application/openapi-ping');
    ok('the keystring is accepted');
  } catch (err) {
    bad('the keystring is refused', err.message.slice(0, 90));
    stop('uploading', 'Etsy will not accept your keystring', err.message.slice(0, 160), 'Run npm run etsy:check.');
  }

  const token = getSetting('etsy_access_token', config.etsy.accessToken);
  try {
    const res = await fetch('https://api.etsy.com/v3/application/users/me', {
      headers: {
        'x-api-key':
          getSetting('etsy_api_key_form') === 'combined' && config.etsy.sharedSecret
            ? `${config.etsy.keystring}:${config.etsy.sharedSecret}`
            : config.etsy.keystring,
        authorization: `Bearer ${token}`,
      },
    });
    if (res.ok) {
      ok('the sign-in still works');
    } else {
      bad(`the sign-in is refused (HTTP ${res.status})`, (await res.text()).slice(0, 80));
      stop(
        'uploading',
        'Your Etsy sign-in has expired',
        `Etsy returned ${res.status} for your access token. Tokens last an hour and renew themselves; ` +
          'this means the refresh token has gone too.',
        'Run npm run etsy:auth, then npm run etsy:check.'
      );
    }
  } catch (err) {
    bad('could not reach Etsy', err.message.slice(0, 80));
  }

  const approved = awaitingUpload();
  const perHour = uploadsInLastHour();
  if (approved.length) ok(`${approved.length} listing(s) approved and waiting to go up`);
  else meh('nothing is approved for upload', 'nothing goes to Etsy until you say so');
  if (perHour >= config.etsy.maxUploadsPerHour) {
    meh(`${perHour} uploads this hour`, `the ceiling is ${config.etsy.maxUploadsPerHour} — the rest go when it clears`);
  }
}

// --- what to do --------------------------------------------------------------

console.log(`\n${bold('What to do')}\n`);
if (!blockers.length) {
  console.log(`  ${green('Nothing is broken.')}`);
  if (!waitingOnYou.length && !proposed) {
    console.log(dim('  The shop is idle and has nothing waiting on you. Give it something:'));
    console.log(dim('    npm run ideas -- 10'));
  } else if (waitingOnYou.length) {
    console.log(`  ${waitingOnYou.length} question(s) are waiting on you in heads up. That is the only thing holding it.`);
  }
  console.log('');
  process.exit(0);
}

// One per symptom. The owner reported two things wrong; answering only the
// first and calling the rest "downstream" is how the second one stayed hidden
// for a week. Within a symptom the first blocker is the real one, because
// everything after it in that chain is a consequence.
const seen = new Set();
for (const b of blockers) {
  if (seen.has(b.symptom)) continue;
  seen.add(b.symptom);
  console.log(`  ${bold(SYMPTOMS[b.symptom] || 'Something is wrong')} — ${b.what}`);
  console.log(`  ${dim(b.why)}`);
  console.log(`  ${green('→')} ${bold(b.fix)}\n`);
}

const hidden = blockers.length - seen.size;
if (hidden) {
  console.log(dim(`  ${hidden} other thing(s) are downstream of those. Fix these and run this again.\n`));
}
process.exit(1);
