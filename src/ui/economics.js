/* ----- economics tab -----
   Costs from economics.js, revenue from revenue.js, joined here. Both derive
   from the finished schedule and neither feeds back into the engine, so
   nothing on this tab can move the acceptance metrics or the ten checks.

   Both models are memoised on the model object: revenueModel() builds every
   itinerary in the network twice (once for the unopposed ceiling) and a tab
   redraw must not pay that again. rebuild() replaces M, so the cache dies
   with it. */
function econOf(M){
  if(!M.__econ){
    try { M.__econ = {cost: econModel(M), rev: revenueModel(M)}; }
    catch(err){ console.error("economics failed", err); M.__econ = {err}; }
  }
  return M.__econ;
}

/* A route is `estimated` when more than a quarter of its revenue comes from
   markets with no measured demand — international, where the gravity model is
   scaled by a factor calibrated on the DB1C-domestic Caribbean. Saying a route
   loses money on that basis is a claim about the estimate, not the route. */
const EST_LIMIT = 0.25;

function econRoutes(E){
  const by = new Map();
  const rev = E.rev.legrev, est = E.rev.estrev, pax = E.rev.boarded;
  for(const {f, cost} of E.cost.flights){
    const k = pairKey(f.o, f.d);
    let a = by.get(k);
    if(!a){ a = {k, o:f.o, d:f.d, nm:f.nm, deps:0, seats:0, pax:0, rev:0,
                 est:0, direct:0, alloc:0, types:new Set()}; by.set(k, a); }
    a.deps++; a.types.add(f.t);
    a.seats += (SPEC[f.t] && SPEC[f.t].seats) || 0;
    a.pax += pax.get(f.id) || 0;
    a.rev += rev.get(f.id) || 0;
    a.est += est.get(f.id) || 0;
    a.direct += cost.direct; a.alloc += cost.allocated;
  }
  for(const a of by.values()){
    a.contrib = a.rev - a.direct;
    a.margin = a.rev > 0 ? a.contrib/a.rev : -1;
    a.lf = a.seats ? a.pax/a.seats : 0;
    a.estimated = a.rev > 0 ? a.est/a.rev > EST_LIMIT : true;
  }
  return [...by.values()].sort((x,y)=>x.contrib-y.contrib);
}

const money = n => (n<0?"−":"") + "$" + fmt(Math.abs(Math.round(n)));

