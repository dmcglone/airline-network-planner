/* ---------- revenue ----------
   Itineraries, demand allocation and revenue, derived from the finished
   schedule. Like economics.js this only reads the model; nothing here feeds
   back into the engine, so the acceptance metrics and the ten checks cannot
   move because of it.

   Mirrors revenue.py. tools/rev_parity.js feeds both the same schedule and
   fails if they disagree.

   The point of the file: demand is origin-and-destination, cost is per leg,
   and in a bank structure a large share of passengers ride two legs on one
   fare. Multiplying per-leg loads by per-leg fares would invent revenue that
   was never sold. So this builds the itineraries the schedule offers,
   allocates each market's demand across them, and prorates the fare back onto
   the legs that carried it. Leg revenue sums to market revenue by
   construction. */

const INTL = (()=>{ try { return JSON.parse(document.getElementById("intl").textContent); }
                    catch(e){ return {demandFactor:1, fareCurve:{}, overrides:{}}; } })();
const INTL_FACTOR = INTL.demandFactor != null ? INTL.demandFactor : 1;
const INTL_FARE = INTL.fareCurve || {};
const INTL_OVERRIDE = INTL.overrides || {};

const REV_MAX_CONNECT = 240;   // minutes; beyond this nobody buys it
const REV_CIRCUITY = 1.35;     // connecting path vs nonstop great circle
const REV_CONNECT_PENALTY = 0.65;
const REV_COMPETITION = 1.0;   // QSI of every other airline in a market
const REV_SPILL_PASSES = 4;
const CABIN_MULT = {F:3.0, PE:1.6, Y:1.0};

const isIntl = (o,d) => (AP[o] && AP[o][5]) !== "United States"
                     || (AP[d] && AP[d][5]) !== "United States";

/* Fare against distance, fitted to the real DB1C fares. Used where a market
   has passengers but no fare of its own. Weak — r2 about 0.19 — but better
   than a flat number. */
const FARE_FIT = (()=>{
  if(!DOT || !DOT.rows) return {a:100, b:0, r2:0, n:0};
  let n=0, sx=0, sy=0;
  const pts=[];
  for(const k in DOT.rows){
    const v=DOT.rows[k], o=k.slice(0,3), d=k.slice(3);
    if(!AP[o] || !AP[d] || !v[1]) continue;
    const nm=dist(o,d); if(nm<50) continue;
    const x=Math.log(nm), y=Math.log(v[1]);
    pts.push([x,y]); sx+=x; sy+=y; n++;
  }
  if(!n) return {a:100, b:0, r2:0, n:0};
  const mx=sx/n, my=sy/n;
  let sxy=0, sxx=0;
  for(const [x,y] of pts){ sxy+=(x-mx)*(y-my); sxx+=(x-mx)*(x-mx); }
  const b=sxy/sxx, a=my-b*mx;
  let ss=0, rs=0;
  for(const [x,y] of pts){ ss+=(y-my)*(y-my); rs+=(y-(a+b*x))*(y-(a+b*x)); }
  return {a:Math.exp(a), b, r2:1-rs/ss, n};
})();

/* Passengers per direction per day, average fare, and where they came from:
   "db1c" measured, "estimated" international, "subthreshold" a US market too
   small for the DB1C sample, "none" unsizeable. Provenance travels with the
   number so an estimate is never reported as a measurement. */
