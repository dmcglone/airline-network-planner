#!/usr/bin/env python3
"""Form 41 -> src/data/economics.json.

Reproducible extract of aircraft unit costs from published DOT Form 41 data,
the same shape of pipeline as the DB1C demand extract. Reads three BTS files:

  T_F41SCHEDULE_P52.csv   aircraft operating expenses by carrier/type/quarter
  T_T100D_SEGMENT_*.csv   departures, block hours, seats, distance
  T_F41SCHEDULE_P6.csv    carrier-level expenses (landing fees, food)

UNITS. P-5.2 reports hours, aircraft-days, gallons and dollars in THOUSANDS.

REGION. P-5.2 splits each carrier/type across region entities (D domestic,
L Latin, A Atlantic, P Pacific). T-100 Domestic Segment is domestic only, so
both sides are filtered to D. Mixing an all-region numerator with a domestic
denominator inflates every carrier that flies internationally -- it moved
American's A319 crew cost by 12%.

THE CYCLE/HOUR SPLIT. Costs are stored as `cyc` (per departure) and `hr` (per
block hour) so that stage length changes unit cost, which is the whole point of
the model. Form 41 cannot identify that split: regressing gallons per departure
on block hours per departure across carriers gives NEGATIVE intercepts on most
types (-2,592 gal/cycle on the A320), because carrier and mission effects swamp
the stage-length signal -- JetBlue's A320 burns 1,216 gal/hr against Delta's
870 on transcon flying.

So the level comes from Form 41 and only the SHAPE is assumed, via one
transparent parameter per cost element: `cycleEquivHours`, the block-hour
equivalent of a departure. Given observed cost per departure C at observed
block hours per departure B:

    hr  = C / (B + e)        cyc = hr * e

which reconciles exactly to the Form 41 total at each type's observed stage
length, whatever e is. e is an assumption, visible and editable; the totals
are measured. e = 0 reproduces a pure per-hour model.
"""
import argparse, csv, json, pathlib, statistics
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent

TYPES = {
    "318": "A318", "698": "A319", "719": "A319neo", "694": "A320",
    "722": "A320neo", "699": "A321ceo", "721": "A321neo",
    "723": "A220-100", "724": "A220-300",
    "608": "B717", "612": "B737-700", "614": "B737-800", "634": "B737-900",
    "888": "B737-900ER", "737": "B737MAX7", "838": "B737MAX8",
    "894": "B737MAX8-200", "839": "B737MAX9", "885": "B737MAX10",
    "622": "B757-200", "623": "B757-300",
    "343": "A330-200", "696": "A330-200", "687": "A330-300", "824": "A330-900",
    "339": "A330-900", "359": "A350-900", "335": "A350-1000",
    "625": "B767-200", "626": "B767-300", "624": "B767-400",
    "627": "B777-200", "637": "B777-300",
    "887": "B787-8", "889": "B787-9", "837": "B787-10",
    "819": "B747-400", "821": "B747-8",
    "629": "CRJ200", "631": "CRJ700", "657": "CRJ705", "638": "CRJ900",
    "767": "CRJ1000", "530": "CRJ550",
    "674": "E135", "676": "E140", "675": "E145", "677": "E170",
    "673": "E175", "678": "E190", "748": "E195",
    "482": "DHC8-400", "441": "ATR-42", "442": "ATR-72", "461": "EMB-120",
    "656": "MD-90",
}

# Aircraft type 699 is labelled "A321neoXLR" in T_AIRCRAFT_TYPES, but carries
# 243,564 American departures in 2025 at a 1,119 nm average stage. That is the
# ceo fleet; 721 is the actual neo. Inference from volume and stage length,
# not something the BTS file states.

