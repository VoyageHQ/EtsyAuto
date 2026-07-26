---
name: hartistic-dashboard-shot
description: How to run the Hartistic Valley dashboard headlessly and capture a screenshot of it, including opening a specific building panel or switching to the harbour before the shot. Use this skill whenever the user asks to see the dashboard, wants a screenshot or picture of the valley, asks "what does it look like now", or whenever you have changed anything under src/web/ and want to check the change actually rendered. Read it before reaching for Chromium's --screenshot flag, which hangs forever on this page.
---

# Screenshotting the dashboard

The dashboard is a canvas that animates on `requestAnimationFrame` with an open
server-sent-events stream. Chromium's `--screenshot` flag waits for the page to
go idle before capturing, and this page never goes idle — the command hangs
until you kill it. The fix is to drive the DevTools protocol directly and say
"wait this long, then capture".

`scripts/shot.mjs` in this skill does exactly that, in about eighty lines with
no dependencies.

## The whole loop

```bash
cd /home/user/EtsyAuto

# 1. Start the server. --no-loop keeps the agents from doing work you did not ask for.
npm run dashboard > /tmp/dash.log 2>&1 &

# 2. Wait for it to answer, rather than sleeping and hoping.
until curl -sf http://127.0.0.1:4173/api/state > /dev/null; do sleep 0.3; done

# 3. Capture.
node .claude/skills/hartistic-dashboard-shot/scripts/shot.mjs \
  http://127.0.0.1:4173 /tmp/valley.png 1500 900 3500
```

Then read the PNG back to look at it. Judge it as an image — canvas bugs
(banding, chequerboarding, a building drawn over a path) are invisible in the
code and obvious in the picture.

### Arguments

```
node shot.mjs <url> <out.png> [width] [height] [waitMs] [jsToRunFirst]
```

`waitMs` is the honest knob: the valley is procedurally generated on load and
villagers need a moment to walk somewhere interesting. 3000–4000ms gives a
settled frame. Under ~1500ms you photograph a half-drawn map.

The last argument is JavaScript evaluated in the page before the capture, which
is how you photograph anything other than the default view.

## Photographing a specific panel or the harbour

The panels are opened by clicking a building. From the page, that is a click on
the station's DOM label:

```bash
node .claude/skills/hartistic-dashboard-shot/scripts/shot.mjs \
  http://127.0.0.1:4173 /tmp/office.png 1500 900 3500 \
  "document.querySelector('[data-station=\"office\"]').click()"
```

Switching business is the shop name in the top left:

```bash
... 3500 "document.getElementById('district-switch').click()"
```

Verify the selector against `src/web/index.html` and `src/web/js/` before
guessing — a missing element makes the script throw inside the page, and you
get a screenshot of the unchanged view rather than an error. If the shot looks
identical to the default, that is the first thing to check.

The script sleeps 1.2s after running your script, which is enough for the panel
transition. Chain several statements with `;` if you need to click through.

## Populating it first

An empty valley photographs badly and tells you nothing. To get real content on
screen, run the offline pipeline before starting the server:

```bash
npm run ideas -- 8            # the Scout proposes
npm run queue                 # note the ids
npm run approve -- idea_xxxx  # approve one or two
npm run make                  # work the queue through to finished files
```

This is all offline and takes seconds. `npm test` also leaves a populated
database behind, which is often the fastest route to a realistic screenshot.

## Cleaning up

Kill the server by port, never by process-name pattern:

```bash
fuser -k 4173/tcp
```

`pkill -f chrome` and friends match your own invoking command line in this
environment and will kill the shell you are running in — the command appears to
"succeed" with an odd exit code and you lose the session. The script kills its
own Chromium on exit, so normally there is nothing else to clean up; if one is
left behind after a crash, `fuser -k 9333/tcp` gets it.

## If nothing renders

- **Blank white page** — a JS error before first paint. `curl` the page and
  check `src/web/js/` loaded; the server logs are in `/tmp/dash.log`.
- **Map but no sidebar data** — the SSE stream failed. Hit
  `http://127.0.0.1:4173/api/state` and check it returns JSON.
- **A panel that will not close, or one stuck open** — CSS specificity. The
  `hidden` attribute loses to `display: flex` unless
  `.modal[hidden] { display: none }` is present. This has bitten before.
