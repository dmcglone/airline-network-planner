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

const MISSION_KEY = "anp-missions";      // the logbook: each mission's best result, this browser only

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

/* The logbook: each mission's best result, as {stars, at, values}, with the date
   it was flown and the value of each objective then. A record from before the
   logbook is the star count alone, and gets its figures the next time the
   mission is played. Storage can hold anything, and these figures go into
   markup, so a record is read back as numbers and a date or not at all. */
function missionLogAll(){
  try { const all = JSON.parse(localStorage.getItem(MISSION_KEY) || "{}");
    return all && typeof all === "object" ? all : {}; }
  catch(e){ return {}; }
}
function missionLog(id){
  const all = missionLogAll(), v = own(all, id) ? all[id] : null;
  if(typeof v === "number") return Number.isFinite(v) ? {stars: Math.max(0, Math.min(9, Math.round(v))), at: null, values: null} : null;
  if(!v || typeof v !== "object") return null;
  const n = Number(v.stars);
  return {stars: Number.isFinite(n) ? Math.max(0, Math.min(9, Math.round(n))) : 0,
    at: typeof v.at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.at) ? v.at : null,
    values: Array.isArray(v.values) && v.values.every(x => typeof x === "number" && Number.isFinite(x)) ? v.values : null};
}
function missionBest(id){ return (missionLog(id) || {stars: 0}).stars; }
/* Logs a scored network when it beats the record: more stars, or the same stars
   and a better first objective, which is each mission's headline. A result with
   no stars is not logged. Returns true when this is a new best. */
function missionRecord(id, S){
  if(!S || !S.stars) return false;
  const old = missionLog(id), values = S.results.map(r => r.value), o = S.results[0].o;
  const better = !old || S.stars > old.stars || (S.stars === old.stars
    && (!old.values || (o.kind === "aircraftMax" ? values[0] < old.values[0] : values[0] > old.values[0])));
  if(!better) return false;
  const d = new Date(), p = n => String(n).padStart(2, "0");
  try {
    const all = missionLogAll();
    all[id] = {stars: S.stars, at: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, values};
    localStorage.setItem(MISSION_KEY, JSON.stringify(all));
    return true;
  } catch(e){ return false; }
}
/* An objective's value in a few words, for the logbook line. */
function objectiveShort(o, v){
  const n = fmt(Math.round(v));
  switch(o.kind){
    case "connections":    return `${n} connections at ${esc(o.at)}`;
    case "aircraftMax":    return `${n} aircraft`;
    case "profitMeasured": return objectiveShown(o, v);
    case "deps":           return `${n} departures`;
    case "routes":         return `${n} routes`;
  }
  return n;
}
const logDay = at => { const [y, m, d] = at.split("-").map(Number);
  return `${d} ${"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[m - 1] || ""} ${y}`; };
/* "+$754k/day · 15 routes · 18 aircraft", or "" for a record without figures. */
const missionLogLine = (mi, rec) => rec && rec.values && rec.values.length === mi.objectives.length
  ? mi.objectives.map((o, i) => objectiveShort(o, rec.values[i])).join(" · ") : "";

const starsHTML = (n, of) => `<span class="stars" role="img" aria-label="${n} of ${of} stars">`
  + Array.from({length: of}, (_, i) => `<span${i < n ? ` class="on"` : ""}>★</span>`).join("") + `</span>`;

/* The card at the top of the Network tab, and of Suggestions, where the moves
   that shift the objectives are. Drawn with the header figures, so it fills in
   when the money arrives. */
const MISSION_HOSTS = ["#missionCard", "#missionCardSuggest"];
function drawMission(){
  const hosts = MISSION_HOSTS.map(s => $(s)).filter(Boolean); if(!hosts.length) return;
  const mi = activeMission();
  for(const h of hosts) h.hidden = !mi;
  if(!mi){ for(const h of hosts) h.innerHTML = ""; return; }
  const E = econReady();
  const S = E ? missionScore(M, E, mi) : null;
  if(S) missionRecord(mi.id, S);
  const of = mi.objectives.length, rec = missionLog(mi.id), line = missionLogLine(mi, rec);
  const rows = mi.objectives.map((o, i) => {
    const r = S && S.results[i];
    return `<li class="${r && r.met ? "met" : ""}"><span class="mo-mark" aria-hidden="true">${r && r.met ? "✓" : "○"}</span>`
      + `<span>${objectiveLabel(o)}</span><span class="mo-v">${r ? objectiveShown(o, r.value) : "…"}</span></li>`;
  }).join("");
  const html = `<h2>${esc(mi.title)} <span class="sub">Mission</span>${S ? starsHTML(S.stars, of) : ""}</h2>`
    + `<div class="pad">${practiceBand()}<p class="note">${esc(mi.brief)}</p><ul class="mission-obj">${rows}</ul>`
    + (S && S.stars === of ? `<p class="mission-play">${PLAY_BUTTON}`
        + `<span class="dim">Your schedule on the map, one day in about a minute.</span></p>` : "")
    + (rec && rec.stars
        ? `<p class="mission-best"><b>Your best</b> ${starsHTML(rec.stars, of)}`
          + (rec.at ? `<span class="dim">${logDay(rec.at)}</span>` : "")
          + (line ? `<span class="mb-v">${line}</span>` : "") + `</p>`
        : `<p class="note dim">No stars on this mission yet.</p>`)
    + `<p class="note dim mission-foot">`
    + (S && !S.checksOk ? `<b>No stars while a check is failing.</b> Fix it on the Checks tab first. ` : "")
    + `Every mission is checked to be winnable each time the planner is built.</p></div>`;
  for(const h of hosts){
    h.innerHTML = html;
    const pb = h.querySelector("[data-playday]"); if(pb) pb.onclick = playMissionDay;
  }
}

