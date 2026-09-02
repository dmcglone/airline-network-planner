/* ---------- state ---------- */
let state;   // assigned at bootstrap, after the geo helpers exist
function baseline(){
  const keys=new Set(RAW.routes.map(r=>r.o+"|"+r.d));
  const rs=RAW.routes.map(r=>Object.assign({o:r.o,d:r.d,dow:r.dow,mix:Object.assign({},r.mix)}, r.red?{red:1}:{}));
  if(rs.some(r=>r.red)) return {routes: rs,          // the published seed already carries flags
    fleet: FLEET_BASE.map(f=>Object.assign({},f)),
    feed: {SJC:1, PIT:1, MCO:1, RDU:0, DEN:0}, spacing:'balanced', redeye: 1,
    roster: Object.assign({},FLEET_PINNED), spare: 0.08, v: 2};
  for(const r of rs){
    if(!DEFAULT_RED.has(pairKey(r.o,r.d))) continue;
    const typ=TYPES.find(t=>+r.mix[t]>0)||"A319";
    const v=redeyeInfo(r.o,r.d,typ); if(!v.ok) continue;
    if(r.o===v.from || !keys.has(v.from+"|"+v.to)) r.red=1;   // the row that carries the control
  }
  return {routes: rs,
                          fleet: FLEET_BASE.map(f=>Object.assign({},f)),
                          feed: {SJC:1, PIT:1, MCO:1, RDU:0, DEN:0}, spacing:'balanced', redeye: 1,
                             roster: Object.assign({},FLEET_PINNED), spare: 0.08, v: 2}; }
function load(){
  try{ const s = localStorage.getItem(KEY); if(s){ const p = JSON.parse(s); if(p&&p.routes&&p.fleet){ if(!p.feed) p.feed={SJC:1,PIT:1,MCO:1,RDU:0,DEN:0}; if(!p.spacing) p.spacing='balanced'; if(!p.roster) p.roster=Object.assign({},FLEET_PINNED); if(p.spare===undefined) p.spare=0.08; if(p.redeye===undefined) p.redeye=1;
        if(p.v!==2){                                     // one-time: seed the default red-eye markets
          p.v=2;
          const keys=new Set(p.routes.map(r=>r.o+"|"+r.d));
          for(const r of p.routes){
            if(!DEFAULT_RED.has(pairKey(r.o,r.d))) continue;
            const typ=TYPES.find(t=>+r.mix[t]>0)||"A319";
            const v=redeyeInfo(r.o,r.d,typ); if(!v.ok) continue;
            if(r.o===v.from || !keys.has(v.from+"|"+v.to)) r.red=1;
          }
        }
        return p; }  } }catch(e){}
  return baseline();
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }

/* ---------- portable state: export / import ----------
   Everything the UI can change must round-trip through here. If a number moves
   after an export/import cycle, something is being held outside this function. */
const STATE_SCHEMA = 1;
function currentConfig(){
  return { stations: STA.slice(),
           roles: Object.assign({}, ROLE),
           banks: JSON.parse(JSON.stringify(BANKS)),
           curfew: JSON.parse(JSON.stringify(CURFEW)),
           mct: MCT, spokeEarliest: SPOKE_EARLIEST,
           redDep: RED_DEP.slice(), redArr: RED_ARR };
}
function applyConfig(c){
  if(!c || typeof c!=="object") return;
  if(Array.isArray(c.stations) && c.stations.length) STA = c.stations.slice();
  if(c.roles && typeof c.roles==="object") ROLE = Object.assign({}, c.roles);
  if(c.banks && typeof c.banks==="object") BANKS = JSON.parse(JSON.stringify(c.banks));
  if(c.curfew && typeof c.curfew==="object") CURFEW = JSON.parse(JSON.stringify(c.curfew));
  if(typeof c.mct==="number") MCT = c.mct;
  if(typeof c.spokeEarliest==="number") SPOKE_EARLIEST = c.spokeEarliest;
  if(Array.isArray(c.redDep) && c.redDep.length===2) RED_DEP = c.redDep.slice();
  if(typeof c.redArr==="number") RED_ARR = c.redArr;
}
/* the headline numbers, as the KPI strip shows them — the acceptance test */
function headline(){
  const T=M.totals;
  return { deps:T.deps, tails:T.tails, fleetRequired:T.totalFleet, roster:T.roster,
           surplus:T.surplus, blockHrs:Math.round(T.blockHrs), asmM:+(T.asm/1e6).toFixed(1),
           gates:T.gates, routes:T.routes, checksFailing:failCount() };
}
function exportState(){
  return { app:"frontier-network-planner", schema:STATE_SCHEMA,
           exported:new Date().toISOString(),
           config: currentConfig(),
           state: JSON.parse(JSON.stringify(state)),
           metrics: headline() };
}
function importState(obj){
  const o = (typeof obj==="string") ? JSON.parse(obj) : obj;
  if(!o || typeof o!=="object") throw new Error("not a state file");
  if(o.app && o.app!=="frontier-network-planner") throw new Error("this file is not a Frontier network export");
  if(o.schema>STATE_SCHEMA) throw new Error("that file was written by a newer version of the planner (schema "+o.schema+")");
  const st = o.state || o;                       // tolerate a bare state object
  if(!st.routes || !st.fleet) throw new Error("no routes or fleet in that file");
  applyConfig(o.config);
  state = JSON.parse(JSON.stringify(st));
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

