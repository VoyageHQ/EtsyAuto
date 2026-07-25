# How it fits together

Zero dependencies, on purpose. Node 22.5+ gives us `node:sqlite`, a global
`WebSocket`, `fetch` and `zlib`, which is everything needed. No install step
means nothing to break in six months.

```
                      ┌──────────────┐
   you ──────────────▶│  approvals   │◀──── the only way work starts
                      └──────┬───────┘
                             │
┌───────────┐   jobs   ┌─────▼──────┐   events   ┌──────────────┐
│  agents   │◀────────▶│   queue    │───────────▶│  event bus   │
└─────┬─────┘          └────────────┘            └──────┬───────┘
      │                                                  │
      │ writes                                    ┌──────┴───────┐
      ▼                                           ▼              ▼
┌───────────┐    ┌──────────┐              ┌──────────┐   ┌──────────┐
│  sqlite   │    │  out/    │              │ dashboard│   │ discord  │
└───────────┘    └──────────┘              │   (SSE)  │   │  bots    │
                                           └──────────┘   └──────────┘
```

## The loop

`src/pipeline/orchestrator.js` ticks every `TICK_SECONDS`. Each tick queues a
`manager.plan` job and then drains up to six jobs. One job runs at a time —
this is a shop, not a datacentre, and serial work makes the map readable.

A job is `{agent_id, kind, payload, priority}`. The agent that declares the
kind in its `handles` array picks it up. Failures retry twice, then stop.

## The lifecycle

```
idea (proposed) ──you approve──▶ product
   research ──▶ design ──▶ copy ──▶ review ──▶ ready ──you approve──▶ listed
```

Each stage has an owner (`STAGE_OWNER` in `src/pipeline/products.js`) and
`advance()` moves the product on and queues the next owner. A product that
fails review goes back to `design` and raises an approval asking what you want
done.

## Human gates

`src/core/approvals.js`. An approval is a question with options, stored open
until answered. Answering emits `approval:answered`, and the orchestrator routes
it — `publish` queues the Shopkeeper, `changes` sends it back to the Workshop,
`rebuild` restarts the design.

The same approval renders three ways: the *heads up* panel in the sidebar,
buttons on a Discord message, and `npm run answer`.

## Events

Everything an agent does calls `log()`, which persists to `events`, prints a
line to the terminal, and emits on the bus. Two listeners: the dashboard's SSE
stream, and the Discord relay. Pass `discord: false` for noise you do not want
in your server.

`pushState()` tells connected dashboards to refetch. It is a nudge, not a diff —
state is small and refetching is simpler than reconciling.

## The brain

`src/core/llm.js` exposes `complete`, `completeJson` and an `enabled` flag over
three providers: `offline`, `anthropic`, and anything OpenAI-compatible.

The pattern every agent uses:

```js
const result = await this.thinkOr(() => this.offlineVersion(), { prompt, json: true });
```

If there is no model, or it returns something unparseable, the offline path runs
instead. This is why the whole shop works with an empty `.env`, and why a flaky
model degrades the output rather than stopping the line.

## The design engine

```
spec  ──▶ buildDoc()  ──▶ Doc { pages: [ { items: [...] } ] }
                              ├──▶ renderPdf()  → PDF bytes
                              ├──▶ renderSvgPage() → preview + mockups
                              └──▶ sheetsFromSpec() → csv
```

`src/design/doc.js` is a flat list of rects, lines, circles, polygons and text
in points with a top-left origin. `pdf.js` writes a real PDF 1.4 by hand —
Flate-compressed content streams, the three base Helvetica faces, a correct
xref table — using an embedded Helvetica width table so alignment and wrapping
work without a font library. `svg.js` renders the same items for the browser.
`png.js` is a small PNG encoder used for the Discord avatars.

`templates/layout.js` holds the page painters. `templates/plan.js` turns an idea
into a spec, either from a model or from category blueprints, and normalises
whatever it gets so the renderer can never be handed something it cannot draw.

## The dashboard

Plain ES modules, no bundler, served straight from `src/web`. The valley is
drawn procedurally into an offscreen canvas once, then blitted each frame with
just the villagers, the smoke and the day/night tint on top. Labels are DOM
elements over the canvas so the text stays crisp and clickable.

`src/server/state.js` builds the one payload the whole UI reads.

## Discord

`gateway.js` is a small gateway client: identify, heartbeat, resume, reconnect
with backoff. `bot.js` runs either one bot per agent (each renaming itself and
setting a generated avatar) or one shared bot posting through per-channel
webhooks. Whichever is present, one bot is the *steward* and owns the slash
commands and the HQ channel.

## Data

`data/valley.db` — ideas, products, assets, listings, jobs, events, lessons,
approvals, agent state, sales, campaigns, settings. Schema is created on import
in `src/core/db.js` with `CREATE TABLE IF NOT EXISTS`, so there are no
migrations to run.

`out/` is disposable except for anything you have edited by hand. Deleting a
product's folder and pressing rebuild regenerates it.

## Deliberate omissions

- **No framework.** The dashboard is 1,500 lines of DOM and canvas.
- **No queue server.** SQLite and a `setTimeout` loop.
- **No auth.** It binds to `127.0.0.1`. Do not expose it to the internet
  without putting something in front of it.
- **No test framework.** `npm test` is one script that runs the real pipeline
  and checks the real files it produces.