# Carriers whose cost structure resembles a hybrid low-cost operator. The
# legacies report crew cost roughly 40-80% higher for identical flying, so
# which set feeds the blend changes the answer materially. Exposed as a
# setting rather than baked in.
PEER_SETS = {
    "lcc": ["WN", "NK", "F9", "G4", "AS", "B6", "SY", "XP", "MX"],
    "legacy": ["AA", "DL", "UA", "HA"],
    "regional": ["OO", "YX", "MQ", "QX", "YV", "9E", "OH", "ZW", "C5", "PT",
                 "G7"],
}
PEER_SETS["all"] = sorted({c for v in PEER_SETS.values() for c in v})

FUEL_PRICE_KEYS = ("FUEL_FLY_OPS", "AIR_FUELS_ISSUED")

MONEY = ["FUEL_FLY_OPS", "PILOT_FLY_OPS", "BENEFITS_FLY_OPS", "TRAIN_FLY_OPS",
         "PERS_EXP_FLY_OPS", "INS_FLY_OPS", "RENTAL_FLY_OPS", "TOT_FLY_OPS",
         "TOT_DIR_MAINT", "AIRFRAME_DEP", "ENGINE_DEP", "TOT_AIR_OP_EXPENSES"]
UNITS = ["TOTAL_AIR_HOURS", "AIR_DAYS_ASSIGN", "AIR_FUELS_ISSUED"]

# Block-hour equivalent of one departure, per cost element. Fuel: taxi burn
# plus the climb premium over cruise. Maintenance: cycle-driven wear on gear,
# brakes and engine cycles. Crew: pre-flight and turn duty outside block time.
CYCLE_EQUIV = {"fuel": 0.35, "maint": 0.30, "crew": 0.10}

num = lambda r, k: float((r.get(k) or "0").strip() or 0)


def load_p52(path, region="D"):
    agg = defaultdict(lambda: defaultdict(float))
    periods = set()
    for r in csv.DictReader(open(path)):
        periods.add((r["YEAR"], r["QUARTER"]))
        if r["AIRCRAFT_TYPE"] not in TYPES or r["REGION"] != region:
            continue
        a = agg[(r["UNIQUE_CARRIER"], TYPES[r["AIRCRAFT_TYPE"]])]
        for k in MONEY + UNITS:
            a[k] += num(r, k)
    return agg, periods


def load_t100(path):
    ac = defaultdict(lambda: defaultdict(float))
    car = defaultdict(lambda: defaultdict(float))
    periods = set()
    for r in csv.DictReader(open(path)):
        periods.add((r["YEAR"], r["QUARTER"]))
        if r["CLASS"] != "F":
            continue
        d = num(r, "DEPARTURES_PERFORMED")
        if d <= 0:
            continue
        c = r["UNIQUE_CARRIER"]
        s, nm = num(r, "SEATS"), num(r, "DISTANCE")
        for a in (ac[(c, TYPES[r["AIRCRAFT_TYPE"]])]
                  if r["AIRCRAFT_TYPE"] in TYPES else None, car[c]):
            if a is None:
                continue
            a["deps"] += d
            a["blkhrs"] += num(r, "RAMP_TO_RAMP") / 60.0
            a["airhrs"] += num(r, "AIR_TIME") / 60.0
            a["nm"] += nm * d
            a["seats"] += s
            a["pax"] += num(r, "PASSENGERS")
    return ac, car, periods


