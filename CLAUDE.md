# Airline Network Planner

Routes in, a flyable schedule out: rotations, station banks, gates, fleet
requirement, unit economics, and a suggestion engine. A static page; all compute
runs in the browser. Frontier (8 bases, 400 aircraft) is the example airline that
ships with it, not the product. The end goal is a site where anyone plans their
own network under their own airline's name.

`README.md` has the full layout, deploy setup and model notes. `ROADMAP.md` is
the backlog and the record of what was investigated and why. Read them when the
task touches those areas; don't restate them here.

## See the site

- **Local:** `python serve.py` builds and serves at http://127.0.0.1:8787/ and
  rebuilds when `src/`, `network.json` or `build.py` change. In Claude Code on
  desktop, `.claude/launch.json` runs this as the `planner` preview. Page errors
  are POSTed to `/_err` and print in the server log.
- **Live:** https://airline-network-planner.daniel-mcglone.workers.dev (the
  `live` preview). Its saved state is in that origin's localStorage and does not
  carry over to localhost, or back.
- **Single file:** `python preview.py` writes `dist/standalone.html`, with the
  demand data inlined, for opening or sending on its own.

## Commands

```
python build.py              src/ -> dist/index.html (web) + dist/artifact.html
python verify.py             acceptance metrics + ten checks + starters (Playwright)
python make_legs.py          network.json -> legs.json for the Python engine
python engine.py             reference engine;  python validate.py  its checks
python economics.py --json   then  node tools/econ_parity.js   (cost, Python vs JS)
python revenue.py            then  node tools/rev_parity.js    (revenue, Python vs JS)
python tools/intl_pax.py     refetch the OAG/MIDT sheet -> src/data/intl_pax.json
npm run deploy               build + wrangler deploy (manual; see below)
```

The parity tools read `lines.json`, so run `make_legs.py` and `engine.py` first.
`verify.py` needs `python -m pip install playwright` and
`python -m playwright install chromium` once.

## Rules that have each cost a real bug

1. **`dist/` is output.** Edit `src/`, `src/data/` or `network.json` and
   rebuild. A hook blocks writes into `dist/`.
2. **Verify, don't assert.** `build.py` then `verify.py` before any push or
   deploy. A hook runs both before `git push` and `wrangler deploy` and blocks on
   failure.
3. **Never check a test through a pipe or a `&&` chain.** `verify.py | tail`
   reports the exit status of `tail`. A commit shipped on a red test this way.
   Run each step on its own and read its exit code.
4. **Never edit an expected value to make a test pass.** The numbers in
   `verify.py`'s `EXPECT` came off a schedule known to be sound. If one moves,
   behaviour changed: find the cause. A deliberate change gets a dated comment
   explaining it, like the A320E retirement note already there.
5. **`verify.py` is the source of truth for the metrics**, not any document.
   Older notes say 366 tails, +1 surplus, 213 gates; the A320E retirement moved
   those to 365, +2, 211, and counting gates exactly (October 2026) moved 211
   to 218.
6. **The airline is configuration.** Name, wordmark, hubs, banks, curfews, feed
   modes, spacing, red-eye seeds, fleet and roster live in `src/data/*.json`.
   Nothing airline-specific goes in `src/*.js`.
7. **Python and JS must agree.** `engine.py` is the reference; `src/engine.js`
   mirrors it. After an engine change, compare tails, gates and checks from
   both. `src/validate.js` re-derives the ten checks from the finished schedule
   rather than trusting the engine's counters, with a documented one-minute
   rounding band.
8. **Layers read the schedule, never write it.** Economics and revenue consume
   the finished schedule. If they wrote back, the metrics and checks would stop
   meaning anything.
9. **The roster is pinned at 400.** Adding tails is a decision for Daniel, not a
   side effect of a fix.
10. **Reload is the real test.** In-session probes have hidden reload bugs more
    than once. State saves to localStorage on every rebuild; test a page reload
    with saved state. `TYPES` is a boot-time snapshot, so user-added fleet types
    need `fillSelects()` after `rebuild()`.
11. **Report your own bugs plainly.** Past ones: a truncated self-publish, a
    save that dropped the demand data and emptied Grow, a Diagnostics tab
    claiming zero curfew violations while five were live, minutes compared
    against hours, map radii in degrees.

## Model facts worth having in your head

- Hubs SJC, PIT, MCO (8 banks); focus DEN, RDU (5); P2P AUS, LAS, COS (6
  rolling). Hybrid connecting and point-to-point.
- Aircraft overnight down the line and turn back in the morning. That is normal.
- A turn is one aircraft, so both directions of a market match gauge. Spoke
  routes are stored once and mirrored; station-to-station routes are stored both
  ways and rebalanced to the larger side.
- SJC curfew 06:00 to 23:00 applies to arrivals and to the outstation departure
  search window.
- Night-turn order: red-eye, then forced-long (>13h), then feed candidate, then
  longest. Overnight departures use the earliest feasible bank.
- Gates by interval-graph colouring over ground periods. Spares are 8% of
  rotations, rounded up.
- All distances are nautical miles. Block = ground manoeuvre + distance/cruise.
- US demand is DOT DB1C (Jul 2025 to May 2026). International pairs DB1C does
  not cover come from a published OAG/MIDT sheet (`src/data/intl_pax.json`,
  tagged `intl`). Anything else is a gravity model that orders candidates well
  and sizes them badly (r² 0.52, typically off ~7x).
- Every Fix suggestion is checked with `trialBuild()`, a full rebuild, before
  it is offered.

## Writing

Copy in the UI follows `STYLE.md`: technical and human, no em dashes in prose,
no "not X, but Y", no throat-clearing or marketing verbs. Its grep checks are
the pre-ship test.

## Deploying and CI

- Deploys are manual: `npm run deploy` (build + `wrangler deploy`). A push does
  not deploy.
- CI (`.github/workflows/verify.yml`) runs build, `verify.py` and the Python
  parity check on every push to `main` and every PR.

## Hooks in `.claude/`

`.claude/hooks/guard.py` is called with `python`. On a machine where only
`python3` exists, the hooks fail to start and do not block anything. Fix PATH
rather than deleting the hook.
