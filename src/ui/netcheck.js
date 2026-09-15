/* ----- check a new route against the whole network -----
   The Add route panel estimates a route on its own: local demand, a connecting
   ceiling, its own direct cost. That is quick and it is biased both ways. It
   misses passengers the new flight takes from connections you already sell, and
   feeders that have no room. It also misses the revenue a new spoke sends onto
   flights you already fly, which is usually why an airline adds it.

   So this rebuilds the entire schedule with the route in it, runs the revenue
   and cost models on both versions, and reports the difference. Nothing is
   estimated here that the Economics tab would not also say. */

/* Adding a route, exactly as the Add button does it. One function for both, so a
   check always tests the change you would actually make. */
const existingRoute = (routes, o, d) => routes.find(r => r.o === o && r.d === d) || null;

function applyAddRoute(routes, a){
  const {o, d, t, n, w, red} = a;
  const ex = existingRoute(routes, o, d);
  if(ex){ ex.mix[t] = (+ex.mix[t] || 0) + n; ex.dow = w; if(red) ex.red = 1; }
  else routes.push(Object.assign({o, d, dow: w, mix: {[t]: n}}, red ? {red: 1} : {}));
  if(STA.includes(d)){                       // trunk: mirror the other direction
    const back = routes.find(r => r.o === d && r.d === o);
    if(back){ back.mix[t] = (+back.mix[t] || 0) + n; back.dow = w; }
    else routes.push({o: d, d: o, dow: w, mix: {[t]: n}});
  }
  routes.sort((x, y) => x.o < y.o ? -1 : x.o > y.o ? 1 : (x.d < y.d ? -1 : 1));
}

function addFormValues(){
  return {
    o: $("#nO").value, d: addDest, t: $("#nT").value,
    n: Math.max(1, Math.round(+$("#nN").value || 1)),
    w: Math.max(1, Math.min(7, Math.round(+$("#nW").value || 7))),
    red: $("#nRed").checked && !$("#nRedWrap").hidden
  };
}

function failsOf(m){
  const c = m.checks;
  return [c.unflown, c.extra, c.brkSpace, c.brkGround, c.open, c.brkNight, c.brkSpan,
          c.imb, c.curfew, c.rangeBad.length].filter(x => x > 0).length;
}

/* The numbers compared, for one built schedule. */
function netSnapshot(m, o, d, costOnly, t){
  // The rebuilt schedule only supplies cost, fleet and gates, so its revenue
  // model, the most expensive part of a check, is skipped for it.
  const E = costOnly ? {cost: econModel(m)} : econOf(m);
  if(!E || E.err || !E.cost) return null;
  const key = pairKey(o, d);
  const pair = {rev: 0, direct: 0, pax: 0, deps: 0};
  for(const {f, cost} of E.cost.flights){
    if(pairKey(f.o, f.d) !== key) continue;
    if(E.rev){
      pair.rev += E.rev.legrev.get(f.id) || 0;
      pair.pax += E.rev.boarded.get(f.id) || 0;
    }
    pair.direct += cost.direct;
    pair.deps++;
  }
  const T = m.totals;
  // Aircraft and gates are read for what the route itself touches: its own type,
  // and its own two airports. Rebuilding re-chains every rotation and re-colours
  // every station's gates, so one added E175 turn can move the A320 requirement
  // or a gate count at a station it never visits. That movement is the rebuild,
  // not the route, the same way revenue is.
  const ft = m.fleet.find(f => f.t === t) || {total: 0, short: 0, surplus: 0};
  const gatesAt = m.stations.filter(s => s.code === o || s.code === d)
    .reduce((x, s) => x + s.gates, 0);
  return {
    typeTotal: ft.total, typeShort: ft.short, typeSurplus: ft.surplus, gatesAt,
    rev: E.rev ? E.rev.stats.rev : null, direct: E.cost.totals.direct, alloc: E.cost.totals.allocated,
    pax: E.rev ? E.rev.stats.pax : null, conn: E.rev ? E.rev.stats.conn : null,
    tails: T.totalFleet, surplus: T.surplus, short: T.shortRots,
    gates: T.gates, fails: failsOf(m), pair
  };
}

/* What the route itself does, with everything else held still.

   A full rebuild is deterministic, but adding one route re-times flights across
   the whole day. On the shipped network that moves several hundred thousand
   dollars of revenue between markets that have nothing to do with the new
   route, in both directions, netting to a number far larger than the route
   could plausibly be worth. That is the schedule reshuffling, not the route.

   So revenue is measured on YOUR CURRENT schedule with this market's flights
   swapped for the rebuilt ones. That keeps every other flight exactly where it
   is, and still captures what matters: passengers the route feeds onto your
   flights, and passengers it takes from connections you already sell. */
