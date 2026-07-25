# Hartistic Valley

Two businesses run by fourteen agents on one pixel-art dashboard, where every
building is a real queue and every villager is a real agent.

- **The Valley** — an Etsy shop: digital products invented, designed and listed.
- **The Harbour** — a venture arm: startup ideas found in real discussions,
  checked for money, built as an MVP and marketed.

You approve the ideas. They do the rest.

```
npm start          # then open http://127.0.0.1:4173
```

No `npm install`. No build step. No paid services. It runs on Node 22.5+ and
nothing else.

---

## What it actually does

1. **The Scout** invents product ideas and puts a ranked list in front of you.
   Nothing gets built until you say which ones you want.
2. **The Researcher** works out what buyers type into the search box and what
   the thing should cost.
3. **The Maker** builds the real files — print-ready A4 and US Letter PDFs,
   plus a spreadsheet where that makes sense.
4. **The Scribe** writes the listing: title, 13 legal tags, description.
5. **The Inspector** opens every file, checks it against Etsy's rules, and
   sends anything half-finished back to the Workshop.
6. **The Shopkeeper** packs an upload folder — or creates a draft listing
   directly, if you have connected the Etsy API.
7. **The Curator** turns what already works into more shop: bundles of
   finished products at a discount, and spin-off editions of anything that
   sells.
8. **The Manager** keeps the whole thing moving and never approves anything
   itself.

They get better as they go. Every prompt carries what the shop has actually
learned — what sold, what has sat there for a month, which categories you say
yes to and which you always turn down. See
[docs/LEARNING.md](docs/LEARNING.md).

Everything they produce lands in `out/<SKU>-<name>/`:

```
out/HV-0001-zero-based-monthly-budget-planner/
  zero-based-monthly-budget-planner-A4.pdf         the product
  zero-based-monthly-budget-planner-US-Letter.pdf  the product, again
  spreadsheet/*.csv                                editable companion
  images/1-hero.svg …                              listing images
  preview/page-01.svg …                            page previews
  READ-ME-FIRST.txt                                what the buyer opens first
  design-brief.md                                  rebuild it in Canva if you like
  LISTING.md                                       title, tags, description to paste
  listing.csv                                      the same, for bulk tools
```

## Getting going

```bash
cp .env.example .env      # every value is optional
npm start
```

Open <http://127.0.0.1:4173>. Click the **Research Bench** — the Scout will
already have a list waiting. Tick the ones you want and press *build the
selected*. Watch the villagers walk between buildings as the work moves along.

Prefer a terminal?

```bash
npm run ideas -- 10 adhd     # ask for ten ideas about ADHD
npm run queue                # see the list
npm run approve -- idea_ab12 # build one
npm run status               # who is doing what
npm run make                 # work through the queue now
```

## The Harbour — the venture arm

Click the name in the top left to switch business. Six more agents, none of
whom touch the shop:

1. **The Prospector** reads Hacker News, Reddit and any forum feed you give it,
   looking for the phrases people use when they have an unmet need — "I wish
   there was", "is there a tool that", "we still use a spreadsheet". It brings
   you **the single best one**, with the actual quotes and links as evidence.
2. **The Analyst** decides whether it can make money, and kills it if it
   cannot. No path to a payment within 90 days, or needs a licence? Dead.
3. **The Architect** cuts it down to a fortnight of evenings and writes down
   what is deliberately *not* being built.
4. **The Builder** scaffolds a genuinely running MVP: landing page with the
   buyers' own words on it, working waitlist, pricing page ready for Stripe.
5. **The Marketer** writes the positioning, launch plan, ad copy and calendar —
   and has no payment method or posting credentials, by design.
6. **The Harbourmaster** keeps it moving, one venture at a time.

```bash
cd ventures/<name> && node server.js     # the MVP, running, no install
```

Full detail — including exactly what the Builder does and does not produce —
in [docs/VENTURES.md](docs/VENTURES.md).

## The dashboard

| Building | What it is |
| --- | --- |
| **Research Bench** | New ideas waiting for your yes or no. The only place work starts. |
| **Office** | The Manager, the loop controls, and where you teach the agents. |
| **Workshop** | Products being designed. Rebuild anything from here. |
| **Library** | Approved ideas and finished listing copy. |
| **Review Hall** | The Inspector's queue, and anything that failed a check. |
| **Shopfront** | Packed and live listings. Turn the images into PNGs here. |
| **Packhouse** | Bundles and spin-offs the Curator has suggested. |
| **Lookout** | What the Researcher thinks buyers want right now. |
| **Calendar** | The season the shop is currently pushing for. |
| **Ledger** | Earnings, what sells, what does not, and what you keep approving. |

