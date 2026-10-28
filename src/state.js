/* ---------- state ---------- */
let state;   // assigned at bootstrap, after the geo helpers exist
/* The shipped network, as shipped.

   This read the live STA, ROLE and FLEET_PINNED globals, which are mutated by
   whatever network is currently loaded. Load a one-station starter and then ask
   for the full example, and you got the example's 404 routes with the starter's
   single station: most routes flew from a base that no longer existed, and the
   404-route airline reported needing 29 aircraft. A function called baseline()
   has to mean the same thing every time it is called. */
function baseline(){
  const keys=new Set(RAW.routes.map(r=>r.o+"|"+r.d));
  const rs=RAW.routes.map(r=>Object.assign({o:r.o,d:r.d,dow:r.dow,mix:Object.assign({},r.mix)}, r.red?{red:1}:{}));
  if(rs.some(r=>r.red)) return {routes: rs,          // the published seed already carries flags
    fleet: FLEET_BASE.map(f=>Object.assign({},f)),
    feed: {SJC:1, PIT:1, MCO:1, RDU:0, DEN:0}, spacing:'balanced', redeye: 1,
    roster: Object.assign({}, FLEETDATA.pinned), spare: 0.08, v: 2, brand: BRAND.name, code: BRAND.code,
    livery: Object.assign({}, BRAND.livery),
    stations: SHIPPED_STATIONS.slice(), roles: Object.assign({}, SHIPPED_ROLES),
    pinned: Object.assign({}, FLEETDATA.pinned)};
  for(const r of rs){
    if(!DEFAULT_RED.has(pairKey(r.o,r.d))) continue;
    const typ=TYPES.find(t=>+r.mix[t]>0)||TYPES[0];
    const v=redeyeInfo(r.o,r.d,typ); if(!v.ok) continue;
    if(r.o===v.from || !keys.has(v.from+"|"+v.to)) r.red=1;   // the row that carries the control
  }
  return {routes: rs,
                          fleet: FLEET_BASE.map(f=>Object.assign({},f)),
                          feed: {SJC:1, PIT:1, MCO:1, RDU:0, DEN:0}, spacing:'balanced', redeye: 1,
                             roster: Object.assign({}, FLEETDATA.pinned), spare: 0.08, v: 2, brand: BRAND.name, code: BRAND.code,
    livery: Object.assign({}, BRAND.livery),
    stations: SHIPPED_STATIONS.slice(), roles: Object.assign({}, SHIPPED_ROLES),
    pinned: Object.assign({}, FLEETDATA.pinned)}; }

/* Reconcile a loaded fleet's cabin geometry against the shipped airframe.

   Only `pitch` is editable, so only `pitch` is the user's to keep. Cabin
   length, abreast, exits, monuments and the certified maximum are properties of
   the aeroplane: a saved copy of them is not a decision anyone made, it is a
   snapshot of whatever the data said the day they first touched the panel. Left
   in place it shadows every later correction -- which is exactly what happened
   when the E175's First cabin went from four abreast to three and no existing
   session ever saw it.

   Geometry also arrived after the first state files were written, so an older
   export has no `geom` at all. Both cases fall out of the same rule.

   `pitch` is merged rather than replaced, so a type gaining a cabin picks up a
   sensible default for it without disturbing the two the user already set.

   Every load path comes through here, so this is also where geometry from a
   file or a Share link is made safe to compute with and to draw (cleanGeom). */
function reconcileGeom(fleet){
  if(!Array.isArray(fleet)) return fleet;
  for(const f of fleet){
    // A type the user added has no shipped airframe behind it, so its geometry
    // is its own: it is cleaned, never replaced.
    const base = f.origin === "user" ? null : FLEET_BASE.find(b=>b.t===f.t);
    if(base && base.geom){
      const keptPitch = f.geom && f.geom.pitch;
      f.geom = JSON.parse(JSON.stringify(base.geom));
      if(keptPitch) f.geom.pitch = Object.assign({}, f.geom.pitch, keptPitch);
    }
    if(f.geom) f.geom = cleanGeom(f.geom);
  }
  return fleet;
}

