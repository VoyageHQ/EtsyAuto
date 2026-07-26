---
name: hartistic-triage
description: How to diagnose a stuck Hartistic Valley — a product that never finishes, an idea nobody picks up, a venture that stalls, an agent stuck on one status, a listing that keeps failing the Inspector, or a dashboard that shows nothing happening. Use this skill whenever the user says something is stuck, frozen, stalled, "not doing anything", "has been sat there", "keeps getting rejected", or asks why an agent is idle. Read it before poking at the database or restarting the loop, because the queue, the approvals table and the stage machine each stall for different reasons and the fix for one makes the others worse.
---

# Triaging a stuck valley

Work in this project only moves through four mechanisms. Almost every "it is
stuck" report is one of them, and identifying which takes about a minute.

| Mechanism | Where | Stalls when |
| --- | --- | --- |
| The job queue | `src/pipeline/queue.js` | nothing enqueued, or no agent `handles` the kind |
| The stage machine | `src/pipeline/products.js` | the product's `stage` has no scheduler |
| Approval gates | `src/core/approvals.js` | it is waiting on the owner, correctly |
| The foreman tick | `manager.js` / `harbourmaster.js` | the loop is off, or a guard is holding it |

**Start by ruling out the boring answer:** it is waiting for the owner. That is
the system working. `npm run status` and the *heads up* panel both show it.

## The first three commands

```bash
npm run status     # who is doing what, right now
npm run queue      # ideas waiting on a decision
npm test           # does the pipeline still run end to end offline
```

If `npm test` is green, the machinery is fine and the problem is data or a gate
— skip to "Reading the database". If it is red, fix that first; a broken build
looks exactly like a stall from the dashboard.

## Reading the database

`data/valley.db` is plain SQLite. Node's built-in driver is the easiest way in,
and does not disturb a running server:

```bash
node --disable-warning=ExperimentalWarning -e "
import('./src/core/db.js').then(({ all }) => {
  console.log('JOBS', all(\"SELECT id, agent_id, kind, status, attempts, error FROM jobs WHERE status IN ('queued','running','blocked') ORDER BY priority\"));
  console.log('PRODUCTS', all(\"SELECT sku, stage, status FROM products WHERE status = 'active'\"));
  console.log('APPROVALS', all(\"SELECT id, kind, agent_id, title FROM approvals WHERE status = 'open'\"));
});
"
```

Three questions, in order:

1. **Is there an open approval?** Then nothing downstream of it will move, by
   design. Answer it (`npm run answer`, the dashboard, or `/approve` in
   Discord).
2. **Is there a queued job that never runs?** Check `agentForKind(kind)` in
   `src/agents/registry.js` returns someone. A job kind no agent `handles` sits
   in the queue forever and nothing logs a warning. This happens after renaming
   an agent or removing one.
3. **Is there an active product with no job?** That is the Manager's job to
   fix — step 3 of `Manager.handle()` calls `scheduleStage()` on any active
   product with nothing in flight. If the Manager is running and it still does
   not move, `scheduleStage()` has no case for that `stage` value.

## Common causes, in the order they actually occur

**The loop is off.** `npm run dashboard` starts the server *without* the tick
(`--no-loop`). Everything looks alive and nothing progresses. `npm start` runs
both. The Office panel shows loop state.

**The token budget is spent.** `LLM_DAILY_TOKENS` is a hard rail: past it the
agents fall back to offline craft rather than spending more. Output gets less
inventive, not absent — but if something depends on a model it will look stuck.
The meter is in the Office; `src/core/spend.js` has `todayUsage()` and
`overBudget()`.

**The Inspector keeps rejecting the same thing.** That is a working feedback
loop, not a stall — after the second identical rejection it teaches the
responsible agent a lesson (`src/core/retro.js`). Read the rejection reason
before "fixing" anything; usually the copy really does contain a trademark, a
placeholder, an unprovable claim or shaming language, all of which are correct
to reject.

The checks live in **two** places, which matters when reproducing a rejection.
`auditListing()` in `src/etsy/seo.js` covers listing mechanics — tag count,
description length, the digital-download sentence, price. The knowledge-driven
checks (`findTrademarks`, `findBannedPhrases`, `findPlaceholders`,
`findShameLanguage`, `findOverPromises`) live in `src/knowledge/apply.js` and
are called from `src/agents/qa.js`, not from `auditListing`. Run whichever
matches the reason you were given:

```bash
node --disable-warning=ExperimentalWarning -e "
Promise.all([import('./src/etsy/seo.js'), import('./src/knowledge/apply.js')]).then(([seo, k]) => {
  const title = 'Disney Budget Planner', body = 'TODO write this';
  console.log('mechanics ', seo.auditListing({ title, tags: [], description: body }));
  console.log('trademarks', k.findTrademarks(title + ' ' + body, [], title));
  console.log('placeholder', k.findPlaceholders(body));
});
"
```

**A venture was killed, not stalled.** The Analyst kills ideas with no path to
payment within 90 days, anything needing a licence, and anything out of scope.
`ventureKillReasons()` in `apply.js` lists why. A killed venture is a decision,
and the Harbour works one venture at a time by design.

**The Scout has run out of room.** It will not repeat itself and will not
propose anything too close to an existing product (`src/core/similarity.js`,
`TOO_SIMILAR`). If the backlog stops refilling, that guard is usually why, and
the fix is a broader theme, not a lower threshold.

**Two agents claim one job kind.** `agentForKind` returns the first match, so
the second agent never runs and never errors. Grep for the kind.

## Restarting safely

The queue is durable, so a restart loses nothing in flight — jobs marked
`running` when the process died stay `running` and will not be picked up again.
If you see stale `running` rows from a crash:

```bash
node --disable-warning=ExperimentalWarning -e "
import('./src/core/db.js').then(({ run }) =>
  run(\"UPDATE jobs SET status = 'queued' WHERE status = 'running'\"));
"
```

Only do that when the process is definitely not running, or you will get two
agents on one job.

`npm run reset` exists and wipes the database. It is the right tool for a
corrupted dev database and the wrong tool for a stall — it destroys the owner's
taught lessons, approval history and earnings record, none of which are in git.
Do not reach for it without saying plainly what it deletes and getting a yes.

## When you have fixed it

Add a smoke-test check that would have caught it. Most stalls in this codebase
have been wiring mistakes — an unhandled job kind, a stage with no scheduler, a
rule that stopped firing — and all three are cheap to assert and invisible
otherwise.