function isolatedRevenue(base, trial, o, d){
  const key = pairKey(o, d);
  const kept = base.flights.filter(f => pairKey(f.o, f.d) !== key);
  const added = trial.flights.filter(f => pairKey(f.o, f.d) === key)
    .map((f, i) => Object.assign({}, f, {id: 9e8 + i}));
  // The same allocation revenueModel() runs, without its second "ceiling" pass,
  // which this comparison never reads.
  const F = kept.concat(added).map(f => Object.assign({}, f,
    {seats: (SPEC[f.t] && SPEC[f.t].seats) || 0}));
  const R = allocateDemand(F, buildItineraries(F), REV_COMPETITION, flightPremiums(F).prem);
  let pairRev = 0, pairPax = 0;
  for(const f of added){
    pairRev += R.legrev.get(f.id) || 0;
    pairPax += R.boarded.get(f.id) || 0;
  }
  return {rev: R.stats.rev, pax: R.stats.pax, conn: R.stats.conn, pairRev, pairPax};
}

/* Build the network with the route added, without touching the live one. The
   economics run inside the swap because the models read state too. */
function trialWithRoute(a){
  const keep = state.routes;
  try{
    state.routes = JSON.parse(JSON.stringify(keep));
    applyAddRoute(state.routes, a);
    const m = build();
    const snap = netSnapshot(m, a.o, a.d, true, a.t);
    if(snap){ snap.iso = isolatedRevenue(M, m, a.o, a.d); snap.type = a.t; }
    return snap;
  } finally { state.routes = keep; }
}

/* The check runs by itself once the form settles. It is a full rebuild, a second
   or so on a large network, and it holds the page while it runs, so it waits for
   typing to stop rather than running on every keystroke. Results are cached per
   form state and dropped whenever the network itself changes. */
const NETCHECK_DELAY = 500;
let netTimer = null;
let netCache = {m: null, map: new Map()};

const netSig = a => [a.o, a.d, a.t, a.n, a.w, a.red ? 1 : 0].join("|");

function netCached(a){
  if(netCache.m !== M) netCache = {m: M, map: new Map()};
  return netCache.map.get(netSig(a)) || null;
}

/* Run a check now, or return the cached one. Shared by Add route and Grow, so a
   suggestion checked on the Grow tab opens instantly in Add route. */
function computeNetCheck(a){
  const hit = netCached(a);
  if(hit) return hit;
  let R;
  try{
    const before = netSnapshot(M, a.o, a.d, false, a.t);
    const after = trialWithRoute(a);
    R = (before && after) ? netResult(before, after)
      : {err: "The economics could not be computed for this network."};
  } catch(err){
    console.error("network check failed", err);
    R = {err: `The network check failed: ${err.message || err}`};
  }
  netCached(a);                                   // make sure the cache belongs to this M
  netCache.map.set(netSig(a), R);
  if(netCache.map.size > 80) netCache.map.delete(netCache.map.keys().next().value);
  return R;
}

function scheduleNetCheck(a){
  clearTimeout(netTimer);
  netTimer = setTimeout(() => {
    const now = addFormValues();
    if(netSig(now) !== netSig(a) || $("#addRow").hidden) return;   // form moved on
    computeNetCheck(a);
    addInfo();
  }, NETCHECK_DELAY);
}

/* The comparison, as numbers. */
function netResult(B, A){
  const I = A.iso;
  // Revenue with the rest of the schedule held still; cost of the flights added.
  const pairRev = I.pairRev - B.pair.rev;
  const dRev = I.rev - B.rev;
  const pairCost = A.pair.direct - B.pair.direct;
  const allocRatio = B.direct ? B.alloc / B.direct : 1;
  return {
    net: dRev - pairCost,
    netAlloc: dRev - pairCost * allocRatio,
    pairRev, pairCost, restRev: dRev - pairRev,
    dPax: I.pax - B.pax, dConn: I.conn - B.conn,
    // Aircraft, gates and checks come from the full rebuild: real requirements.
    type: A.type,
    dTails: A.typeTotal - B.typeTotal, surplus: [B.typeSurplus, A.typeSurplus],
    short: A.typeShort, moreShort: Math.max(0, A.typeShort - B.typeShort),
    dGates: A.gatesAt - B.gatesAt, fails: [B.fails, A.fails],
    existed: B.pair.deps > 0
  };
}

