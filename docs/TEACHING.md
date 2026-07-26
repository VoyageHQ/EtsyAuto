# Teaching the agents

Corrections stick. A lesson is stored against an agent and injected into its
system prompt for every future job, under a heading that tells it your rules
override its own instincts and any generic best practice.

## Three ways to teach

**On the dashboard** — Office → *teach an agent*. Pick who learns it, write the
rule, done.

**In Discord** — `/teach agent:The Scout lesson:never propose baby products`

**In a terminal**
```bash
npm run teach -- scout      never propose anything with cartoon characters
npm run teach -- copywriter always British spelling, never American
npm run teach -- everyone   the shop is called Hartistic, one word
```

`everyone` teaches the whole valley.

## Teaching by rejecting

The fastest way to shape the Scout. Turn an idea down with a reason and the
reason becomes a lesson automatically:

```
npm run reject -- idea_7f2a  religious products are not for this shop
```

The Scout learns: *Do not propose ideas like "Advent Activity Calendar Cards":
religious products are not for this shop.*

On the dashboard, the note box under the idea list does the same thing for
however many you have ticked.

## What makes a good lesson

Write it as an instruction, not a preference. The agent reads it literally.

Good:
- `Week grids always start on Monday.`
- `Never use the word "journey" in a listing description.`
- `Prices end in .99 and never go above £9.99.`
- `Every planner needs a page the buyer can write their own list on.`
- `Do not propose anything that needs more than eight pages.`

Less good:
- `Be more creative.` — nothing to act on.
- `Make better products.` — same.
- `Sometimes use a lighter palette.` — "sometimes" is not a rule.

Lessons are cheap. A dozen sharp ones beat one long paragraph.

## Who to teach

| You want to change | Teach |
| --- | --- |
| The kind of ideas you get | `scout` |
| Keywords, pricing, what counts as saturated | `researcher` |
| Page layouts, what a product must include | `maker` |
| Listing voice, wording, what never to say | `copywriter` |
| What gets rejected before it goes out | `qa` |
| Which bundles and spin-offs get suggested | `curator` |
| Shop-wide facts and forbidden words | `everyone` |

## What they already know

The agents do not start empty. Twenty-nine **knowledge packs** ship in the
repo — around 477 lessons of real domain knowledge — and load into the lessons
table every time the project starts.

```bash
npm run knowledge              # every pack, and how many lessons are in force
npm run knowledge -- maker     # everything one agent knows, in full
```

They cover, among much else: how Etsy search matches titles against tags, the
fee structure to price against, 12mm safe margins because home printers cannot
reach the edge, 6mm minimum row height for handwriting, cream backgrounds and
1.5 line spacing for dyslexia-friendly products, the sentence that prevents
most refunds, one-person unit economics, and the law around collecting email
addresses.

Packs behave exactly like a lesson you typed. They appear in the Office marked
with the pack they came from, and **deleting one makes it stay deleted** —
loading never silently reinstates something you removed. If you want it back:

```bash
npm run knowledge -- --restore
```

Why packs rather than just typing them in? Because `data/valley.db` is
gitignored and never leaves your machine. A lesson taught by hand is yours
alone; a pack travels with the project and survives a fresh database.

### Knowledge that works without a model

A lesson written in prose only changes behaviour when a model reads it. With
`LLM_PROVIDER=offline` nobody reads anything — so the parts of the knowledge
that can be expressed as a check are also enforced in code:

| Enforced in code | Where it bites |
| --- | --- |
| Trademark names in a title, tag, description **or filename** | Inspector rejects, Scout never proposes |
| Unprovable claims and marketing filler | Inspector rejects, Marketer strips them from ad copy |
| Shaming language on neurodivergent products | Inspector rejects |
| Promising a file that is not shipped | Inspector rejects |
| Price floors, price bands, charm endings | Every price the shop sets |
| Spelling variants Etsy treats as different words | Tag building |
| Licence-needing or out-of-scope ventures | Analyst kills on sight |
| Subscriptions priced below what fees allow | Analyst flags |
| The seasonal calendar and its lead times | What the Manager asks the Scout for, all year |
| Medical claims on supportive products | Inspector rejects "treats ADHD", allows "helps with ADHD" |
| Etsy policy traps and licence overreach | Inspector rejects before it reaches your shop |
| Listing image count, and prices baked into images | Inspector rejects; the mockup engine never draws a price |
| Which palette a category wears | Every product the Maker builds |
| Ground a one-person venture cannot stand on | Analyst kills on sight |

That last one is worth spelling out: the shop's campaign calendar is generated
from the `listByMonth` table in the seasonal pack. Edit that table and the shop
changes what it works on — in October it chases new year planners, in August
it chases Halloween and Christmas. It is knowledge driving behaviour, not
knowledge describing it.

So the knowledge applies today, on your machine, with no API key.

## Lessons the agents write themselves

The Inspector writes lessons too. The second time it rejects work for the same
reason, it teaches whoever caused it the rule that prevents it — see
[LEARNING.md](LEARNING.md). Those appear in the same list as yours, marked as
coming from an agent, and you delete them the same way.

## Unteaching

Office → **house rules** → *forget*. It is deactivated, not deleted, so the
history stays honest.

## Where it lives

The `lessons` table in `data/valley.db`, assembled by
`lessonBlock()` in `src/core/memory.js`, and appended to every agent's system
prompt in `src/agents/base.js`.

Lessons work with a model configured. In offline mode the agents follow their
built-in craft and cannot read prose instructions — the corpus and templates
decide what they make. Everything else, including rejection history and the
Scout not repeating itself, still applies.
