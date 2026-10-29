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

DATA PROVENANCE. Every market is tagged. `db1c` is measured US O&D. `intl` is
international from OAG and MIDT ticketing records as compiled in a published
sheet (src/data/intl_pax.json, written by tools/intl_pax.py), which only holds
pairs DB1C does not cover. `estimated` is international the sheet does not
list, where gravity demand is scaled by a factor calibrated on the
DB1C-domestic Caribbean (see tools/intl_calibrate.py) and fares come from a
curve fitted on the same markets. Totals are reported both ways, because an
estimated route showing a loss is a statement about the estimate, not about
the route.

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
INTL_ROWS = load("src/data/intl_pax.json")["rows"]
STA = set(load("src/data/stations.json"))
LINES = load("lines.json")["lines"]

MCT = CFG.get("mct", 40)
MAX_CONNECT = 240        # minutes; beyond this nobody buys the itinerary
CIRCUITY = 1.35          # connecting path vs nonstop great circle
CONNECT_PENALTY = 0.65   # QSI multiplier for a one-stop against a nonstop
COMPETITION = 1.0        # QSI attributed to every other airline in a market
SPILL_PASSES = 4
# Two-stop itineraries: a feeder into one of our stations, a flight to another,
# a flight out. Offered only in measured markets the schedule gives no nonstop
# or one-stop, so no market served today changes. Their rival is another
# airline's best trip: a nonstop where the market is big enough that someone
# flies it, otherwise a one-stop. The demand data carries no carrier schedules,
# so "big enough" is a named assumption; BTS T-100 segment data would replace it.
TWO_STOP_WEIGHT = 0.10        # QSI of a two-stop against a nonstop of equal elapsed time
RIVAL_NONSTOP_PAX = 30        # passengers a day each way from which a rival nonstop is assumed
RIVAL_NONSTOP_NM = 200        # and only beyond this distance
RIVAL_GND, RIVAL_KT = 35, 450             # a rival narrowbody nonstop's block
RIVAL_CIRCUITY, RIVAL_WAIT = 1.15, 90     # and its one-stop: further, and a connection
# Cabin fare multipliers, normalised below so the seat-weighted mean is 1.0.
# What a seat is worth against economy, by cabin AND by the kind of seat in it.
# A domestic recliner up front and a lie-flat suite are not the same product and
# must not earn the same fare. Mirrors SEAT_MULT in src/revenue.js.
SEAT_MULT = {
    "F":  {"lieflat": 5.5, "recliner": 3.0},
    "PE": {"recliner": 2.0, "standard": 1.6},
    "Y":  {"standard": 1.0},
}
# A flat bed earns its premium because you can sleep on it, so the premium
# depends on stage length. Recliners are not tapered: their value is legroom.
LIEFLAT_FULL_NM, LIEFLAT_FLOOR = 1800.0, 0.30
DEFAULT_KIND = {"F": "recliner", "PE": "standard", "Y": "standard"}


def seat_kind_of(spec, cabin):
    allowed = {"F": ("lieflat", "recliner"),
               "PE": ("recliner", "standard"),
               "Y": ("standard",)}[cabin]
    k = (spec.get("geom", {}) or {}).get("seat", {}).get(cabin)
    return k if k in allowed else DEFAULT_KIND[cabin]


def seat_mult(cabin, kind, nm):
    m = SEAT_MULT.get(cabin, {}).get(kind)
    if m is None:
        return 1.0
    if kind != "lieflat":
        return m
    t = min(1.0, max(LIEFLAT_FLOOR, (nm or 0.0) / LIEFLAT_FULL_NM))
    return 1.0 + (m - 1.0) * t


def raw_premium(f):
    """The un-normalised worth of an average seat on one flight."""
    s = FLEET.get(f["t"])
    if not s:
        return 1.0
    tot = s["F"] + s["PE"] + s["Y"]
    if not tot:
        return 1.0
    return sum(seat_mult(c, seat_kind_of(s, c), f["nm"]) * s[c]
               for c in ("F", "PE", "Y")) / tot

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

    Returns provenance as well as numbers: "db1c" measured, "intl" for
    international from the OAG and MIDT sheet, "estimated" for international
    it does not list, "none" where the market cannot be sized at all.
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
    # The sheet only holds pairs DB1C does not cover, so looking it up second
    # can never displace a domestic market.
    r = INTL_ROWS.get(k)
    if r:
        return (r[0], (r[1] or INTL_FARE.get("a", FARE_A) * nm ** INTL_FARE.get("b", FARE_B)),
                "intl")
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


