<script>
"use strict";
/* Everything airline-specific arrives as data: src/data/config.json,
   fleet.json, stations.json and the network seed. Nothing about this airline
   is written into the engine, so another network is another config, not a
   fork. Fallbacks below keep the page alive if a block fails to parse. */
const RAW = JSON.parse(document.getElementById("net").textContent);
const CFG = (()=>{ try { return JSON.parse(document.getElementById("cfg").textContent); }
                   catch(e){ console.error("config unreadable", e); return {}; } })();
const FLEETDATA = (()=>{ try { return JSON.parse(document.getElementById("fleet").textContent); }
                   catch(e){ console.error("fleet data unreadable", e); return {types:[],pinned:{}}; } })();

const AP = RAW.airports; let STA = RAW.stations;
let ROLE = Object.assign({}, CFG.roles);
const ROLE_LABEL = {Hub:"Hub",Focus:"Focus city",P2P:"Point-to-point"};
const ROLE_SHORT = {Hub:"Hub",Focus:"Focus",P2P:"P2P"};
let BANKS = JSON.parse(JSON.stringify(CFG.banks || {}));
let CURFEW = JSON.parse(JSON.stringify(CFG.curfew || {}));
// Stations that pull a morning feed from their spokes. "dawn" = earliest bank the aircraft can
// reach; a number = a named bank in local minutes (MCO's 10:00 Caribbean wave).
/* Which stations want to be fed, and how.

   This used to be a fixed map in the config file, so the Schedule strategy panel
   listed exactly five stations for ever. Promote a station to a hub and it would
   never appear — a hub with no feed target is a hub that does not connect.

   It is now derived from the roles. A hub or a focus city has connecting intent
   and therefore a feed; a point-to-point base does not, by definition, so it is
   correctly absent rather than missing. Per-station overrides from the config
   survive — MCO is an O&D and Caribbean station, so it takes a 10:00 bank rather
   than a dawn feed. */
const FEED_OVERRIDE = Object.assign({}, CFG.feedMode);
let FEEDMODE = {};
function syncFeedModes(){
  const next = {};
  for(const s of STA){
    if(ROLE[s] !== "Hub" && ROLE[s] !== "Focus") continue;
    next[s] = (FEED_OVERRIDE[s] !== undefined) ? FEED_OVERRIDE[s] : "dawn";
  }
  FEEDMODE = next;
  // a station that has just become feedable needs a default: hubs feed, focus
  // cities do not until somebody says so
  if(typeof state !== "undefined" && state && state.feed){
    for(const s in FEEDMODE)
      if(state.feed[s] === undefined) state.feed[s] = ROLE[s] === "Hub" ? 1 : 0;
    for(const s in state.feed)
      if(FEEDMODE[s] === undefined) delete state.feed[s];
  }
}
let MCT = CFG.mct != null ? CFG.mct : 40;      // minimum connect time, minutes
// Markets flagged as red-eyes out of the box. A route's red-eye flag lives on the route itself;
// the engine works out which direction flies overnight, because only one ever can.
const DEFAULT_RED = new Set(CFG.defaultRedEyes || []);
const pairKey = (a,b) => a<b ? a+"|"+b : b+"|"+a;
let RED_DEP = (CFG.redDep || [1260,1380]).slice();   // a red-eye departs 21:00–23:00 local
let RED_ARR = CFG.redArr != null ? CFG.redArr : 405; // and aims to land about 06:45 local
let SPOKE_EARLIEST = CFG.spokeEarliest != null ? CFG.spokeEarliest : 330;
const DAWN_STAGGER = CFG.dawnStagger != null ? CFG.dawnStagger : 7;
// How hard to rationalise departure times within a market. "win" is the span a market's
// flights aim to cover; "cap" is the largest gap ever demanded; "gap" is the hard floor.
const SPACING = CFG.spacing || {};
const EPS = 1e-6;
/* A two-letter designator, suggested from the airline's name but never bound to
   it. Real codes are mostly not initials -- Southwest is WN, JetBlue B6,
   Frontier F9 -- so deriving one and keeping it in step would produce codes
   that feel wrong and would overwrite a deliberate choice on the next rename.
   The suggestion is used only while the code is still untouched. */
function suggestCode(name){
  const w = String(name||"").toUpperCase().replace(/[^A-Z0-9 ]/g,"").split(/\s+/).filter(Boolean);
  if(!w.length) return "XX";
  if(w.length >= 2) return (w[0][0] + w[1][0]);
  return (w[0][0] + (w[0][1] || w[0][0]));
}
/* The designator in use right now, and a flight number wearing it. */
const airlineCode = () => ((typeof state !== "undefined" && state && state.code) || BRAND.code || "XX");
const flightNo = fn => airlineCode() + " " + fn;

const validCode = s => /^[A-Z0-9]{2}$/.test(String(s||"").toUpperCase());

const STARTERS = (()=>{ try { return JSON.parse(document.getElementById("starters").textContent).starters || []; }
                        catch(e){ return []; } })();
const FRAMES = (()=>{ try { return JSON.parse(document.getElementById("frames").textContent).frames || []; }
                      catch(e){ return []; } })();
/* The airframes that ship with the planner. A type the user adds is not in
   here, which is how reconcileGeom knows whose geometry is authoritative. */
const FLEET_BASE = (FLEETDATA.types || []).map(f=>Object.assign({origin:"shipped"},f));
/* The type codes currently in the fleet, in fleet order.

   This used to be a snapshot of the shipped fleet taken once at load. Every
   consumer reads it -- the network table's gauge columns, the Add route
   dialog, the engine's leg builder, validate, suggest, the CSV export -- so a
   type the user added existed in the roster and the seatmap and nowhere else.
   You could buy the aircraft and then have no way to fly it.

   It is mutated in place rather than reassigned so that nothing holding a
   reference can go stale, and syncTypes() runs at the top of every build(). */
const TYPES = FLEET_BASE.map(f=>f.t);
function syncTypes(){
  const want = (typeof state !== "undefined" && state && state.fleet)
    ? state.fleet.map(f=>f.t) : FLEET_BASE.map(f=>f.t);
  TYPES.length = 0;
  for(const t of want) TYPES.push(t);
}
const SM = 1.15078;
const KEY = CFG.storageKey || "frontier-planner-v1";
// The fleet this schedule needed when the roster feature was added — the reference line.
const FLEET_PINNED = Object.assign({}, FLEETDATA.pinned);
// The airline's own name is config too — this app plans networks, and the
// example that ships with it is not the thing it is.
const BRAND = Object.assign({name:"My Airline", code:"XX", product:"Network Planner",
                             possessive:"This airline", designDay:""}, CFG.brand);
const pinTotal = () => TYPES.reduce((a,t)=>a+(FLEET_PINNED[t]||0),0);