/* ----- the Missions card and panel -----
   A mission lived only on the welcome cards, which a returning visitor never
   sees again. The header's row of figures now ends with a Missions card: the
   stars won so far, and the mission open now. It opens a panel of every mission
   with its brief, its objectives against your best, and Play.

   Each mission flies its own small practice airline, and playing swaps it in.
   Undo alone could not be trusted to bring yours back: its history is lost on a
   reload, and the swap had already saved over your airline. So Play from your
   own airline first sets a copy of it aside in this browser, and while a
   practice airline is open its card offers Back to your airline. Going from one
   mission to another keeps the same airline aside. */
let missionsOpen = false;
const OWN_KEY = "anp-own";               // your airline, set aside while a practice airline is open
/* The airline set aside, or null. Read back through adoptState(), which checks
   it like a file; the name goes into markup, so only a string is used. */
function ownAside(){
  try { const o = JSON.parse(localStorage.getItem(OWN_KEY) || "null");
    return o && typeof o === "object" && o.state && Array.isArray(o.state.routes) && Array.isArray(o.state.fleet) ? o : null; }
  catch(e){ return null; }
}
const ownName = o => o && typeof o.state.brand === "string" && o.state.brand.trim() ? o.state.brand : "your airline";
function backToOwn(){
  const o = ownAside(); if(!o) return;
  missionsOpen = false; drawMissionsPanel();
  try { swapNetwork(() => adoptState(o), `back to ${ownName(o)}`); }
  catch(e){ toast("Your airline could not be read back: " + e.message); return; }
  try { localStorage.removeItem(OWN_KEY); } catch(e){}
  goTab("network");
  toast(`Back to ${ownName(o)}`);
}
/* What a mission's airline is, in a few words: "one hub at Denver, 40 routes,
   41 aircraft". */
function practiceLine(s){
  const st = (s.state && s.state.stations) || [], c = st[0], roles = (s.state && s.state.roles) || {}, ex = s.expect || {};
  const kind = roles[c] === "Hub" ? "hub" : roles[c] === "Focus" ? "focus city" : "base";
  return `${st.length === 1 ? "one" : fmt(st.length)} ${kind}${st.length === 1 ? "" : "s"} at ${esc(cityName(c))}, `
    + `${fmt(ex.routes || 0)} routes, ${fmt(ex.roster || 0)} aircraft`;
}
/* Above the brief while a practice airline is open: whose airline this is, and
   the way back to yours. */
function practiceBand(){
  const mi = activeMission(), s = mi && (typeof STARTERS !== "undefined" ? STARTERS : []).find(x => x.id === mi.id);
  if(!s) return "";
  const o = ownAside();
  return `<div class="practice-band"><span><b>${esc(s.brand)}</b> is a practice airline for this mission.`
    + (o ? ` Your airline, <b>${esc(ownName(o))}</b>, is set aside in this browser.` : "") + `</span>`
    + (o ? `<button class="btn sm" data-backown="1">Back to ${esc(ownName(o))}</button>` : "") + `</div>`;
}
const allMissions = () => (typeof STARTERS !== "undefined" ? STARTERS : [])
  .filter(s => s.mission).map(s => ({s, mi: missionOf(s.id)}));
function missionStars(){
  return allMissions().reduce((t, {mi}) => [t[0] + missionBest(mi.id), t[1] + mi.objectives.length], [0, 0]);
}
/* The card after the four figures. Drawn after drawMission(), so a star won by
   this build is already counted. */
