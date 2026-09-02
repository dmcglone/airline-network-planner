#!/usr/bin/env python3
"""Concatenate src/ into dist/planner.html.

dist/planner.html is an OUTPUT. Never hand-edit it — edit the part in src/ and
rebuild, or your change is silently reverted by the next build.

src/manifest.json lists the parts in document order. Two entries are generated
rather than copied:
  @net  the airport table, the demand data, the station list, and the route
        seed taken from network.json — plus the config and fleet blocks
  @geo  the coastline and border geometry
Everything else is copied through verbatim.
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
D = ROOT / "src/data"

def load(name):
    return json.loads((D / name).read_text(encoding="utf-8"))

def block(tag, obj):
    """A JSON island. '</' is escaped so a string in the data can never close
    the script tag early."""
    body = json.dumps(obj, separators=(",", ":"), sort_keys=True).replace("</", "<\\/")
    return f'<script type="application/json" id="{tag}">{body}</script>'

def gen_net():
    state = json.loads((ROOT / "network.json").read_text(encoding="utf-8"))["state"]
    net = {"airports": load("airports.json"),
           "routes":   state["routes"],
           "stations": load("stations.json"),
           "demand":   load("dot_db1c.json")}
    return "\n".join([block("net", net), block("cfg", load("config.json")),
                      block("fleet", load("fleet.json"))])

def gen_geo():
    return "</script>\n" + block("geo", load("geo.json"))

GENERATED = {"@net": gen_net, "@geo": gen_geo}

def build():
    out = []
    for rel in json.load(open(ROOT / "src/manifest.json")):
        if rel in GENERATED:
            out.append(GENERATED[rel]())
            continue
        p = ROOT / rel
        if not p.exists():
            sys.exit(f"build: missing part {rel}")
        out.append(p.read_text(encoding="utf-8"))
    return "\n".join(out)

def main():
    html = build()
    # A truncated publish once shipped a dead artifact. Never again silently.
    for marker in ('id="net"', 'id="geo"', 'id="cfg"', 'id="fleet"',
                   "function drawMap", "function exportState", "function build("):
        if marker not in html:
            sys.exit(f"build: output is missing {marker} — refusing to write a broken page")
    # index.html, not planner.html: Workers serves ./dist at the site root,
    # so the page has to be the directory index.
    dest = ROOT / "dist/index.html"
    dest.parent.mkdir(exist_ok=True)
    # Write via a temp file and rename, so a reader (verify.py's browser) can
    # never open a half-written 760KB document and fail confusingly.
    tmp = dest.with_suffix(".html.tmp")
    tmp.write_text(html, encoding="utf-8")
    tmp.replace(dest)
    print(f"built {dest.relative_to(ROOT)} — {len(html):,} bytes")

if __name__ == "__main__":
    main()