const netSgn = (n, f) => (n > 0.5 ? "+" : n < -0.5 ? "−" : "±") + f(Math.abs(n));
const netK = n => moneyK(n).replace("−", "");

function netTone(R){
  return R.net < 0 ? "bad" : (R.netAlloc < 0 || R.moreShort > 0) ? "warn" : "ok";
}

function netBanner(R){
  const tone = netTone(R);
  const head = R.net < 0
    ? `Your network earns about ${money(Math.round(-R.net / 100) * 100)} a day less`
    : `Your network earns about ${money(Math.round(R.net / 100) * 100)} a day more`;
  const why = [];
  if(R.restRev > 250)
    why.push(`${netK(R.restRev)} of that lands on flights you already fly, from passengers this route feeds.`);
  else if(R.restRev < -250)
    why.push(`It takes ${netK(-R.restRev)} a day from flights you already fly, mostly passengers you were connecting.`);
  if(R.moreShort > 0)
    why.push(`You don't have the aircraft: it needs ${fmt(R.moreShort)} more ${esc(R.type)} than you own.`);
  else if(R.net >= 0 && R.netAlloc < 0)
    why.push(`It covers direct cost but not ownership and overhead.`);
  return {tone, head, why};
}

/* The aircraft card that sits with demand and load factor. */
function netAircraftCard(R, pending){
  if(pending || !R || R.err)
    return `<div class="rv-m"><div class="rv-l">Aircraft</div><div class="rv-v dim">…</div>`
      + `<div class="rv-n">${pending ? "checking your fleet" : "not available"}</div></div>`;
  const bad = R.moreShort > 0;
  return `<div class="rv-m"><div class="rv-l">${esc(R.type)} needed</div>`
    + `<div class="rv-v${bad ? " bad" : ""}">${netSgn(R.dTails, fmt)}</div>`
    + `<div class="rv-n${bad ? " bad" : ""}">${bad
        ? `${fmt(R.moreShort)} more than you own`
        : `spare ${fmt(Math.max(0, R.surplus[0]))} → ${fmt(Math.max(0, R.surplus[1]))}`}</div></div>`;
}

/* The breakdown, including what the quick read said about the route alone. */
function netBreakdown(R, A){
  const row = (label, value, note, cls) =>
    `<div class="nc-row"><div class="nc-l">${label}</div>`
    + `<div class="nc-v${cls ? " " + cls : ""}">${value}</div><div class="nc-n">${note || ""}</div></div>`;
  const pairNet = R.pairRev - R.pairCost;
  const alone = A && A.contrib != null
    ? `; local passengers alone ${A.contrib < 0 ? "−" : "+"}${netK(A.contrib)}` : "";
  const rows = [
    row(R.existed ? "This market, change" : "This route", `${netSgn(pairNet, netK)} a day`,
        `${netK(R.pairRev)} rev with connections, ${netK(R.pairCost)} direct cost${alone}`,
        pairNet < 0 ? "bad" : ""),
    row("Rest of your network", `${netSgn(R.restRev, netK)} rev`,
        R.restRev >= 0 ? "fed onto flights you already fly" : "taken from flights you already fly",
        R.restRev < -250 ? "bad" : ""),
    row("Passengers", `${netSgn(R.dPax, v => fmt(Math.round(v)))} a day`,
        `${netSgn(R.dConn, v => fmt(Math.round(v)))} connecting, network-wide`),
    row("Gates", netSgn(R.dGates, fmt), "at the route's own airports, at peak"),
    row("Checks", R.fails[1] > R.fails[0] ? "worse" : "unchanged",
        R.fails[1] ? `${fmt(R.fails[1])} of ten failing${R.fails[0] ? `, was ${fmt(R.fails[0])}` : ""}` : "all ten pass",
        R.fails[1] > R.fails[0] ? "bad" : ""),
    row("Fully allocated", `${netSgn(R.netAlloc, netK)} a day`, "after ownership and overhead",
        R.netAlloc < 0 ? "bad" : "")
  ].join("");
  return `<div class="nc-grid">${rows}</div>`
    + `<details class="nc-how"><summary>How this is measured</summary><div>`
    + `Revenue is your current schedule with this market's flights added, so every other flight `
    + `stays where it is. Aircraft, gates and checks come from rebuilding the whole day with the `
    + `route in it, counted for the route's own aircraft type and its own two airports. A rebuild `
    + `re-times flights and re-chains aircraft across the whole network, which on its own moves `
    + `revenue between unrelated markets, and aircraft between types the route never uses, by `
    + `more than most routes are worth. That reshuffle is left out. Competition is still one generic rival per market, so read gains as optimistic.`
    + `</div></details>`;
}