function marketOf(o,d){
  const k = o<d ? o+d : d+o;
  const ov = INTL_OVERRIDE[k];
  if(ov) return {pax:ov[0], fare:ov[1], src:"db1c"};
  const r = DOT && DOT.rows ? DOT.rows[k] : null;
  const nm = dist(o,d);
  if(r) return {pax:r[0], fare:r[1] || FARE_FIT.a*Math.pow(nm,FARE_FIT.b), src:"db1c"};
  const so=DEM.size[o], sd=DEM.size[d];
  if(!so || !sd || nm<50) return {pax:0, fare:0, src:"none"};
  const air = 1/(1+Math.exp(-(nm-190)/55));
  const grav = so*sd/Math.pow(nm,DEM.beta)*DEM.k*air;
  // The Caribbean calibration applies to international markets. A US market
  // absent from DB1C is not international, it is under the sample threshold,
  // and multiplying it would invent traffic.
  if(isIntl(o,d))
    return {pax: grav*INTL_FACTOR, src:"estimated",
            fare: (INTL_FARE.a || FARE_FIT.a)*Math.pow(nm, INTL_FARE.b != null ? INTL_FARE.b : FARE_FIT.b)};
  return {pax:grav, fare:FARE_FIT.a*Math.pow(nm,FARE_FIT.b), src:"subthreshold"};
}

/* Nonstops, plus one-stop connections over the stations. Times are UTC
   minutes on a repeating day, so a bank wrapping past midnight still
   connects — the +1440 shift is tried as well as the same-day window. */
function buildItineraries(F){
  const itins = new Map(), push = (o,d,it) => {
    const k=o+"|"+d; let a=itins.get(k); if(!a){ a=[]; itins.set(k,a); } a.push(it); };
  const arrAt = new Map(), depAt = new Map();
  for(const f of F){
    push(f.o, f.d, {legs:[f], nm:f.nm, elapsed:f.blkMin, stops:0});
    if(STA.includes(f.d)){ if(!arrAt.has(f.d)) arrAt.set(f.d,[]); arrAt.get(f.d).push(f); }
    if(STA.includes(f.o)){ if(!depAt.has(f.o)) depAt.set(f.o,[]); depAt.get(f.o).push(f); }
  }
  for(const s of STA){
    const A=arrAt.get(s)||[], B=depAt.get(s)||[];
    for(const a of A) for(const b of B){
      if(b.d === a.o) continue;                  // a return, not a connection
      const aArr = (a.depX != null ? a.depX : a.depU) + a.blkMin;
      let wait = null;
      for(const sh of [0,1440]){
        const w = (b.depX != null ? b.depX : b.depU) + sh - aArr;
        if(w >= MCT && w <= REV_MAX_CONNECT){ wait = w; break; }
      }
      if(wait === null) continue;
      const nm = a.nm + b.nm, gc = dist(a.o, b.d);
      if(gc < 50 || nm > REV_CIRCUITY*gc) continue;
      push(a.o, b.d, {legs:[a,b], nm, stops:1,
                      elapsed: a.blkMin + wait + b.blkMin});
    }
  }
  return itins;
}

/* Split each market's demand across its itineraries, then spill.
   `competition` is the QSI attributed to every other airline in a market, so
   our share is Q/(Q+competition): a market we serve with three nonstops takes
   more than one we only reach over a hub. */
