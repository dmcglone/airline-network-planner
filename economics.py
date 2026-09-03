#!/usr/bin/env python3
"""Unit economics, derived from the finished schedule.

Reference implementation. src/economics.js mirrors this, the same way
validate.js mirrors validate.py -- if the two disagree that is a real defect.

This reads the schedule and costs it. It never feeds back into the engine, so
the eight acceptance metrics and the ten checks cannot move because of
anything in here.

    python3 make_legs.py && python3 engine.py && python3 economics.py

WHAT MAKES STAGE LENGTH BITE. Every element is stored as a per-cycle plus a
per-hour rate (see tools/f41_rates.py for how the split is derived, and why
Form 41 cannot measure it). A 300 nm E145 leg pays a full cycle for very few
hours; a transcon amortises the cycle over five. That is the entire reason the
model can tell you a short leg is uneconomic.

MARGINAL VERSUS FULLY ALLOCATED. Ownership is a fixed cost of a roster that
already exists. Charging a route for an aircraft it did not cause is the
classic way to reject a route that would have made money, so `direct` excludes
ownership and `allocated` includes it. For "should this route exist", the
honest test is direct cost against revenue, plus an aircraft only when a
rebuild says the fleet requirement actually moved.
"""
import json, math, pathlib
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent
load = lambda p: json.loads((ROOT / p).read_text())

ECON = load("src/data/economics.json")
FLEETDATA = load("src/data/fleet.json")
FLEET = {f["t"]: f for f in FLEETDATA["types"]}
AP = load("src/data/airports.json")
LINES = load("lines.json")["lines"]

RATES = ECON["types"]
FUEL = ECON["fuel"]["pricePerGal"]
STATION = ECON["station"]
OPS = ECON.get("ops", {})
SPARE = OPS.get("spareRatio", 0.08)
OVERHEAD = OPS.get("overheadPct", 0.0)
HANDLING = OPS.get("handlingPerDep", 0.0)
REF_SEATS = OPS.get("landingRefSeats", 175)


def rate(typ):
    """Form 41 rates for one of this airline's fleet types.

    `f41` on the fleet type says which real aircraft it is costed as; `f41Adj`
    multiplies individual elements where the airline's variant differs. The
    A320E is an A320 with international handling, not a separate cost basis.
    """
    f = FLEET[typ]
    r = RATES.get(f.get("f41", typ))
    if not r:
        raise SystemExit(f"no Form 41 rates for fleet type {typ} "
                         f"(f41={f.get('f41', typ)!r})")
    adj = f.get("f41Adj", {})
    out = {}
    for k in ("gal", "crew", "maint"):
        m = adj.get(k, 1.0)
        out[k] = {"cyc": r[k]["cyc"] * m, "hr": r[k]["hr"] * m}
    out["ownDay"] = (r["ownDay"] or 0) * adj.get("ownDay", 1.0)
    return out


def cost_of_flight(o, d, typ, blk_hr):
    """Direct cost of one departure. Ownership is deliberately not in here."""
    r = rate(typ)
    seats = FLEET[typ]["F"] + FLEET[typ]["PE"] + FLEET[typ]["Y"]
    gal = r["gal"]["cyc"] + r["gal"]["hr"] * blk_hr
    c = {
        "fuel": gal * FUEL,
        "crew": r["crew"]["cyc"] + r["crew"]["hr"] * blk_hr,
        "maint": r["maint"]["cyc"] + r["maint"]["hr"] * blk_hr,
        # Landing fees scale with weight; seats are the only weight proxy the
        # model carries, and the peer figure is at the peer average gauge.
        "landing": STATION["landingPerDep"] * seats / REF_SEATS,
        "handling": HANDLING,
    }
    c["gal"] = gal
    c["direct"] = sum(c[k] for k in
                      ("fuel", "crew", "maint", "landing", "handling"))
    return c


def build():
    """Cost every flight in the schedule, then roll up."""
    flights = []
    block_by_type = defaultdict(float)
    tails = defaultdict(int)
    for l in LINES:
        tails[l["type"]] += 1
        for o, d, dep, arr, b in l["flights"]:
            blk = b / 60.0
            c = cost_of_flight(o, d, l["type"], blk)
            block_by_type[l["type"]] += blk
            flights.append(dict(o=o, d=d, t=l["type"], base=l["base"],
                                blk=blk, nm=dist(o, d), cost=c))

    # Ownership is a daily charge on the whole roster, spares included, spread
    # across that type's flying. High utilisation is what makes it cheap per
    # departure, which is why it cannot be a per-departure constant.
    own_rate = {}
    for t, n in tails.items():
        total = math.ceil(n * (1 + SPARE))
        bh = block_by_type[t]
        own_rate[t] = (rate(t)["ownDay"] * total / bh) if bh else 0.0
    for f in flights:
        f["cost"]["own"] = own_rate[f["t"]] * f["blk"]
        f["cost"]["allocated"] = (f["cost"]["direct"] + f["cost"]["own"]) \
            * (1 + OVERHEAD)
    return flights, tails, own_rate


