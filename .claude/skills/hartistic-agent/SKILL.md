---
name: hartistic-agent
description: How to add, remove or rewire a villager (agent) in the Hartistic Valley codebase — the registry, its home station on the map, its division, its job kinds, its Discord identity and its smoke-test coverage. Use this skill whenever the user asks for a new agent, a new role, "another villager", "someone who does X", wants an existing agent split in two, wants an agent moved between the Etsy shop and the venture arm, or asks why an agent is not appearing on the dashboard or in Discord. Also use it before editing anything under src/agents/, since an agent added without its station and pack silently does nothing.
---

# Adding a villager

An agent in this project is not just a class. It is a person on a map, a queue
in a database, a channel in Discord and a row in the smoke test. Adding the
class alone produces an agent that never receives work and never appears — the
most common failure mode, and a silent one.

## What an agent actually needs

Six things, in this order. Skipping any of them leaves it half-wired.

1. **A home station** in `src/core/stations.js` — a real building on the map.
2. **The class** in `src/agents/<id>.js`, extending `Agent` from `base.js`.
3. **Registration** in `src/agents/registry.js` (import + an entry in `instances`).
4. **Someone to give it work** — usually the Manager or the Harbourmaster.
5. **A knowledge pack** in `src/knowledge/packs/<id>.js` so it starts competent.
6. **Smoke test coverage** in `test/smoke.js`.

Discord needs nothing: `src/discord/bot.js` walks the registry, so a registered
agent gets a channel automatically. It only needs a hand-drawn avatar if you
want one — see `src/discord/avatars.js`, `PROPS[agent.id]`.

## 1. The station

Stations live in two worlds. `STATIONS` is the valley (the Etsy shop),
`HARBOUR_STATIONS` is the venture arm, and `WORLDS` at the bottom of the file
ties each to its palette. Put the new building in the world its agent belongs
to — a valley agent standing in the harbour will walk across water.

```js
{
  id: 'lookout',                  // used as agent.station
  name: 'Lookout',
  building: 'tower',              // must be a shape the canvas renderer knows
  tile: { x: 44, y: 6 },          // 64 x 40 grid
  door: { x: 45, y: 10 },         // where villagers stand; keep it on a path
  blurb: 'What the Researcher thinks buyers want right now.',
  counter: 'trendCount',          // a key on the state payload, or omit
  counterLabel: (n) => (n ? `${n} signals` : 'quiet'),
}
```

Pick `tile` so the building does not overlap another (buildings are roughly
6x5 tiles) and put `door` next to an existing entry in `PATHS`, otherwise the
villager teleports rather than walks. `counter` must be a real key on the
payload built in `src/server/state.js`, or the label renders blank.

## 2. The class

Read an existing agent of similar shape first — `src/agents/curator.js` for a
shop agent, `src/agents/analyst.js` for a venture agent. The constructor spec
is documented on `Agent` in `src/agents/base.js`.

```js
export class Archivist extends Agent {
  constructor() {
    super({
      id: 'archivist',
      name: 'The Archivist',
      title: 'catalogue keeper',
      station: 'library',
      division: 'etsy',            // 'etsy' or 'ventures' — see below
      colour: '#c9b8e8',
      handles: ['archivist.sweep'],
      voice: 'Dry, precise, one sentence per fact.',
      purpose: `What it is for, written in the second person...`,
    });
  }

  async handle(job) {
    this.moveTo('library', 'sorting');
    // ...
    this.say('...', { kind: 'archive' });
    this.setStatus('idle');
    return { result: {} };
  }
}
```

`handles` is the contract: `agentForKind()` in the registry routes a job to the
first agent whose `handles` contains that kind. Two agents claiming the same
kind means the second never runs, and nothing warns you.

`division` decides which world it walks in, which sidebar it appears in, and —
importantly — which lessons it can see. `lessonsFor()` in `src/core/memory.js`
scopes house lessons by division, so a venture agent must never be given
`division: 'etsy'` "just to make it show up".

## 3. Wiring the work

An agent with no caller is inert. Work comes from one of three places:

- **A foreman tick** — `Manager.handle()` (`src/agents/manager.js`) or
  `Harbourmaster.handle()` enqueues jobs each loop. Add a numbered step there,
  and gate it so it does not enqueue on every tick: the existing steps use
  either a `getSetting('last_*')` timestamp or a count of outstanding work.
- **The product lifecycle** — `scheduleStage()` in `src/pipeline/products.js`,
  if the agent is a stage in the making of a product.
- **The dashboard or CLI** — a route in `src/server/index.js` or a verb in
  `src/cli.js`, if the owner starts it by hand.

Whichever you choose, the job goes through `enqueue()` in
`src/pipeline/queue.js`. Never call an agent's `handle()` directly from another
agent; the queue is what makes stalled work visible and recoverable.

## 4. Approval gates

If the new agent can publish, launch, post or spend, it must raise an approval
rather than act. Use `ask()` from `src/core/approvals.js` and return without
doing the thing. This is not a style preference — the three gates in the README
are load-bearing promises to the owner, and an agent that can bypass one is a
bug regardless of how useful it is.

## 5. Testing it

`test/smoke.js` runs the whole pipeline offline in about a second. Add checks
that would fail if the agent were half-wired:

```js
check('the Archivist is on the roster', agents.has('archivist'));
check('the Archivist has a station in its own world',
  WORLDS.valley.stations.some((s) => s.id === getAgent('archivist').station));
```

Write counts as **relative** (before/after) rather than absolute. The test runs
against a real database that may already have rows, and absolute counts pass
once then fail forever.

```bash
npm test
```

## Removing an agent

Reverse order: registry entry, class file, pack file, station, any foreman step
that enqueues its job kinds, and its smoke-test checks. Leave the station in
place if another agent still lives there. Check for orphaned rows:

```bash
grep -rn "<id>" src/ test/ docs/ scripts/
```

Jobs already queued for a removed agent will sit in the queue forever — the
Manager's stall-chasing step (step 3) does not know the agent is gone. Clear
them or handle the kind somewhere.

## Keeping the docs honest

`README.md` and `docs/AGENTS.md` both list the fleet with a number ("fourteen
agents"). Update the count and the list, or the docs start lying about the
thing they exist to describe.