/* State from somewhere else.

   A Share link, an opened file, and saved state (which can be a link opened
   last week) are somebody else's data. Their codes and numbers go into markup
   all over the page: a station code into every station dropdown, a type code
   into every gauge column, a range into the Fleet table. So they are checked
   here, once, rather than escaped at three hundred places.

   A code is kept only if this planner could have written it: a station is an
   airport in the airport table, and a type code is what Add type accepts. A
   number is kept only if it is a number. Anything else is dropped or reset, and
   the return value counts how many. Everything the planner writes passes
   through unchanged. A new field that is read from state needs a line here. */
const TYPE_CODE_RE = /^[A-Z0-9-]{1,5}$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isStationCode = s => typeof s === "string" && own(AP, s);
const isTypeCode = t => typeof t === "string" && TYPE_CODE_RE.test(t);
const TYPE_DEFAULTS = {F:0, PE:0, Y:0, rng:2500, kt:450, gnd:35, turn:45, util:11};

function cleanState(st){
  let n = 0;
  const num = (v, d) => {
    if(typeof v === "number" && Number.isFinite(v)) return v;
    if(typeof v === "boolean") return v ? 1 : 0;
    const x = (typeof v === "string" && v.trim()) ? Number(v) : NaN;
    if(Number.isFinite(x)) return x;
    n++; return d;
  };
  const keep = (list, ok) => (Array.isArray(list) ? list : []).filter(x => ok(x) || (n++, false));
  const obj = o => (o && typeof o === "object" && !Array.isArray(o)) ? o : {};

  st.fleet = keep(st.fleet, f => f && typeof f === "object" && isTypeCode(f.t));
  for(const f of st.fleet){
    const base = FLEET_BASE.find(b => b.t === f.t) || {};
    for(const k in TYPE_DEFAULTS) if(k in f) f[k] = num(f[k], k in base ? base[k] : TYPE_DEFAULTS[k]);
  }
  for(const key of ["roster", "pinned"]){
    if(!(key in st)) continue;
    const o = st[key] = obj(st[key]);
    for(const k of Object.keys(o)){ if(isTypeCode(k)) o[k] = num(o[k], 0); else { delete o[k]; n++; } }
  }

  st.routes = keep(st.routes, r => r && typeof r === "object" && isStationCode(r.o) && isStationCode(r.d));
  for(const r of st.routes){
    if("dow" in r) r.dow = num(r.dow, 7);
    const mix = obj(r.mix); r.mix = {};
    for(const k of Object.keys(mix)){ if(isTypeCode(k)) r.mix[k] = num(mix[k], 0); else n++; }
    if("red" in r && typeof r.red !== "number") r.red = r.red ? 1 : 0;
  }

  if("stations" in st) st.stations = keep(st.stations, isStationCode);
  if("roles" in st){
    const o = st.roles = obj(st.roles);
    for(const k of Object.keys(o)){
      if(!isStationCode(k)){ delete o[k]; n++; }
      else if(!own(ROLE_LABEL, o[k])){ o[k] = "P2P"; n++; }
    }
  }
  if("feed" in st){
    const o = st.feed = obj(st.feed);
    for(const k of Object.keys(o)){ if(isStationCode(k)) o[k] = num(o[k], 0); else { delete o[k]; n++; } }
  }
  if("spacing" in st && !own(SPACING, st.spacing)){ st.spacing = "balanced"; n++; }
  if("spare" in st) st.spare = num(st.spare, 0.08);
  if("redeye" in st) st.redeye = num(st.redeye, 1);
  return n;
}