def observations(p52, t100):
    """One row per carrier/type, with quality flags rather than silent drops."""
    rows = []
    for (carrier, typ), a in p52.items():
        h = a["TOTAL_AIR_HOURS"] * 1000
        d = a["AIR_DAYS_ASSIGN"] * 1000
        g = a["AIR_FUELS_ISSUED"] * 1000
        b = t100.get((carrier, typ))
        if not b or b["deps"] < 500 or h < 1000 or d < 100:
            continue
        usd = lambda k: a[k] * 1000.0
        bh, deps = b["blkhrs"], b["deps"]
        crew = (usd("PILOT_FLY_OPS") + usd("BENEFITS_FLY_OPS")
                + usd("TRAIN_FLY_OPS") + usd("PERS_EXP_FLY_OPS"))
        own = usd("RENTAL_FLY_OPS") + usd("AIRFRAME_DEP") + usd("ENGINE_DEP")
        rows.append(dict(
            carrier=carrier, type=typ, deps=round(deps),
            stage=round(b["nm"] / deps, 1), blkdep=round(bh / deps, 3),
            taxiMin=round((bh - b["airhrs"]) / deps * 60, 1),
            seats=round(b["seats"] / deps, 1), util=round(bh / d, 2),
            blkAirRatio=round(bh / h, 3),
            galDep=round(g / deps, 1), crewDep=round(crew / deps, 1),
            maintDep=round(usd("TOT_DIR_MAINT") / deps, 1),
            ownDay=round(own / d, 1), flags=[]))
    flag(rows)
    return rows


# Flags that make a row unusable, versus flags that are only a caveat. A thin
# sample is still the best evidence available for a type nobody flies much
# domestically, so it annotates rather than excludes -- otherwise every
# widebody disappears.
EXCLUDE = {"low-util", "hours-basis", "negative-maint", "burn-outlier"}


def flag(rows):
    """Mark rows that cannot be believed, with the reason kept on the row."""
    med = defaultdict(list)
    for r in rows:
        med[r["type"]].append(r["galDep"] / max(r["blkdep"], .1))
    med = {t: statistics.median(v) for t, v in med.items()}
    for r in rows:
        f = r["flags"]
        if r["deps"] < 10000:
            f.append("thin")
        if r["util"] < 4:
            f.append("low-util")          # fleet entering or leaving service
        if r["blkAirRatio"] < 1.0:
            f.append("hours-basis")       # block < airborne is impossible;
        if r["maintDep"] < 0:             # the carrier is filing block hours
            f.append("negative-maint")    # in the airborne-hours field
        if r["ownDay"] < 500:
            f.append("no-ownership")      # CPA: partner owns the aircraft
        gph = r["galDep"] / max(r["blkdep"], .1)
        m = med.get(r["type"], gph)
        if m and not 0.6 < gph / m < 1.7:
            f.append("burn-outlier")
    # A carrier reporting the identical ownership cost against every type it
    # flies is allocating a fleet total, not measuring the type. Spirit files
    # $8,721 a day against the A320, A320neo, A321ceo and A321neo alike.
    by_car = defaultdict(list)
    for r in rows:
        by_car[r["carrier"]].append(r)
    for rs in by_car.values():
        if len(rs) > 2 and len({round(r["ownDay"]) for r in rs}) == 1:
            for r in rs:
                r["flags"].append("flat-ownership")


def rate(rows, elem, per):
    """Departure-weighted mean of a per-departure cost, split cyc/hr."""
    w = sum(r["deps"] for r in rows)
    cost = sum(r[per] * r["deps"] for r in rows) / w
    blk = sum(r["blkdep"] * r["deps"] for r in rows) / w
    e = CYCLE_EQUIV[elem]
    hr = cost / (blk + e)
    return {"cyc": round(hr * e, 1), "hr": round(hr, 1)}