function missionsKpi(){
  if(!allMissions().length) return "";
  const [n, of] = missionStars(), on = activeMission();
  return `<button class="kpi clickable missions-kpi" data-missions="open" title="A small airline, three objectives, a star for each">`
    + `<span class="k">Missions</span><span class="v"><span class="mk-star" aria-hidden="true">★</span>${fmt(n)}`
    + `<small>of ${fmt(of)} stars</small></span>`
    + `<span class="knote">${on ? "On: " + esc(on.title) : "Play a mission"}</span></button>`;
}
function drawMissionsPanel(){
  const host = $("#missionsPanel"); if(!host) return;
  host.hidden = !missionsOpen;
  if(!missionsOpen){ host.innerHTML = ""; return; }
  const cards = allMissions().map(({s, mi}) => {
    const rec = missionLog(mi.id), of = mi.objectives.length, now = state.origin === mi.id;
    // each objective against your best run, ticked where that run met it
    const rows = mi.objectives.map((o, i) => {
      const v = rec && rec.values && rec.values.length === of ? rec.values[i] : null, met = v !== null && objectiveMet(o, v);
      return `<li class="${met ? "met" : ""}"><span class="mo-mark" aria-hidden="true">${met ? "✓" : "○"}</span>`
        + `<span>${objectiveLabel(o)}</span><span class="mo-v">${v !== null ? objectiveShown(o, v) : ""}</span></li>`; }).join("");
    return `<div class="ms-card${now ? " now" : ""}"><div class="ms-head"><span class="wc-name">${esc(mi.title)}</span>`
      + (now ? `<span class="wc-now">Open now</span>` : "") + starsHTML(rec ? rec.stars : 0, of) + `</div>`
      + `<span class="ms-from"><b>${esc(s.brand)}</b>, a practice airline: ${practiceLine(s)}</span>`
      + `<p class="note">${esc(mi.brief)}</p><ul class="mission-obj">${rows}</ul>`
      + `<span class="wc-best">${rec && rec.stars ? "Your best" + (rec.at ? ", " + logDay(rec.at) : "") : "Not flown yet"}</span>`
      + `<div class="ms-foot"><button class="btn${now ? "" : " primary"}" data-mplay="${esc(mi.id)}">`
      + `${now ? "Start again" : rec && rec.stars ? "Play again" : "Play"}</button></div></div>`;
  }).join("");
  const [n, of] = missionStars();
  // whose airline Play sets aside: this one, or on a practice airline the one already aside
  const on = activeMission(), aside = on ? ownAside() : null, mine = on ? (aside ? esc(ownName(aside)) : "") : esc(state.brand || "your airline");
  host.innerHTML = `<div class="welcome-inner" role="dialog" aria-modal="true" aria-labelledby="missionsH">`
    + `<h2 id="missionsH">Missions <span class="ms-total">${fmt(n)} of ${fmt(of)} stars</span></h2>`
    + `<p class="note">Missions are puzzles on small practice airlines, separate from yours. Each has three objectives, `
    + `a star for each. No star counts while any of the ten checks fails, and every mission is checked to be winnable `
    + `each time the planner is built. Your best is kept in this browser.</p>`
    + (on ? practiceBand() : "")
    + `<div class="ms-list">${cards}</div>`
    + `<div class="toolbar" style="padding-left:0"><button class="btn sm" data-msclose="1">Close</button>`
    + `<span class="dim" style="font-size:12.5px">`
    + (mine ? `Playing sets ${mine} aside in this browser and opens the practice airline. Back to ${mine} brings `
        + `yours back, even after a reload.`
      : `Playing replaces this practice airline with another. Undo brings it back.`)
    + `</span></div></div>`;
  const first = host.querySelector("[data-mplay]"); if(first) first.focus();
}
/* Clicks from the page's one delegated handler (events.js). */
function missionsEvent(t){
  if(!t) return false;
  if(t.id === "missionsPanel" || (t.dataset && t.dataset.msclose)){
    if(!missionsOpen) return false;
    missionsOpen = false; drawMissionsPanel(); return true; }
  if(!t.dataset) return false;
  if(t.dataset.missions){ missionsOpen = true; drawMissionsPanel(); return true; }
  if(t.dataset.backown){ backToOwn(); return true; }
  if(t.dataset.mplay){
    missionsOpen = false; drawMissionsPanel();
    // from your own airline, set it aside; from a practice airline, the one aside stays
    if(!activeMission()){ try { localStorage.setItem(OWN_KEY, JSON.stringify(exportState())); } catch(e){} }
    if(startAirline(t.dataset.mplay)) goTab("network");
    return true;
  }
  return false;
}
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && missionsOpen){ missionsOpen = false; drawMissionsPanel(); }
});

