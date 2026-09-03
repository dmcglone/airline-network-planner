/* ---------- economics ----------
   Unit costs derived from the finished schedule, the same way validate.js
   re-derives the ten checks: this reads M.flights and costs them, and never
   feeds anything back into the engine. The eight acceptance metrics and the
   ten checks cannot move because of anything in this file.

   Mirrors economics.py. Any disagreement between the two is a real defect.

   Rates come from src/data/economics.json, extracted from published DOT
   Form 41 by tools/f41_rates.py. Every element is a per-cycle plus a per-hour
   rate, which is what makes stage length change unit cost -- a 300 nm leg
   pays a whole cycle for 1.3 block hours, a transcon spreads it over five.
   Form 41 cannot measure that split (the cross-carrier regression returns
   negative cycle fuel), so the level is measured and only the shape is
   assumed, through cycleEquivHours in the JSON. */

const ECON = (()=>{ try { return JSON.parse(document.getElementById("econ").textContent); }
                    catch(e){ console.error("economics data unreadable", e);
                              return {types:{}, fuel:{pricePerGal:0},
                                      station:{landingPerDep:0}, ops:{}}; } })();
const ECON_OPS = ECON.ops || {};
const OVERHEAD_PCT   = ECON_OPS.overheadPct     != null ? ECON_OPS.overheadPct : 0;
const HANDLING_DEP   = ECON_OPS.handlingPerDep  != null ? ECON_OPS.handlingPerDep : 0;
const LAND_REF_SEATS = ECON_OPS.landingRefSeats != null ? ECON_OPS.landingRefSeats : 175;

/* Form 41 rates for one of this airline's fleet types. `f41` on the fleet type
   says which real aircraft it is costed as, `f41Adj` scales individual elements
   where the variant differs — the A320E is an A320 doing international work,
   not a separate cost basis. Returns null if the type has no rates, so the tab
   can say which types are uncosted instead of quietly reporting zero. */
function econRate(t){
  const spec = SPEC[t] || {}, base = FLEET_BASE.find(f=>f.t===t) || {};
  const key = base.f41 || spec.f41 || t, r = ECON.types[key];
  if(!r) return null;
  const adj = base.f41Adj || spec.f41Adj || {}, out = {f41:key};
  for(const k of ["gal","crew","maint"]){
    const m = adj[k] != null ? adj[k] : 1;
    out[k] = {cyc: r[k].cyc*m, hr: r[k].hr*m};
  }
  out.ownDay = (r.ownDay||0) * (adj.ownDay != null ? adj.ownDay : 1);
  out.flags = r.flags || [];
  return out;
}

/* Direct cost of one departure. Ownership is deliberately excluded: it is a
   fixed cost of a roster that already exists, and charging a candidate route
   for an aircraft it did not cause is how you reject a route that would have
   made money. See econMarginal() for the honest test. */
function econFlightCost(t, blkHr){
  const r = econRate(t);
  if(!r) return null;
  const seats = (SPEC[t] && SPEC[t].seats) || 0;
  const gal = r.gal.cyc + r.gal.hr*blkHr;
  const c = {
    gal,
    fuel:  gal * ECON.fuel.pricePerGal,
    crew:  r.crew.cyc  + r.crew.hr*blkHr,
    maint: r.maint.cyc + r.maint.hr*blkHr,
    // Landing fees scale with weight; seats are the only weight proxy the
    // model carries, and the peer figure is at the peer average gauge.
    landing: ECON.station.landingPerDep * seats / LAND_REF_SEATS,
    handling: HANDLING_DEP
  };
  c.direct = c.fuel + c.crew + c.maint + c.landing + c.handling;
  return c;
}

/* Cost the whole schedule. Returns per-flight costs plus rollups by type,
   by route and by stage-length band. */
