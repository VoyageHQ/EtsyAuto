# How the fleet gets better

Three feedback loops, all running without you having to do anything. All three
are visible, and you can override or delete anything they conclude.

---

## 1. The shop's own results steer what gets made next

Every time an agent thinks, it is handed a short summary of what has actually
happened in your shop — not market theory, your numbers:

```
WHAT THIS SHOP HAS LEARNED SO FAR — real numbers from its own listings, not
guesses. Weigh this more heavily than your instincts about the market.
- The shop has 7 listing(s) out and has taken £41.93 across 8 sale(s).
- What has actually sold: ADHD Cleaning Chart (ADHD & neurodivergent, 5 sales);
  Kids Chore Chart (Chore charts, 3 sales).
- Listed for over a month with no sales, so do not simply make more of the same:
  Wedding Seating Plan Kit (Wedding templates).
- What the owner says yes and no to: ADHD & neurodivergent — always yes (4 yes,
  0 no); Wedding templates — usually no (1 yes, 3 no).
- Search terms the shop already targets, so avoid competing with itself:
  adhd cleaning chart, chore chart printable, budget planner …
```

Each agent gets only the parts it can act on. The Scout sees your taste and the
reasons you have given for turning things down. The Researcher and the Curator
see what sold and what stalled. The Scribe sees the keyword coverage so it does
not write two listings chasing the same phrase.

Recording sales is what powers this. If you are not using the Etsy API, add
them by hand in the **Ledger** — it takes five seconds and it is the single
highest-value thing you can do for the quality of the ideas you get.

It is in `src/core/insights.js`, and everything it says is on the Ledger page
so you can check its working.

## 2. The Inspector teaches instead of just rejecting

Every failed review is classified — broken PDF, thin product, too few tags,
description that never admits it is a digital download, and so on. The first
time, it is just a rejection. The **second** time the same class of problem
appears, the Inspector writes a lesson for whoever caused it:

```
! That is the second time I have seen "thin-tags", so I have taught copywriter
  the rule that prevents it. Delete it in the Office if you disagree.
```

From then on the Scribe carries *"Always use all 13 tags, each under 20
characters, with no two tags meaning the same thing"* into every job.

You can see the running tally under **what keeps going wrong** in the Review
Hall, and every lesson it has written is listed in the Office next to yours,
marked as coming from an agent rather than from you. Delete any you disagree
with — it will not write the same one twice.

`src/core/retro.js`. Add a new problem class by adding one entry to `PATTERNS`.

## 3. The shop stops competing with itself

Two of your own listings chasing the same search term is worse than one. Before
anything is proposed or researched, its title and keywords are compared against
everything the shop already has, using plain word overlap.

- Over **62% overlap** — the Scout drops it as a near-duplicate before you ever
  see it, and says how many it dropped.
- Over **42% overlap** — the Researcher lets it through but flags it loudly:
  *"This overlaps 48% with the shop's own HV-0003. Either aim it at a clearly
  different buyer, or make it a variant of that product rather than a rival."*

This catches the thing exact matching misses: "Weekly Meal Planner" and "Meal
Planner Weekly Printable" are the same product.

Variants from the Curator are deliberately exempt from the near-duplicate rule
against their own parent — that is the whole point of a variant — but they are
still checked against everything else.

`src/core/similarity.js`. No embeddings, no API, no dependency.

---

## What it does not do

It does not read Etsy. Nothing here scrapes search results or competitor
listings — that would breach Etsy's terms and get your shop in trouble. Every
number above comes from your own shop's history.

So the loop is only as good as the data you give it. A shop with no recorded
sales gets no sales signal, and the agents will say so rather than invent one.