/* ----- the day, played back -----
   A network holding every star can be watched: one day on the map from 03:00 at
   the base, at 1,440 times, so about a minute. A mission about one station
   narrows the map to it. This moves the map's clock and filter and nothing else;
   Done puts both back as they were. */
const PLAY_SPEED = 1440;
const PLAY_BUTTON = `<button class="btn sm primary" type="button" data-playday="1">Watch the day</button>`;
let PLAY = null;            // {mi, at, base, done, prev: the map as it was}

function playMissionDay(){
  const mi = activeMission(); if(!mi) return;
  const at = (mi.objectives.find(o => o.at) || {}).at || "";
  if(!PLAY) PLAY = {prev: {st: $("#mStation").value, speed: LIVE.speed, clock: LIVE.clock, on: LIVE.on}};
  Object.assign(PLAY, {mi, at, base: at || STA[0], done: false});
  hideReadout();
  $("#mStation").value = at; LIVE.on = true; $("#liveOn").checked = true;
  LIVE.sel = null; mapSel = null; VIEW = null;
  LIVE.clock = mod(utc(PLAY.base, 180), 1440); LIVE.speed = PLAY_SPEED; LIVE.left = 1440;
  LIVE.onEnd = () => { PLAY.done = true; drawPlayStrip(); };
  LIVE.onTick = tickPlayStrip;
  // the replay owns the clock: the speed menu would claim 120× and Now would stop it
  $("#liveSpeed").disabled = $("#liveNow").disabled = true;
  liveStart(0.1);
  drawPlayStrip();
  goTab("map");
}

function stopMissionDay(){
  if(!PLAY) return;
  const p = PLAY.prev; PLAY = null;
  Object.assign(LIVE, {left: null, onEnd: null, onTick: null, speed: p.speed, clock: p.clock, on: p.on});
  $("#liveOn").checked = p.on; $("#mStation").value = p.st;
  $("#liveSpeed").disabled = $("#liveNow").disabled = false;
  liveStart();
  drawPlayStrip();
  if(tab === "map") drawMap();
}

/* The strip's buttons are drawn here, at the start and at the end. Each frame
   only updates its numbers, so a click never lands on a button just redrawn. */
function drawPlayStrip(){
  const h = $("#playStrip"); if(!h) return;
  h.hidden = !PLAY;
  if(!PLAY){ h.innerHTML = ""; return; }
  const of = PLAY.mi.objectives.length, E = econReady(), S = E ? missionScore(M, E, PLAY.mi) : null;
  const head = `${starsHTML(S ? S.stars : of, of)}<b>${esc(PLAY.mi.title)}</b>`;
  if(PLAY.done){
    const parts = [`${fmt(M.totals.deps)} departures flown by ${fmt(M.totals.tails)} aircraft`];
    for(const r of (S ? S.results : [])){
      if(r.o.kind === "connections") parts.push(`${fmt(Math.round(r.value))} connections through ${esc(r.o.at)}`);
      if(r.o.kind === "profitMeasured") parts.push(`${objectiveShown(r.o, r.value)} on measured demand`);
    }
    h.innerHTML = `${head}<span>Your day: ${parts.join(", ")}.</span>`
      + `<span class="ps-btns"><button class="btn sm" type="button" data-playday="1">Replay</button>`
      + `<button class="btn sm" type="button" data-playdone="1">Done</button></span>`;
    const lr = $("#live"); if(lr) lr.textContent = `Your day: ${parts.join(", ")}.`;
  } else {
    h.innerHTML = `${head}<span class="dim">Playing the day</span>`
      + `<span class="ps-v" id="playTime"></span><span class="ps-v dim" id="playAir"></span>`
      + `<span class="ps-btns"><button class="btn sm" type="button" data-playdone="1">Stop</button></span>`
      + `<i class="ps-bar" aria-hidden="true"><i id="playBar"></i></i>`;
  }
  h.querySelectorAll("[data-playday]").forEach(b => b.onclick = playMissionDay);
  h.querySelectorAll("[data-playdone]").forEach(b => b.onclick = stopMissionDay);
  tickPlayStrip();
}
function tickPlayStrip(){
  if(!PLAY || PLAY.done || LIVE.left === null) return;
  const t = $("#playTime"), a = $("#playAir"), bar = $("#playBar"); if(!t) return;
  t.textContent = `${hhmm(loc(PLAY.base, LIVE.clock))} at ${PLAY.base}`;
  a.textContent = `${fmt(airborne(LIVE.clock, PLAY.at ? {st: PLAY.at, ty: ""} : null).length)} airborne`;
  bar.style.width = `${(100 * (1440 - LIVE.left) / 1440).toFixed(1)}%`;
}
