/* ----- the money, where decisions are made -----
   The header used to carry ten operational figures of equal weight and no money.
   It now answers "is this network any good": what it earns after everything,
   how full it flies, whether you own the aircraft it needs, and how much it
   flies. Everything that left the header still lives on its own tab.

   The revenue model takes a noticeable fraction of a second, too long to run
   inside every edit, so the money arrives a moment after the schedule: the
   header and the Network table draw at once and fill their money in after. */

let econTimer = null;
let demandSettled = false;      // set by boot once the demand data has arrived (or failed to)
const econReady = () => (M && M.__econ && !M.__econ.err) ? M.__econ : null;

function scheduleEcon(){
  clearTimeout(econTimer);
  const m = M;
  if(!demandSettled) return;                   // boot redraws when demand lands
  econTimer = setTimeout(() => {
    if(m !== M) return;                        // rebuilt since; that build will ask again
    econOf(M);
    drawKpis();
    fillRouteMoney();
  }, 60);
}

/* Per market, both directions together, cached on the economics it came from. */
function routeMoney(){
  const E = econReady(); if(!E) return null;
  if(!E.__byPair){
    E.__byPair = new Map();
    for(const r of econRoutes(E)) E.__byPair.set(r.k, r);
  }
  return E.__byPair;
}

function drawKpis(){
  if(typeof paintChecksTab === "function") paintChecksTab();
  const T = M.totals, bad = failCount(), E = econReady();
  const R = M.feedStats ? M.feedStats.redeyes : 0;
  const short = M.fleet.filter(f => f.short > 0);
  const card = (label, value, note, goto, flag, title) =>
    `<button class="kpi clickable${flag ? " flag" : ""}" data-goto="${goto}"`
    + (title ? ` title="${esc(title)}"` : "") + `>`
    + `<span class="k">${esc(label)}</span><span class="v">${value}</span>`
    + `<span class="knote">${note}</span></button>`;

  let money, lf;
  if(E){
    const rev = E.rev.stats.rev, op = rev - E.cost.totals.allocated;
    money = card("Operating result", `${moneyK(op)}<small>/day</small>`,
      `${op < 0 ? "loss" : "profit"} on ${esc(moneyK(rev))} revenue`, "econ", op < 0,
      "Revenue less every cost, including aircraft ownership and overhead");
    lf = card("Load factor", `${Math.round(E.rev.lf * 100)}%`,
      `${Math.round(E.rev.stats.conn / E.rev.stats.pax * 100)}% of passengers connect`, "econ", false,
      "Seats filled across the whole schedule");
  } else {
    const wait = demandSettled ? "working it out" : "loading demand";
    money = card("Operating result", `<span class="dim">…</span>`, wait, "econ");
    lf = card("Load factor", `<span class="dim">…</span>`, wait, "econ");
    scheduleEcon();
  }
  const air = card("Aircraft", `${fmt(T.totalFleet)}<small>of ${fmt(T.roster)}</small>`,
    short.length
      ? short.map(f => `${fmt(f.short)} ${esc(f.t)} short`).join(", ")
      : `${fmt(Math.max(0, T.roster - T.totalFleet))} spare`,
    "fleet", short.length > 0, "Aircraft this schedule needs, including spares, against the aircraft you own");
  const fl = card("Flights a day", fmt(T.deps),
    `${fmt(T.routes)} routes${R ? ` · ${fmt(R)} overnight` : ""}`, "schedule", false);
  const chk = bad ? card("Checks", `${fmt(bad)}<small>failing</small>`, "the schedule breaks a rule", "checks", true) : "";

  const host = $("#kpis");
  host.classList.add("head");
  host.innerHTML = money + lf + air + fl + chk;
}

/* ---- Network table ---- */
function moneyCell(k){
  const map = routeMoney();
  if(!map) return `<span class="dim">…</span>`;
  const r = map.get(k);
  if(!r) return `<span class="dim">—</span>`;
  return `<span class="${r.contrib < 0 ? "neg" : ""}">${moneyK(r.contrib)}</span>`
    + (r.estimated ? ` <span class="chip bad" title="More than a quarter of this route's revenue is estimated">est</span>` : "");
}
function fillRouteMoney(){
  if(!routeMoney()) return;
  document.querySelectorAll("#tRoutes [data-money]").forEach(td => { td.innerHTML = moneyCell(td.dataset.money); });
}

/* Remove a market in both directions. A trunk is stored both ways and the engine
   flies the larger side, so deleting one row of it used to change nothing. */
function removeMarket(routes, o, d){
  const k = pairKey(o, d);
  for(let i = routes.length - 1; i >= 0; i--)
    if(pairKey(routes[i].o, routes[i].d) === k) routes.splice(i, 1);
}

/* ---- what cutting a route does to the network ----
   The mirror of the Add route check. A route that loses money on its own can
   still carry passengers onto your other flights, and cutting it loses them.
   Measured the same way: revenue on the current schedule with only this
   market's flights taken out, aircraft for its own types, gates at its own two
   airports. */
