/* ---------- red-eye viability ---------- */
// Returns the one direction that can fly overnight, or why neither can.
function redeyeInfo(o,d,typ){
  if(!AP[o]||!AP[d]) return {ok:false,why:"unknown airport"};
  const sp=SPEC[typ]||SPEC.A319||{gnd:35,kt:447};
  const blkm=sp.gnd+dist(o,d)/sp.kt*60;
  if(blkm<3.25*60) return {ok:false,blk:blkm/60,
    why:`${(blkm/60).toFixed(1)} h block — too short to sell as an overnight`};
  let nearest=null;
  for(const [a,b] of [[o,d],[d,o]]){
    const sh=off(b)-off(a); let best=null;
    for(let m=RED_DEP[0];m<=RED_DEP[1];m+=5){
      if(CURFEW[a] && (m<CURFEW[a][0]||m>CURFEW[a][1])) continue;
      const arr=mod(m+blkm+sh,1440);
      if(arr>=300&&arr<=540){ const pen=Math.abs(arr-RED_ARR); if(!best||pen<best.pen) best={pen,dep:m,arr}; }
    }
    if(best) return {ok:true,from:a,to:b,dep:best.dep,arr:Math.round(best.arr),blk:blkm/60};
    const need=mod(RED_ARR-blkm-sh,1440);
    if(!nearest||need<nearest.need) nearest={need,a,b,sh};
  }
  return {ok:false,blk:blkm/60,
    why:`would have to depart ${hhmm(nearest.need)} from ${nearest.a} to land at a usable hour`};
}
function redeyeSets(){
  const IN=new Set(), OUT=new Set(), done=new Set();
  if(!state.redeye) return {IN,OUT};
  for(const r of state.routes){
    if(!r.red) continue;
    const k=pairKey(r.o,r.d); if(done.has(k)) continue;
    const typ=TYPES.find(t=>+r.mix[t]>0)||"A319";
    const v=redeyeInfo(r.o,r.d,typ); if(!v.ok) continue;
    done.add(k);
    if(STA.includes(v.to)) IN.add(v.to+"|"+v.from); else OUT.add(v.from+"|"+v.to);
  }
  return {IN,OUT};
}