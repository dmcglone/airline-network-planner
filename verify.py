#!/usr/bin/env python3
"""Acceptance test for dist/planner.html.

The expected values came off the live artifact before the split. If one moves,
the split changed behaviour — find the cause; never edit the expectation.
"""
from playwright.sync_api import sync_playwright
import pathlib, sys, json, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# These came off a schedule known to be sound. If one moves, behaviour changed:
# find the cause, do not edit the number to match.
#
# Changed once, deliberately, when the A320E was retired from the shipped fleet.
# It was an extended-range A320 specific to this airline, and a stranger opening
# the example inherited a variant they had no context for. Nothing it flew needed
# the range — the longest was MCO-LIM at 2,441 nm against the A320's 2,900 — so
# its 27 routes and 18 pinned tails moved to the A320.
#
#   tails 366 -> 365, fleetRequired 399 -> 398, surplus 1 -> 2, gates 213 -> 211
#
# Block hours, ASMs, routes and departures did not move, because the same flying
# still happens. It got CHEAPER: the A320E carried a 60-minute turn for
# international handling, and on 45-minute turns the rotations pack slightly
# better. Retiring a sub-fleet saving an aircraft and two gates is a real result,
# not a rounding artifact.
#
# Changed a second time, deliberately, in October 2026, when gates began to be
# counted exactly. A station's gates had been the most aircraft on the ground at
# any of 96 looks a day, one every 15 minutes, and a bank's peak between two
# looks went uncounted. The gate assignment behind the Board's gate letters
# disagreed as well: it swept from midnight and gave aircraft parked across it
# gates of their own. Three counts for one thing (SJC 48, 49 and 54) became one.
#
#   gates 211 -> 218   (SJC 48 -> 49, PIT 28 -> 30, DEN 18 -> 21, MCO 29 -> 30)
#
# and in starters.json the Point-to-point base's gates 8 -> 9: LAS has nine
# aircraft on the ground for seven and a half minutes at 08:03, between looks.
# No flight moved: same schedule, same tails, same checks. Only the count did.
EXPECT = {"roster":400, "surplus":2, "blockHrs":3786, "asmM":192.6, "gates":218,
          "routes":404, "deps":1650, "tails":365, "fleetRequired":398, "checksFailing":0}
CHECKS = ["unflown","extra","brkSpace","brkGround","open","brkNight","brkSpan","imb","curfew","rangeBad"]

def check_starters(pg):
    """Build every starting network and prove it is a legal airline.

    A starter is a curated artifact, and curated artifacts rot. Retime a bank,
    tighten the spacing rule, correct a range, and the network a stranger sees
    on their very first screen opens with failing checks. That is worse than
    shipping no starter at all, so every starter carries the metrics it must
    produce and this asserts them on every build.

    A starter with no `expect` block fails deliberately: a starter that declares
    nothing cannot be caught degrading.
    """
    starters = pg.evaluate("()=>(typeof STARTERS!=='undefined'?STARTERS:[])"
                           ".map(s=>({id:s.id, name:s.name, expect:s.expect||null}))")
    if not starters:
        return [("(none)", True, "no starters defined yet")]

    out = []
    for s in starters:
        sid, name = s["id"], s.get("name") or s["id"]
        loaded = pg.evaluate("(id)=>{ if(!loadStarter(id)) return false;"
                             " M=build(); save(); draw(); return true; }", sid)
        if not loaded:
            out.append((name, False, "loadStarter() refused it")); continue
        pg.wait_for_timeout(600)
        got = pg.evaluate("()=>exportState().metrics")
        chk = pg.evaluate("()=>{const c={...M.checks};c.rangeBad=c.rangeBad.length;return c;}")

        bad = [k for k in CHECKS if chk.get(k)]
        if bad:
            out.append((name, False, "checks failing: " + ", ".join(bad))); continue

        want = s.get("expect")
        if not want:
            out.append((name, False,
                        "no expect block — record its metrics so it cannot rot"))
            continue
        wrong = [f"{k} {got.get(k)} != {v}" for k, v in want.items() if got.get(k) != v]
        out.append((name, not wrong, "; ".join(wrong) if wrong
                    else f"{got.get('routes')} routes, {got.get('tails')} tails, ten checks clean"))

        # A mission is a promise that it can be won. Play its reference solution
        # and require all the stars, and require that the start does not already
        # have them, or the mission asks for nothing.
        ms = pg.evaluate("""(id)=>{ const mi = missionOf(id); if(!mi) return null;
            loadStarter(id); M = build();
            const b = missionScore(M, econOf(M), mi);
            for(const s of mi.solution) applyMissionStep(state.routes, s);
            M = build();
            const a = missionScore(M, econOf(M), mi);
            return {title: mi.title, of: mi.objectives.length, before: b.stars, after: a.stars,
                    values: a.results.map(r => Math.round(r.value))}; }""", sid)
        if ms:
            ok = ms["after"] == ms["of"] and ms["before"] < ms["of"]
            out.append((f"  mission", ok,
                        f"{ms['title']}: {ms['before']} of {ms['of']} stars at the start, "
                        f"{ms['after']} with the reference solution {ms['values']}"))

    # leave the page on the shipped network, so anything after this sees it
    pg.evaluate("()=>{ state = load(); applyStationConfig(state); M=build(); draw(); }")
    pg.wait_for_timeout(400)
    return out


