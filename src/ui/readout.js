/* ----- what an edit did -----
   After a route edit the whole day is rebuilt, and the header figures move for
   two reasons at once: the edit, and the rebuild re-timing flights the edit never
   touched. A median edit re-times about fifty flights, and that alone moves
   revenue by around $18k a day either way (ROADMAP, the schedule reshuffles). So
   the header cannot say what an edit was worth.

   This measures it the way the network check does. Revenue is the previous
   schedule with only the edited markets' flights swapped for the rebuilt ones;
   cost is the change on those markets; aircraft are counted for the types edited
   and gates at the edited airports. The reshuffle is counted and named, never
   scored. Nothing here feeds back into the schedule. */

let EDIT = null;              // {prev, prevRoutes, label, m} for the build in flight
const READOUT_MAX_MARKETS = 10;

/* Called before every rebuild. Only an edit that changed routes and nothing else
   gets a readout: settings, the fleet, a new starter or an import change too much
   at once for "what did this edit do" to have an answer. */
function noteEdit(label){
  EDIT = null;
  if(typeof M === "undefined" || !M || typeof committed === "undefined" || !committed){ hideReadout(); return; }
  let before; try { before = JSON.parse(committed); } catch(e){ hideReadout(); return; }
  const rest = s => JSON.stringify(Object.assign({}, s, {routes: null}));
  if(rest(before) !== rest(state)){ hideReadout(); return; }
  EDIT = {prev: M, prevRoutes: before.routes || [], label};
}
/* Called once the rebuild has produced its model. */
function editBuilt(){ if(EDIT && !EDIT.m) EDIT.m = M; }

/* Which markets changed, and how, one line each. */
function routeDiff(before, after){
  const byKey = rs => { const m = new Map(); for(const r of rs) m.set(r.o + "|" + r.d, r); return m; };
  const B = byKey(before), A = byKey(after), seen = new Map();
  for(const k of new Set([...B.keys(), ...A.keys()])){
    const b = B.get(k), a = A.get(k);
    if(JSON.stringify(b || null) === JSON.stringify(a || null)) continue;
    const r = a || b, pk = pairKey(r.o, r.d);
    if(seen.has(pk)) continue;                   // a trunk is stored both ways; describe it once
    const parts = [];
    if(a) for(const t of new Set([...Object.keys((b && b.mix) || {}), ...Object.keys(a.mix || {})])){
      const d = (+(a.mix || {})[t] || 0) - (+((b && b.mix) || {})[t] || 0);
      if(d) parts.push(`${t} ${d > 0 ? "+" : "−"}${Math.abs(d)} a day`);
    }
    if(!a) parts.push("removed");
    else if(!b) parts.unshift("new");
    if(a && b && (a.dow || 7) !== (b.dow || 7)) parts.push(`${a.dow || 7} days a week`);
    if(a && b && !!a.red !== !!b.red) parts.push(a.red ? "red-eye on" : "red-eye off");
    const types = new Set([...Object.keys((b && b.mix) || {}), ...Object.keys((a && a.mix) || {})]);
    seen.set(pk, {o: r.o, d: r.d, text: parts.join(", ") || "changed", types});
  }
  return [...seen.entries()].map(([k, v]) => Object.assign({k}, v));
}

/* Flights on markets the edit did not touch whose departure moved. */
function retimedCount(prev, next, keys){
  const deps = m => { const g = new Map();
    for(const f of m.flights){ const pk = pairKey(f.o, f.d); if(keys.has(pk)) continue;
      const k = pk + "|" + f.o + "|" + f.t; (g.get(k) || g.set(k, []).get(k)).push(f.depU); }
    for(const v of g.values()) v.sort((x, y) => x - y);
    return g; };
  const a = deps(prev), b = deps(next);
  let n = 0;
  for(const k of new Set([...a.keys(), ...b.keys()])){
    const x = a.get(k) || [], y = b.get(k) || [];
    for(let i = 0; i < Math.max(x.length, y.length); i++) if(x[i] !== y[i]) n++;
  }
  return n;
}

