#!/usr/bin/env python3
"""Build the page and stage a copy somewhere it can be looked at.

Reading a diff tells you what changed; it does not tell you whether the
Economics tab still renders. This is the shortest path from an edit in src/ to
a page you can click on, without a deploy and without credentials.

    python3 preview.py

In a Claude session that writes to /mnt/user-data/outputs, the copy lands there
and renders inline. Anywhere else it lands in dist/ and the path is printed for
you to open. Pass --out to put it somewhere specific.

WHICH FILE. dist/standalone.html -- a complete document with the demand data
inlined. Not index.html: that one fetches demand.json from alongside itself,
which is right for a served site and wrong for a single file handed to someone,
where the fetch 404s and the demand column silently falls back to estimates.
Not artifact.html either: the <meta charset> in the standalone wrapper is what
stops a browser decoding this UTF-8 page as Latin-1, which turns the A-yuml
range inside a regex into an out-of-order character range and kills the boot
script before anything renders.

WHAT A PREVIEW IS NOT. It is a build of the working tree at this moment. It does
not carry anything saved on the live Cloudflare site, and nothing done inside it
reaches the repo. It is also sandboxed, so localStorage is unavailable -- save()
in state.js swallows that quietly, which means edits made in the preview survive
rebuilds within the page and vanish on reload. Export State is the way out.

Previewing is not verifying. This only proves the page builds and boots. Run
verify.py for the acceptance metrics and the ten checks, and do not run it
through a pipe -- the pipeline takes the exit status of the last command, so a
failing test reads as a pass.
"""
import argparse
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).parent
BUILT = ROOT / "dist" / "standalone.html"

# Where a Claude session can write files that render in the conversation. Used
# only if it already exists -- this script is expected to run locally too.
SESSION_OUT = pathlib.Path("/mnt/user-data/outputs")


def destination(explicit):
    if explicit:
        return pathlib.Path(explicit).expanduser().resolve()
    if SESSION_OUT.is_dir():
        return SESSION_OUT / "planner-preview.html"
    return ROOT / "dist" / "planner-preview.html"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", help="where to put the copy")
    ap.add_argument("--no-build", action="store_true",
                    help="stage the existing dist/index.html without rebuilding")
    args = ap.parse_args()

    if not args.no_build:
        # Not a && chain and not piped: check the return code and stop on it,
        # rather than staging a stale page from a build that failed.
        r = subprocess.run([sys.executable, str(ROOT / "build.py"), "--target", "standalone"],
                           cwd=ROOT)
        if r.returncode != 0:
            print(f"build.py failed (exit {r.returncode}) — nothing staged",
                  file=sys.stderr)
            return r.returncode

    if not BUILT.exists():
        print(f"{BUILT} does not exist — run without --no-build", file=sys.stderr)
        return 1
    # build.py's default target is web+artifact, so a standalone left over from
    # an earlier run is easy to stage by accident and very hard to spot: it is a
    # working page, just an old one. Refuse anything older than the sources.
    newest = max((f.stat().st_mtime for f in (ROOT/"src").rglob("*") if f.is_file()),
                 default=0)
    if not args.no_build and BUILT.stat().st_mtime < newest:
        print(f"{BUILT} is older than src/ — the build did not refresh it", file=sys.stderr)
        return 1

    dest = destination(args.out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(BUILT, dest)

    kb = dest.stat().st_size / 1024
    print(f"staged {dest} ({kb:,.0f} KB)")
    if dest.parent != SESSION_OUT:
        print(f"open it: {dest.as_uri()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
