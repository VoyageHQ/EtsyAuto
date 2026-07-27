# The Harbour — the venture arm

A second business on the same dashboard, run by six agents who have nothing to
do with the Etsy shop. They find startup ideas in what people are actually
complaining about, check the idea can make money, build the first version, and
plan the launch.

Switch to it by clicking the name in the top left corner.

```
signals ──▶ shortlist ──you pick one──▶ analysis ──▶ plan ──▶ build ──▶ launch
```

---


## What is actually automated, and what is not

This matters more than any feature list, because the gap between them is where
people lose weeks.

**The agents do, on their own:**

- find the evidence — real questions and complaints, with view counts, from
  Hacker News and Stack Exchange;
- decide whether it can make money, and kill it if it cannot;
- cut it to a fortnight of evenings and write down what is *not* being built;
- write every file: landing page, pricing page, the API, the deploy config, a
  GitHub Actions workflow, and the launch plan;
- check every plan against what is genuinely free to run;
- watch what is live: is it reachable, has anybody signed up, has anybody paid,
  what is the one thing to do today.

**You do, and no agent will do for you:**

1. **Run four commands to put it online.** `DEPLOY.md` in each venture folder.
   It is about ten minutes, once, and costs nothing.
2. **Open a Stripe account and paste a Payment Link.** No agent can open a
   financial account in your name, and none should be able to.
3. **Reply to the people in `SELL.md`.** This is the one that decides whether
   anything happens. Posting as you, to communities, from an unattended loop,
   is how a domain gets banned and how somebody gets a reply from "you" that
   you never wrote. The Operator drafts; you send.

Anyone promising you the third one is automated is selling you a ban.

## What it costs

Nothing, until somebody pays you. Every service in the stack has a free tier
with no card at signup — the exact limits are in `src/ventures/freetier.js`
with the date they were checked, and the Architect rewrites any plan that would
need AWS, a per-token API, an app store account or a company registration
before the first customer.

The only thing worth paying for early is a domain, about £10 a year, and only
once somebody has actually paid you.

## The fleet

| Agent | Building | What it does |
| --- | --- | --- |
| **The Prospector** | Lighthouse | Reads public discussions, finds unmet needs, brings you the best one |
| **The Analyst** | Counting House | Decides whether it can make money, and kills it if it cannot |
| **The Architect** | Drawing Office | Cuts it down to a fortnight of evenings |
| **The Builder** | Boatyard | Scaffolds a real, running MVP |
| **The Marketer** | Billboard | Positioning, channels, ad copy, calendar — never posts or spends |
| **The Harbourmaster** | Harbour Office | Keeps it moving, one venture at a time |

The Warehouse holds what is live and what it has earned.

## Where the ideas come from

Not brainstorming. Real posts, harvested from public APIs, matched against the
phrases people use when they have an unmet need:

> "i wish there was", "is there a tool that", "why is there no",
> "takes me hours", "we still use a spreadsheet", "there has to be a better
> way", "what do you use for", "any alternative to" …

| Source | Status | Notes |
| --- | --- | --- |
| **Hacker News** | Works everywhere | The Algolia search API is public, free and needs no key. It indexes every comment. |
| **Reddit** | Works on your machine | The public `.json` endpoints, with a proper user agent and a gap between requests. Set `VENTURE_SUBREDDITS` to communities whose problems you could actually solve. |
| **RSS / Atom** | Any feed | Put forum or blog feeds in `VENTURE_FEEDS`. |

Rules the harvester sticks to, because getting them wrong gets accounts
banned: only documented public endpoints, never HTML scraping, never a
logged-in page, an honest user agent, one request at a time with a gap, and a
hard cap per run. A source that blocks or rate limits us is reported and
skipped, never retried in a loop.

If every source is unreachable, the Prospector says so rather than inventing
ideas.

## Picking one

Open the **Lighthouse**. You get a recommendation, not a wall of options:

> **My pick: Rota Ledger** — A focused tracker for shift swaps that replaces
> the spreadsheet everyone is quietly using.
> Who pays: small restaurant owners. £12/month. First money in about 30 days.
> Evidence: 4 real posts.

