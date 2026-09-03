#!/usr/bin/env python3
"""Revenue, with connections. Reference implementation; src/revenue.js mirrors it.

    python3 make_legs.py && python3 engine.py && python3 revenue.py

WHY THIS EXISTS. Demand is origin-and-destination, cost is per leg. In a bank
structure a large share of passengers ride two legs on one fare, so multiplying
per-leg loads by per-leg fares would invent revenue that was never sold. This
builds the itineraries the schedule actually offers, allocates each market's
demand across them, and then prorates each fare back onto the legs that carried
it. Leg revenue therefore sums to market revenue by construction.

FOUR MODELLING CHOICES, all of them assumptions rather than measurements:

  1. CONNECTION LEGALITY. A connection is a bank arrival followed by a
     departure at the same station, at least MCT apart and no more than
     MAX_CONNECT, with the two legs no more circuitous than CIRCUITY times
     the nonstop great circle. Only stations connect; a spoke is not a hub.

  2. ALLOCATION. A quality-of-service index. Each itinerary scores on elapsed
     time against the market's best, with a flat penalty for connecting;
     market demand splits in proportion to score. This is the standard shape,
     and it is calibrated against nothing.

  3. PRORATION. Straight distance proration: a leg earns the share of the fare
     matching its share of the itinerary's miles. Real airlines use weighted
     schemes that favour the local leg; distance is the transparent default.

  4. MARKET SHARE. DB1C reports the WHOLE market, every carrier in it. The
     first version of this file allocated all of it to us and spilled eight
     times more traffic than it carried, which is what a one-airline-owns-
     everything assumption looks like when it hits a capacity constraint.
     Share is now QSI against an unobserved competitor, share =
     Q / (Q + COMPETITION), so markets where the schedule is strong win more.
     COMPETITION is not measurable from anything here, so it is a single named
     parameter: 1.0 means a rival of equal schedule quality, and we split the
     market evenly. Load factor is then an OUTPUT, not a target. An earlier
     draft solved COMPETITION to hit an 83% load factor and it drove to zero,
     because even taking 100% of every market this schedule only fills 63.5%.
     That is a finding about the network, not a number to calibrate away:
     capacity sits in thin markets that cannot fill at any plausible share.

  5. SPILL. A flight cannot board more than it has seats. Demand over capacity
     is spilled with no recapture onto other flights, so this understates
     revenue on tight markets rather than flattering it. Applied over a few
     passes, since capping one flight frees demand on another.

DATA PROVENANCE. Every market is tagged. `db1c` is measured US O&D. `estimated`
is international, where gravity demand is scaled by a factor calibrated on the
DB1C-domestic Caribbean (see tools/intl_calibrate.py) and fares come from a
curve fitted on the same markets. Totals are reported both ways, because an
estimated route showing a loss is a statement about the estimate, not about
the route. Real international data backfills through the `overrides` table in
src/data/intl_demand.json without touching this file.

CABIN FARES reconcile down to the observed DB1C average rather than building
up from it: multipliers are normalised so the seat-weighted mean equals 1.0,
which means the real fare data constrains the answer instead of decorating it.
"""
import json, math, pathlib
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent
load = lambda p: json.loads((ROOT / p).read_text())

AP = load("src/data/airports.json")
DEM = load("src/data/dot_db1c.json")
DOT = DEM.get("dot") or {}
ROWS = DOT.get("rows", {})
SIZE = DEM.get("size", {})
BETA, KGRAV = DEM.get("beta", 1.2), DEM.get("k", 1.0)
FLEETDATA = load("src/data/fleet.json")
FLEET = {f["t"]: f for f in FLEETDATA["types"]}
CFG = load("src/data/config.json")
INTL = load("src/data/intl_demand.json")
INTL_OVERRIDE = INTL.get("overrides", {})
INTL_FACTOR = INTL.get("demandFactor", 1.0)
INTL_FARE = INTL.get("fareCurve", {})
STA = set(load("src/data/stations.json"))
LINES = load("lines.json")["lines"]

MCT = CFG.get("mct", 40)
MAX_CONNECT = 240        # minutes; beyond this nobody buys the itinerary
CIRCUITY = 1.35          # connecting path vs nonstop great circle
CONNECT_PENALTY = 0.65   # QSI multiplier for a one-stop against a nonstop
COMPETITION = 1.0        # QSI attributed to every other airline in a market
SPILL_PASSES = 4
# Cabin fare multipliers, normalised below so the seat-weighted mean is 1.0.
CABIN_MULT = {"F": 3.0, "PE": 1.6, "Y": 1.0}

