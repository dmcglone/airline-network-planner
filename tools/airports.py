#!/usr/bin/env python3
"""Add Europe to the planner's airport table.

src/data/airports.json was cut from airports.dat (OpenFlights) for the Americas
only. A European airport could not be added to a network, and the OAG/MIDT
sheet's European pairs were dropped by tools/intl_pax.py, which keeps a pair
only when both ends are in this table.

This adds every airport in airports.dat in a European country that the sheet
lists, plus the current European airports airports.dat is too old to have
(Berlin Brandenburg opened in 2020). Airports the sheet never mentions are left
out, so the destination picker is not filled with airstrips. The Americas
entries are left exactly as they are; a rerun replaces only the European part.

Each entry is [name, city, lat, lon, UTC offset in minutes on the design day,
country], the format the page and the Python engines read. Russia is left out:
most of it is in Asia, and this adds Europe. Turkey is in, for Istanbul.

Run it before tools/intl_pax.py.

    python tools/airports.py        writes src/data/airports.json
"""
import csv, json, pathlib, sys
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import intl_pax                                   # the sheet's tabs and its fetch

DESIGN_DAY = datetime(2026, 6, 8)                 # config.json brand.designDay; offsets are for this day
EUROPE = {"United Kingdom", "Ireland", "France", "Germany", "Spain", "Portugal", "Italy", "Netherlands",
          "Belgium", "Luxembourg", "Switzerland", "Austria", "Denmark", "Norway", "Sweden", "Finland",
          "Iceland", "Faroe Islands", "Poland", "Czech Republic", "Slovakia", "Hungary", "Slovenia",
          "Croatia", "Bosnia and Herzegovina", "Serbia", "Montenegro", "Macedonia", "Albania", "Greece",
          "Cyprus", "Malta", "Bulgaria", "Romania", "Moldova", "Ukraine", "Belarus", "Lithuania", "Latvia",
          "Estonia", "Turkey", "Gibraltar", "Jersey", "Guernsey", "Isle of Man"}
# Airports the sheet uses that airports.dat does not have: new airports and new
# codes. Coordinates are the published aerodrome reference points.
EXTRA = {
    "BER": ("Berlin Brandenburg", "Berlin", 52.3617, 13.5023, "Europe/Berlin", "Germany"),
    "RMO": ("Chișinău Intl", "Chisinau", 46.9277, 28.931, "Europe/Chisinau", "Moldova"),     # was KIV
    "COV": ("Çukurova Intl", "Adana", 36.8915, 35.0712, "Europe/Istanbul", "Turkey"),
    "RZV": ("Rize-Artvin", "Rize", 41.1692, 40.8289, "Europe/Istanbul", "Turkey"),
    "GHV": ("Brașov-Ghimbav Intl", "Brasov", 45.7056, 25.5229, "Europe/Bucharest", "Romania"),
    "FDE": ("Førde Bringeland", "Forde", 61.3911, 5.7569, "Europe/Oslo", "Norway"),
}


# Rows airports.dat leaves without a zone, in countries with more than one
ZONE = {"RMU": "Europe/Madrid", "CDT": "Europe/Madrid", "BNJ": "Europe/Berlin"}


def offset(tz):
    return int(ZoneInfo(tz).utcoffset(DESIGN_DAY).total_seconds() // 60)


def need_tzdata():
    # Without time zone data every lookup fails. Skipping those rows would add no
    # European airport at all and say nothing, the way engine.py once built 366
    # rotations on offsets of 0. Stop instead.
    try:
        offset("Europe/London")
    except Exception:
        sys.exit("airports: Python has no time zone data. Install it: python -m pip install tzdata")


def short(name):
    # the same shortening the Americas entries had
    return name.replace(" International Airport", " Intl").replace(" Airport", "").replace(" International", " Intl")


def sheet_airports():
    codes = set()
    for gid in intl_pax.TABS.values():
        rows = list(csv.reader(intl_pax.io.StringIO(intl_pax.fetch(gid))))
        head = [h.strip().upper() for h in rows[0]]
        iO, iD, iP = head.index("ORIGIN"), head.index("DESTINATION"), head.index("PAX IN/OUT")
        for r in rows[1:]:
            if len(r) > max(iO, iD, iP) and intl_pax.number(r[iP]):
                codes.update(c.strip() for c in (r[iO], r[iD]) if len(c.strip()) == 3)
    return codes


def main():
    need_tzdata()
    path = ROOT / "src/data/airports.json"
    ap = json.loads(path.read_text(encoding="utf-8"))
    ap = {k: v for k, v in ap.items() if v[5] not in EUROPE}          # a rerun starts from the Americas
    americas = len(ap)
    listed = sheet_airports()
    rows = list(csv.reader(open(ROOT / "airports.dat", encoding="utf-8")))
    # Some rows have no zone (Istanbul's new airport among them). Where every
    # other airport in that country shares one zone, that is its zone too.
    zones = {}
    for row in rows:
        if row[11] and row[11] != "\\N":
            zones.setdefault(row[3], set()).add(row[11])
    added, skipped = 0, []
    for row in rows:
        iata, name, city, ctry, tz = row[4], row[1], row[2], row[3], row[11]
        if ctry not in EUROPE or row[12] != "airport" or len(iata) != 3 or iata not in listed or iata in ap:
            continue
        if (not tz or tz == "\\N") and iata in ZONE:
            tz = ZONE[iata]
        if not tz or tz == "\\N":
            if len(zones.get(ctry, ())) != 1:
                skipped.append(iata); continue
            tz = next(iter(zones[ctry]))
        off = offset(tz)
        ap[iata] = [short(name), city, round(float(row[6]), 4), round(float(row[7]), 4), off, ctry]
        added += 1
    for iata, (name, city, lat, lon, tz, ctry) in EXTRA.items():
        if iata in listed and iata not in ap:
            ap[iata] = [name, city, lat, lon, offset(tz), ctry]
            added += 1
    # escaped accents and no spaces, as the file has always been written
    path.write_text(json.dumps(dict(sorted(ap.items())), separators=(",", ":")), encoding="utf-8")
    print(f"{americas:,} airports in the Americas kept, {added:,} in Europe added, {len(ap):,} in all")
    if skipped:
        print("left out, no time zone to give them:", " ".join(sorted(skipped)))


if __name__ == "__main__":
    main()
