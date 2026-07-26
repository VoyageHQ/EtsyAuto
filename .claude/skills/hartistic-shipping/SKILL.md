---
name: hartistic-shipping
description: The pre-commit checklist for the Hartistic Valley repo — what to run, what must never be staged (Etsy credentials, the database, generated ventures containing real signup emails), and how to keep the docs' counts honest. Use this skill before every commit or push in this repository, whenever the user says commit, push, ship, save this, or asks you to open a pull request, and whenever you have touched .env, .gitignore, scripts/ or anything that writes files at runtime. Read it before staging, not after — this repo has live API credentials and real personal data one `git add -A` away from being published.
---

# Before you commit

This repository has three things in the working tree that must never reach
GitHub, and `git add -A` will happily stage all of them if `.gitignore` ever
loses a line.

## The three rails

**`.env`** holds the owner's live Etsy keystring and shared secret, and any
Discord bot tokens. It is gitignored; `.env.example` is the committed one and
carries no values. If you ever need to add a setting, add it to `.env.example`
with an empty value and document it — never copy a real value across.

**`data/*.db`** is the running state: the owner's taught lessons, approval
history, earnings. Gitignored deliberately. It is also why knowledge lives in
`src/knowledge/packs/` rather than in the database — see the
`hartistic-knowledge` skill.

**`ventures/**`** is generated MVP scaffolding, and a running venture writes
real signups into `ventures/<name>/data/waitlist.jsonl`. That is other people's
personal data. Gitignored, and the whole directory is regenerable from
`src/ventures/scaffold.js`, so there is nothing of value to preserve there.

## The check

Look at what you are about to commit, every time:

```bash
git status --short
git diff --cached --stat
git diff --cached | grep -nEi "ETSY_(KEYSTRING|SHARED_SECRET|ACCESS|REFRESH)=.|DISCORD_TOKEN[_A-Z]*=.|ANTHROPIC_API_KEY=.|sk-[A-Za-z0-9]{8}|Bearer [A-Za-z0-9]{8}" || echo "clean"
```

That grep is a backstop, not a guarantee. The real habit is staging files by
name — `git add src/knowledge/packs/foo.js README.md` — rather than `-A`. It
takes five extra seconds and makes the whole class of accident impossible.

If a secret ever does get committed, rewriting history is not enough on its
own: treat the credential as burned and tell the owner to rotate it in Etsy's
or Discord's console. (The Etsy shared secret was pasted into a chat during
development, so it should be regenerated regardless.)

## The build

```bash
npm test
```

133-odd checks, the whole pipeline end to end, offline, in about a second. It
must pass on a **clean** database and again on a **second run** — a check
written with an absolute count passes once and fails forever after. If you
added a check, run it twice:

```bash
npm test && npm test
```

There is no lint step, no build step and no dependencies. If you find yourself
wanting a package, that is a design decision the owner should make, not a
detail to slip into a commit — the "no npm install" property is a feature of
this project, not an accident.

## Docs that count things

Several files quote numbers that go stale the moment you add something:

- `README.md` — "fourteen agents", the pack count ("twenty-one"), the lesson
  total ("about 340"), the station table, the `src/` tree listing.
- `docs/TEACHING.md` — pack count and lesson total again.
- `docs/AGENTS.md` — the roster.
- `docs/ARCHITECTURE.md` — module layout.

`npm run knowledge` prints the real pack and lesson figures. Updating a count
is a one-line diff; leaving it wrong makes the docs untrustworthy about the
one thing they exist to explain.

## Commits and branches

Work goes on `claude/etsy-ai-agent-dashboard-xpkc8t`. Never push to another
branch without being asked.

```bash
git add <named files>
git commit -m "Short sentence in the imperative"
git push -u origin claude/etsy-ai-agent-dashboard-xpkc8t
```

If the push fails on a network error, retry up to four times backing off 2s,
4s, 8s, 16s. Do not retry on a rejection — that means the remote moved, and
you need to fetch and look at what changed.

Commit messages here describe the change from the shop's point of view ("Drive
the shop's calendar from the seasonal pack"), not the mechanics ("update
manager.js"). Look at `git log --oneline -10` and match the register.

Do not open a pull request unless the owner asks for one.
