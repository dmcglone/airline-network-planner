#!/usr/bin/env python3
"""International origin-and-destination demand, from a published sheet.

The sheet PAX_DATA_2025-26 is published on the web as ten regional tabs of
city pairs: annual passengers with both directions combined, average one-way
fare in USD, and distance in statute miles. It gives its source as OAG and
MIDT ticketing records for 2025-26, keeps pairs above 1,000 passengers a year,
and warns that split ticketing makes the figures indicative of broad flows
rather than exact point-to-point demand.

DB1C stays the source for US domestic markets. This keeps only what DB1C does
not cover: pairs with at least one end outside the United States, Puerto Rico
and the US Virgin Islands, and both ends in src/data/airports.json, since the
planner cannot route anywhere else. Passengers become per direction per day
(annual / 730), the unit DB1C uses here.

Before writing, it scores itself against DB1C on every US pair both carry and
stores the result in the file, so the comparison travels with the data.

    python tools/intl_pax.py        writes src/data/intl_pax.json
"""
import csv, io, json, math, pathlib, sys, urllib.request
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = "2PACX-1vQOkBeWQpdyQZ7xHkdDiu6fhjEhoqStjxdwqdBlHuk_twRRRIEStvNvujaolumZZroAat-v6ha34Vnr"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/e/{PUB}/pubhtml"
TABS = {"African Subcon": 902327766, "Asia": 1841067059, "Canada": 148716858,
        "Europe": 165495096, "Indian Subcon": 1417092023, "Latin America": 862913801,
        "Middle East": 1137641988, "Oceania": 303846969, "S. Pacific Islands": 1214387782,
        "United States": 607562098}
# DB1C's domain. Puerto Rico and the USVI are domestic to DB1C, so a pair
# between them and the mainland stays with DB1C.
DOMESTIC = {"United States", "Puerto Rico", "Virgin Islands"}


def fetch(gid):
    url = f"https://docs.google.com/spreadsheets/d/e/{PUB}/pub?gid={gid}&single=true&output=csv"
    req = urllib.request.Request(url, headers={"User-Agent": "airline-network-planner"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def number(s):
    s = (s or "").replace("$", "").replace(",", "").replace("mi", "").strip()
    return float(s) if s else None


def main():
    ap = json.loads((ROOT / "src/data/airports.json").read_text(encoding="utf-8"))
    db1c = json.loads((ROOT / "src/data/dot_db1c.json").read_text(encoding="utf-8"))["dot"]["rows"]

    pairs, conflicts, read = {}, 0, 0
    for tab, gid in TABS.items():
        rows = list(csv.reader(io.StringIO(fetch(gid))))
        head = [h.strip().upper() for h in rows[0]]
        iO, iD = head.index("ORIGIN"), head.index("DESTINATION")
        iP, iF = head.index("PAX IN/OUT"), head.index("AVG. FARE ($)")
        n = 0
        for r in rows[1:]:
            if len(r) <= max(iO, iD, iP, iF):
                continue
            o, d = r[iO].strip(), r[iD].strip()
            pax, fare = number(r[iP]), number(r[iF])
            if len(o) != 3 or len(d) != 3 or o == d or not pax:
                continue
            k = o + d if o < d else d + o
            # A pair between two regions is listed in both tabs, with the same figures.
            if k in pairs:
                conflicts += pairs[k] != (pax, fare)
                continue
            pairs[k] = (pax, fare); n += 1
        read += len(rows) - 1
        print(f"{tab:20}{len(rows) - 1:8,} rows{n:8,} new pairs")
    if conflicts:
        sys.exit(f"intl_pax: {conflicts} pairs carry different figures in different tabs")

    # How the sheet scores against DB1C where both measure the same market.
    ratios, fares, lx = [], [], []
    for k, (pax, fare) in pairs.items():
        r = db1c.get(k)
        if not r:
            continue
        each = pax / 730
        ratios.append(each / r[0]); lx.append((math.log(r[0]), math.log(each)))
        if fare and r[1]:
            fares.append(fare / r[1])
    ratios.sort(); fares.sort()
    q = lambda a, p: round(a[int((len(a) - 1) * p)], 3)
    mx = sum(x for x, _ in lx) / len(lx); my = sum(y for _, y in lx) / len(lx)
    cov = sum((x - mx) * (y - my) for x, y in lx)
    r2 = cov * cov / (sum((x - mx) ** 2 for x, _ in lx) * sum((y - my) ** 2 for _, y in lx))
    # Coverage the other way: DB1C markets big enough that the sheet's 1,000 a
    # year cutoff cannot explain their absence.
    big = [k for k, r in db1c.items() if r[0] >= 10]
    check = {"markets": len(ratios), "paxRatioMedian": q(ratios, .5),
             "paxRatioP10": q(ratios, .1), "paxRatioP90": q(ratios, .9),
             "logR2": round(r2, 3), "fareRatioMedian": q(fares, .5),
             "db1cMarketsOver10": len(big), "missingFromSheet": sum(k not in pairs for k in big)}

    keep = {}
    for k, (pax, fare) in pairs.items():
        o, d = k[:3], k[3:]
        if o not in ap or d not in ap:
            continue
        if ap[o][5] in DOMESTIC and ap[d][5] in DOMESTIC:
            continue
        keep[k] = [round(pax / 730, 1), round(fare) if fare else 0]

    out = {
        "source": "OAG and MIDT ticketing records, 2025-26, as compiled in the published sheet PAX_DATA_2025-26",
        "url": SHEET_URL,
        "period": "2025-26",
        "fetched": date.today().isoformat(),
        "unit": "rows: [passengers per direction per day, average one-way fare in USD]",
        "threshold": "pairs above 1,000 passengers a year, both directions combined",
        "scope": "pairs with at least one end outside the US, Puerto Rico and the USVI, both ends in airports.json",
        "caveats": [
            "Third-party figures this project cannot audit. The sheet says split ticketing can overstate "
            "or understate a pair and that its method may include predictive measures.",
            "MIDT counts tickets sold through booking systems, so carriers that sell mostly direct may be undercounted.",
            "A pair the sheet does not list falls back to the gravity estimate in intl_demand.json.",
        ],
        "checkAgainstDB1C": check,
        "rows": dict(sorted(keep.items())),
    }
    path = ROOT / "src/data/intl_pax.json"
    path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"\n{read:,} rows read, {len(pairs):,} distinct pairs, {len(keep):,} kept")
    print(f"against DB1C on {check['markets']:,} US pairs: passengers x{check['paxRatioMedian']} median "
          f"(p10 {check['paxRatioP10']}, p90 {check['paxRatioP90']}), log r2 {check['logR2']}, "
          f"fares x{check['fareRatioMedian']}")
    print(f"DB1C markets of 10+ pax/day missing from the sheet: "
          f"{check['missingFromSheet']:,} of {check['db1cMarketsOver10']:,}")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