def wait_of(a, b):
    """Minutes on the ground between flight a and flight b, or None."""
    for shift in (0, 1440):
        w = b["dep"] + shift - a["arr"]
        if MCT <= w <= MAX_CONNECT:
            return w
    return None


def itineraries(F):
    """Nonstops, plus one-stop connections over the stations, plus two-stops
    for the markets neither serves.

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
                wait = wait_of(a, b)
                if wait is None:
                    continue
                nm = a["nm"] + b["nm"]
                gc = dist(a["o"], b["d"])
                if gc < 50 or nm > CIRCUITY * gc:
                    continue
                itins[(a["o"], b["d"])].append(
                    {"legs": [a, b], "nm": nm, "stops": 1,
                     "elapsed": a["arr"] - a["dep"] + wait
                                + b["arr"] - b["dep"]})
    # Two-stops: the middle flight joins two of our stations, and each
    # connection follows the one-stop rules. Only measured markets nothing
    # above serves.
    served, sized = set(itins), {}

    def measured(o, d):
        if (o, d) not in sized:
            pax, _, src = market(o, d)
            sized[(o, d)] = pax > 0 and src in ("db1c", "intl")
        return sized[(o, d)]

    for L in F:
        if L["o"] not in STA or L["d"] not in STA:
            continue
        feed = [a for a in arr_at[L["o"]] if a["o"] != L["d"] and wait_of(a, L) is not None]
        on = [b for b in dep_at[L["d"]] if b["d"] != L["o"] and wait_of(L, b) is not None]
        for a in feed:
            for b in on:
                if a["o"] == b["d"] or (a["o"], b["d"]) in served:
                    continue
                nm = a["nm"] + L["nm"] + b["nm"]
                gc = dist(a["o"], b["d"])
                if gc < 50 or nm > CIRCUITY * gc or not measured(a["o"], b["d"]):
                    continue
                itins[(a["o"], b["d"])].append(
                    {"legs": [a, L, b], "nm": nm, "stops": 2,
                     "elapsed": a["arr"] - a["dep"] + wait_of(a, L)
                                + L["arr"] - L["dep"] + wait_of(L, b)
                                + b["arr"] - b["dep"]})
    return itins


def flight_premiums(F):
    """Premiums normalised so the seat-weighted fleet mean is 1.0.

    Per FLIGHT rather than per type, because the lie-flat taper makes the same
    aircraft worth more on a long sector than a short one. Normalising keeps the
    network total pinned to the measured DB1C fares -- cabin mix moves revenue
    between flights rather than adding any.

    ASSUMPTION, unchanged: passengers are spread across cabins in proportion to
    seats, so a premium cabin is credited whether or not anyone would have
    bought it. Mirrors flightPremiums() in src/revenue.js.
    """
    num = den = 0.0
    raw = {}
    for f in F:
        s = FLEET.get(f["t"])
        if not s:
            continue
        seats = s["F"] + s["PE"] + s["Y"]
        r = raw_premium(f)
        raw[f["id"]] = r
        num += r * seats
        den += seats
    mean = (num / den) if den else 1.0
    return {i: (r / mean if mean else 1.0) for i, r in raw.items()}, mean


def allocate(itins, competition, prem):
    """Split each market's demand across its itineraries, then spill.

    `competition` is the QSI attributed to every other airline in a market.
    Our share is Q/(Q+competition), so a market where we fly three nonstops
    takes a larger share than one we only reach over a hub. In a two-stop
    market the rival's trip is modelled, and `competition` scales it, so 0
    still means every passenger (the ceiling).
    """
    boarded = defaultdict(float)          # flight id -> passengers
    legrev = defaultdict(float)           # flight id -> prorated revenue
    estrev = defaultdict(float)           # of which from estimated markets
    stats = dict(pax=0.0, conn=0.0, rev=0.0, spilled=0.0,
                 markets=0, real=0, nonstopOnly=0,
                 estPax=0.0, estRev=0.0, estMarkets=0,
                 intlMarkets=0, intlRev=0.0, twoStop=0.0, twoStopRev=0.0)
    src_of = {}
    per_market = []
    for (o, d), opts in itins.items():
        pax, fare, src = market(o, d)
        if pax <= 0:
            continue
        src_of[(o, d)] = src
        best = min(i["elapsed"] for i in opts)
        rival = competition
        if opts[0]["stops"] == 2:
            # A two-stop market has only two-stops of ours. The rival's best
            # trip sets the pace: a nonstop where the market can hold one,
            # otherwise a one-stop.
            nm = dist(o, d)
            ns = RIVAL_GND + nm / RIVAL_KT * 60
            nonstop = pax >= RIVAL_NONSTOP_PAX and nm >= RIVAL_NONSTOP_NM
            theirs = ns if nonstop else ns * RIVAL_CIRCUITY + RIVAL_WAIT
            best = min(best, theirs)
            rival = competition * (best / theirs) ** 2 * (1.0 if nonstop else CONNECT_PENALTY)
        for i in opts:
            w = TWO_STOP_WEIGHT if i["stops"] == 2 else CONNECT_PENALTY if i["stops"] else 1.0
            i["qsi"] = (best / i["elapsed"]) ** 2 * w
        tq = sum(i["qsi"] for i in opts)
        stats["markets"] += 1
        stats["real"] += 1 if src == "db1c" else 0
        stats["estMarkets"] += 1 if src == "estimated" else 0
        stats["intlMarkets"] += 1 if src == "intl" else 0
        if all(i["stops"] == 0 for i in opts):
            stats["nonstopOnly"] += 1
        share = tq / (tq + rival)
        for i in opts:
            i["pax"] = pax * share * i["qsi"] / tq
        per_market.append(((o, d), pax, fare, opts, src))

    # Spill. Capping one flight frees demand on another, so a few passes.
    # Two-stops are left out here and take only the seats left once everyone
    # else is aboard, as revenue management would: sharing a full flight with
    # them pushed out passengers paying more per seat, and network revenue
    # fell as they were added.
    def first(i):
        return i["stops"] != 2

    keep = {f["id"]: 1.0 for f in FLIGHTS}
    for _ in range(SPILL_PASSES):
        boarded.clear()
        for _, _, _, opts, _ in per_market:
            for i in opts:
                if not first(i):
                    continue
                k = min(keep[f["id"]] for f in i["legs"])
                for f in i["legs"]:
                    boarded[f["id"]] += i["pax"] * k
        for f in FLIGHTS:
            b = boarded[f["id"]]
            if b > f["seats"]:
                keep[f["id"]] *= f["seats"] / b
    boarded.clear()                          # everyone else, as finally placed
    for _, _, _, opts, _ in per_market:
        for i in opts:
            if not first(i):
                continue
            k = min(keep[f["id"]] for f in i["legs"])
            for f in i["legs"]:
                boarded[f["id"]] += i["pax"] * k
    keep2 = {f["id"]: 1.0 for f in FLIGHTS}
    for _ in range(SPILL_PASSES):
        b2 = defaultdict(float)
        for _, _, _, opts, _ in per_market:
            for i in opts:
                if first(i):
                    continue
                k = min(keep2[f["id"]] for f in i["legs"])
                for f in i["legs"]:
                    b2[f["id"]] += i["pax"] * k
        for f in FLIGHTS:
            b, room = b2[f["id"]], max(0.0, f["seats"] - boarded[f["id"]])
            if b > room:
                keep2[f["id"]] *= room / b

    boarded.clear()
    for (o, d), pax, fare, opts, src in per_market:
        for i in opts:
            kk = keep if first(i) else keep2
            k = min(kk[f["id"]] for f in i["legs"])
            flown = i["pax"] * k
            stats["spilled"] += i["pax"] - flown
            stats["pax"] += flown
            if i["stops"]:
                stats["conn"] += flown
            # Distance-weighted mean of the legs' cabin premiums. Weighting by
            # distance and not by leg count is deliberate: the fare is prorated
            # onto the legs by distance a few lines below, so using the same
            # weight here keeps leg revenue summing to itinerary revenue exactly
            # -- the invariant this whole file exists to hold.
            im = sum(prem.get(f["id"], 1.0) * f["nm"] for f in i["legs"]) / i["nm"]
            rev = flown * fare * im
            stats["rev"] += rev
            if i["stops"] == 2:
                stats["twoStop"] += flown
                stats["twoStopRev"] += rev
            if src == "estimated":
                stats["estPax"] += flown
                stats["estRev"] += rev
            if src == "intl":
                stats["intlRev"] += rev
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
    prem, premMean = flight_premiums(F)
    seats = sum(f["seats"] for f in F)
    boarded, legrev, st, estrev = allocate(itins, COMPETITION, prem)

    # The ceiling: what this schedule would fill if it took every passenger in
    # every market it touches. Anything below 100% is capacity the network
    # cannot fill even unopposed.
    ceiling = sum(allocate(itins, 0.0, prem)[0].values()) / seats

    asm = sum(f["seats"] * f["nm"] for f in F) * 1.15078
    rpm = sum(boarded[f["id"]] * f["nm"] for f in F) * 1.15078
    nonstop = sum(len([i for i in v if not i["stops"]]) for v in itins.values())
    onestop = sum(len([i for i in v if i["stops"] == 1]) for v in itins.values())
    twostop = sum(len([i for i in v if i["stops"] == 2]) for v in itins.values())

    print(f"fare curve: fare = {FARE_A:.2f} x nm^{FARE_B:.3f}  "
          f"(r2 {FARE_R2:.2f} on {FARE_N:,} real markets)")
    kinds = sorted({(c, seat_kind_of(FLEET[t], c))
                    for t in FLEET for c in ("F", "PE", "Y") if FLEET[t][c]})
    print("seat multipliers in use: "
          + ", ".join(f"{c}/{k} {SEAT_MULT[c][k]:g}" for c, k in kinds)
          + f"   fleet mean premium {premMean:.3f}"
          + f"   (lie-flat tapers to {LIEFLAT_FLOOR:g} below {LIEFLAT_FULL_NM:g} nm)")
    print(f"competition QSI {COMPETITION:.2f} "
          f"(1.0 = one rival of equal schedule quality)")
    print(f"\nitineraries: {nonstop:,} nonstop, {onestop:,} one-stop, {twostop:,} two-stop over "
          f"{len(STA)} stations")
    print(f"markets served: {st['markets']:,} "
          f"({st['real']:,} measured DB1C, {st['intlMarkets']:,} international "
          f"from OAG/MIDT, {st['estMarkets']:,} estimated international at x{INTL_FACTOR})")
    print(f"\npassengers/day   {st['pax']:12,.0f}")
    print(f"  connecting     {st['conn']:12,.0f}  "
          f"({st['conn']/st['pax']*100:.0f}% of passengers)")
    print(f"    of which two-stop {st['twoStop']:7,.0f}  "
          f"({st['twoStopRev']:,.0f} revenue; only seats left empty)")
    print(f"  spilled        {st['spilled']:12,.0f}")
    print(f"revenue/day      {st['rev']:12,.0f}")
    print(f"  measured       {st['rev']-st['estRev']:12,.0f}  "
          f"({(1-st['estRev']/st['rev'])*100:.0f}%)")
    print(f"    of which intl{st['intlRev']:12,.0f}  "
          f"({st['intlRev']/st['rev']*100:.0f}%, OAG/MIDT sheet)")
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
               "intlMarkets": st["intlMarkets"], "intlRev": st["intlRev"],
               "seats": seats, "asm": asm, "rpm": rpm, "ceiling": ceiling,
               "nonstop": nonstop, "onestop": onestop, "twostop": twostop,
               "twoStop": st["twoStop"], "twoStopRev": st["twoStopRev"],
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