def blend(rows, peers):
    """Per-type rates from unflagged observations of the chosen peer set."""
    usable = [r for r in rows if not (EXCLUDE & set(r["flags"]))]
    by = defaultdict(list)
    for r in usable:
        if r["carrier"] in peers:
            by[r["type"]].append(r)
    # Widebodies are flown almost exclusively by the legacies, so a low-cost
    # peer set has nothing to say about a 787. Rather than drop the type,
    # fall back to whoever does fly it and record that the peer set was not
    # honoured for this row.
    outside = defaultdict(list)
    for r in usable:
        if r["type"] not in by:
            outside[r["type"]].append(r)
    for t, rs in outside.items():
        by[t] = rs
    out = {}
    for t, rs in sorted(by.items()):
        w = sum(r["deps"] for r in rs)
        av = lambda k: sum(r[k] * r["deps"] for r in rs) / w
        # Ownership is dropped where the filing is a fleet allocation or the
        # aircraft belongs to a codeshare partner rather than the operator.
        orws = [r for r in rs
                if not {"flat-ownership", "no-ownership"} & set(r["flags"])]
        ow = sum(r["deps"] for r in orws)
        out[t] = {
            "gal": rate(rs, "fuel", "galDep"),
            "crew": rate(rs, "crew", "crewDep"),
            "maint": rate(rs, "maint", "maintDep"),
            "ownDay": (round(sum(r["ownDay"] * r["deps"] for r in orws) / ow)
                       if ow else None),
            "seats": round(av("seats")),
            "taxiMin": round(av("taxiMin"), 1),
            "obsStage": round(av("stage")),
            "carriers": sorted(r["carrier"] for r in rs),
            "deps": round(w),
            "flags": sorted({f for r in rs for f in r["flags"]}
                            | ({"outside-peer-set"} if t in outside else set())),
        }
    return out


def station_rates(p6path, carriers_t100, peers):
    """Landing fees and catering per departure, carrier level.

    P-6 is not split by region, so these are all-region costs over domestic
    departures and read slightly high. Ground handling is deliberately not
    taken from SALARIES_TRAFFIC: the low-cost carriers outsource it, so they
    report $67-110 a departure against $2,000-3,300 for the legacies, which
    measures who employs the rampers rather than what handling costs.
    """
    agg = defaultdict(lambda: defaultdict(float))
    for r in csv.DictReader(open(p6path)):
        a = agg[r["UNIQUE_CARRIER"]]
        for k in ("LANDING_FEES", "FOOD", "OP_EXPENSE"):
            a[k] += num(r, k)
    land, food, obs = [], [], []
    for c in peers:
        a, b = agg.get(c), carriers_t100.get(c)
        if not a or not b or b["deps"] < 20000 or a["LANDING_FEES"] <= 0:
            continue
        lf = a["LANDING_FEES"] * 1000 / b["deps"]
        fd = a["FOOD"] * 1000 / b["pax"]
        land.append((lf, b["deps"]))
        food.append((fd, b["deps"]))
        obs.append({"carrier": c, "landPerDep": round(lf),
                    "foodPerPax": round(fd, 2),
                    "seatsPerDep": round(b["seats"] / b["deps"])})
    wm = lambda v: round(sum(x * w for x, w in v) / sum(w for _, w in v), 2)
    return {"landingPerDep": wm(land), "foodPerPax": wm(food),
            "note": "landingPerDep is at the peer average gauge; scale by "
                    "seats for other types", "observations": obs}