function allocateDemand(F, itins, competition){
  const boarded=new Map(), legrev=new Map(), estrev=new Map(), perMarket=[];
  const st={pax:0, conn:0, rev:0, spilled:0, markets:0, real:0,
            estMarkets:0, estPax:0, estRev:0};
  for(const [key, opts] of itins){
    const [o,d] = key.split("|");
    const m = marketOf(o,d);
    if(m.pax <= 0) continue;
    let best = Infinity;
    for(const i of opts) if(i.elapsed < best) best = i.elapsed;
    let tq = 0;
    for(const i of opts){
      i.qsi = Math.pow(best/i.elapsed, 2) * (i.stops ? REV_CONNECT_PENALTY : 1);
      tq += i.qsi;
    }
    const share = tq/(tq+competition);
    for(const i of opts) i.pax = m.pax*share*i.qsi/tq;
    st.markets++;
    if(m.src === "db1c") st.real++;
    if(m.src === "estimated") st.estMarkets++;
    perMarket.push({o, d, fare:m.fare, src:m.src, opts});
  }
  // Spill. Capping one flight frees demand on another, so a few passes.
  const keep = new Map(); for(const f of F) keep.set(f.id, 1);
  for(let p=0; p<REV_SPILL_PASSES; p++){
    boarded.clear();
    for(const m of perMarket) for(const i of m.opts){
      let k = 1; for(const f of i.legs) k = Math.min(k, keep.get(f.id));
      for(const f of i.legs) boarded.set(f.id, (boarded.get(f.id)||0) + i.pax*k);
    }
    for(const f of F){
      const b = boarded.get(f.id)||0;
      if(b > f.seats) keep.set(f.id, keep.get(f.id)*f.seats/b);
    }
  }
  boarded.clear();
  for(const m of perMarket) for(const i of m.opts){
    let k = 1; for(const f of i.legs) k = Math.min(k, keep.get(f.id));
    const flown = i.pax*k;
    st.spilled += i.pax - flown;
    st.pax += flown;
    if(i.stops) st.conn += flown;
    const rev = flown*m.fare;
    st.rev += rev;
    if(m.src === "estimated"){ st.estPax += flown; st.estRev += rev; }
    for(const f of i.legs){
      boarded.set(f.id, (boarded.get(f.id)||0) + flown);
      const share = rev*f.nm/i.nm;                 // straight distance proration
      legrev.set(f.id, (legrev.get(f.id)||0) + share);
      if(m.src === "estimated") estrev.set(f.id, (estrev.get(f.id)||0) + share);
    }
  }
  return {boarded, legrev, estrev, stats:st};
}

/* Cabin fare multipliers normalised so the seat-weighted mean is 1.0 — the
   observed DB1C average constrains the answer rather than being added to. */
function cabinMultipliers(F){
  const seats = {F:0, PE:0, Y:0};
  for(const f of F){ const s=SPEC[f.t]; if(!s) continue;
    seats.F+=s.F; seats.PE+=s.PE; seats.Y+=s.Y; }
  const tot = seats.F+seats.PE+seats.Y;
  if(!tot) return {mult:CABIN_MULT, share:seats};
  let mean = 0;
  for(const c of ["F","PE","Y"]) mean += CABIN_MULT[c]*seats[c]/tot;
  const mult = {};
  for(const c of ["F","PE","Y"]) mult[c] = CABIN_MULT[c]/mean;
  return {mult, share:{F:seats.F/tot, PE:seats.PE/tot, Y:seats.Y/tot}};
}

function revenueModel(M){
  const F = M.flights.map(f=>Object.assign({}, f,
    {seats: (SPEC[f.t] && SPEC[f.t].seats) || 0}));
  const itins = buildItineraries(F);
  const r = allocateDemand(F, itins, REV_COMPETITION);
  const seats = F.reduce((s,f)=>s+f.seats, 0);
  // The ceiling: what this schedule fills taking every passenger in every
  // market it touches. Below 100% is capacity that cannot fill unopposed.
  const ceiling = seats
    ? [...allocateDemand(F, buildItineraries(F), 0).boarded.values()]
        .reduce((a,b)=>a+b,0)/seats : 0;
  const asm = F.reduce((s,f)=>s+f.seats*f.nm, 0)*SM;
  const rpm = F.reduce((s,f)=>s+(r.boarded.get(f.id)||0)*f.nm, 0)*SM;
  let nonstop=0, onestop=0;
  for(const opts of itins.values()) for(const i of opts) i.stops ? onestop++ : nonstop++;
  return Object.assign(r, {
    itineraries:{nonstop, onestop}, seats, asm, rpm, ceiling,
    lf: seats ? [...r.boarded.values()].reduce((a,b)=>a+b,0)/seats : 0,
    rasm: asm ? r.stats.rev/asm*100 : 0,
    yield: rpm ? r.stats.rev/rpm*100 : 0,
    cabins: cabinMultipliers(F), fareFit: FARE_FIT
  });
}