DIST = {}


def dist(a, b):
    k = (a, b) if a < b else (b, a)
    if k not in DIST:
        la1, lo1 = math.radians(AP[a][2]), math.radians(AP[a][3])
        la2, lo2 = math.radians(AP[b][2]), math.radians(AP[b][3])
        DIST[k] = 3440.065 * 2 * math.asin(math.sqrt(
            math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2)
            * math.sin((lo2 - lo1) / 2) ** 2))
    return DIST[k]


def report(flights, tails, own_rate):
    SM = 1.15078
    seats = lambda t: FLEET[t]["F"] + FLEET[t]["PE"] + FLEET[t]["Y"]
    asm = sum(seats(f["t"]) * f["nm"] * SM for f in flights)
    tot = defaultdict(float)
    for f in flights:
        for k, v in f["cost"].items():
            tot[k] += v
    print(f"{len(flights)} flights, {sum(tails.values())} tails, "
          f"{asm/1e6:.1f}m ASM/day\n")
    print(f"{'element':12}{'$/day':>14}{'cents/ASM':>11}{'share':>8}")
    for k in ("fuel", "crew", "maint", "landing", "handling", "own"):
        print(f"{k:12}{tot[k]:14,.0f}{tot[k]/asm*100:11.2f}"
              f"{tot[k]/tot['allocated']*100:7.0f}%")
    print(f"{'-'*45}")
    print(f"{'direct':12}{tot['direct']:14,.0f}{tot['direct']/asm*100:11.2f}")
    print(f"{'allocated':12}{tot['allocated']:14,.0f}"
          f"{tot['allocated']/asm*100:11.2f}")

    print(f"\n{'type':7}{'deps':>6}{'stage':>7}{'blk/dep':>9}{'$/dep':>9}"
          f"{'CASM':>7}{'seat-mi':>9}")
    by = defaultdict(lambda: defaultdict(float))
    for f in flights:
        a = by[f["t"]]
        a["deps"] += 1
        a["nm"] += f["nm"]
        a["blk"] += f["blk"]
        a["cost"] += f["cost"]["allocated"]
        a["asm"] += seats(f["t"]) * f["nm"] * SM
    for t in FLEET:
        a = by.get(t)
        if not a:
            continue
        print(f"{t:7}{a['deps']:6.0f}{a['nm']/a['deps']:7.0f}"
              f"{a['blk']/a['deps']:9.2f}{a['cost']/a['deps']:9,.0f}"
              f"{a['cost']/a['asm']*100:7.2f}{a['asm']/a['deps']:9,.0f}")

    # CASM against stage length -- the curve the whole model exists to show
    print(f"\n{'stage band':14}{'deps':>7}{'CASM':>8}{'$/dep':>9}  types")
    bands = [(0, 300), (300, 500), (500, 750), (750, 1000), (1000, 1500),
             (1500, 9999)]
    for lo, hi in bands:
        fs = [f for f in flights if lo <= f["nm"] < hi]
        if not fs:
            continue
        c = sum(f["cost"]["allocated"] for f in fs)
        a = sum(seats(f["t"]) * f["nm"] * SM for f in fs)
        ts = sorted({f["t"] for f in fs})
        label = f"{lo}-{hi} nm" if hi < 9999 else f"{lo}+ nm"
        print(f"{label:14}{len(fs):7}{c/a*100:8.2f}{c/len(fs):9,.0f}  "
              f"{','.join(ts)}")


def totals(flights, tails, own_rate):
    SM = 1.15078
    seats = lambda t: FLEET[t]["F"] + FLEET[t]["PE"] + FLEET[t]["Y"]
    tot = defaultdict(float)
    for f in flights:
        for k, v in f["cost"].items():
            tot[k] += v
        tot["asm"] += seats(f["t"]) * f["nm"] * SM
    tot["deps"] = len(flights)
    return dict(tot)


if __name__ == "__main__":
    import sys
    built = build()
    if "--json" in sys.argv:
        t = totals(*built)
        (ROOT / "econ_py.json").write_text(json.dumps(
            {"totals": t, "casm": t["allocated"] / t["asm"] * 100}, indent=1))
        print("wrote econ_py.json")
    else:
        report(*built)