def fuel_price(p52):
    """Dollars per gallon implied by the filings, mainline carriers only."""
    d = g = 0.0
    for (carrier, _), a in p52.items():
        if carrier in PEER_SETS["regional"] or a["FUEL_FLY_OPS"] <= 0:
            continue
        d += a["FUEL_FLY_OPS"]
        g += a["AIR_FUELS_ISSUED"]
    return round(d / g, 3) if g else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="f41", help="directory of BTS CSVs")
    ap.add_argument("--p52", default="p52_2025/T_F41SCHEDULE_P52.csv",
                    help="P-5.2 file, relative to --src")
    ap.add_argument("--peers", default="lcc", choices=sorted(PEER_SETS))
    ap.add_argument("--out", default=str(ROOT / "src/data/economics.json"))
    args = ap.parse_args()
    d = pathlib.Path(args.src)

    p52, pq = load_p52(d / args.p52)
    t100_ac, t100_car, tq = load_t100(d / "T_T100D_SEGMENT_US_CARRIER_ONLY.csv")
    # Every rate here is a P-5.2 numerator over a T-100 denominator. If the two
    # files cover different periods the ratios are silently wrong rather than
    # obviously wrong -- a quarter of cost over a year of departures understates
    # burn by a factor of five and nothing about the output looks odd.
    if pq != tq:
        fmt = lambda s: ", ".join(f"{y}Q{q}" for y, q in sorted(s)) or "none"
        raise SystemExit(f"period mismatch: P-5.2 covers {fmt(pq)} but T-100 "
                         f"covers {fmt(tq)}. Download matching periods.")
    rows = observations(p52, t100_ac)
    peers = PEER_SETS[args.peers] + PEER_SETS["regional"]

    out = {
        "meta": {
            "source": "US DOT Form 41 Schedule P-5.2 and P-6, T-100 Domestic "
                      "Segment, calendar 2025",
            "region": "domestic entities only, both sides of the join",
            "periods": sorted(f"{y}Q{q}" for y, q in pq),
            "peerSet": args.peers,
            "cycleEquivHours": CYCLE_EQUIV,
            "caveats": [
                "The cycle/hour split is assumed, not measured -- Form 41 "
                "cannot identify it. Only cycleEquivHours is an assumption; "
                "the totals reconcile to Form 41 at each type's observed "
                "stage length.",
                "Widebody rows come from domestic flying only, a small and "
                "unrepresentative slice of mostly-international fleets. "
                "Treat as provisional until T-100 Segment (All Carriers) is "
                "joined against all P-5.2 regions.",
                "Regional carriers fly under capacity purchase agreements: "
                "fuel dollars and often ownership sit with the mainline "
                "partner. Gallons are still reported, so burn is real and "
                "fuel is priced here rather than taken from their books.",
                "Aircraft type 699 is treated as the A321ceo despite being "
                "labelled A321neoXLR in T_AIRCRAFT_TYPES; 721 is the neo.",
            ],
        },
        "fuel": {"pricePerGal": fuel_price(p52),
                 "note": "implied by mainline fuel dollars over gallons "
                         "issued, 2025; regionals excluded because their "
                         "fuel is bought by the mainline partner"},
        # Knobs the rates do not determine. Handling is set here rather than
        # taken from P-6 because SALARIES_TRAFFIC measures who employs the
        # rampers, not what handling costs.
        "ops": {"spareRatio": 0.08, "overheadPct": 0.18,
                "handlingPerDep": 450, "landingRefSeats": 175},
        "peerSets": PEER_SETS,
        "types": blend(rows, peers),
        "station": station_rates(d / "p6b/T_F41SCHEDULE_P6.csv", t100_car,
                                 PEER_SETS[args.peers]),
        "observations": sorted(rows, key=lambda r: (r["type"], -r["deps"])),
    }
    pathlib.Path(args.out).write_text(json.dumps(out, indent=1) + "\n")

    t = out["types"]
    print(f"{len(rows)} observations, {len(t)} types with usable rates, "
          f"peer set '{args.peers}'")
    flagged = [r for r in rows if r["flags"]]
    print(f"{len(flagged)} observations flagged")
    print(f"\n{'type':12}{'gal/cyc':>8}{'gal/hr':>8}{'$crew/cyc':>10}"
          f"{'$crew/hr':>9}{'$mnt/cyc':>9}{'$mnt/hr':>8}{'$own/day':>9}"
          f"{'seats':>6}  carriers")
    for k, v in t.items():
        print(f"{k:12}{v['gal']['cyc']:8.0f}{v['gal']['hr']:8.0f}"
              f"{v['crew']['cyc']:10.0f}{v['crew']['hr']:9.0f}"
              f"{v['maint']['cyc']:9.0f}{v['maint']['hr']:8.0f}"
              f"{(v['ownDay'] or 0):9.0f}{v['seats']:6.0f}  "
              f"{','.join(v['carriers'])}"
              f"{'  [' + ','.join(v['flags']) + ']' if v['flags'] else ''}")
    print(f"\nstation: {out['station']['landingPerDep']} per departure "
          f"landing, {out['station']['foodPerPax']} per passenger catering")
    print(f"written to {args.out}")


main()