function computeCutCheck(o, d){
  const key = "cut|" + pairKey(o, d);
  if(netCache.m !== M) netCache = {m: M, map: new Map()};
  const hit = netCache.map.get(key); if(hit) return hit;
  let R;
  try{
    const E = econOf(M), pk = pairKey(o, d);
    const pair = {rev: 0, direct: 0};
    const types = new Set();
    for(const {f, cost} of E.cost.flights){
      if(pairKey(f.o, f.d) !== pk) continue;
      pair.rev += E.rev.legrev.get(f.id) || 0;
      pair.direct += cost.direct;
      types.add(f.t);
    }
    const kept = M.flights.filter(f => pairKey(f.o, f.d) !== pk)
      .map(f => Object.assign({}, f, {seats: (SPEC[f.t] && SPEC[f.t].seats) || 0}));
    const I = allocateDemand(kept, buildItineraries(kept), REV_COMPETITION, flightPremiums(kept).prem);
    const keep = state.routes; let m;
    try{
      state.routes = JSON.parse(JSON.stringify(keep));
      removeMarket(state.routes, o, d);
      m = build();
    } finally { state.routes = keep; }
    const byT = (mm, t) => mm.fleet.find(x => x.t === t) || {total: 0, short: 0};
    const freed = {}; let shortFixed = 0;
    for(const t of types){
      const n = byT(M, t).total - byT(m, t).total; if(n > 0) freed[t] = n;
      shortFixed += Math.max(0, byT(M, t).short - byT(m, t).short);
    }
    const gatesAt = mm => mm.stations.filter(s => s.code === o || s.code === d).reduce((x, s) => x + s.gates, 0);
    const dRev = I.stats.rev - E.rev.stats.rev;
    const ratio = E.cost.totals.direct ? E.cost.totals.allocated / E.cost.totals.direct : 1;
    R = {net: dRev + pair.direct, netAlloc: dRev + pair.direct * ratio,
         restRev: dRev + pair.rev, pairRev: pair.rev, saved: pair.direct,
         freed, shortFixed, dGates: gatesAt(m) - gatesAt(M),
         fails: [failsOf(M), failsOf(m)]};
  } catch(err){
    console.error("cut check failed", err);
    R = {err: String(err.message || err)};
  }
  netCache.map.set(key, R);
  return R;
}

function cutCell(r){
  const R = netCache.m === M ? netCache.map.get("cut|" + r.k) : null;
  let verdict;
  if(!R) verdict = `<span class="gi-pill pending">checking…</span>`;
  else if(R.err) verdict = `<span class="gi-pill">not checked</span>`;
  else {
    const breaks = R.fails[1] > R.fails[0];
    const tone = R.net < 0 || breaks ? "bad" : R.netAlloc < 0 ? "warn" : "ok";
    const why = [];
    if(R.restRev < -250) why.push(`loses ${netK(-R.restRev)} of feed`);
    const fr = Object.entries(R.freed).map(([t, n]) => `${fmt(n)} ${esc(t)}`);
    if(fr.length) why.push(`frees ${fr.join(" + ")}`);
    if(R.shortFixed > 0) why.push(`clears ${fmt(R.shortFixed)} short`);
    if(R.fails[1] > R.fails[0]) why.push(`breaks a check`);
    verdict = `<span class="gi-pill ${tone}">Network ${R.net < 0 ? "−" : "+"}${netK(R.net)}/day</span>`
      + (why.length ? ` <span class="gi-why">${why.join(", ")}</span>` : "");
  }
  // Losing money or breaking a check: still possible, not offered as the answer.
  const worse = R && !R.err && (R.net < 0 || R.fails[1] > R.fails[0]);
  return `<td class="cutv">${verdict}</td>`
    + `<td class="cuta"><button class="btn sm" data-review="${esc(r.o)}|${esc(r.d)}">Review</button> `
    + `<button class="btn sm${worse ? " quiet" : ""}" data-cut="${esc(r.o)}|${esc(r.d)}">${worse ? "Cut anyway" : "Cut"}</button></td>`;
}

let cutGen = 0, CUT_ROWS = [];
function startCutChecks(rows){
  CUT_ROWS = rows;
  const gen = ++cutGen;
  const tick = () => {
    if(gen !== cutGen || tab !== "econ") return;
    const next = CUT_ROWS.find(r => !(netCache.m === M && netCache.map.get("cut|" + r.k)));
    if(!next) return paintCutProgress();
    computeCutCheck(next.o, next.d);
    const tr = document.querySelector(`#econWorst tr[data-pair="${CSS.escape(next.k)}"]`);
    if(tr){
      tr.querySelector(".cutv").remove(); tr.querySelector(".cuta").remove();
      tr.insertAdjacentHTML("beforeend", cutCell(next));
    }
    paintCutProgress();
    setTimeout(tick, 60);
  };
  paintCutProgress();
  setTimeout(tick, 150);
}
function paintCutProgress(){
  const host = $("#cutProgress"); if(!host) return;
  const done = CUT_ROWS.filter(r => netCache.m === M && netCache.map.get("cut|" + r.k)).length;
  host.innerHTML = done < CUT_ROWS.length
    ? `<span class="rv-checking">Checking what cutting each one does to your network… ${fmt(done)} of ${fmt(CUT_ROWS.length)}</span>`
    : `A route that loses money on its own can still feed your other flights. <b>Network</b> is what `
      + `cutting it would do to the whole airline, with the rest of the schedule held still.`;
}

/* Review a market on the Network tab. */
function reviewMarket(o, d){
  goTab("network");
  const q = $("#q"); if(q){ q.value = `${o}–${d}`; }
  drawRoutes();
  const t = $("#tRoutes"); if(t) t.scrollIntoView({behavior: "smooth", block: "start"});
}

function cutMarket(o, d){
  removeMarket(state.routes, o, d);
  rebuild(`cut ${o}–${d}`);
  toast(`Cut ${o}–${d}. Undo brings it back.`);
}
