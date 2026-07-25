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
| Shop-wide facts and forbidden words | `everyone` |

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