US = "United States"
is_intl = lambda o, d: (AP.get(o, [None]*6)[5] != US
                        or AP.get(d, [None]*6)[5] != US)

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


def fare_curve():
    """Fare against distance, fitted to the real DB1C fares.

    Markets outside the DB1C sample -- everything international -- have
    passengers from the gravity model but no fare at all. Rather than leave
    them at zero or invent a flat number, fit log(fare) on log(nm) across the
    12,241 real markets and use the curve where a real fare is missing.
    """
    xs, ys = [], []
    for k, v in ROWS.items():
        o, d = k[:3], k[3:]
        if o not in AP or d not in AP or not v[1]:
            continue
        nm = dist(o, d)
        if nm < 50:
            continue
        xs.append(math.log(nm))
        ys.append(math.log(v[1]))
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    b = (sum((x - mx) * (y - my) for x, y in zip(xs, ys))
         / sum((x - mx) ** 2 for x in xs))
    a = my - b * mx
    ss = sum((y - my) ** 2 for y in ys)
    rs = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    return math.exp(a), b, 1 - rs / ss, n


FARE_A, FARE_B, FARE_R2, FARE_N = fare_curve()


def market(o, d):
    """Passengers per direction per day, average fare, and where they came from.

    Returns provenance as well as numbers: "db1c" measured, "estimated" for
    international, "none" where the market cannot be sized at all.
    """
    k = o + d if o < d else d + o
    ov = INTL_OVERRIDE.get(k)
    if ov:                                   # real data, backfilled
        return ov[0], ov[1], "db1c"
    r = ROWS.get(k)
    if r:
        return r[0], (r[1] or FARE_A * dist(o, d) ** FARE_B), "db1c"
    so, sd = SIZE.get(o), SIZE.get(d)
    nm = dist(o, d)
    if not so or not sd or nm < 50:
        return 0.0, 0.0, "none"
    air = 1 / (1 + math.exp(-(nm - 190) / 55))
    grav = so * sd / nm ** BETA * KGRAV * air
    # The Caribbean calibration applies to international markets. A US market
    # absent from DB1C is not international, it is just under the sample
    # threshold of roughly three passengers a day, and multiplying it by 7.56
    # would invent traffic.
    if is_intl(o, d):
        return (grav * INTL_FACTOR,
                INTL_FARE.get("a", FARE_A) * nm ** INTL_FARE.get("b", FARE_B),
                "estimated")
    return grav, FARE_A * nm ** FARE_B, "subthreshold"


def flights():
    """Every departure, in UTC minutes, with seats and cabin split."""
    out = []
    for li, l in enumerate(LINES):
        for gi, (o, d, dep, arr, b) in enumerate(l["flights"]):
            f = FLEET[l["type"]]
            out.append(dict(id=li * 100 + gi, o=o, d=d, t=l["type"],
                            dep=dep, arr=arr, blk=b / 60.0, nm=dist(o, d),
                            seats=f["F"] + f["PE"] + f["Y"],
                            cabins={c: f[c] for c in ("F", "PE", "Y")}))
    return out


def itineraries(F):
    """Nonstops, plus one-stop connections over the stations.

    Times are UTC minutes on a repeating day, so a bank that wraps past
    midnight still connects -- the +1440 shift is tried as well as the
    same-day window.
    """
    itins = defaultdict(list)
    for f in F:
        itins[(f["o"], f["d"])].append(
            {"legs": [f], "nm": f["nm"], "elapsed": f["arr"] - f["dep"],
             "stops": 0})
    arr_at, dep_at = defaultdict(list), defaultdict(list)
    for f in F:
        if f["d"] in STA:
            arr_at[f["d"]].append(f)
        if f["o"] in STA:
            dep_at[f["o"]].append(f)
    for s in STA:
        for a in arr_at[s]:
            for b in dep_at[s]:
                if b["d"] == a["o"]:
                    continue          # not a connection, a return
                for shift in (0, 1440):
                    wait = b["dep"] + shift - a["arr"]
                    if MCT <= wait <= MAX_CONNECT:
                        break
                else:
                    continue
                nm = a["nm"] + b["nm"]
                gc = dist(a["o"], b["d"])
                if gc < 50 or nm > CIRCUITY * gc:
                    continue
                itins[(a["o"], b["d"])].append(
                    {"legs": [a, b], "nm": nm, "stops": 1,
                     "elapsed": a["arr"] - a["dep"] + wait
                                + b["arr"] - b["dep"]})
    return itins


