#!/usr/bin/env python3
"""Route contribution: the cost model and the revenue model, joined.

    python3 make_legs.py && python3 engine.py && python3 economics.py --json \
        && python3 revenue.py && python3 pnl.py

Costs come from economics.py, per leg. Revenue comes from revenue.py, already
prorated onto legs so that connecting itineraries are counted once rather than
once per leg. Both are keyed on the same flight ids out of lines.json.

WHICH MARGIN TO READ. `direct` excludes ownership, because the roster exists
whether or not a given route is flown -- that is the number to judge a
candidate route on. `allocated` adds ownership and overhead and answers a
different question: whether the network as a whole covers its full costs.
A route can be worth flying on the first and lose money on the second.
"""
import json, pathlib
from collections import defaultdict
import economics as E

ROOT = pathlib.Path(__file__).resolve().parent
REV = json.loads((ROOT / "revenue.json").read_text())
BOARDED = {int(k): v for k, v in REV["boarded"].items()}
LEGREV = {int(k): v for k, v in REV["legrev"].items()}
ESTREV = {int(k): v for k, v in REV.get("estrev", {}).items()}

flights, tails, own_rate = E.build()
LINES = E.LINES

# economics.build() and revenue.py both walk lines.json in the same order, so
# flight ids line up; assert it rather than trust it.
ids = [li * 100 + gi for li, l in enumerate(LINES)
       for gi in range(len(l["flights"]))]
assert len(ids) == len(flights), "flight count mismatch between the two models"

rows = defaultdict(lambda: defaultdict(float))
for fid, f in zip(ids, flights):
    k = "-".join(sorted([f["o"], f["d"]]))
    a = rows[k]
    a["deps"] += 1
    a["nm"] = f["nm"]
    a["seats"] += E.FLEET[f["t"]]["F"] + E.FLEET[f["t"]]["PE"] + E.FLEET[f["t"]]["Y"]
    a["pax"] += BOARDED.get(fid, 0.0)
    a["rev"] += LEGREV.get(fid, 0.0)
    a["estrev"] += ESTREV.get(fid, 0.0)
    a["direct"] += f["cost"]["direct"]
    a["alloc"] += f["cost"]["allocated"]

tot = defaultdict(float)
for a in rows.values():
    for k, v in a.items():
        if k != "nm":
            tot[k] += v
print(f"{len(rows)} routes, {tot['deps']:,.0f} departures\n")
print(f"revenue/day        {tot['rev']:14,.0f}")
print(f"direct cost/day    {tot['direct']:14,.0f}")
print(f"allocated cost/day {tot['alloc']:14,.0f}")
print(f"contribution/day   {tot['rev']-tot['direct']:14,.0f}  "
      f"({(tot['rev']-tot['direct'])/tot['rev']*100:.0f}% of revenue)")
print(f"operating result   {tot['rev']-tot['alloc']:14,.0f}")
print(f"system load factor {tot['pax']/tot['seats']*100:14.1f}%")

out = sorted(rows.items(), key=lambda kv: kv[1]["rev"] - kv[1]["direct"])
# A route whose revenue mostly comes from estimated international markets is
# not scored, it is guessed at. Marked, and kept out of the headline count.
EST_LIMIT = 0.25
est = lambda a: a["estrev"] / a["rev"] > EST_LIMIT if a["rev"] > 0 else True


def line(k, a):
    return (f"{k:10}{a['deps']:5.0f}{a['nm']:6.0f}"
            f"{a['pax']/a['seats']*100:6.0f}%{a['rev']/a['deps']:9,.0f}"
            f"{a['direct']/a['deps']:9,.0f}{a['rev']-a['direct']:13,.0f}"
            f"  {'est' if est(a) else ''}")


print(f"\n{'route':10}{'deps':>5}{'nm':>6}{'LF':>7}{'rev/dep':>9}"
      f"{'cost/dep':>9}{'contrib/day':>13}  data")
print("worst 12 on direct contribution")
for k, a in out[:12]:
    print(line(k, a))
print("\nbest 8")
for k, a in out[-8:]:
    print(line(k, a))

neg = [k for k, a in rows.items() if a["rev"] < a["direct"]]
negm = [k for k, a in rows.items() if a["rev"] < a["direct"] and not est(a)]
nest = [k for k, a in rows.items() if est(a)]
print(f"\n{len(neg)} of {len(rows)} routes do not cover their direct cost")
print(f"  of which measured  {len(negm)}   <- the real finding")
print(f"  estimated-dependent{len(neg)-len(negm)}   "
      f"(of {len(nest)} routes drawing >{EST_LIMIT:.0%} of revenue from "
      f"estimated markets)")