And in the Harbour: **Lighthouse** (the shortlist and the evidence),
**Counting House** (can it make money), **Drawing Office** (the scope),
**Boatyard** (the built MVP), **Billboard** (campaigns), **Warehouse** (what is
live and what it earned), **Harbour Office** (the foreman).

The clock in the corner is real: the valley gets dark in the evening and the
windows come on.

## Free by design

- **Design** — PDFs are generated from a vector engine written into the repo.
  No Canva account needed, no fonts to buy, no stock art, nothing to license.
  If you would rather design by hand, every product ships a
  `design-brief.md` you can follow in Canva's free plan, and you can drop your
  own PDF into the folder and press *rebuild*.
- **Listing images** — built as SVG, then turned into the PNGs Etsy wants by
  your own browser, in one click, from the Shopfront.
- **The agents' brain** — works with no API key at all (`LLM_PROVIDER=offline`),
  falling back to a built-in corpus of real product concepts and rule-based
  copywriting. Point `LLM_BASE_URL` at a local Ollama and it stays free while
  getting a lot more inventive. Anthropic and any OpenAI-compatible endpoint
  are both supported — see `.env.example`.
- **Storage** — Node's built-in SQLite, in `data/valley.db`.

## Nothing goes out without you

Three hard gates, and they are not configurable away:

1. No idea becomes a product until you approve it.
2. No listing leaves the valley until you approve it.
3. Etsy listings are created as **drafts**. Going live is a deliberate change
   to `ETSY_PUBLISH_MODE`, and even then you place it in your own shop.

Anything waiting on you appears under **heads up** in the sidebar, and gets
pushed to Discord with buttons if you have that switched on.

There is a fourth rail on your wallet. Set `LLM_DAILY_TOKENS` and when the day's
budget is spent the agents fall back to their offline craft rather than
spending more — the shop keeps running, it just gets less inventive until
midnight. The meter is in the Office.

## Teaching them

Corrections stick. Type a rule in the Office (or `/teach` in Discord, or
`npm run teach`) and it is added to that agent's prompt for every future job:

```
npm run teach -- scout      never propose anything with cartoon characters
npm run teach -- copywriter  always use British spelling and no exclamation marks
npm run teach -- everyone    the shop is called Hartistic, never write Hartistic Co
```

Turning an idea down *with a reason* teaches the Scout automatically. See
[docs/TEACHING.md](docs/TEACHING.md).

## Discord

Each agent can appear as its own member with its own name, avatar and channel.
The full walkthrough, including what to do in the developer portal, is in
[docs/DISCORD.md](docs/DISCORD.md).

```bash
npm run discord:setup    # prints the roster, invite links and checks your tokens
```

## Etsy

You do not need API access. Without it the Shopkeeper packs `LISTING.md` and
you paste it in — about two minutes per product. With it, drafts are created
for you:

```bash
npm run etsy:auth        # gets the access token your keystring cannot get alone
```

See [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Reading the code

```
src/core        config, sqlite, event bus, llm providers, lessons, approvals,
                insights, similarity, retro, spend
src/agents      one file per villager, plus the Scout's idea corpus
src/pipeline    the job queue and the product lifecycle
src/design      vector doc → PDF/SVG/PNG, page templates, mockups
src/etsy        SEO rules, listing builder, upload packs, optional API
src/ventures    research sources, idea synthesis, MVP scaffolding, marketing
src/discord     gateway client, per-agent bots, avatars, slash commands
src/server      the dashboard API and static host
src/web         the dashboard itself: canvas valley, sidebar, panels
```

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/AGENTS.md](docs/AGENTS.md) and [docs/LEARNING.md](docs/LEARNING.md).

```bash
npm test      # the whole pipeline end to end, offline, in about a second
```

## A word on honesty

The agents are instructed never to invent reviews, statistics or scarcity, and
the Inspector rejects listings that do not say plainly that the product is a
digital download. That is not squeamishness — vague digital listings are the
main cause of refund requests and one-star reviews on Etsy.