# Strings where the planner expects a number or a short code, each written to
# close the attribute or tag it lands in and open a handler of its own.
HOSTILE_ATTR = '1000" onload="window.__xss=1" data-x="'
HOSTILE_TAG = '"><img src=x onerror="window.__xss=1">'

# One airline with a hostile value in every field the page reads. Marking the
# A320 as user-added is how a link gets past reconcileGeom(), and the Settings
# preview draws the A320, so both side views see the hostile geometry. Brand,
# the airline code and a type's name are text, escaped where they are drawn.
CRAFT = """([a, t]) => {
    const st = JSON.parse(JSON.stringify(state));
    const f = st.fleet.find(x => x.t === 'A320');
    f.origin = 'user'; f.name = t; f.f41 = t; f.Y = t; f.gnd = t;
    for(const k of ['F', 'PE', 'rng', 'kt', 'turn', 'util']) f[k] = a;
    f.geom = Object.assign({}, f.geom, {cabinLength: a, certifiedMax: a,
        abreast: {F: a, PE: t, Y: a}, pitch: {F: a, PE: t, Y: a},
        exits: [{type: t, x: 0}, {type: 'III', x: a}, {type: 'C', x: 1}],
        monuments: [{kind: t, x: a, len: t}]});
    const g = JSON.parse(JSON.stringify(f)); g.t = t; st.fleet.push(g);
    st.roster[t] = 1; st.roster.A320 = a; st.pinned.A320 = a;
    st.routes[0].mix[t] = 1; st.routes[0].mix.E175 = a; st.routes[0].dow = a; st.routes[1].red = t;
    st.routes.push({o: t, d: 'DEN', dow: 7, mix: {A320: 1}}, {o: 'DEN', d: t, dow: 7, mix: {A320: 1}});
    st.stations.push(t); st.roles[t] = 'Hub'; st.roles.DEN = t; st.feed[t] = 1;
    st.brand = t; st.code = t; st.spacing = t; st.spare = a; st.redeye = t;
    return st; }"""

# Every tab, then the seatmap and the Settings preview for the A320. Nothing may
# throw, no element may carry an on* attribute (the page has none of its own),
# and nothing may have run.
TOUR = """() => {
    const thrown = []; let handlers = 0, imgs = 0;
    smType = 'A320';
    for(const t of [...document.querySelectorAll('.tab')].map(x => x.id.replace('tab-', ''))){
      try{ goTab(t); }catch(e){ thrown.push(t + ': ' + e.message); }
      for(const el of document.querySelectorAll('*'))
        if([...el.attributes].some(x => /^on/i.test(x.name))) handlers++;
      imgs += document.querySelectorAll('img[src="x"]').length;
    }
    return {opened: (state.fleet.find(x => x.t === 'A320') || {}).origin === 'user',
            thrown, handlers, imgs,
            views: document.querySelectorAll('#airlinePanel .sideview, #seatmapPanel .sideview').length}; }"""

def check_untrusted(b, pg, page_url):
    """Open a crafted airline the three ways one arrives, and prove nothing in it runs.

    A Share link, an opened file and saved state (a link opened before a fix)
    are somebody else's data, and their codes and numbers go into markup all
    over the page. Before cleanState() a crafted link could put markup in a
    station code, a type code, a route, a range or a route's days per week,
    and before cleanGeom() in a cabin pitch; any of them ran script. Before
    21b7b38 a string cabin length made the side view throw and an exit type
    went into the seatmap unescaped.
    """
    crafted = pg.evaluate(CRAFT, [HOSTILE_ATTR, HOSTILE_TAG])
    out = []
    for how in ("Share link", "opened file", "saved state"):
        sp = b.new_page(viewport={"width":1480,"height":1050})
        errs = []; sp.on("pageerror", lambda e: errs.append(str(e)))
        try:
            out.append(_open_and_tour(sp, errs, how, pg, page_url, crafted))
        except Exception as e:      # a load that throws is a failure to report, not to stop on
            out.append((how, False, "threw: " + str(e).splitlines()[0][:160]))
        sp.close()
    out.append(_config_bounds(b, page_url))
    return out