Underneath it are the actual quotes, with links to the original posts, so you
can check the claim yourself before agreeing. Then: **build this one**, **not
this**, or **later**. Rejecting with a reason teaches the Prospector, exactly
like the shop's ideas do.

## Monetisation is not optional

Every idea carries a revenue model from the moment it is proposed, and the
Analyst kills anything that cannot plausibly take a payment within
`VENTURE_MAX_DAYS_TO_REVENUE` days (90 by default).

It also kills, regardless of how good the idea looks:

- Anything needing a licence — financial advice, medical claims, legal advice,
  holding other people's money.
- Two-sided marketplaces and anything that only works at scale. Those need a
  team and funding.

When it kills something it asks you first, and you can overrule it.

## What the Builder actually produces

Be clear about the boundary. Running `node server.js` in the generated folder
gives you a real, working:

- **Landing page** stating the problem in the buyers' own words, with the real
  quotes and links as evidence.
- **Waitlist** that stores genuine signups to `data/waitlist.jsonl`.
- **Pricing page** with your tiers, ready for Stripe Payment Links.
- **Server** with no dependencies and no install step.

```
ventures/rota-ledger/
  public/index.html      the landing page
  public/styles.css      light and dark, no frameworks
  server.js              static host + working waitlist endpoint
  data/waitlist.jsonl    real people. Personal data — do not share it
  PLAN.md                what to build next, in order, and what to leave out
  README.md              how to run and deploy it free
  marketing/             the launch pack
  .env.example           where the Stripe links go
```

What it is **not** is a finished product. The feature that makes the venture
worth paying for still has to be written — `PLAN.md` says exactly which one and
in what order. Any tool claiming otherwise is lying to you.

The Builder never overwrites `index.html`, `styles.css` or `server.js` once
they exist, so your own work is safe.

## Taking the first payment

1. Create a free Stripe account.
2. Make a **Payment Link** for each tier — about two minutes, no code.
3. Paste the URLs into `.env` in the venture folder.

The pricing buttons then go to a real checkout. Until then they collect
interest instead, which is the right order: get people asking to pay before
building billing.

## The Marketer

It writes and plans. You press go. It has **no payment method and no posting
credentials** and never asks for them — a campaign sits as a draft until you
approve it, and approving hands you a checklist rather than posting anything.

The launch pack, in `ventures/<slug>/marketing/`:

| File | What it is |
| --- | --- |
| `POSITIONING.md` | The one sentence to repeat everywhere, and the words to avoid |
| `LAUNCH-PLAN.md` | Which channels, in what order, and each community's rules |
| `AD-COPY.md` | Five ad variants plus the reply template for the original threads |
| `CONTENT-CALENDAR.csv` | Four weeks of what to post where |
| `KEYWORDS.md` | Search terms taken from how buyers described the problem |

Its first move is always the same, and it is the one that works: go back to the
threads the evidence came from and reply to the person who complained. Not a
launch announcement to a community you have never contributed to — that gets
you banned, deservedly.

It will not invent testimonials, user counts or results, and it will not
propose ads until ten people have said the landing page makes sense.

## Keeping the two businesses apart

They share the runtime — queue, approvals, event bus, Discord, dashboard — and
nothing else:

- Separate database tables. No venture agent reads `products`, `ideas` or
  `listings`; no shop agent reads `ventures` or `signals`.
- Separate prompt context. Venture agents are never told they work for an Etsy
  shop, and the shop's sales figures never appear in a venture prompt.
- Separate insights. The venture arm learns from its own history only.

## Honest limits

- **Offline mode is a rough first pass.** With no model configured the
  Prospector clusters harvested posts using word overlap. It finds real quotes
  and real wants, but the naming and framing are crude. Point it at
  domain-specific communities in `VENTURE_SUBREDDITS`, or configure a model,
  and the quality changes completely.
- **It cannot read your analytics.** The Marketer knows what you tell it.
- **It does not read Etsy, App Store rankings, or anything behind a login.**
- **One venture at a time**, by default. Two half-built products are worth less
  than one finished one.

## Commands

```bash
npm start                    # both businesses, one dashboard
```

On the dashboard: Lighthouse → *go and listen now* to harvest on demand.
In Discord: the venture agents each get their own channel, and decisions arrive
in `#valley-hq` with buttons, exactly like the shop's.
