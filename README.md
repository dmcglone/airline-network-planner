# Airline Network Planner

An airline network planning model: routes in, a flyable schedule out — aircraft
rotations, station banks, gate requirements, and a suggestion engine that
proposes routes rather than only reporting problems.

The airline that ships with it is Frontier, a fantasy carrier with 8 bases and
400 aircraft. That is example data, not the product: the airline's name, hubs,
banks, curfews and fleet all live in `src/data/`, so a different network is a
different config rather than a fork.

It is a static page. All the compute runs in the browser, so it needs no server.

## Quick start

```sh
python3 build.py                 # src/ -> dist/index.html + dist/artifact.html
python3 verify.py                # acceptance test: metrics + the ten checks
python3 serve.py                 # build, serve at http://127.0.0.1:8787/, rebuild on change
```

`serve.py` is stdlib only. It is also what Claude Code's preview runs
(`.claude/launch.json`), and `CLAUDE.md` holds the working rules for Claude
sessions. Opening `dist/index.html` from disk mostly works, but `file://` hides
the charset bug described below, so prefer the server.

Two outputs, because they are served differently:

- **`dist/index.html`** — a complete document with its own doctype and
  `<meta charset>`. This is what Cloudflare serves.
- **`dist/artifact.html`** — the same page body without `<html>`/`<head>`/`<body>`,
  for publishing through the Claude Artifact tool, which supplies its own
  skeleton.

The charset matters more than it looks. Without it a web server hands the
browser this UTF-8 file with no encoding declared, it is decoded as Latin-1,
`À-ÿ` inside a regex becomes an out-of-order character range, and the boot
script dies before the page renders. `file://` sniffs the encoding and hides
this, so `verify.py` serves `dist/` over HTTP and loads the root URL — the way
Cloudflare will.

`verify.py` needs Playwright (`pip install playwright && playwright install chromium`).

## Layout

```
src/
  constants.js      config loader — reads data/, holds nothing airline-specific
  state.js          the editable network + exportState / importState
  geo.js            distance, timezones, local/UTC
  demand.js         DOT lookup, gravity-model fallback
  redeye.js         red-eye viability per market
  engine.js         the schedule builder: legs -> turns -> rotations
  validate.js       the ten checks, re-derived independently of the engine
  suggest.js        fix / fill / grow
  ui/               one file per tab, plus render.js and events.js
  data/
    airports.json   2,715 airports in the Americas and Europe (tools/airports.py): name, city, lat/lon, UTC offset, country
    dot_db1c.json   12,241 US markets from DOT DB1C + gravity-model sizes
    intl_pax.json   24,525 international pairs from the OAG/MIDT sheet (tools/intl_pax.py)
    geo.json        coastlines and borders for the map; Europe's from Natural Earth (tools/geo_europe.py)
    stations.json   the bases
    fleet.json      aircraft types and the pinned roster
    config.json     hubs, banks, curfews, feed modes, spacing, red-eye seeds
engine.py           reference implementation — the JS mirrors this
validate.py         the ten checks, Python side
build.py            src/ -> dist/index.html
verify.py           acceptance test
make_legs.py        network.json -> legs.json, so engine.py sees the same network
network.json        the committed network state
wrangler.jsonc      Cloudflare Workers static-assets config
dist/index.html     GENERATED — not committed; run build.py
```

## Deploying

Cloudflare Workers with static assets. (Cloudflare recommends Workers over Pages
for new projects — Pages still works, but new development goes to Workers.)
There is no Worker script: all the compute runs in the visitor's browser, so
Cloudflare just serves `./dist`.

Connect the repo in the Cloudflare dashboard under Workers & Pages, then set:

| Setting | Value |
|---|---|
| Build command | `python3 build.py` |
| Deploy directory | `./dist` (set in `wrangler.jsonc`) |
| Deploy command | `npx wrangler deploy` (the default) |
| Production branch | `main` |

The build image ships Python 3.13, so no version pin is needed. `wrangler.jsonc`
supplies the rest. Locally, `npm run deploy` does the same thing.

`dist/` is not committed — it is 770KB of generated output that changes on every
source edit, and committing it reinvites exactly the source-of-truth ambiguity
the build step removes. CI rebuilds it. If you would rather have a checked-in
copy as a fallback, delete the `dist/` line from `.gitignore`.

The acceptance test needs a browser, which the Cloudflare build image does not
have, so it runs in GitHub Actions (`.github/workflows/verify.yml`) on every
push instead — build, acceptance metrics, the ten checks, and Python↔JS parity.

## Two rules that matter

**`dist/planner.html` is an output.** Edit the part in `src/` and rebuild. A
hand-edit there is reverted by the next build, silently.

