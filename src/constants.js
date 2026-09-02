<script>
"use strict";
/* Everything Frontier-specific arrives as data: src/data/config.json,
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
const FEEDMODE = Object.assign({}, CFG.feedMode);
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
const FLEET_BASE = (FLEETDATA.types || []).map(f=>Object.assign({},f));
const TYPES = FLEET_BASE.map(f=>f.t);
const SM = 1.15078;
const KEY = CFG.storageKey || "frontier-planner-v1";
// The fleet this schedule needed when the roster feature was added — the reference line.
const FLEET_PINNED = Object.assign({}, FLEETDATA.pinned);
const pinTotal = () => TYPES.reduce((a,t)=>a+(FLEET_PINNED[t]||0),0);
