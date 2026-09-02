#!/usr/bin/env python3
"""Acceptance test for dist/planner.html.

The expected values came off the live artifact before the split. If one moves,
the split changed behaviour — find the cause; never edit the expectation.
"""
from playwright.sync_api import sync_playwright
import pathlib, sys, json, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

EXPECT = {"roster":400, "surplus":1, "blockHrs":3786, "asmM":192.6, "gates":213,
          "routes":404, "deps":1650, "tails":366, "fleetRequired":399, "checksFailing":0}
CHECKS = ["unflown","extra","brkSpace","brkGround","open","brkNight","brkSpan","imb","curfew","rangeBad"]

def main():
    # Serve dist/ over HTTP and load the ROOT URL, because that is how Cloudflare
    # will serve it — not file://. The difference is not cosmetic: a missing
    # <meta charset> makes a browser decode this UTF-8 page as Latin-1, which
    # turns a regex range into a syntax error and kills the boot script. file://
    # sniffs the encoding and hides that entirely.
    root = pathlib.Path(__file__).parent / "dist"
    srv = ThreadingHTTPServer(("127.0.0.1", 0),
          functools.partial(SimpleHTTPRequestHandler, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    page_url = f"http://127.0.0.1:{srv.server_address[1]}/"
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width":1480,"height":1050})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(page_url); pg.wait_for_timeout(3000)
        got = pg.evaluate("()=>exportState().metrics")
        checks = pg.evaluate("()=>{const c={...M.checks};c.rangeBad=c.rangeBad.length;return c;}")
        tails = pg.evaluate("()=>M.rots.map(r=>r.id).sort()")
        gates = pg.evaluate("()=>M.stations.map(s=>[s.code,s.gates]).sort()")
        # every tab must render without throwing
        for t in pg.evaluate("()=>[...document.querySelectorAll('.tab')].map(t=>t.textContent.trim())"):
            pg.evaluate("(t)=>{document.querySelectorAll('.tab').forEach(b=>{if(b.textContent.trim()===t)b.click();})}", t)
            pg.wait_for_timeout(400)
        b.close()
    srv.shutdown()

    ok = True
    print("metric            expected        got")
    for k, want in EXPECT.items():
        good = got.get(k) == want
        ok &= good
        print(f"  {k:<16}{str(want):<16}{got.get(k)}  {'ok' if good else '<-- MISMATCH'}")
    print("\nten checks (all must be 0):")
    for c in CHECKS:
        good = checks.get(c) == 0
        ok &= good
        print(f"  {c:<14}{checks.get(c)}  {'ok' if good else '<-- FAIL'}")
    if errs:
        ok = False
        print("\npage errors:", errs[:5])
    json.dump({"tails":tails,"gates":gates,"metrics":got},
              open(pathlib.Path(__file__).parent/"fingerprint.json","w"), indent=1)
    print("\n" + ("PASS — the split is clean" if ok else "FAIL — do not publish"))
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
