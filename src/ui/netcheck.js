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
function applyAddRoute(routes, a){
  const {o, d, t, n, w, red} = a;
  const ex = routes.find(r => r.o === o && r.d === d);
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
function netSnapshot(m, o, d){
  const E = econOf(m);
  if(!E || E.err) return null;
  const key = pairKey(o, d);
  const pair = {rev: 0, direct: 0, pax: 0, deps: 0};
  for(const {f, cost} of E.cost.flights){
    if(pairKey(f.o, f.d) !== key) continue;
    pair.rev += E.rev.legrev.get(f.id) || 0;
    pair.pax += E.rev.boarded.get(f.id) || 0;
    pair.direct += cost.direct;
    pair.deps++;
  }
  const T = m.totals;
  return {
    rev: E.rev.stats.rev, direct: E.cost.totals.direct, alloc: E.cost.totals.allocated,
    pax: E.rev.stats.pax, conn: E.rev.stats.conn,
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
  const R = revenueModel({flights: kept.concat(added)});
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
    const snap = netSnapshot(m, a.o, a.d);
    if(snap) snap.iso = isolatedRevenue(M, m, a.o, a.d);
    return snap;
  } finally { state.routes = keep; }
}

let netCheck = null;              // {sig, html}: the last result, while it still applies
const netSig = a => [a.o, a.d, a.t, a.n, a.w, a.red ? 1 : 0, state.routes.length,
                     JSON.stringify(state.routes).length].join("|");

function runNetCheck(){
  const a = addFormValues();
  if(!a.d || !AP[a.d]) return;
  const host = $("#netCheck"); if(!host) return;
  host.innerHTML = `<div class="nc-busy">Rebuilding your schedule with ${esc(a.o)}–${esc(a.d)} added…</div>`;
  // Let the message paint before the rebuild holds the thread.
  setTimeout(() => {
    let html;
    try{
      const before = netSnapshot(M, a.o, a.d);
      const after = trialWithRoute(a);
      html = (before && after) ? netCheckHTML(a, before, after)
        : `<div class="nc-busy">The economics could not be computed for this network.</div>`;
    } catch(err){
      console.error("network check failed", err);
      html = `<div class="nc-busy">The rebuild failed: ${esc(err.message || String(err))}</div>`;
    }
    netCheck = {sig: netSig(a), html};
    host.innerHTML = html;
    const btn = document.querySelector("[data-netcheck]");
    if(btn) btn.textContent = "Check again";
  }, 30);
}

function netCheckHTML(a, B, A){
  const sgn = (n, f) => (n > 0.5 ? "+" : n < -0.5 ? "−" : "±") + f(Math.abs(n));
  const $k = n => moneyK(n).replace("−", "");
  const I = A.iso;

  // Revenue with the rest of the schedule held still; cost of the flights added.
  const pairRev = I.pairRev - B.pair.rev;
  const dRev = I.rev - B.rev;
  const restRev = dRev - pairRev;
  const pairCost = A.pair.direct - B.pair.direct;
  const net = dRev - pairCost;
  const dConn = I.conn - B.conn, dPax = I.pax - B.pax;

  // Aircraft and gates come from the full rebuild: those are real requirements.
  const dTails = A.tails - B.tails, dGates = A.gates - B.gates;
  const moreShort = A.short - B.short;
  // Ownership and overhead scale with the cost the route adds, at the network's ratio.
  const allocRatio = B.direct ? B.alloc / B.direct : 1;
  const netAlloc = dRev - pairCost * allocRatio;
  const existed = B.pair.deps > 0;

  const tone = net < 0 ? "bad" : (netAlloc < 0 || moreShort > 0) ? "warn" : "ok";
  const head = net < 0
    ? `Your network earns about ${money(Math.round(-net / 100) * 100)} a day less`
    : `Your network earns about ${money(Math.round(net / 100) * 100)} a day more`;
  const why = [];
  if(restRev > 250)
    why.push(`${$k(restRev)} of revenue lands on flights you already fly, from passengers this route feeds.`);
  else if(restRev < -250)
    why.push(`It takes ${$k(-restRev)} a day from flights you already fly, mostly passengers you were connecting.`);
  if(moreShort > 0)
    why.push(`You don't have the aircraft: ${fmt(moreShort)} more rotation${moreShort === 1 ? "" : "s"} couldn't be flown.`);
  else if(net >= 0 && netAlloc < 0)
    why.push(`It covers direct cost but not ownership and overhead.`);

  const row = (label, value, note, cls) =>
    `<div class="nc-row"><div class="nc-l">${label}</div>`
    + `<div class="nc-v${cls ? " " + cls : ""}">${value}</div><div class="nc-n">${note || ""}</div></div>`;

  const rows = [
    row(existed ? "This market, change" : "This route", `${sgn(pairRev, $k)} rev`,
        `${sgn(pairCost, $k)} direct cost`),
    row("Rest of your network", `${sgn(restRev, $k)} rev`,
        restRev >= 0 ? "fed onto flights you already fly" : "taken from flights you already fly",
        restRev < -250 ? "bad" : ""),
    row("Passengers", `${sgn(dPax, v => fmt(Math.round(v)))} a day`,
        `${sgn(dConn, v => fmt(Math.round(v)))} connecting, network-wide`),
    row("Aircraft", sgn(dTails, fmt),
        moreShort > 0 ? `short by ${fmt(A.short)} rotation${A.short === 1 ? "" : "s"}`
                      : `surplus ${fmt(B.surplus)} → ${fmt(A.surplus)}`,
        moreShort > 0 ? "bad" : ""),
    row("Gates", sgn(dGates, fmt), "summed across stations"),
    row("Checks", A.fails > B.fails ? "worse" : "unchanged",
        A.fails ? `${fmt(A.fails)} of ten failing${B.fails ? `, was ${fmt(B.fails)}` : ""}` : "all ten pass",
        A.fails > B.fails ? "bad" : ""),
    row("Fully allocated", `${sgn(netAlloc, $k)} a day`, "after ownership and overhead",
        netAlloc < 0 ? "bad" : "")
  ].join("");

  const icon = tone === "bad" ? "▲" : tone === "warn" ? "●" : "✓";
  return `<div class="rv-banner ${tone}"><span class="rv-icon" aria-hidden="true">${icon}</span><div>`
    + `<div class="rv-head">${head}</div>`
    + (why.length ? `<div class="rv-why">${why.join(" ")}</div>` : "")
    + `</div></div>`
    + `<div class="nc-grid">${rows}</div>`
    + `<details class="nc-how"><summary>How this is measured</summary><div>`
    + `Revenue is your current schedule with this market's flights added, so every other flight `
    + `stays where it is. Aircraft, gates and checks come from rebuilding the whole day with the `
    + `route in it. Adding a route re-times flights across the network, and that reshuffle alone `
    + `moves revenue between unrelated markets by more than most routes are worth, so it is left `
    + `out. Competition is still one generic rival per market, so read gains as optimistic.`
    + `</div></details>`;
}
