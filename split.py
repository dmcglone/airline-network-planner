"""One-time splitter: cut the monolith into src/ parts along its real seams.

Every part is an exact line-range slice, so build.py concatenating them in
order must reproduce the source byte-for-byte. That equality is the proof the
seams are right; only after it holds do we extract the data blocks.
"""
import pathlib, json
SRC = pathlib.Path("/root/frontier/app/planner.html")
lines = SRC.read_text(encoding="utf-8").split("\n")
def cut(a, b):                      # 1-indexed, inclusive
    return "\n".join(lines[a-1:b])

PARTS = [
  ("src/head.html",        1,   5),
  ("src/style.css",        6,   218),      # inside <style>…</style>
  ("src/body.html",        219, 474),      # </style> through the markup
  ("src/data/net.json",    475, 475),      # <script id="net"> … </script>
  ("src/pristine.js",      476, 480),
  ("src/constants.js",     481, 529),      # <script> opens at 481
  ("src/state.js",         530, 624),
  ("src/geo.js",           625, 642),
  ("src/demand.js",        643, 685),
  ("src/redeye.js",        686, 721),
  ("src/engine.js",        722, 1131),
  ("src/data/geo.json",    1132, 1133),    # </script> + <script id="geo">
  ("src/suggest.js",       1134, 1280),    # <script> opens at 1134
  ("src/ui/render.js",     1281, 1322),
  ("src/ui/network.js",    1323, 1370),
  ("src/ui/schedule.js",   1371, 1397),
  ("src/ui/rotations.js",  1398, 1424),
  ("src/ui/stations.js",   1425, 1444),
  ("src/ui/fleet.js",      1445, 1536),
  ("src/ui/checks.js",     1537, 1640),
  ("src/ui/events.js",     1641, 1938),
  ("src/ui/map.js",        1939, 2205),
  ("src/ui/board.js",      2206, 2301),
  ("src/boot.js",          2302, 2347),
  ("src/foot.html",        2348, len(lines)),
]
prev = 0
for path, a, b in PARTS:
    assert a == prev + 1, f"gap or overlap before {path}: {prev} -> {a}"
    prev = b
    p = pathlib.Path(path); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(cut(a, b), encoding="utf-8")
assert prev == len(lines), f"tail not covered: {prev} vs {len(lines)}"
json.dump([p for p, _, _ in PARTS], open("src/manifest.json", "w"), indent=1)
print("wrote", len(PARTS), "parts covering", len(lines), "lines")