def cabin_shares():
    """Fare multipliers normalised so the fleet-weighted mean is 1.0."""
    seats = defaultdict(float)
    for l in LINES:
        f = FLEET[l["type"]]
        for c in ("F", "PE", "Y"):
            seats[c] += f[c] * len(l["flights"])
    tot = sum(seats.values())
    mean = sum(CABIN_MULT[c] * seats[c] / tot for c in seats)
    return {c: CABIN_MULT[c] / mean for c in seats}, \
           {c: seats[c] / tot for c in seats}


def allocate(itins, competition):
    """Split each market's demand across its itineraries, then spill.

    `competition` is the QSI attributed to every other airline in a market.
    Our share is Q/(Q+competition), so a market where we fly three nonstops
    takes a larger share than one we only reach over a hub.
    """
    boarded = defaultdict(float)          # flight id -> passengers
    legrev = defaultdict(float)           # flight id -> prorated revenue
    estrev = defaultdict(float)           # of which from estimated markets
    stats = dict(pax=0.0, conn=0.0, rev=0.0, spilled=0.0,
                 markets=0, real=0, nonstopOnly=0,
                 estPax=0.0, estRev=0.0, estMarkets=0)
    src_of = {}
    per_market = []
    for (o, d), opts in itins.items():
        pax, fare, src = market(o, d)
        if pax <= 0:
            continue
        src_of[(o, d)] = src
        best = min(i["elapsed"] for i in opts)
        for i in opts:
            i["qsi"] = ((best / i["elapsed"]) ** 2
                        * (CONNECT_PENALTY if i["stops"] else 1.0))
        tq = sum(i["qsi"] for i in opts)
        stats["markets"] += 1
        stats["real"] += 1 if src == "db1c" else 0
        stats["estMarkets"] += 1 if src == "estimated" else 0
        if all(i["stops"] == 0 for i in opts):
            stats["nonstopOnly"] += 1
        share = tq / (tq + competition)
        for i in opts:
            i["pax"] = pax * share * i["qsi"] / tq
        per_market.append(((o, d), pax, fare, opts, src))

    # Spill. Capping one flight frees demand on another, so a few passes.
    keep = {f["id"]: 1.0 for f in FLIGHTS}
    for _ in range(SPILL_PASSES):
        boarded.clear()
        for _, _, _, opts, _ in per_market:
            for i in opts:
                k = min(keep[f["id"]] for f in i["legs"])
                for f in i["legs"]:
                    boarded[f["id"]] += i["pax"] * k
        for f in FLIGHTS:
            b = boarded[f["id"]]
            if b > f["seats"]:
                keep[f["id"]] *= f["seats"] / b

    boarded.clear()
    for (o, d), pax, fare, opts, src in per_market:
        for i in opts:
            k = min(keep[f["id"]] for f in i["legs"])
            flown = i["pax"] * k
            stats["spilled"] += i["pax"] - flown
            stats["pax"] += flown
            if i["stops"]:
                stats["conn"] += flown
            rev = flown * fare
            stats["rev"] += rev
            if src == "estimated":
                stats["estPax"] += flown
                stats["estRev"] += rev
            for f in i["legs"]:
                boarded[f["id"]] += flown
                # straight distance proration
                legrev[f["id"]] += rev * f["nm"] / i["nm"]
                if src == "estimated":
                    estrev[f["id"]] += rev * f["nm"] / i["nm"]
    return boarded, legrev, stats, estrev


FLIGHTS = flights()


