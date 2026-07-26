---
name: hartistic-knowledge
description: How to teach the Hartistic Valley agents durable knowledge by writing or editing a knowledge pack in src/knowledge/packs/ — prose lessons that reach the prompt, plus machine-readable rules enforced in code so the knowledge still works with LLM_PROVIDER=offline. Use this skill whenever the user says "teach the agents", "they should know", "make sure they never", asks for research to be turned into something the agents keep, reports an agent repeating a mistake, or asks why a lesson had no effect. Also use it before editing anything under src/knowledge/, and prefer it over typing lessons into the database, since data/valley.db is gitignored and never reaches another machine.
---

# Teaching the agents properly

There are two ways knowledge enters this project, and they are not
interchangeable.

**A lesson typed into the Office** (or `npm run teach`) lands in the `lessons`
table in `data/valley.db`. That file is gitignored. It is the right home for
the owner's own corrections and the wrong home for anything you want to survive
a fresh clone.

**A knowledge pack** is a file in `src/knowledge/packs/`. It is versioned in
git, loaded into the same `lessons` table on every start, and behaves exactly
like a typed lesson — it shows up in the Office, and deleting it makes it stay
deleted. This is where researched knowledge belongs.

So: when asked to teach the agents something, write a pack.

## The shape of a pack

```js
// The Curator: the economics of selling more of what already works.
export default {
  id: 'curator',                 // becomes source 'pack:curator'
  agent: 'curator',              // an agent id, or omit for a house pack
  division: 'etsy',              // 'etsy' | 'ventures' | 'both'
  title: 'Bundles, variants and catalogue economics',
  summary: 'Why bundles work, when they do not, and how to price them.',

  lessons: [
    'A bundle works when every item in it belongs to the same person on the same day.',
  ],

  rules: {
    bundle: { minItems: 2, idealItems: 3, maxItems: 4, discount: 0.3 },
  },
};
```

Register it in the `PACKS` array in `src/knowledge/index.js` — import at the
top, entry in the array. A pack that is not in that array does nothing at all.

`agent` and `division` interact: an agent-scoped pack sets `division: null` on
its rows (the agent already has a division), while a house pack scopes its rows
to one side of the business so the harbour never reads the shop's rules. This
is done for you in `loadKnowledge()`; the field on the pack is what drives it.

## Writing lessons that change behaviour

The agent reads each lesson literally, as an instruction, alongside a dozen
others. Write accordingly.

**Good** — specific, checkable, and it says *why* where the why is not obvious:

- `Week grids always start on Monday.`
- `Leave a 12mm margin on every edge: most home printers cannot reach closer.`
- `Three to four items is the sweet spot for a bundle. Two barely feels like a bundle; six looks like a clearance bin and devalues each item.`

**Weak** — nothing to act on:

- `Be more creative.`
- `Sometimes use a lighter palette.` — "sometimes" is not a rule.
- A paragraph covering five things. Split it; lessons are cheap.

Aim for domain knowledge the agent could not derive from its own prompt: real
numbers, real thresholds, real consequences. A pack that restates the agent's
`purpose` in different words costs tokens on every job and changes nothing.

## The part that actually matters: rules

The owner runs with `LLM_PROVIDER=offline` much of the time. In offline mode
**nobody reads the prose**. A pack of pure lessons is inert on that machine.

So anything expressible as a check goes in `rules`, and something in
`src/knowledge/apply.js` has to act on it. That file is the bridge between the
packs and the code — `findTrademarks`, `findBannedPhrases`, `findShameLanguage`,
`findPlaceholders`, `findOverPromises`, `tidyPrice`, `bandFor`,
`spellingVariants`, `ventureKillReasons` and friends all read from the merged
rule set and are called from the Inspector, the Scout, the Lister and the
Marketer.

The test of a pack is: **can I break the shop's behaviour by editing this data
alone, with no model configured?** If yes, the knowledge is real. If no, it is
a comment.

A worked example already in the tree: `packs/seasonal.js` carries a
`listByMonth` table, and `nextSeason()` in `src/agents/manager.js` derives the
whole campaign calendar from it. Change the table and the shop changes what it
works on in October.

### Adding a new enforced rule

1. Put the data in the pack's `rules`.
2. Add a helper in `src/knowledge/apply.js` that reads it via `allRules()`.
3. Call the helper from wherever it should bite — usually `src/agents/qa.js`
   (the Inspector) or `src/etsy/seo.js`.
4. Add a smoke-test check that the helper catches a violation.

Use `allRules()`, not `rulesFor(agentId)`, for anything cross-cutting.
`rulesFor` filters to one agent's packs; a trademark list lives in the shop's
house pack but the Inspector, the Scout and the Lister all need it. Getting
this wrong disables the check silently — it has happened here before.

## Pitfalls with real scars

- **Blunt word lists reject the agents' own good copy.** A ban on "never miss"
  killed the Maker's deliberately forgiving "Never miss twice". Match the
  narrower phrase (`'never miss a day'`), not the fragment.
- **Synonyms are not spelling variants.** A variants table that maps
  planner→diary produces "meal diary". Variants are `organiser/organizer`,
  not different words.
- **Claim checks need satisfaction clauses.** "editable" is a broken promise
  unless the product ships a spreadsheet — hence `SATISFIED_BY_SHEET` and
  `SATISFIED_BY_PDF` in `apply.js`. Add the escape hatch with the check.
- **Packs are loaded, not synced.** Editing a lesson's text creates a *new*
  lesson; the old row stays. That is deliberate (deletes must stick), but it
  means large rewrites leave litter. `npm run knowledge` shows what is live.

## Checking your work

```bash
npm run knowledge              # every pack and how many lessons are in force
npm run knowledge -- maker     # one agent's knowledge in full
npm test                       # the rules still fire
```

Then update the pack count in `README.md` and `docs/TEACHING.md` — both quote a
number and a lesson total.