/* Stations and their roles used to live only in the config file, so promoting a
   station to a hub could not survive a reload — STA and ROLE are module-level
   and save() only writes `state`. They are decisions, so they belong in state
   like everything else, with the shipped config as the fallback. */
function applyStationConfig(st){
  if(st && Array.isArray(st.stations) && st.stations.length) STA = st.stations.slice();
  if(st && st.roles && typeof st.roles === "object") ROLE = Object.assign({}, st.roles);
  // a station with no role is point-to-point; a role with no station is noise
  for(const s of STA) if(!ROLE[s]) ROLE[s] = "P2P";
  for(const k in ROLE) if(!STA.includes(k)) delete ROLE[k];
}

/* Load a starting network.

   A starter is a partial state overlaid on baseline(): it names its stations,
   their roles, its routes and its roster, and inherits everything else. That
   keeps a starter small and means a new state field does not have to be added
   to every starter file to avoid breaking them.

   Nothing is fetched — the starters ship inside the page like the fleet and the
   airport data, so this is a state swap and a rebuild. */
function loadStarter(id){
  const s = (typeof STARTERS !== "undefined" ? STARTERS : []).find(x => x.id === id);
  if(!s) return false;
  const next = baseline();
  Object.assign(next, JSON.parse(JSON.stringify(s.state || {})));
  if(s.brand) next.brand = s.brand;
  if(s.code){ next.code = s.code; next.codeSetByUser = false; }
  if(s.livery) next.livery = Object.assign({}, s.livery);
  // a starter names its own bases, so the roles and the feed follow from it
  next.stations = (next.stations || STA).slice();
  next.roles = Object.assign({}, next.roles);
  state = next;
  applyStationConfig(state);
  syncFeedModes();
  reconcileGeom(state.fleet);
  return true;
}

let sawSavedState = false;
function load(){
  try{ const s = localStorage.getItem(KEY); if(s){ sawSavedState = true; const p = JSON.parse(s); if(p&&p.routes&&p.fleet){ cleanState(p); if(!p.feed) p.feed={SJC:1,PIT:1,MCO:1,RDU:0,DEN:0}; if(!p.spacing) p.spacing='balanced'; if(!p.roster) p.roster=Object.assign({},FLEET_PINNED); if(p.spare===undefined) p.spare=0.08; if(p.redeye===undefined) p.redeye=1;
        if(p.v!==2){                                     // one-time: seed the default red-eye markets
          p.v=2;
          const keys=new Set(p.routes.map(r=>r.o+"|"+r.d));
          for(const r of p.routes){
            if(!DEFAULT_RED.has(pairKey(r.o,r.d))) continue;
            const typ=TYPES.find(t=>+r.mix[t]>0)||TYPES[0];
            const v=redeyeInfo(r.o,r.d,typ); if(!v.ok) continue;
            if(r.o===v.from || !keys.has(v.from+"|"+v.to)) r.red=1;
          }
        }
        reconcileGeom(p.fleet); return p; }  } }catch(e){}
  return baseline();
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }

/* ---------- portable state: export / import ----------
   Everything the UI can change must round-trip through here. If a number moves
   after an export/import cycle, something is being held outside this function. */
const STATE_SCHEMA = 1;
const APP_ID = "airline-network-planner";
// Exports written before the project was renamed carry the old id. They are the
// same format, so keep reading them — refusing them would strand real work.
const APP_IDS = new Set([APP_ID, "frontier-network-planner"]);
function currentConfig(){
  return { stations: STA.slice(),
           roles: Object.assign({}, ROLE),
           banks: JSON.parse(JSON.stringify(BANKS)),
           curfew: JSON.parse(JSON.stringify(CURFEW)),
           mct: MCT, spokeEarliest: SPOKE_EARLIEST,
           redDep: RED_DEP.slice(), redDepEvening: RED_DEP_EVE.slice(), redArr: RED_ARR };
}
/* A file's config is somebody else's data too: the same rules as cleanState().
   Banks are keyed by role and curfews by station, and both are minutes. Every
   role needs banks, so a role whose banks are unusable keeps the ones it has. */
