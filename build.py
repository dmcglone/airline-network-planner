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
import argparse, shutil, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
D = ROOT / "src/data"

def load(name):
    return json.loads((D / name).read_text(encoding="utf-8"))

def block(tag, obj):
    """A JSON island. '</' is escaped so a string in the data can never close
    the script tag early."""
    body = json.dumps(obj, separators=(",", ":"), sort_keys=True).replace("</", "<\\/")
    return f'<script type="application/json" id="{tag}">{body}</script>'

def gen_net(defer_demand=False):
    """Assemble the data blocks that ship inside the page.

    The DB1C demand file is 192 KB gzipped, over half the compressed payload,
    and the engine does not need it: a schedule is built from routes, fleet and
    geography. It only feeds the demand column, the Grow tab and the revenue
    model. So the web build leaves it out of the document and fetches it after
    first paint, which roughly halves time-to-interactive on a slow connection.

    The artifact build still inlines it, because a body-only fragment pasted
    into another page has nowhere reliable to fetch a sibling file from.
    """
    state = json.loads((ROOT / "network.json").read_text(encoding="utf-8"))["state"]
    net = {"airports": load("airports.json"),
           "routes":   state["routes"],
           "stations": load("stations.json")}
    if defer_demand:
        net["demandUrl"] = "demand.json"
    else:
        net["demand"] = load("dot_db1c.json")
    return "\n".join([block("net", net), block("cfg", load("config.json")),
                      block("fleet", load("fleet.json")),
                      block("frames", load("airframes.json")),
                      block("starters", load("starters.json")),
                      block("econ", load("economics.json")),
                      block("intl", load("intl_demand.json"))])

def gen_geo():
    return "</script>\n" + block("geo", load("geo.json"))

GENERATED = {"@net": gen_net, "@geo": gen_geo}

def build(defer_demand=False):
    out = []
    for rel in json.load(open(ROOT / "src/manifest.json")):
        if rel in GENERATED:
            fn = GENERATED[rel]
            out.append(fn(defer_demand) if fn is gen_net else fn())
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
def inject_site_urls(html):
    """Fill in the absolute URLs the social crawlers need.

    og:image and og:url have to be absolute — a crawler does not resolve a
    relative path and cannot fetch a data URI. The address is in config.json
    rather than hardcoded here, so pointing the site at a real domain is one
    line of data, not a code change.
    """
    url = (load("config.json").get("site") or {}).get("url", "").rstrip("/")
    if not url:
        return html          # no address configured: ship without the cards
    tags = (f'<meta property="og:url" content="{url}/">\n'
            f'<meta property="og:image" content="{url}/og.png">\n'
            f'<meta name="twitter:image" content="{url}/og.png">\n')
    return html.replace('<meta property="og:type"', tags + '<meta property="og:type"', 1)

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
    ap.add_argument("--target", choices=["web", "artifact", "standalone", "both"],
                    default="both",
                    help="web: dist/index.html, a complete document that fetches "
                         "demand.json alongside it. artifact: dist/artifact.html, "
                         "body-only for the Artifact tool. standalone: "
                         "dist/standalone.html, one complete file with the demand data "
                         "inlined — for previewing, emailing or opening offline, where "
                         "there is no sibling file to fetch.")
    args = ap.parse_args()
    html = build(defer_demand=False)
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
        # the web page fetches the demand file after first paint
        web = build(defer_demand=True)
        # A truncated web page shipped once. Check the parts that make the
        # deferred build different, not just the ones the artifact shares.
        for marker in ('id="net"', "function build(", "demandUrl", "function loadDemand"):
            if marker not in web:
                sys.exit(f"build: web output is missing {marker}")
        if '"demand"' in web.split("</script>")[0]:
            sys.exit("build: web output still inlines the demand data")
        # Social previews need an absolute URL to a real image — a data URI is
        # not fetchable by the crawler, and a relative path is not resolved by
        # most of them. So the file is copied out and the URL is built from the
        # configured site address.
        shutil.copyfile(ROOT / "src/assets/og.png", ROOT / "dist" / "og.png")
        (ROOT / "dist" / "demand.json").write_text(
            json.dumps(load("dot_db1c.json"), separators=(",", ":")), encoding="utf-8")
        targets.append(("dist/index.html", inject_site_urls(wrap_standalone(web))))
    if args.target in ("artifact", "both"):
        targets.append(("dist/artifact.html", html))
    if args.target == "standalone":
        # A complete document AND self-contained. The web build splits the demand
        # data out to halve the critical path, which is right for a served site
        # and wrong for a single file someone opens on its own — it 404s looking
        # for a sibling that is not there.
        targets.append(("dist/standalone.html", wrap_standalone(html)))

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