def main():
    F = FLIGHTS
    itins = itineraries(F)
    mult, seatshare = cabin_shares()
    seats = sum(f["seats"] for f in F)
    boarded, legrev, st, estrev = allocate(itins, COMPETITION)

    # The ceiling: what this schedule would fill if it took every passenger in
    # every market it touches. Anything below 100% is capacity the network
    # cannot fill even unopposed.
    ceiling = sum(allocate(itins, 0.0)[0].values()) / seats

    asm = sum(f["seats"] * f["nm"] for f in F) * 1.15078
    rpm = sum(boarded[f["id"]] * f["nm"] for f in F) * 1.15078
    nonstop = sum(len([i for i in v if not i["stops"]]) for v in itins.values())
    onestop = sum(len([i for i in v if i["stops"]]) for v in itins.values())

    print(f"fare curve: fare = {FARE_A:.2f} x nm^{FARE_B:.3f}  "
          f"(r2 {FARE_R2:.2f} on {FARE_N:,} real markets)")
    print(f"cabin multipliers, normalised: "
          + ", ".join(f"{c} {mult[c]:.2f}" for c in ("F", "PE", "Y"))
          + "  seat share "
          + ", ".join(f"{c} {seatshare[c]*100:.0f}%" for c in ("F", "PE", "Y")))
    print(f"competition QSI {COMPETITION:.2f} "
          f"(1.0 = one rival of equal schedule quality)")
    print(f"\nitineraries: {nonstop:,} nonstop, {onestop:,} one-stop over "
          f"{len(STA)} stations")
    print(f"markets served: {st['markets']:,} "
          f"({st['real']:,} measured DB1C, {st['estMarkets']:,} estimated "
          f"international at x{INTL_FACTOR})")
    print(f"\npassengers/day   {st['pax']:12,.0f}")
    print(f"  connecting     {st['conn']:12,.0f}  "
          f"({st['conn']/st['pax']*100:.0f}% of passengers)")
    print(f"  spilled        {st['spilled']:12,.0f}")
    print(f"revenue/day      {st['rev']:12,.0f}")
    print(f"  measured       {st['rev']-st['estRev']:12,.0f}  "
          f"({(1-st['estRev']/st['rev'])*100:.0f}%)")
    print(f"  estimated      {st['estRev']:12,.0f}  "
          f"({st['estRev']/st['rev']*100:.0f}%, international)")
    print(f"seats/day        {seats:12,.0f}")
    print(f"load factor      {sum(boarded.values())/seats*100:12.1f}%")
    print(f"  unopposed ceiling{ceiling*100:11.1f}%  "
          f"<- at 100% share of every market it serves")
    print(f"RASM (cents)     {st['rev']/asm*100:12.2f}")
    print(f"yield  (cents)   {st['rev']/rpm*100:12.2f}")
    byroute = defaultdict(lambda: [0.0, 0.0, 0.0])   # pax, seats, revenue
    for f in F:
        k = f["o"] + "-" + f["d"] if f["o"] < f["d"] else f["d"] + "-" + f["o"]
        a = byroute[k]
        a[0] += boarded[f["id"]]; a[1] += f["seats"]; a[2] += legrev[f["id"]]
    lfs = sorted(((v[0] / v[1], k, v) for k, v in byroute.items()
                  if v[1] > 0))
    print(f"\nthinnest 8 routes by load factor")
    for lf, k, v in lfs[:8]:
        print(f"  {k:9}{lf*100:6.1f}%{v[1]:8,.0f} seats{v[2]:11,.0f} rev/day")
    print(f"fullest 4")
    for lf, k, v in lfs[-4:]:
        print(f"  {k:9}{lf*100:6.1f}%{v[1]:8,.0f} seats{v[2]:11,.0f} rev/day")

    summary = {"pax": st["pax"], "rev": st["rev"], "conn": st["conn"],
               "spilled": st["spilled"], "estRev": st["estRev"],
               "estPax": st["estPax"], "markets": st["markets"],
               "real": st["real"], "estMarkets": st["estMarkets"],
               "seats": seats, "asm": asm, "rpm": rpm, "ceiling": ceiling,
               "nonstop": nonstop, "onestop": onestop,
               "lf": sum(boarded.values())/seats}
    (ROOT / "rev_py.json").write_text(json.dumps(summary, indent=1))
    json.dump({"boarded": {str(k): v for k, v in boarded.items()},
               "legrev": {str(k): v for k, v in legrev.items()},
               "estrev": {str(k): v for k, v in estrev.items()},
               "stats": st, "competition": COMPETITION, "ceiling": ceiling,
               "fareCurve": [FARE_A, FARE_B, FARE_R2]},
              open(ROOT / "revenue.json", "w"))
    print("\nwrote revenue.json")


if __name__ == "__main__":
    main()
