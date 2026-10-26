#!/usr/bin/env python3
"""Build the planner and serve it locally, rebuilding when the source changes.

    python serve.py                 # http://127.0.0.1:8787/
    python serve.py --port 9000
    python serve.py --no-watch      # build once, serve, never rebuild

This is what Claude Code's preview runs (.claude/launch.json). It serves dist/
over HTTP at the site root, the same way Cloudflare does, because file:// hides
the charset bug that once killed the boot script on a real server.

WHAT IT DOES
  * builds the web target (dist/index.html + demand.json + og.png)
  * serves dist/ with caching off, so a reload always gets the latest build
  * polls src/, network.json and build.py once a second and rebuilds on change
  * keeps serving the last good page if a rebuild fails, and says so loudly
  * answers POST /_err like worker.js does, printing the crash report here
    instead of to Workers Logs, so a page error shows up in this terminal

WHAT IT DOES NOT DO
  * run worker.js. Only the /_err endpoint is imitated. `npx wrangler dev`
    runs the real Worker if that ever matters.
  * verify anything. A page that serves is not a page that passes. Run
    verify.py, and never through a pipe.
  * carry state from the live site. The planner saves to localStorage per
    origin, so edits made at 127.0.0.1 stay there. Export State is the way out.

Stdlib only: no Playwright, no npm.
"""
import argparse
import functools
import json
import os
import pathlib
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# Windows: when the preview launches this, stdout may not be able to encode
# the em dash build.py prints, and a UnicodeEncodeError on startup kills the
# server. Replace what cannot be encoded instead of crashing.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

# Children write UTF-8 regardless of the console's code page.
CHILD_ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}

ROOT = pathlib.Path(__file__).resolve().parent
DIST = ROOT / "dist"
WATCHED = [ROOT / "src", ROOT / "network.json", ROOT / "build.py"]
MAX_ERR_BODY = 4096          # same cap as worker.js


def log(msg):
    print(f"[serve {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def build():
    """Run build.py for the web target. Returns True on success.

    The return code is checked directly. Nothing here is piped, so a failed
    build can never read as a pass."""
    r = subprocess.run([sys.executable, str(ROOT / "build.py"), "--target", "web"],
                       cwd=ROOT, env=CHILD_ENV, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        log(f"BUILD FAILED (exit {r.returncode}). Still serving the last good page.")
        for line in (r.stdout + r.stderr).strip().splitlines()[-15:]:
            print("    " + line, flush=True)
        return False
    for line in r.stdout.strip().splitlines():
        log(line)
    return True


def snapshot():
    """Newest mtime and file count across everything that feeds the build.
    The count catches a deleted file, which would not move the newest mtime."""
    newest, count = 0.0, 0
    for p in WATCHED:
        files = [p] if p.is_file() else (f for f in p.rglob("*") if f.is_file())
        for f in files:
            try:
                newest = max(newest, f.stat().st_mtime)
                count += 1
            except FileNotFoundError:
                pass                     # deleted between listing and stat
    return newest, count


def watch(interval=1.0):
    seen = snapshot()
    while True:
        time.sleep(interval)
        now = snapshot()
        if now == seen:
            continue
        # Let a burst of saves settle so one edit is one build, not five.
        time.sleep(0.3)
        seen = snapshot()
        log("source changed, rebuilding")
        if build():
            log("rebuilt. Reload the page.")


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path.split("?")[0] != "/_err":
            self.send_error(405)
            return
        try:
            n = min(int(self.headers.get("Content-Length") or 0), MAX_ERR_BODY)
        except ValueError:
            n = 0
        raw = self.rfile.read(n).decode("utf-8", "replace") if n else ""
        try:
            body = json.loads(raw)
        except ValueError:
            body = {"message": raw[:800]}
        if isinstance(body, dict) and body.get("message"):
            where = body.get("where") or "?"
            tab = body.get("tab") or "?"
            log(f"PAGE ERROR [{where} / tab {tab}]: {str(body['message'])[:800]}")
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        # Quiet on success, loud on failure. A wall of 200s buries the one 404.
        if len(args) > 1 and str(args[1]).startswith(("4", "5")):
            log("HTTP " + fmt % args)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8787)),
                    help="port to listen on (default: $PORT, else 8787)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--no-watch", action="store_true", help="do not rebuild on change")
    args = ap.parse_args()

    if not build():
        if not (DIST / "index.html").exists():
            log("no page to serve. Fix the build and run this again.")
            return 1
        log("serving an OLD dist/index.html. It does not reflect src/.")

    handler = functools.partial(Handler, directory=str(DIST))
    try:
        srv = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as e:
        log(f"cannot listen on {args.host}:{args.port}: {e}. Try --port.")
        return 1
    if not args.no_watch:
        threading.Thread(target=watch, daemon=True).start()
    log(f"planner at http://{args.host}:{args.port}/"
        + ("" if args.no_watch else "  (rebuilds on change)"))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
