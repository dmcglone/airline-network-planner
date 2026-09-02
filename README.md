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
python3 build.py                 # src/ -> dist/index.html
python3 verify.py                # acceptance test: metrics + the ten checks
open dist/index.html
```

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
    airports.json   2,198 airports: name, city, lat/lon, UTC offset, country
    dot_db1c.json   12,241 US markets from DOT DB1C + gravity-model sizes
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

To plan a different airline, edit `src/data/config.json` (start with `brand`),
`fleet.json` and `stations.json`, put its routes in `network.json`, and
rebuild. Nothing in `src/*.js` needs to change.

## Verifying a change

`verify.py` checks the acceptance metrics and all ten checks, and fails loudly
rather than adjusting expectations:

| Metric | Expected |
|---|---|
| Fleet roster | 400 |
| Surplus | +1 aircraft spare |
| Block hours/day | 3,786 |
| Daily ASMs | 192.6m |
| Peak gates | 213 |
| Routes | 404 |
| Daily flights | 1,650 |
| Rotations | 366 |

If one of these moves, behaviour changed. Find the cause before editing the
expectation — these came off a schedule known to be sound.

For Python↔JS parity:

```sh
python3 make_legs.py && python3 engine.py && python3 validate.py
```

Both engines must produce 366 rotations with the same split by type
(A319 129, A320 61, A320E 17, A321 66, E175 76, E145 17).

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

## Model notes

Block time is `ground manoeuvre + distance / cruise speed`, calibrated so
SJC–LAX blocks about 1h15 and SJC–EWR about 5h20. All distances are nautical
miles. Spares are 8% of rotations, rounded up. Gates come from interval-graph
colouring over ground periods.

US demand is real: DOT DB1C Market data, the O&D product that replaced DB1B in
July 2025, 40% ticket sample, eleven months (Jul 2025 – May 2026). Everything
else uses a gravity model. Against real DB1C the gravity model scores r² = 0.52
and ranks market pairs correctly about 75% of the time, typically off by ~7× —
good enough to order candidates, not to size them.
