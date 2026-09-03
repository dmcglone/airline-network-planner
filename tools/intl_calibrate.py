#!/usr/bin/env python3
"""Calibrate an international demand estimate -> src/data/intl_demand.json.

    python3 tools/intl_calibrate.py

THE PROBLEM. DB1C is domestic. Every international market in the network --
the Caribbean, Mexico, Central and South America -- falls through to the
gravity model, which is off by about a factor of seven and produced load
factors of 4-13% on routes we simply have no data for. Reporting those as
unprofitable would be asserting something the data cannot support.

THE ANCHOR. DB1C counts Puerto Rico and the US Virgin Islands as domestic.
SJU, STT, STX and BQN are Caribbean leisure destinations with REAL origin-and-
destination passengers and fares, several hundred markets of them. They are
the closest measured analogue to the unmeasured stations, and they say the
gravity model does not merely scatter around the truth in these markets, it is
biased low by a consistent multiple:

    SJU  x8.2 over 130 markets      STX  x7.5 over 36
    STT  x6.7 over  72              BQN x14.9 over 16

That is what you would expect from a size proxy built on domestic traffic:
a resort island has a small resident population and enormous inbound demand.

WHAT THIS PRODUCES. A multiplier applied to gravity demand for non-US markets,
and a fare curve fitted on the same island markets (r2 0.28, against 0.19 for
the all-market curve). Both are ESTIMATES and everything downstream is tagged
`estimated` so it can be reported separately from measured markets, or
excluded outright.

BACKFILL. `overrides` is an empty per-market table, read in preference to the
estimate. Real international O&D -- T-100 International Segment, or a licensed
dataset -- lands there, market by market, without touching any other file.
"""
import json, math, pathlib, statistics
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
load = lambda p: json.loads((ROOT / p).read_text())

DEM = load("src/data/dot_db1c.json")
ROWS = DEM["dot"]["rows"]
SIZE = DEM["size"]
BETA, KGRAV = DEM["beta"], DEM["k"]
AP = load("src/data/airports.json")

# DB1C-domestic Caribbean: the calibration set.
ISLANDS = {"SJU", "STT", "STX", "BQN", "PSE", "MAZ", "SIG", "CPX", "VQS"}
MIN_MARKETS = 5


def dist(a, b):
    la1, lo1 = math.radians(AP[a][2]), math.radians(AP[a][3])
    la2, lo2 = math.radians(AP[b][2]), math.radians(AP[b][3])
    return 3440.065 * 2 * math.asin(math.sqrt(
        math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2)
        * math.sin((lo2 - lo1) / 2) ** 2))


def gravity(o, d):
    so, sd = SIZE.get(o), SIZE.get(d)
    nm = dist(o, d)
    if not so or not sd or nm < 50:
        return 0.0
    return so * sd / nm ** BETA * KGRAV / (1 + math.exp(-(nm - 190) / 55))


def fit_loglog(pairs):
    xs = [math.log(x) for x, _ in pairs]
    ys = [math.log(y) for _, y in pairs]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    b = (sum((x - mx) * (y - my) for x, y in zip(xs, ys))
         / sum((x - mx) ** 2 for x in xs))
    a = my - b * mx
    ss = sum((y - my) ** 2 for y in ys)
    rs = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    return math.exp(a), b, 1 - rs / ss


def main():
    ratios, per_island, fares = [], defaultdict(list), []
    for k, v in ROWS.items():
        o, d = k[:3], k[3:]
        if o not in AP or d not in AP or (o in ISLANDS) == (d in ISLANDS):
            continue
        isl = o if o in ISLANDS else d
        g = gravity(o, d)
        if g <= 0 or v[0] <= 0:
            continue
        per_island[isl].append(v[0] / g)
        ratios.append(v[0] / g)
        if v[1]:
            fares.append((dist(o, d), v[1]))

    factor = statistics.median(ratios)
    fa, fb, fr2 = fit_loglog(fares)
    islands = {k: {"markets": len(v), "ratio": round(statistics.median(v), 2)}
               for k, v in sorted(per_island.items()) if len(v) >= MIN_MARKETS}

    out = {
        "method": "gravity demand multiplied by a factor calibrated on "
                  "DB1C-domestic Caribbean markets (Puerto Rico, USVI); fares "
                  "from a curve fitted on the same markets",
        "provenance": "estimated",
        "calibration": {
            "islands": islands,
            "markets": len(ratios),
            "medianRatio": round(factor, 2),
            "meanRatio": round(statistics.fmean(ratios), 2),
            "spread": [round(statistics.quantiles(ratios, n=4)[0], 2),
                       round(statistics.quantiles(ratios, n=4)[2], 2)],
        },
        "demandFactor": round(factor, 2),
        "fareCurve": {"a": round(fa, 2), "b": round(fb, 4), "r2": round(fr2, 3),
                      "markets": len(fares)},
        "caveats": [
            "Calibrated on Caribbean leisure markets. Applying the same "
            "factor to Bogota, Lima, Mexico City or Panama City assumes they "
            "are biased the same way, and they are business and VFR markets "
            "rather than resort ones. Those are the least trustworthy "
            "estimates in the model.",
            "The factor is a median over a wide spread; it corrects a "
            "systematic bias, it does not make any single market accurate.",
            "Nothing here is measured international demand. Every market "
            "scored this way is tagged `estimated` downstream.",
        ],
        # Real data lands here, keyed "OOODDD" with the codes sorted, value
        # [passengersPerDayPerDirection, averageFare]. Read in preference to
        # the estimate, so a backfill is additive and needs no code change.
        "overrides": {},
    }
    p = ROOT / "src/data/intl_demand.json"
    p.write_text(json.dumps(out, indent=1) + "\n")

    print(f"calibration set: {len(ratios)} real Caribbean markets")
    for k, v in islands.items():
        print(f"  {k:5}{v['markets']:5} markets   x{v['ratio']:.2f}")
    q1, q3 = out["calibration"]["spread"]
    print(f"\ndemand factor x{factor:.2f}  (quartiles {q1:.2f}-{q3:.2f})")
    print(f"fare curve    {fa:.1f} x nm^{fb:.3f}  r2 {fr2:.2f} "
          f"on {len(fares)} markets")
    print(f"\nwritten to {p.relative_to(ROOT)}")


main()
