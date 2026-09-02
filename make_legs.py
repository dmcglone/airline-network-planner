#!/usr/bin/env python3
"""Regenerate legs.json for engine.py from network.json.

The Python reference and the JS engine must be fed the same network, or a
parity comparison means nothing. This mirrors src/engine.js exactly:
  - a spoke route is mirrored, because the aircraft has to come back;
  - a route between two stations is NOT mirrored — the reverse is its own
    route row — and the pair is then rebalanced to the larger of the two
    directions, because a turn is one aircraft and both ways must match gauge.
"""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent
net = json.loads((ROOT/"network.json").read_text())
state, STA = net["state"], json.loads((ROOT/"src/data/stations.json").read_text())
TYPES = [f["t"] for f in json.loads((ROOT/"src/data/fleet.json").read_text())["types"]]

legs, weekly = {}, {}
def add(o, d, t, n, dow):
    k = f"{o}|{d}|{t}"
    legs[k] = legs.get(k, 0) + n
    weekly[k] = weekly.get(k, 0) + n * dow

for r in state["routes"]:
    dow = r.get("dow", 7)
    for t in TYPES:
        n = int(r["mix"].get(t, 0) or 0)
        if n <= 0: continue
        add(r["o"], r["d"], t, n, dow)
        if r["d"] not in STA:                 # spoke: mirror the return
            add(r["d"], r["o"], t, n, dow)

rebal = 0
for i, a in enumerate(STA):
    for b in STA[i+1:]:
        for t in TYPES:
            ka, kb = f"{a}|{b}|{t}", f"{b}|{a}|{t}"
            na, nb = legs.get(ka, 0), legs.get(kb, 0)
            if na == nb: continue
            n = max(na, nb)
            if n > 0:
                legs[ka] = legs[kb] = n
                w = max(weekly.get(ka, 0), weekly.get(kb, 0))
                weekly[ka] = weekly[kb] = w
            else:
                legs.pop(ka, None); legs.pop(kb, None)
            rebal += 1

(ROOT/"legs.json").write_text(json.dumps({"legs": legs, "weekly": weekly, "fixes": [], "recon": []}))
print(f"legs.json: {len(legs)} directed leg groups from {len(state['routes'])} routes, "
      f"{rebal} station pairs rebalanced, {sum(legs.values())} daily legs")
