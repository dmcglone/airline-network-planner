/* ---------- red-eye viability ---------- */
/* Which window an overnight from a to b leaves in: the usual one (21:00 to 23:00)
   when a departure in it lands at b between 05:00 and 09:00, otherwise the
   evening one, for a long eastbound flight that would land too late from 21:00
   (RDU–LHR leaves 17:35). null when neither lands it. blkm is the block in
   minutes. The engine times the flight in the same window this picks. */
function redeyeWindow(a,b,blkm){
  const sh=off(b)-off(a);
  for(const w of [RED_DEP,RED_DEP_EVE])
    for(let m=w[0];m<=w[1];m+=5){
      if(CURFEW[a] && (m<CURFEW[a][0]||m>CURFEW[a][1])) continue;
      const arr=mod(m+blkm+sh,1440);
      if(arr>=300&&arr<=540) return w;
    }
  return null;
}
// Returns the one direction that can fly overnight, or why neither can. Both
// directions are tried in the usual window before either is tried in the evening.
function redeyeInfo(o,d,typ){
  if(!AP[o]||!AP[d]) return {ok:false,why:"unknown airport"};
  const sp=SPEC[typ]||SPEC.A319||{gnd:35,kt:447};
  const blkm=sp.gnd+dist(o,d)/sp.kt*60;
  if(blkm<3.25*60) return {ok:false,blk:blkm/60,
    why:`${(blkm/60).toFixed(1)} h block, too short to sell as an overnight`};
  for(const w of [RED_DEP,RED_DEP_EVE])
    for(const [a,b] of [[o,d],[d,o]]){
      if(redeyeWindow(a,b,blkm)!==w) continue;
      const sh=off(b)-off(a); let best=null;
      for(let m=w[0];m<=w[1];m+=5){
        if(CURFEW[a] && (m<CURFEW[a][0]||m>CURFEW[a][1])) continue;
        const arr=mod(m+blkm+sh,1440);
        if(arr>=300&&arr<=540){ const pen=Math.abs(arr-RED_ARR); if(!best||pen<best.pen) best={pen,dep:m,arr}; }
      }
      if(best) return {ok:true,from:a,to:b,dep:best.dep,arr:Math.round(best.arr),blk:blkm/60,evening:w===RED_DEP_EVE};
    }
  // When neither direction works, name the one whose departure would come
  // nearest the windows. This used to name the earlier clock time, which for
  // RDU–LHR was "depart 03:37 from LHR" when the near miss is leaving RDU at 17:41.
  const lo=Math.min(RED_DEP[0],RED_DEP_EVE[0]), hi=Math.max(RED_DEP[1],RED_DEP_EVE[1]);
  let nearest=null;
  for(const [a,b] of [[o,d],[d,o]]){
    const need=mod(RED_ARR-blkm-(off(b)-off(a)),1440);
    const gap=Math.min(mod(lo-need,1440), mod(need-hi,1440));
    if(!nearest||gap<nearest.gap) nearest={need,gap,a,b};
  }
  const n=nearest, win=`overnights leave ${hhmm(RED_DEP[0])} to ${hhmm(RED_DEP[1])}, long ones from ${hhmm(RED_DEP_EVE[0])}`;
  return {ok:false,blk:blkm/60,
    why: mod(n.need-lo,1440) <= hi-lo
      ? `would have to leave ${n.a} at ${hhmm(n.need)}, which its curfew does not allow`
      : `would have to leave ${n.a} at ${hhmm(n.need)} to land in ${n.b} at ${hhmm(RED_ARR)}; ${win}`};
}
/* A flight that flies overnight: leaves in the evening or the small hours, lands
   05:00 to 09:00 the next day, long enough to sleep on. The header's overnight
   count, the Fleet and Checks tabs and the Rotations timeline all use this. */
const isRedeyeFlight = f => (f.dep>=Math.min(1230,RED_DEP_EVE[0]) || f.dep<=90)
  && f.day>0 && f.blk>=3.25 && f.arr>=300 && f.arr<=540;
function redeyeSets(){
  const IN=new Set(), OUT=new Set(), done=new Set();
  if(!state.redeye) return {IN,OUT};
  for(const r of state.routes){
    if(!r.red) continue;
    const k=pairKey(r.o,r.d); if(done.has(k)) continue;
    const typ=TYPES.find(t=>+r.mix[t]>0)||TYPES[0];
    const v=redeyeInfo(r.o,r.d,typ); if(!v.ok) continue;
    done.add(k);
    if(STA.includes(v.to)) IN.add(v.to+"|"+v.from); else OUT.add(v.from+"|"+v.to);
  }
  return {IN,OUT};
}