function drawEcon(){
  const E = econOf(M);
  if(E.err){ $("#econ").innerHTML =
    `<p class="note">The cost model could not run: ${esc(String(E.err))}</p>`;
    return; }
  const C = E.cost, R = E.rev, T = C.totals;
  const contrib = R.stats.rev - T.direct, op = R.stats.rev - T.allocated;

  const kpi = (k,v,note,flag) =>
    `<div class="kpi${flag?" flag":""}"><div class="k">${esc(k)}</div>`
    + `<div class="v">${v}</div>`
    + (note?`<div class="knote">${esc(note)}</div>`:"") + `</div>`;
  $("#econKpis").innerHTML = [
    kpi("Revenue/day", money(R.stats.rev),
        `${Math.round((1-R.stats.estRev/R.stats.rev)*100)}% measured`),
    kpi("Direct cost/day", money(T.direct), "excludes ownership"),
    kpi("Contribution/day", money(contrib),
        `${Math.round(contrib/R.stats.rev*100)}% of revenue`, contrib<0),
    kpi("Allocated cost/day", money(T.allocated), "with ownership + overhead"),
    kpi("Operating result", money(op), op<0?"loss":"profit", op<0),
    kpi("Load factor", (R.lf*100).toFixed(1)+"%",
        `ceiling ${(R.ceiling*100).toFixed(1)}% unopposed`),
    kpi("RASM", R.rasm.toFixed(2)+"¢", "per available seat mile"),
    kpi("CASM", C.casm.toFixed(2)+"¢", "fully allocated"),
    kpi("Yield", R.yield.toFixed(2)+"¢", "per revenue passenger mile"),
    kpi("Connecting", Math.round(R.stats.conn/R.stats.pax*100)+"%",
        `${fmt(Math.round(R.stats.conn))} of ${fmt(Math.round(R.stats.pax))} passengers`)
  ].join("");

  // cost stack
  const els = [["fuel","Fuel"],["crew","Crew"],["maint","Maintenance"],
               ["landing","Landing fees"],["handling","Ground handling"],
               ["own","Ownership"]];
  let h = `<table><thead><tr><th>Cost element</th><th class="num">$/day</th>`
    + `<th class="num">¢/ASM</th><th class="num">Share</th></tr></thead><tbody>`;
  for(const [k,label] of els)
    h += `<tr><td>${label}</td><td class="num mono">${fmt(Math.round(T[k]))}</td>`
      + `<td class="num mono">${(T[k]/T.asm*100).toFixed(2)}</td>`
      + `<td class="num mono dim">${Math.round(T[k]/T.allocated*100)}%</td></tr>`;
  h += `<tr><td><b>Direct</b></td><td class="num mono"><b>${fmt(Math.round(T.direct))}</b></td>`
    + `<td class="num mono"><b>${(T.direct/T.asm*100).toFixed(2)}</b></td><td></td></tr>`;
  h += `<tr><td><b>Fully allocated</b></td><td class="num mono"><b>${fmt(Math.round(T.allocated))}</b></td>`
    + `<td class="num mono"><b>${C.casm.toFixed(2)}</b></td><td></td></tr></tbody></table>`;
  $("#econCost").innerHTML = h;

  // unit cost against stage length — the curve the model exists to show
  const worst = Math.max(...C.byStage.map(b=>b.casm));
  h = `<table><thead><tr><th>Stage length</th><th class="num">Departures</th>`
    + `<th class="num">CASM ¢</th><th class="num">$/departure</th><th></th>`
    + `</tr></thead><tbody>`;
  for(const b of C.byStage){
    const label = b.hi > 1e8 ? `${fmt(b.lo)}+ nm` : `${fmt(b.lo)}–${fmt(b.hi)} nm`;
    h += `<tr><td>${label}</td><td class="num mono">${fmt(b.deps)}</td>`
      + `<td class="num mono">${b.casm.toFixed(2)}</td>`
      + `<td class="num mono">${fmt(Math.round(b.perDep))}</td>`
      + `<td style="width:38%"><span style="display:inline-block;height:9px;`
      + `border-radius:3px;background:var(--accent);opacity:.7;`
      + `width:${(b.casm/worst*100).toFixed(1)}%"></span></td></tr>`;
  }
  h += `</tbody></table>`;
  $("#econStage").innerHTML = h;

  // by fleet type
  h = `<table><thead><tr><th>Type</th><th class="num">Departures</th>`
    + `<th class="num">Avg stage</th><th class="num">Block/dep</th>`
    + `<th class="num">$/departure</th><th class="num">CASM ¢</th>`
    + `<th>Rates from</th></tr></thead><tbody>`;
  for(const t of TYPES){
    const a = C.byType.find(x=>x.t===t); if(!a) continue;
    const r = econRate(t);
    h += `<tr><td class="mono">${t}</td><td class="num mono">${fmt(a.deps)}</td>`
      + `<td class="num mono">${fmt(Math.round(a.nm/a.deps))}</td>`
      + `<td class="num mono">${(a.blk/a.deps).toFixed(2)}</td>`
      + `<td class="num mono">${fmt(Math.round(a.allocated/a.deps))}</td>`
      + `<td class="num mono">${(a.allocated/a.asm*100).toFixed(2)}</td>`
      + `<td class="dim">${r?esc(r.f41):"—"}`
      + (r && r.flags.length?` <span class="chip bad" title="see tools/f41_rates.py">${esc(r.flags.join(", "))}</span>`:"")
      + `</td></tr>`;
  }
  h += `</tbody></table>`;
  $("#econType").innerHTML = h;

  // routes, worst first — the point of the tab
  const rows = econRoutes(E);
  const neg = rows.filter(r=>r.contrib<0);
  const negM = neg.filter(r=>!r.estimated);
  const N = 20;
  const routeRows = rs => rs.map(r=>
    `<tr><td class="mono">${r.o}–${r.d}</td>`
    + `<td class="num mono">${fmt(r.deps)}</td>`
    + `<td class="num mono">${fmt(Math.round(r.nm))}</td>`
    + `<td class="num mono">${(r.lf*100).toFixed(0)}%</td>`
    + `<td class="num mono">${fmt(Math.round(r.rev/r.deps))}</td>`
    + `<td class="num mono">${fmt(Math.round(r.direct/r.deps))}</td>`
    + `<td class="num mono"${r.contrib<0?' style="color:var(--bad)"':""}>`
    + `${money(r.contrib)}</td>`
    + `<td class="dim">${[...r.types].join(", ")}`
    + (r.estimated?` <span class="chip bad" title="More than a quarter of this route's revenue comes from markets with no measured demand — the number is an estimate, not a measurement.">est</span>`:"")
    + `</td></tr>`).join("");
  const head = `<table><thead><tr><th>Route</th><th class="num">Deps</th>`
    + `<th class="num">nm</th><th class="num">LF</th><th class="num">Rev/dep</th>`
    + `<th class="num">Cost/dep</th><th class="num">Contribution/day</th>`
    + `<th>Gauge</th></tr></thead><tbody>`;
  $("#econWorst").innerHTML = head + routeRows(rows.slice(0,N)) + `</tbody></table>`;
  $("#econBest").innerHTML = head
    + routeRows(rows.slice(-N).reverse()) + `</tbody></table>`;

  $("#econRouteNote").innerHTML =
    `<b>${fmt(neg.length)} of ${fmt(rows.length)} routes do not cover their `
    + `direct cost</b>, ${fmt(negM.length)} of them on measured demand. `
    + `Contribution is revenue less direct operating cost, with no ownership `
    + `charge: the roster exists whether or not a route is flown, and a route `
    + `that fits into existing slack costs no aircraft. That is the right test `
    + `for whether a route should exist. Judging the network as a whole is a `
    + `different question, and the fully allocated line above answers it.`;

  const cal = (INTL.calibration||{});
  $("#econProvenance").innerHTML =
    `<b>Where the numbers come from.</b> Costs are US DOT Form 41 Schedule `
    + `P-5.2 and P-6 joined to T-100, calendar 2025, domestic entities only, `
    + `peer set <span class="mono">${esc((ECON.meta||{}).peerSet||"?")}</span>. `
    + `Each element is a per-cycle plus a per-hour rate, which is why unit cost `
    + `falls with stage length. Form 41 cannot measure that split — the `
    + `cross-carrier regression returns negative cycle fuel — so the level is `
    + `measured and only the shape is assumed, through `
    + `<span class="mono">cycleEquivHours</span>.<br><br>`
    + `<b>Demand.</b> ${fmt(R.stats.real)} markets carry measured DB1C `
    + `origin-and-destination demand. ${fmt(R.stats.estMarkets)} international `
    + `markets are estimated: gravity demand scaled ×${INTL.demandFactor} from `
    + `${fmt((cal.markets)||0)} real Caribbean markets that DB1C counts as `
    + `domestic. Those routes are marked <span class="chip bad">est</span> and `
    + `${Math.round(R.stats.estRev/R.stats.rev*100)}% of revenue rests on them. `
    + `Real data backfills through the overrides table in `
    + `<span class="mono">intl_demand.json</span>.<br><br>`
    + `<b>Connections.</b> The schedule offers ${fmt(R.itineraries.nonstop)} `
    + `nonstop and ${fmt(R.itineraries.onestop)} one-stop itineraries. Each `
    + `fare is prorated across the legs that carried it by distance, so a `
    + `connecting passenger is counted once rather than once per leg. Market `
    + `share is quality-of-service against one rival of equal schedule quality; `
    + `load factor is an output of that, not a target.`;
}