function applyConfig(c){
  if(!c || typeof c!=="object") return;
  const isNum = x => typeof x === "number" && Number.isFinite(x);
  const mins = a => Array.isArray(a) && a.every(isNum);
  const pick = (o, ok) => Object.fromEntries(Object.entries(o).filter(ok));
  const sta = Array.isArray(c.stations) ? c.stations.filter(isStationCode) : [];
  if(sta.length) STA = sta;
  if(c.roles && typeof c.roles==="object")
    ROLE = pick(c.roles, ([k, v]) => isStationCode(k) && own(ROLE_LABEL, v));
  if(c.banks && typeof c.banks==="object")
    BANKS = JSON.parse(JSON.stringify(Object.assign({}, BANKS,
      pick(c.banks, ([k, v]) => own(ROLE_LABEL, k) && mins(v)))));
  if(c.curfew && typeof c.curfew==="object")
    CURFEW = JSON.parse(JSON.stringify(pick(c.curfew, ([k, v]) => isStationCode(k) && mins(v) && v.length===2)));
  if(isNum(c.mct)) MCT = c.mct;
  if(isNum(c.spokeEarliest)) SPOKE_EARLIEST = c.spokeEarliest;
  if(mins(c.redDep) && c.redDep.length===2) RED_DEP = c.redDep.slice();
  if(mins(c.redDepEvening) && c.redDepEvening.length===2) RED_DEP_EVE = c.redDepEvening.slice();
  if(isNum(c.redArr)) RED_ARR = c.redArr;
}
/* the headline numbers, as the KPI strip shows them — the acceptance test */
function headline(){
  const T=M.totals;
  return { deps:T.deps, tails:T.tails, fleetRequired:T.totalFleet, roster:T.roster,
           surplus:T.surplus, blockHrs:Math.round(T.blockHrs), asmM:+(T.asm/1e6).toFixed(1),
           gates:T.gates, routes:T.routes, checksFailing:failCount() };
}
function exportState(){
  return { app:APP_ID, schema:STATE_SCHEMA,
           exported:new Date().toISOString(),
           config: currentConfig(),
           state: JSON.parse(JSON.stringify(state)),
           metrics: headline() };
}
function importState(obj){
  const o = (typeof obj==="string") ? JSON.parse(obj) : obj;
  if(!o || typeof o!=="object") throw new Error("not a state file");
  if(o.app && !APP_IDS.has(o.app)) throw new Error("this file is not a network export from this planner");
  if(o.schema>STATE_SCHEMA) throw new Error("that file was written by a newer version of the planner (schema "+o.schema+")");
  const st = o.state || o;                       // tolerate a bare state object
  if(!st.routes || !st.fleet) throw new Error("no routes or fleet in that file");
  applyConfig(o.config);
  state = JSON.parse(JSON.stringify(st));
  cleanState(state);
  reconcileGeom(state.fleet);
  if(!state.brand) state.brand = BRAND.name;
  if(!state.code)  state.code  = BRAND.code;
  // A shared link or a file is somebody else's data: keep only a livery we can trust.
  state.livery = (typeof liveryOf === "function") ? liveryOf(state) : state.livery;
  applyStationConfig(state);
  if(!state.feed) state.feed={SJC:1,PIT:1,MCO:1,RDU:0,DEN:0};
  if(!state.spacing) state.spacing="balanced";
  if(!state.roster) state.roster=Object.assign({},FLEET_PINNED);
  if(state.spare===undefined) state.spare=0.08;
  if(state.redeye===undefined) state.redeye=1;
  state.v=2;
  M=build(); save(); draw();
  const got=headline(), want=o.metrics||null;
  const diff = want ? Object.keys(want).filter(k=>want[k]!==got[k]) : [];
  return {got, want, diff};
}