**The airline is configuration, not code.** Its name and wordmark, hubs, focus
cities, bank times, curfews, feed modes, spacing presets, red-eye seeds, the
fleet table and the pinned roster all live in `src/data/`. The end goal is a
site where anyone plans their own network under their own airline's name; that
only works if nothing about any particular airline is welded into the engine.

To plan a different airline, edit `src/data/config.json` (start with `brand`,
whose `livery` sets the starting colour and tail mark), `fleet.json` and
`stations.json`, put its routes in `network.json`, and rebuild. Nothing in
`src/*.js` needs to change. Players can change the livery in Settings.

## Verifying a change

`verify.py` checks the acceptance metrics and all ten checks, and fails loudly
rather than adjusting expectations:

| Metric | Expected |
|---|---|
| Fleet roster | 400 |
| Surplus | +2 aircraft spare |
| Block hours/day | 3,786 |
| Daily ASMs | 192.6m |
| Peak gates | 218 |
| Routes | 404 |
| Daily flights | 1,650 |
| Rotations | 365 |

If one of these moves, behaviour changed. Find the cause before editing the
expectation — these came off a schedule known to be sound.

For Python↔JS parity:

```sh
python3 make_legs.py && python3 engine.py && python3 validate.py
```

Both engines must produce 365 rotations with the same split by type
(A319 129, A320 76, A321 67, E175 76, E145 17).

`engine.py` needs time zone data. On Windows, run
`python -m pip install tzdata` first. Without it every UTC offset falls back
to 0 and the engine builds 366 rotations with no error.

Each starting network in `src/data/starters.json` carries an `expect` block
that `verify.py` asserts. A starter with a `mission` is also played: the start
must earn fewer than all its stars, and its reference solution must earn all of
them, so every shipped mission is proven winnable on every build.

## The ten checks

Every required leg is flown exactly as often as required; no leg is flown that
the network does not require; rotations are continuous in space; minimum turn
time is respected on every ground stop; every rotation returns its aircraft to
its start; overnight ground time is sufficient; no rotation spans more than 24
hours; every airport departs as often as it arrives; no departure breaks a
curfew; no leg exceeds its aircraft's range.

`src/validate.js` re-derives all ten from the finished schedule rather than
trusting the engine's own counters, and the Checks tab shows a warning if the
two ever disagree. This exists because a Diagnostics tab once reported zero
curfew violations while five were live.

## State

`network.json` is the network: routes with per-gauge frequencies, red-eye flags,
the fleet roster, spacing and spare policy, and the station/bank config. Export
and Import in the app round-trip it. `build.py` injects its routes as the page's
seed, so the committed state and the published page cannot drift apart.

A Share link, an opened file and saved state are treated as somebody else's
data. `cleanState()` and `applyConfig()` in `src/state.js`, and `cleanGeom()`
in `src/seatmap.js`, keep a station code only if it is in the airport table, a
type code only if Add type would accept it, and a number only if it is a number.
Their codes and numbers are drawn into markup all over the page, so a new state
field that the page reads needs a line there. `verify.py` opens a crafted
airline all three ways and fails if anything in it runs.

## Model notes

Block time is `ground manoeuvre + distance / cruise speed`, calibrated so
SJC–LAX blocks about 1h15 and SJC–EWR about 5h20. All distances are nautical
miles. Spares are 8% of rotations, rounded up. A station's gates are the most
aircraft on its ground at once, counted exactly. Each aircraft is given a gate by
colouring the ground periods, swept from the station's quietest moment so that
aircraft parked across midnight need no gates of their own; that uses exactly the
peak at every airport the shipped network and the starters fly to. The Stations
tab draws the result, a row per gate.

US demand is real: DOT DB1C Market data, the O&D product that replaced DB1B in
July 2025, 40% ticket sample, eleven months (Jul 2025 – May 2026).

International demand comes from OAG and MIDT ticketing records for 2025–26, as
compiled in the published sheet PAX_DATA_2025-26. `tools/intl_pax.py` fetches it
and keeps only pairs DB1C does not cover, so DB1C stays the domestic source. It
keeps a pair only when both airports are in `airports.json`, which covers the
Americas and Europe: run `tools/airports.py` first when that table changes. Grow
proposes a European route only once the fleet has a type that can reach it. On
the 8,270 US pairs both carry, the sheet matches DB1C at a median ratio of 1.00
(log r² 0.95) with fares about 7% lower, but 1,360 of DB1C's 6,941 markets above
10 passengers a day are missing from it. These are third-party figures this
project cannot audit; the planner tags them `intl`, separately from `db1c`.

Anything neither source lists uses a gravity model, scaled internationally by a
factor calibrated on the Caribbean markets DB1C counts as domestic. Against real
DB1C the gravity model scores r² = 0.52 and ranks market pairs correctly about
75% of the time, typically off by ~7× — good enough to order candidates, not to
size them.