/* Run from the economics callback, once the rebuilt network has its money. */
function readoutAfterEcon(){
  const ed = EDIT;
  if(!ed || ed.m !== M) return;
  EDIT = null;
  const diff = routeDiff(ed.prevRoutes, state.routes);
  if(!diff.length || diff.length > READOUT_MAX_MARKETS){ hideReadout(); return; }
  const prevE = econOf(ed.prev), E = econReady();
  if(!prevE || prevE.err || !E){ hideReadout(); return; }
  const keys = new Set(diff.map(x => x.k));
  const direct = Ex => Ex.cost.flights.reduce((s, {f, cost}) => s + (keys.has(pairKey(f.o, f.d)) ? cost.direct : 0), 0);
  const I = isolatedRevenueFor(ed.prev, M, keys);
  const net = (I.rev - prevE.rev.stats.rev) - (direct(E) - direct(prevE));
  const est = diff.some(x => marketOf(x.o, x.d).src === "estimated");
  const types = new Set(); diff.forEach(x => x.types.forEach(t => types.add(t)));
  const fleetOf = (m, t) => m.fleet.find(f => f.t === t) || {total: 0, short: 0};
  const airports = new Set(); diff.forEach(x => { airports.add(x.o); airports.add(x.d); });
  const gatesAt = m => m.stations.filter(s => airports.has(s.code)).reduce((a, s) => a + s.gates, 0);
  const R = {
    diff, net, est,
    conn: I.conn - prevE.rev.stats.conn,
    aircraft: [...types].map(t => ({t, d: fleetOf(M, t).total - fleetOf(ed.prev, t).total,
                                     short: fleetOf(M, t).short})),
    gates: gatesAt(M) - gatesAt(ed.prev), airports: [...airports],
    fails: [failsOf(ed.prev), failsOf(M)],
    retimed: retimedCount(ed.prev, M, keys)
  };
  const mi = typeof activeMission === "function" ? activeMission() : null;
  if(mi){
    const b = missionScore(ed.prev, prevE, mi), a = missionScore(M, E, mi);
    if(b && a) R.mission = {mi, b, a};
  }
  paintReadout(R);
}

function hideReadout(){
  const h = $("#readout"); if(h){ h.hidden = true; h.innerHTML = ""; }
}

function paintReadout(R){
  const h = $("#readout"); if(!h) return;
  const cell = (label, value, cls, note) => `<div><span class="ro-l">${label}</span>`
    + `<span class="ro-v${cls ? " " + cls : ""}">${value}</span>`
    + (note ? `<span class="ro-n">${note}</span>` : "") + `</div>`;
  const head = R.diff.slice(0, 3).map(x => `<b>${esc(x.o)}–${esc(x.d)}</b> ${esc(x.text)}`).join("; ")
    + (R.diff.length > 3 ? `; and ${fmt(R.diff.length - 3)} more` : "");
  const cells = [
    cell("Network result", `${netSgn(R.net, netK)}<small>/day</small>`
      + (R.est ? ` <span class="chip bad" title="Demand on this market is a gravity estimate">est</span>` : ""),
      R.net < -0.5 ? "bad" : R.net > 0.5 ? "ok" : ""),
    cell("Connections", netSgn(R.conn, v => fmt(Math.round(v))), "")
  ];
  for(const a of R.aircraft.slice(0, 2))
    cells.push(cell(`${esc(a.t)} needed`, netSgn(a.d, fmt), a.short ? "bad" : "",
      a.short ? `${fmt(a.short)} more than you own` : ""));
  cells.push(cell(`Gates at ${esc(R.airports.slice(0, 3).join(", "))}`, netSgn(R.gates, fmt), ""));
  const notes = [];
  if(R.fails[1] > R.fails[0]) notes.push(`<b class="bad">${fmt(R.fails[1])} of ten checks now failing.</b> See the Checks tab.`);
  else if(R.fails[0] && !R.fails[1]) notes.push(`All ten checks pass again.`);
  if(R.est) notes.push(`Demand on this market is a gravity estimate, often off by seven times, so the result is too.`);
  if(R.retimed) notes.push(`The rebuild also re-timed ${fmt(R.retimed)} other flight${R.retimed === 1 ? "" : "s"}. `
    + `That reshuffle isn't counted here.`);
  let mission = "";
  if(R.mission){
    const {mi, b, a} = R.mission, of = mi.objectives.length, lines = [];
    a.results.forEach((r, i) => {
      if(r.met && !b.results[i].met) lines.push(`Objective met: ${objectiveLabel(r.o)}.`);
      if(!r.met && b.results[i].met) lines.push(`Objective lost: ${objectiveLabel(r.o)}.`);
    });
    if(a.stars === of && b.stars < of) lines.unshift(`<b>Mission complete.</b>`);
    if(lines.length || a.stars !== b.stars)
      mission = `<div class="ro-mission">${starsHTML(a.stars, of)} ${lines.join(" ")}</div>`;
  }
  h.innerHTML = `<div class="ro-head"><span>${head}</span>`
    + `<button class="ro-x" type="button" aria-label="Dismiss">×</button></div>`
    + `<div class="ro-grid">${cells.join("")}</div>`
    + (notes.length ? `<p class="ro-note">${notes.join(" ")}</p>` : "")
    + mission;
  h.hidden = false;
  h.querySelector(".ro-x").onclick = hideReadout;
  const lr = $("#live");
  if(lr){ lr.textContent = ""; setTimeout(() => { lr.textContent = h.innerText.replace(/\s+/g, " ").replace("×", ""); }, 30); }
}
