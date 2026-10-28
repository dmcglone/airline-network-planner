#!/usr/bin/env python3
"""Add Europe's coastline and borders to the map.

src/data/geo.json holds country outlines for the Americas only, so a European
airport would sit in empty sea. This appends the European countries from
Natural Earth's 1:110m admin-0 countries (public domain), rounded to two
decimals like the outlines already there. Russia is left out, as it is from
the airport table; Turkey and Cyprus are in. A polygon west of 30 W (France's
French Guiana) is skipped, because the Americas outlines already draw it.

The Americas rings are not touched. The European ones are recorded under
"europe" in the file, so a rerun replaces them rather than adding a second set.

    python tools/geo_europe.py        writes src/data/geo.json
"""
import json, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
       "geojson/ne_110m_admin_0_countries.geojson")
ALSO = {"Turkey", "Cyprus"}                      # filed under Asia by Natural Earth
SKIP = {"Russia"}


def ring(coords):
    # "lon,lat lon,lat ...", the format geo.json already uses
    f = lambda v: f"{round(v, 2):g}"
    return " ".join(f"{f(x)},{f(y)}" for x, y in coords)


def main():
    req = urllib.request.Request(SRC, headers={"User-Agent": "airline-network-planner"})
    with urllib.request.urlopen(req, timeout=60) as r:
        ne = json.loads(r.read().decode("utf-8"))
    path = ROOT / "src/data/geo.json"
    geo = json.loads(path.read_text(encoding="utf-8"))
    prev = geo.pop("europe", None)
    if prev:                                       # a rerun: drop the last European set
        geo["land"] = geo["land"][:prev["from"]] + geo["land"][prev["from"] + prev["count"]:]
    rings, names = [], []
    for ft in ne["features"]:
        p = ft["properties"]
        name = p.get("ADMIN") or p.get("NAME")
        if name in SKIP or not (p.get("CONTINENT") == "Europe" or name in ALSO):
            continue
        g = ft["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        kept = 0
        for poly in polys:
            outer = poly[0]
            if sum(x for x, _ in outer) / len(outer) < -30:
                continue
            rings.append(ring(outer)); kept += 1
        if kept:
            names.append(name)
    start = len(geo["land"])
    geo["land"] += rings
    geo["europe"] = {"from": start, "count": len(rings),
                     "source": "Natural Earth 1:110m admin 0 countries, public domain", "countries": sorted(names)}
    path.write_text(json.dumps(geo, separators=(",", ":")), encoding="utf-8")
    print(f"{start} rings kept, {len(rings)} European rings added for {len(names)} countries")


if __name__ == "__main__":
    main()