def _config_bounds(b, page_url):
    """A file's config numbers become loop bounds. Until 28 Oct 2026 a red-eye
    window like [0, 1e15] or a spoke push hour of -1e15 was taken, and the
    engine's 5-minute walk over it hung the page that opened the file. Refused
    values must leave the config as it was. This calls applyConfig() without a
    rebuild, so a regression fails here instead of hanging the test."""
    sp = b.new_page()
    try:
        sp.goto(page_url); sp.wait_for_timeout(3000)
        r = sp.evaluate("""() => { const was = JSON.stringify(currentConfig());
          applyConfig({redDep: [0, 1e15], redDepEvening: [1e15, 0], spokeEarliest: -1e15, redArr: 1e15, mct: -5});
          const now = JSON.stringify(currentConfig()); return {same: was === now, now}; }""")
        return ("config numbers", r["same"], "out-of-day windows and minutes refused" if r["same"]
                else "taken: " + r["now"][:220])
    except Exception as e:
        return ("config numbers", False, "threw: " + str(e).splitlines()[0][:160])
    finally:
        sp.close()

def _open_and_tour(sp, errs, how, pg, page_url, crafted):
    if how == "Share link":
        link = pg.evaluate("async (st) => '#n=z' + b64urlEncode(await gzipBytes(JSON.stringify(st)))", crafted)
        sp.goto(page_url + link); sp.wait_for_timeout(3000)
    elif how == "opened file":
        sp.goto(page_url); sp.wait_for_timeout(3000)
        sp.evaluate("""([st, a, t]) => importState({app: APP_ID, schema: STATE_SCHEMA, state: st,
            config: Object.assign(currentConfig(), {stations: [t], roles: {[t]: 'Hub', DEN: t},
              banks: {Hub: [a, 360], [t]: [1]}, curfew: {SJC: [t, 1380], [t]: [1, 2]},
              mct: a, redDep: [t, 1], redArr: t})})""", [crafted, HOSTILE_ATTR, HOSTILE_TAG])
        sp.wait_for_timeout(600)
    else:
        sp.goto(page_url); sp.wait_for_timeout(3000)
        sp.evaluate("(st) => localStorage.setItem(KEY, JSON.stringify(st))", crafted)
        sp.reload(); sp.wait_for_timeout(3000)
    r = sp.evaluate(TOUR)
    sp.wait_for_timeout(800)   # long enough for an onload or onerror to have fired
    r["ran"] = sp.evaluate("()=>!!window.__xss")
    good = r["opened"] and not r["thrown"] and r["views"] == 2 and not r["handlers"] \
        and not r["imgs"] and not r["ran"] and not errs
    return (how, good, "opened, every tab drawn, no handler in the page, nothing ran" if good
            else json.dumps(r) + (f" page errors: {errs[:2]}" if errs else ""))


def check_retimed(pg):
    """An edit re-times the whole schedule, so a rule the builder honours on only
    some paths breaks somewhere the edit never touched. Until 28 Oct 2026 a day
    turn checked the curfew at its base and not at the far end: making RDU-SJC
    one A320 and two A321s re-timed a LAS aircraft to turn at SJC and leave at
    23:15. Every check must pass on that edit."""
    c = pg.evaluate("""() => { const keep = JSON.stringify(state.routes);
      for (const r of state.routes) if (pairKey(r.o, r.d) === pairKey('RDU', 'SJC')) r.mix = {A320: 1, A321: 2};
      M = build(); const c = {...M.checks}; c.rangeBad = c.rangeBad.length;
      state.routes = JSON.parse(keep); M = build();
      return c; }""")
    failing = [k for k in CHECKS if c.get(k)]
    return [("RDU-SJC 1 A320, 2 A321", not failing,
             "all ten checks pass" if not failing else "failing: " + ", ".join(f"{k} {c[k]}" for k in failing))]

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
        retimed_report = check_retimed(pg)
        starter_report = check_starters(pg)
        shared_report = check_untrusted(b, pg, page_url)
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
    print("\nan edit that re-times the schedule (all ten checks must still pass):")
    for name, good, note in retimed_report:
        ok &= good
        print(f"  {name:<24}{'ok  ' if good else 'FAIL'}  {note}")
    print("\nstarting networks (each must build and pass all ten checks):")
    for name, good, note in starter_report:
        ok &= good
        print(f"  {name:<24}{'ok  ' if good else 'FAIL'}  {note}")
    print("\na crafted airline (somebody else's data must not run here):")
    for name, good, note in shared_report:
        ok &= good
        print(f"  {name:<24}{'ok  ' if good else 'FAIL'}  {note}")

    if errs:
        ok = False
        print("\npage errors:", errs[:5])
    json.dump({"tails":tails,"gates":gates,"metrics":got},
              open(pathlib.Path(__file__).parent/"fingerprint.json","w"), indent=1)
    print("\n" + ("PASS — the split is clean" if ok else "FAIL — do not publish"))
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
