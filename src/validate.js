/* ---------- validate ----------
   The ten checks, recomputed from the finished model rather than from the
   engine's own bookkeeping. The engine reports its checks as it builds; this
   re-derives them independently from M.flights and the route table, so a bug
   in the engine's counters cannot hide behind them. A Diagnostics tab once
   claimed zero curfew violations while five were live — this exists so that
   cannot happen quietly again.

   Mirrors validate.py. Any disagreement between the two is a real defect. */
function validateModel(M){
  const F = M.flights, out = {};

  // 1. every required leg is flown exactly as often as required, and 2. nothing extra
  const req = new Map();
  for(const r of state.routes){
    if(!AP[r.o] || !AP[r.d]) continue;
    for(const t of TYPES){
      const n = +r.mix[t] || 0; if(n <= 0) continue;
      const add = (a,b) => { const k = a+"|"+b+"|"+t; req.set(k, (req.get(k)||0) + n); };
      add(r.o, r.d);
      if(!STA.includes(r.d)) add(r.d, r.o);
    }
  }
  for(let i=0;i<STA.length;i++) for(let j=i+1;j<STA.length;j++)
    for(const t of TYPES){
      const ka = STA[i]+"|"+STA[j]+"|"+t, kb = STA[j]+"|"+STA[i]+"|"+t;
      const na = req.get(ka)||0, nb = req.get(kb)||0;
      if(na === nb) continue;
      const n = Math.max(na, nb);
      if(n > 0){ req.set(ka, n); req.set(kb, n); } else { req.delete(ka); req.delete(kb); }
    }
  const flown = new Map();
  for(const f of F){ const k = f.o+"|"+f.d+"|"+f.t; flown.set(k, (flown.get(k)||0)+1); }
  let unflown = 0, extra = 0;
  for(const [k,n] of req) unflown += Math.abs(n - (flown.get(k)||0));
  for(const [k,n] of flown) if(!req.has(k)) extra += n;
  out.unflown = unflown; out.extra = extra;

  // rebuild each rotation from the flights, in departure order
  const byLine = new Map();
  for(const f of F){ if(!byLine.has(f.line)) byLine.set(f.line, []); byLine.get(f.line).push(f); }
  for(const g of byLine.values()) g.sort((a,b)=> a.id - b.id);

  // 3. spatial continuity  4. turn time  5. rotation closes  6. overnight ground  7. 24h span
  //
  // ROUND is a one-minute allowance, and it is not slack in the schedule. The
  // engine works in exact minutes; the model publishes departure times rounded
  // to the minute while block times stay fractional, so a turn built at exactly
  // 40 minutes can read as 39.5 here. Without the allowance this pass reports
  // ~324 phantom breaches on a schedule the engine and validate.py both call
  // clean. It is a rounding band, not a tolerance for short turns: anything
  // more than a minute under the requirement is still a breach.
  const ROUND = 1;
  let brkSpace=0, brkGround=0, open=0, brkNight=0, brkSpan=0;
  for(const g of byLine.values()){
    const turn = SPEC[g[0].t].turn;
    let clock = g[0].depU, prevArr = null, prevAp = null, span = 0;
    for(const f of g){
      const dep = clock + mod(f.depU - clock, 1440);        // unwrap onto a monotonic clock
      const arr = dep + f.blkMin;
      if(prevAp !== null){
        if(prevAp !== f.o) brkSpace++;
        if(dep - prevArr < turn - ROUND) brkGround++;
      }
      prevAp = f.d; prevArr = arr; clock = dep; span = arr - g[0].depU;
    }
    if(g[0].o !== prevAp) open++;
    else if((g[0].depU + 1440) - prevArr < turn - ROUND) brkNight++;
    if(span > 1440 + ROUND) brkSpan++;
  }
  out.brkSpace=brkSpace; out.brkGround=brkGround; out.open=open;
  out.brkNight=brkNight; out.brkSpan=brkSpan;

  // 8. station balance — every airport departs as often as it arrives
  const dep={}, arr={};
  for(const f of F){ dep[f.o]=(dep[f.o]||0)+1; arr[f.d]=(arr[f.d]||0)+1; }
  out.imb = Object.keys(Object.assign({},dep,arr)).filter(a=>(dep[a]||0)!==(arr[a]||0)).length;

  // 9. curfew  10. range
  let curfew=0;
  for(const f of F) if(CURFEW[f.o] && (f.dep < CURFEW[f.o][0] || f.dep > CURFEW[f.o][1])) curfew++;
  out.curfew = curfew;
  const bad=[];
  for(const k of req.keys()){ const [o,d,t]=k.split("|");
    if(dist(o,d) > SPEC[t].rng) bad.push({o,d,t,nm:dist(o,d),rng:SPEC[t].rng}); }
  out.rangeBad = bad;
  return out;
}
/* Cross-check: the engine's own counters against this independent pass.
   Returns the names of any checks the two disagree on. */
function checkParity(M){
  const mine = validateModel(M), theirs = M.checks, diff = [];
  for(const k of Object.keys(mine)){
    const a = Array.isArray(mine[k]) ? mine[k].length : mine[k];
    const b = Array.isArray(theirs[k]) ? theirs[k].length : theirs[k];
    if(a !== b) diff.push(`${k}: validator ${a}, engine ${b}`);
  }
  return diff;
}
