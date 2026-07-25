# Putting the agents in Discord

Each agent can be its own member of your server, with its own name, its own
avatar and its own channel. This is the walkthrough.

First, two things that trip everyone up:

- **A `discord.gg` invite link cannot add a bot.** Those are for people. Bots
  are added through an OAuth2 authorise link built from the application's ID.
  `npm run discord:setup` prints the right link for each of your bots.
- **The keystring-style "client secret" is not needed.** Only the bot token.

---

## The roster

Eight agents, eight bot accounts, eight channels.

| # | Bot name | Channel to create | Token goes in `.env` as |
| --- | --- | --- | --- |
| 1 | The Manager | `#the-manager` | `DISCORD_TOKEN_MANAGER` |
| 2 | The Scout | `#the-scout` | `DISCORD_TOKEN_SCOUT` |
| 3 | The Researcher | `#the-researcher` | `DISCORD_TOKEN_RESEARCHER` |
| 4 | The Maker | `#the-maker` | `DISCORD_TOKEN_MAKER` |
| 5 | The Scribe | `#the-scribe` | `DISCORD_TOKEN_COPYWRITER` |
| 6 | The Inspector | `#the-inspector` | `DISCORD_TOKEN_QA` |
| 7 | The Shopkeeper | `#the-shopkeeper` | `DISCORD_TOKEN_LISTER` |
| 8 | The Curator | `#the-curator` | `DISCORD_TOKEN_CURATOR` |

Plus one channel called **`#valley-hq`** — anything that needs a decision from
you lands there with buttons to tap.

Note that two of the env variable names do not match the display name: the
Scribe's is `COPYWRITER` and the Inspector's is `QA`, because those are the
agents' internal ids. `npm run discord:setup` prints this table for you so you
never have to remember it.

## In the developer portal

Go to <https://discord.com/developers/applications> and do this **eight
times**, once per agent:

1. **New Application** → name it exactly as in the *Bot name* column.
2. Open the **Bot** tab → **Reset Token** → copy it.
3. Paste it into `.env` against the matching variable:
   ```
   DISCORD_TOKEN_SCOUT=MTIzNDU2Nzg5...
   ```
4. Leave every **privileged gateway intent OFF**. The agents only post; they
   never need to read your messages.
5. That is all. Do **not** bother uploading an avatar or filling in the
   description — each agent sets its own name and avatar the first time it
   starts.

Then:

```bash
npm run discord:setup
```

It checks each token, tells you which app it belongs to, and prints that bot's
invite link. Open each link and add it to your server.

The invite asks for: view channels, send messages, embed links, manage
channels, manage webhooks. The last two are only so an agent can create its own
channel if you have not made one — remove them afterwards if you would rather,
as long as the channels already exist.

## Then

```bash
npm start
```

Each agent connects, renames itself, puts its avatar on, finds its channel and
starts reporting. In `#valley-hq` you get the decisions:

```
@you  12 product ideas are waiting for your yes or no.
      [ Open the Research Bench ]

@you  HV-0004 is ready to list — ADHD Cleaning Chart
      Price: £5.99 · 5 pages · 4 images
      Tags: adhd cleaning chart, adhd planner, …
      [ Pack it for upload ]  [ Send back for changes ]  [ Hold it ]
```

## Commands

| Command | What it does |
| --- | --- |
| `/ideas [count] [theme]` | Ask the Scout for products to sell |
| `/queue` | The numbered list waiting for your decision |
| `/approve 1,3,5` | Build those ones |
| `/reject 2 too crowded` | Turn it down — the reason becomes a permanent lesson |
| `/status` | What the valley is up to |
| `/waiting` | Everything needing a decision, with buttons |
| `/teach <agent> <rule>` | Correct an agent for good |
| `/product HV-0003` | Look up a product |

Commands are registered per-server the moment a bot connects, so they show up
straight away.

## The shortcut version

If eight applications feels like too much admin, put a single token in
`DISCORD_BOT_TOKEN` instead and skip the rest. Every agent still posts in its
own channel under its own name and avatar, because messages go out through
per-channel webhooks — but there will be one bot in the member list rather than
eight. You can mix the two: any agent with its own token uses it, everyone else
shares.

## Channel naming

The bots look for a channel matching their name, their bare name (`scout`), or
their internal id, and they accept partial matches — `#scout-ideas` is found
fine. If nothing matches they create `#the-scout` under a category named after
`DISCORD_CATEGORY_NAME`.

You do not need to set `DISCORD_GUILD_ID`. Each bot works out which server it
is in. Set `DISCORD_OWNER_ID` to your own user id if you want to be @mentioned
when a decision is waiting.

## Troubleshooting

**"Discord rejected the bot token"** — the token was reset or mistyped. Reset
it in the portal and paste the new one.

**A bot is in the server but silent** — it has no channel it can post in.
Check it can see and send in its channel, or let it create its own.

**The name did not change** — Discord allows two username changes per hour per
bot. The avatar still lands; the name catches up on the next start, or you can
set it by hand in the portal. The generated avatars are also saved to
`out/discord-avatars/` if you want to upload them yourself.

**Nothing appears in `#valley-hq`** — the steward bot needs to be able to post
there. It picks the first channel whose name contains `valley-hq`, `valley`,
`hq`, `approvals` or `general`.
