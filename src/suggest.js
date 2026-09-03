<script>
"use strict";
/* ---------- suggestions: fix, fill, grow ---------- */
const MIN_SUGG_NM = 150;        // below this a new route competes with driving, not with airlines
const isUS = c => AP[c] && AP[c][5]==="United States";
function rangeOK(o,d,t){ return dist(o,d) <= (SPEC[t]?SPEC[t].rng:0); }
function stationsServing(c){ return STA.filter(s=>state.routes.some(r=>r.o===s&&r.d===c)); }

// Try a change against a real rebuild before recommending it. Rotations are lumpy — removing a
// frequency does not always remove an aircraft — so a plausible-looking swap is not enough.
function trialBuild(mut){
  const keep=state.routes;
  try{ state.routes=JSON.parse(JSON.stringify(keep)); mut(); return build(); }
  finally{ state.routes=keep; }
}
function suggestFix(){
  const out=[];
  // 1. a gauge is short while another sits spare — rebalance with metal already owned
  for(const f of M.fleet){
    if(f.short<=0) continue;
    const spare=M.fleet.filter(g=>g.t!==f.t && g.surplus>0 && g.seats>0)
      .sort((a,b)=>Math.abs(a.seats-f.seats)-Math.abs(b.seats-f.seats));
    // thinnest route flown by the short gauge that a spare gauge could also fly
    const cands=[];
    for(const r of state.routes){
      const n=+r.mix[f.t]||0; if(n<=0) continue;
      for(const g of spare){
        if(!rangeOK(r.o,r.d,g.t)) continue;
        cands.push({r,g,dem:demandOf(r.o,r.d).v,loss:(f.seats-g.seats)*n});
      }
    }
    if(!cands.length) continue;
    cands.sort((a,b)=>a.dem-b.dem || a.loss-b.loss);
    const seen=new Set();
    const uniq=cands.filter(c=>{const k=c.r.o+c.r.d+c.g.t; if(seen.has(k))return false; seen.add(k); return true;});
    out.push({kind:"fix",sev:"high",fleetShort:{f,cands:uniq},
      title:`${f.t}: ${f.short} rotation${f.short===1?"":"s"} cannot be flown`,
      why:`You own ${fmt(f.roster)} ${f.t} against ${fmt(f.total)} required. `
        + M.fleet.filter(g=>g.surplus>0).map(g=>`${g.t} has ${g.surplus} spare`).join(", ")
        + `. A frequency can often be moved onto metal you already own — but rotations are lumpy, so a swap only works on some routes.`,
      action:`Search for a swap that actually clears it`,
      impact:`every candidate is tested by rebuilding the whole schedule`,
      search:true, apply:null});
  }
  // 2. legs beyond their aircraft's range
  for(const b of M.checks.rangeBad.slice(0,3)){
    const fits=TYPES.filter(t=>rangeOK(b.o,b.d,t));
    out.push({kind:"fix",sev:"high",title:`${b.o}–${b.d} is beyond the ${b.t}'s range`,
      why:`${fmt(b.nm)} nm against ${fmt(b.rng)} nm.`,
      action: fits.length?`Re-gauge to ${fits[0]}`:`No gauge in your fleet can fly it — cut the route or raise the range assumption`,
      impact: fits.length?`Route becomes flyable`:`—`,
      apply: fits.length?()=>{ const r=state.routes.find(x=>(x.o===b.o&&x.d===b.d)||(x.o===b.d&&x.d===b.o));
        if(r){ const n=+r.mix[b.t]||0; delete r.mix[b.t]; r.mix[fits[0]]=(+r.mix[fits[0]]||0)+n; } }:null});
  }
  // 3. spoke cities with no morning departure that a feed station could fix
  if(M.feedStats.late>0){
    const off=Object.keys(FEEDMODE).filter(k=>!(state.feed&&state.feed[k]));
    if(off.length){
      let imp="could not be verified";
      try{
        const keepF=state.feed; state.feed=Object.assign({},keepF); off.forEach(k=>state.feed[k]=1);
        const m=build(); state.feed=keepF;
        const dShort=m.fleet.reduce((a,x)=>a+x.short,0)-M.fleet.reduce((a,x)=>a+x.short,0);
        imp=`verified — ${M.feedStats.late} → ${m.feedStats.late} spokes unfed, fleet ${fmt(M.totals.tails)} → ${fmt(m.totals.tails)}, `
          + `gates ${fmt(M.totals.gates)} → ${fmt(m.totals.gates)}`
          + (dShort>0?`, and ${dShort} more gauge${dShort===1?"":"s"} would go short`:``);
      }catch(e){}
      out.push({kind:"fix",sev:"med",
        title:`${M.feedStats.late} spoke cities have no departure before 09:00`,
        why:`${off.join(" and ")} ${off.length===1?"is":"are"} not pulling a morning feed, so their spokes take whatever times fall out of hub-side packing.`,
        action:`Switch on the bank feed at ${off.join(" and ")}`,
        impact:imp,
        apply:()=>{ state.feed=state.feed||{}; off.forEach(k=>state.feed[k]=1); }});
    }
  }
  // 4. stub rotations
  const stubs=M.rots.filter(r=>r.block < 0.4*(SPEC[r.t]?SPEC[r.t].util:11));
  if(stubs.length) out.push({kind:"fix",sev:"med",
    title:`${stubs.length} rotation${stubs.length===1?"":"s"} fly under 40% of target`,
    why:`Aircraft stranded on a single short out-and-back — ${stubs.slice(0,3).map(r=>r.path).join(", ")}.`,
    action:`See the Fill suggestions below — each names routes that would absorb the idle time`,
    impact:`Up to ${fmt(stubs.reduce((a,r)=>a+((SPEC[r.t]?SPEC[r.t].util:11)-r.block),0))} idle block hours recoverable`,
    apply:null});
  return out;
}

