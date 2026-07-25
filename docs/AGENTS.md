# The villagers

Seven agents. Each one is a single file in `src/agents/`, has a home building
on the map, accepts particular job kinds, and carries every lesson you have
taught it into every prompt.

| Agent | File | Home | Handles |
| --- | --- | --- | --- |
| The Manager | `manager.js` | Office | `manager.plan` |
| The Scout | `scout.js` | Research Bench | `scout.brainstorm` |
| The Researcher | `researcher.js` | Lookout | `researcher.validate`, `researcher.trends` |
| The Maker | `maker.js` | Workshop | `maker.build` |
| The Scribe | `copywriter.js` | Library | `copywriter.listing` |
| The Inspector | `qa.js` | Review Hall | `qa.review` |
| The Shopkeeper | `lister.js` | Shopfront | `lister.publish` |
| The Curator | `curator.js` | Packhouse | `curator.scan`, `curator.bundle` |

## The Scout

The one you asked for: its entire job is to bring you ideas and wait.

It never designs anything and it never decides anything. It proposes, scores,
and stops. Scoring is `demand × 2.2 − effort × 0.9 + price ceiling × 0.18`,
capped at 10, which is deliberately crude — it sorts the list, it does not make
the decision.

With no model configured it works from `ideas-corpus.js`: around eighty real
digital-product concepts across budget planners, chore charts, ADHD and
neurodivergent systems, meal planners, wedding templates, kids activities,
business spreadsheets, fitness trackers, wall art, digital planners, home
admin, self care, teacher and study, seasonal, pets and travel. When it runs
out of unused seeds it stretches them with twists — UK edition, ink-saver
edition, dyslexia-friendly edition, one-page edition, and so on.

With a model it writes fresh ideas, is told what is already in the shop so it
does not repeat itself, and gets a nudge about the time of year.

## The Manager

Runs on every tick. It keeps your idea backlog topped up to
`IDEA_BACKLOG_TARGET`, starts approved ideas into production up to
`MAX_ACTIVE_PRODUCTS` at a time, nudges anything that has stalled, sends the
Researcher up the Lookout once a day, and keeps the seasonal campaign current.

It is explicitly forbidden from approving anything.

## The Researcher

Turns an idea into keywords, a competition read, a price range and a verdict.
It is instructed never to invent statistics — a labelled guess is useful, a
fabricated number is a liability.

## The Maker

Plans the product page by page, then the press in `src/design/` renders it as
real PDFs. It is told to write actual content — the real checklist items, the
real column headers — because a template full of placeholders is not a product.

Page kinds available to it: `cover`, `table`, `checklist`, `grid`, `tracker`,
`columns`, `poster`, `instructions`. Whatever a model returns is normalised and
clamped before it reaches the renderer, so a bad response can produce a dull
page but never a broken file.

## The Scribe

Writes the title, tags and description. The rules it cannot break: no invented
reviews or statistics, no "unlock" or "elevate", no emoji, no shouting, and it
must say plainly that the product is a digital download.

Etsy's limits are enforced in code, not left to the model — 140 character
title, 13 tags of at most 20 characters each.

## The Inspector

The gate. It opens every PDF and checks the header and the trailer, checks file
sizes, counts pages and images, audits the listing against Etsy's rules, and —
if a model is available — asks for a second opinion on whether anything would
cause a refund or a policy strike.

Fail and the product goes back to the Workshop and you get asked what to do.
Pass and it asks whether to list it. It never publishes.

## The Shopkeeper

The only agent that touches the outside world, and only after you have
approved. Without Etsy credentials it writes an upload pack. With them it
creates a **draft** listing. If the API refuses for any reason, it falls back to
the upload pack and says so.

## The Curator

The cheapest growth in a digital shop is not another product from scratch — it
is another way to sell what you have already made.

**Bundles.** When two or more finished products suit the same buyer, it
proposes selling them together at about 30% off the combined price. On approval
it merges their pages into one document, adds a contents page, and the result
goes through the Scribe and the Inspector like any other product. No new design
work happens.

**Variants.** When something has earned money, it proposes the same product
again for a different buyer: US Letter, ink-saver, teen, dyslexia-friendly,
large print, one-page. Those land at the Research Bench as ordinary ideas for
you to approve or reject.

Guards worth knowing about, because they are what stop this turning into spam:

- It never bundles anything unfinished, and never bundles the same product
  twice.
- It never spins off a bundle — a variant of a bundle is a mess.
- It stops proposing spin-offs once four are already waiting for your decision.
- Without any sales data it will spin off the single best thing built so far,
  and no more, rather than guessing at scale.

## Adding your own

```js
// src/agents/photographer.js
import Agent from './base.js';

export class Photographer extends Agent {
  constructor() {
    super({
      id: 'photographer',
      name: 'The Photographer',
      title: 'mockup stylist',
      station: 'shopfront',
      colour: '#d8c48f',
      handles: ['photographer.style'],
      purpose: 'You restyle listing images so they stand out in Etsy search.',
    });
  }

  async handle(job) {
    // this.think({ prompt, json: true }) for a model
    // this.thinkOr(fallback, { prompt }) to keep working when there is none
    return { result: {} };
  }
}
```

Add it to `src/agents/registry.js`. It appears on the map, in the sidebar, and
gets a Discord channel with no further wiring. Give it a station that exists in
`src/core/stations.js`, or add a new building there.
