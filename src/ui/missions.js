/* ----- missions -----
   A starter can carry a mission: a brief, three objectives and a reference
   solution. verify.py applies the solution on every build and fails unless it
   earns all three stars, so a shipped mission is always winnable.

   Objectives only measure what the model can be trusted on. Aircraft, departures
   and checks are arithmetic on the schedule. Connections are passengers the
   schedule actually carries through a station. Money counts measured demand only:
   revenue resting on the gravity estimate, which is often off by seven times, is
   left out, so a mission cannot be won on an estimate.

   Every one of the ten checks has to pass before any star counts. A network that
   breaks a rule has not been planned, whatever it earns. */

const MISSION_KEY = "anp-missions";      // best stars per mission, this browser only

function missionOf(id){
  const s = (typeof STARTERS !== "undefined" ? STARTERS : []).find(x => x.id === id);
  return s && s.mission ? Object.assign({id}, s.mission) : null;
}
const activeMission = () => (state && state.origin) ? missionOf(state.origin) : null;

/* Precise enough that a target and a value either side of it never print the
   same: $1.045M against $1.028M, where the header's $1.0M would show both. */
const missionMoney = v => Math.abs(v) >= 1e6 ? `$${(Math.abs(v) / 1e6).toFixed(3)}M`
                                             : `$${fmt(Math.round(Math.abs(v) / 1000))}k`;

function objectiveLabel(o){
  switch(o.kind){
    case "connections":    return `Sell ${fmt(o.min)} connections a day through ${esc(o.at)}`;
    case "aircraftMax":    return `Fly it with ${fmt(o.max)} aircraft or fewer, spares included`;
    case "profitMeasured": return o.min > 0 ? `Earn ${missionMoney(o.min)} a day on measured demand`
                                            : `Make a profit on measured demand`;
    case "deps":           return `Fly ${fmt(o.min)} departures a day`;
    case "routes":         return `Serve at least ${fmt(o.min)} routes`;
  }
  return esc(o.kind);
}

/* One step of a reference solution: add a route exactly as the Add button does,
   or cut a market in both directions. verify.py plays these. */
function applyMissionStep(routes, step){
  if(step.op === "remove"){
    const k = pairKey(step.o, step.d);
    for(let i = routes.length - 1; i >= 0; i--) if(pairKey(routes[i].o, routes[i].d) === k) routes.splice(i, 1);
    return;
  }
  const {op, ...spec} = step;
  applyAddRoute(routes, Object.assign({n: 1, w: 7, red: false}, spec));
}

/* The objective's current value on one built network and its economics. */
function objectiveValue(o, m, E){
  switch(o.kind){
    case "connections": { const g = realisedVia(o.at, m); return g ? g.pax : 0; }
    case "aircraftMax": return m.totals.totalFleet;
    case "profitMeasured":
      return E.rev.stats.rev - E.rev.stats.estRev - E.cost.totals.allocated;
    case "deps": return m.totals.deps;
    case "routes": return m.totals.routes;
  }
  return 0;
}
const objectiveMet = (o, v) => o.kind === "aircraftMax" ? v <= o.max : v >= o.min;
function objectiveShown(o, v){
  if(o.kind === "profitMeasured") return `${v < 0 ? "−" : "+"}${missionMoney(v)}/day`;
  return fmt(Math.round(v));
}

/* Stars for one network: zero unless every check passes, then one per objective. */
function missionScore(m, E, mission){
  if(!m || !E || E.err || !mission) return null;
  const checksOk = failsOf(m) === 0;
  const results = mission.objectives.map(o => {
    const value = objectiveValue(o, m, E);
    return {o, value, met: objectiveMet(o, value)};
  });
  return {checksOk, results, stars: checksOk ? results.filter(r => r.met).length : 0};
}

function missionBest(id){
  try { return JSON.parse(localStorage.getItem(MISSION_KEY) || "{}")[id] || 0; }
  catch(e){ return 0; }
}
/* Returns true when this is a new best. */
function missionRecord(id, stars){
  try {
    const all = JSON.parse(localStorage.getItem(MISSION_KEY) || "{}");
    if((all[id] || 0) >= stars) return false;
    all[id] = stars; localStorage.setItem(MISSION_KEY, JSON.stringify(all));
    return true;
  } catch(e){ return false; }
}

const starsHTML = (n, of) => `<span class="stars" role="img" aria-label="${n} of ${of} stars">`
  + Array.from({length: of}, (_, i) => `<span${i < n ? ` class="on"` : ""}>★</span>`).join("") + `</span>`;

/* The card at the top of the Network tab. Drawn with the header figures, so it
   fills in when the money arrives. */
function drawMission(){
  const host = $("#missionCard"); if(!host) return;
  const mi = activeMission();
  host.hidden = !mi;
  if(!mi){ host.innerHTML = ""; return; }
  const E = econReady();
  const S = E ? missionScore(M, E, mi) : null;
  if(S) missionRecord(mi.id, S.stars);
  const of = mi.objectives.length, best = missionBest(mi.id);
  const rows = mi.objectives.map((o, i) => {
    const r = S && S.results[i];
    return `<li class="${r && r.met ? "met" : ""}"><span class="mo-mark" aria-hidden="true">${r && r.met ? "✓" : "○"}</span>`
      + `<span>${objectiveLabel(o)}</span><span class="mo-v">${r ? objectiveShown(o, r.value) : "…"}</span></li>`;
  }).join("");
  host.innerHTML = `<h2>${esc(mi.title)} <span class="sub">Mission</span>${S ? starsHTML(S.stars, of) : ""}</h2>`
    + `<div class="pad"><p class="note">${esc(mi.brief)}</p><ul class="mission-obj">${rows}</ul>`
    + `<p class="note dim mission-foot">`
    + (S && !S.checksOk ? `<b>No stars while a check is failing.</b> Fix it on the Checks tab first. ` : "")
    + `Best so far: ${fmt(best)} of ${fmt(of)} stars. Every mission is checked to be winnable `
    + `each time the planner is built.</p></div>`;
}