function suggestFill(){
  const out=[];
  const stubs=M.rots.filter(r=>r.block < 0.55*(SPEC[r.t]?SPEC[r.t].util:11))
                    .sort((a,b)=>a.block-b.block).slice(0,6);
  const universe=new Set(); state.routes.forEach(r=>universe.add(r.d));
  for(const st of stubs){
    const B=st.base, T=st.t, sp=SPEC[T]; if(!sp) continue;
    const idle=sp.util-st.block;
    const served=new Set(state.routes.filter(r=>r.o===B).map(r=>r.d));
    const cands=[];
    for(const c of universe){
      if(c===B||served.has(c)||!AP[c]) continue;
      if(dist(B,c)<MIN_SUGG_NM) continue;
      if(!rangeOK(B,c,T)) continue;
      const rt=(sp.gnd+dist(B,c)/sp.kt*60)/60*2;
      if(rt>idle) continue;
      cands.push({c,rt,dem:demandOf(B,c).v,fare:demandOf(B,c).fare,others:stationsServing(c).length});
    }
    cands.sort((a,b)=>(b.fare?b.dem*b.fare:b.dem)-(a.fare?a.dem*a.fare:a.dem));
    if(!cands.length) continue;
    const best=cands.slice(0,3);
    out.push({kind:"fill",sev:"med",rot:st,
      title:`${st.id} flies ${st.block.toFixed(2)} h and sits for ${idle.toFixed(2)}`,
      why:`${st.path} — a ${T} at ${B} with most of its day free.`,
      options:best.map(o=>({code:o.c, txt:`${B}–${o.c} · ${esc(cityName(o.c))} · ${fmt(dist(B,o.c))} nm · ${o.rt.toFixed(2)} h round trip · demand ${fmt(o.dem)} · flown from ${o.others} of your stations`,
        apply:()=>{ state.routes.push({o:B,d:o.c,dow:7,mix:{[T]:1}}); state.routes.sort((a,b)=>a.o<b.o?-1:a.o>b.o?1:(a.d<b.d?-1:1)); }}))});
  }
  return out;
}

/* Estimated daily contribution from adding one round trip on a new market.
   Revenue is our QSI share of the market at the observed fare, capped by the
   gauge's seats; cost is the round trip's direct operating cost from the Form
   41 rates. Ownership is deliberately excluded — the roster already exists,
   and a route that fits into existing slack costs no aircraft. This is an
   ESTIMATE, not a verified rebuild: unlike the Fix candidates it does not run
   trialBuild(), because doing so for several hundred candidates per base is
   far too slow. Rank on it, then verify the one you pick. */