function econModel(M){
  const flights = [], byType = new Map(), blockByType = new Map(),
        tails = new Map(), uncosted = new Set();
  for(const r of M.rots) tails.set(r.t, (tails.get(r.t)||0)+1);
  for(const f of M.flights){
    const c = econFlightCost(f.t, f.blk);
    if(!c){ uncosted.add(f.t); continue; }
    blockByType.set(f.t, (blockByType.get(f.t)||0) + f.blk);
    flights.push({f, cost:c});
  }
  /* Ownership is a daily charge on the whole roster, spares included, spread
     across that type's flying. Utilisation is what makes it cheap per
     departure, so it cannot be a per-departure constant. */
  const spare = state.spare === undefined ? 0.08 : state.spare, ownHr = new Map();
  for(const [t,n] of tails){
    const r = econRate(t), bh = blockByType.get(t)||0;
    ownHr.set(t, (r && bh) ? r.ownDay*Math.ceil(n*(1+spare))/bh : 0);
  }
  const tot = {fuel:0, crew:0, maint:0, landing:0, handling:0, own:0,
               direct:0, allocated:0, gal:0, asm:0, deps:0, blk:0};
  for(const x of flights){
    const {f, cost} = x;
    cost.own = (ownHr.get(f.t)||0) * f.blk;
    cost.allocated = (cost.direct + cost.own) * (1 + OVERHEAD_PCT);
    const asm = ((SPEC[f.t] && SPEC[f.t].seats)||0) * f.nm * SM;
    for(const k of ["fuel","crew","maint","landing","handling","own","direct",
                    "allocated","gal"]) tot[k] += cost[k];
    tot.asm += asm; tot.deps++; tot.blk += f.blk;
    let a = byType.get(f.t);
    if(!a){ a = {t:f.t, deps:0, nm:0, blk:0, asm:0, direct:0, allocated:0};
            byType.set(f.t, a); }
    a.deps++; a.nm += f.nm; a.blk += f.blk; a.asm += asm;
    a.direct += cost.direct; a.allocated += cost.allocated;
  }
  // by market, both directions together, since a turn is one aircraft
  const byRoute = new Map();
  for(const {f, cost} of flights){
    const k = pairKey(f.o, f.d);
    let a = byRoute.get(k);
    if(!a){ a = {key:k, o:f.o, d:f.d, nm:f.nm, deps:0, seats:0, asm:0,
                 direct:0, allocated:0, types:new Set()};
            byRoute.set(k, a); }
    a.deps++; a.types.add(f.t);
    a.seats += (SPEC[f.t] && SPEC[f.t].seats)||0;
    a.asm += ((SPEC[f.t] && SPEC[f.t].seats)||0) * f.nm * SM;
    a.direct += cost.direct; a.allocated += cost.allocated;
  }
  const bands = [[0,300],[300,500],[500,750],[750,1000],[1000,1500],[1500,1e9]];
  const byStage = bands.map(([lo,hi])=>{
    const fs = flights.filter(x=>x.f.nm>=lo && x.f.nm<hi);
    const asm = fs.reduce((s,x)=>s+((SPEC[x.f.t]&&SPEC[x.f.t].seats)||0)*x.f.nm*SM, 0);
    const cost = fs.reduce((s,x)=>s+x.cost.allocated, 0);
    return {lo, hi, deps:fs.length, asm, cost,
            casm: asm ? cost/asm*100 : 0, perDep: fs.length ? cost/fs.length : 0};
  }).filter(b=>b.deps);
  return {flights, totals:tot, byType:[...byType.values()],
          byRoute:[...byRoute.values()], byStage,
          casm: tot.asm ? tot.allocated/tot.asm*100 : 0,
          uncosted:[...uncosted], ownHr};
}

/* The honest cost of adding a route: its own direct cost, plus an aircraft
   only if a full rebuild says the fleet requirement actually moved. The app is
   unusually able to answer that, because trialBuild() already rebuilds the
   whole schedule for every suggestion candidate. `deltaTails` comes from that
   comparison; 0 means the route fitted into existing slack and owes nothing. */
function econMarginal(before, after){
  const b = econModel(before), a = econModel(after);
  // Tails by type, so the aircraft charge is the type that actually grew
  // rather than an average of the fleet.
  const count = M => { const m = new Map();
    for(const r of M.rots) m.set(r.t, (m.get(r.t)||0)+1); return m; };
  const cb = count(before), ca = count(after);
  let deltaTails = 0, ownDay = 0;
  for(const t of new Set([...cb.keys(), ...ca.keys()])){
    const n = (ca.get(t)||0) - (cb.get(t)||0);
    if(!n) continue;
    deltaTails += n;
    const r = econRate(t); if(r) ownDay += n * r.ownDay;
  }
  const deltaDirect = a.totals.direct - b.totals.direct;
  return {
    deltaDirect, deltaTails, ownDay,
    // What the route actually owes: its own operating cost, plus an aircraft
    // only when the rebuild says one appeared.
    marginal: deltaDirect + ownDay,
    deltaAllocated: a.totals.allocated - b.totals.allocated,
    deltaDeps: a.totals.deps - b.totals.deps,
    deltaAsm: a.totals.asm - b.totals.asm
  };
}
