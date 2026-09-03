#!/usr/bin/env python3
"""Concatenate src/ into dist/planner.html.

dist/planner.html is an OUTPUT. Never hand-edit it — edit the part in src/ and
rebuild, or your change is silently reverted by the next build.

src/manifest.json lists the parts in document order. Two entries are generated
rather than copied:
  @net  the airport table, the demand data, the station list, and the route
        seed taken from network.json — plus the config, fleet and Form 41
        economics blocks
  @geo  the coastline and border geometry
Everything else is copied through verbatim.
"""
import argparse, json, pathlib, sys

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
                      block("fleet", load("fleet.json")),
                      block("econ", load("economics.json")),
                      block("intl", load("intl_demand.json"))])

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

# The Artifact runtime wraps published content in its own
# <!doctype html><html><head charset…><body> skeleton, so the artifact target
# must NOT carry those tags. A file served by a web server gets no such
# wrapper: without <meta charset> the browser decodes this UTF-8 document as
# Latin-1, "À-ÿ" inside a regex becomes an out-of-order character range, and
# the whole boot script dies on load. That shipped nothing only because it was
# caught over HTTP — file:// happens to sniff the encoding correctly.
def wrap_standalone(html):
    """Turn the artifact body into a complete, self-describing document."""
    head = ('<!doctype html>\n<html lang="en">\n<head>\n'
            '<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n')
    # The parts run …<style>…css…</style>… — close the head where the CSS ends.
    marker = "</style>"
    i = html.index(marker) + len(marker)
    return head + html[:i] + "\n</head>\n<body>\n" + html[i:] + "\n</body>\n</html>\n"

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--target", choices=["web", "artifact", "both"], default="both",
                    help="web: dist/index.html, a complete document for a web server. "
                         "artifact: dist/artifact.html, body-only for the Artifact tool.")
    args = ap.parse_args()
    html = build()
    # A truncated publish once shipped a dead artifact. Never again silently.
    for marker in ('id="net"', 'id="geo"', 'id="cfg"', 'id="fleet"',
                   "function drawMap", "function exportState", "function build("):
        if marker not in html:
            sys.exit(f"build: output is missing {marker} — refusing to write a broken page")
    # index.html, not planner.html: Workers serves ./dist at the site root,
    # so the page has to be the directory index.
    (ROOT / "dist").mkdir(exist_ok=True)
    targets = []
    if args.target in ("web", "both"):
        targets.append(("dist/index.html", wrap_standalone(html)))
    if args.target in ("artifact", "both"):
        targets.append(("dist/artifact.html", html))

    for rel, text in targets:
        if rel.endswith("index.html") and "charset" not in text[:400]:
            sys.exit("build: the standalone page has no charset in its head — refusing "
                     "to write a document a web server would serve mis-decoded")
        dest = ROOT / rel
        # Write via a temp file and rename, so a reader (verify.py's browser) can
        # never open a half-written 760KB document and fail confusingly.
        tmp = dest.with_suffix(".html.tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(dest)
        print(f"built {rel} — {len(text.encode('utf-8')):,} bytes")

if __name__ == "__main__":
    main()