function growEconomics(o,d,t,dem,fare){
  const blkHr = blk(o,d,t)/60;
  const c = typeof econFlightCost === "function" ? econFlightCost(t, blkHr) : null;
  if(!c || !SPEC[t]) return {};
  // A single new nonstop scores QSI 1 against the competition term, so the
  // share matches what revenue.js would give the same route.
  const share = 1/(1 + (typeof REV_COMPETITION === "number" ? REV_COMPETITION : 1));
  const f = fare || (typeof FARE_FIT === "object" && FARE_FIT.a
                     ? FARE_FIT.a*Math.pow(dist(o,d), FARE_FIT.b) : 0);
  if(!f) return {};
  const pax = Math.min(SPEC[t].seats, dem*share);
  const rev = pax*f*2, cost = c.direct*2;          // both directions of the turn
  return {rev, cost, pax, contrib: rev-cost};
}

function suggestGrow(){
  const out=[];
  const pool=new Set(Object.keys(DEM.size).filter(a=>AP[a]));
  for(const B of STA){
    const served=new Set(state.routes.filter(r=>r.o===B).map(r=>r.d));
    const gauges=M.fleet.filter(f=>f.surplus>0).map(f=>f.t);
    const cands=[];
    for(const c of pool){
      if(c===B||served.has(c)||STA.includes(c)) continue;
      if(!isUS(c)) continue;            // the demand model is calibrated on US service only
      const nm=dist(B,c); if(nm<MIN_SUGG_NM) continue;
      const fits=TYPES.filter(t=>nm<=SPEC[t].rng);
      if(!fits.length) continue;
      const dd=demandOf(B,c); const dem=dd.v; if(dem<=0) continue;
      const g=gauges.find(t=>fits.includes(t))||fits[fits.length-1];
      cands.push(Object.assign({c,nm,dem,fare:dd.fare,season:seasonCurve(dd.season),g,
        others:stationsServing(c).length,spare:gauges.includes(g)},
        growEconomics(B,c,g,dem,dd.fare)));
    }
    // Rank on estimated contribution, not on market size. A big market flown
    // at the wrong stage length can still lose money, and a 300 nm E145 leg
    // pays a full cycle for 1.3 block hours — which is exactly what the cost
    // model exists to say. Falls back to revenue where a route cannot be
    // costed, so a missing rate never silently sorts a candidate to the top.
    cands.sort((a,b)=>(b.contrib!=null?b.contrib:-Infinity)
                     -(a.contrib!=null?a.contrib:-Infinity)
                     || (b.fare?b.dem*b.fare:b.dem)-(a.fare?a.dem*a.fare:a.dem));
    const top=cands.slice(0,4);
    if(top.length) out.push({kind:"grow",base:B,items:top.map(o=>({
      code:o.c,
      txt:`${B}–${o.c} · ${esc(cityName(o.c))} · ${fmt(o.nm)} nm · ${fmt(o.dem)} ${demandUnit()}`
        + (o.fare?` · $${fmt(o.fare)} avg fare · $${fmt(o.dem*o.fare*2)} market/day`:"")
        + (o.contrib!=null?` · <b>${o.contrib>=0?"+":"−"}$${fmt(Math.abs(Math.round(o.contrib)))}</b>/day est. contribution`:"")
        + (o.season?` <span class="mono" title="Jul 2025 → May 2026">${o.season.spark}</span> peak ${o.season.peak} ${o.season.peakX.toFixed(1)}×`:""),
      sub:`${o.others?`already flown from ${o.others} of your stations`:"new city for the network"}${o.spare?` · you have a spare ${o.g}`:` · would need a ${o.g}`}`
        + (o.contrib!=null?` · est. $${fmt(Math.round(o.rev))} revenue vs $${fmt(Math.round(o.cost))} direct cost, before any aircraft charge`:""),
      apply:()=>{ state.routes.push({o:B,d:o.c,dow:7,mix:{[o.g]:1}}); state.routes.sort((a,b)=>a.o<b.o?-1:a.o>b.o?1:(a.d<b.d?-1:1)); }}))});
  }
  return out;
}