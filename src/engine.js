/* ---------- engine ---------- */
function build(){
  syncTypes();
  syncFeedModes();
  syncPinned();
  SPEC = {}; state.fleet.forEach(f=>{ SPEC[f.t]=f; f.seats=f.F+f.PE+f.Y; });
  const legs = new Map(), addLeg=(o,d,t,n)=>{ const k=o+"|"+d+"|"+t; legs.set(k,(legs.get(k)||0)+n); };
  const dowOf = new Map();
  for(const r of state.routes){
    if(!AP[r.o]||!AP[r.d]) continue;
    for(const t of TYPES){
      const n = +r.mix[t]||0; if(n<=0) continue;
      addLeg(r.o,r.d,t,n); dowOf.set(r.o+"|"+r.d+"|"+t, r.dow||7);
      if(!STA.includes(r.d)){ addLeg(r.d,r.o,t,n); dowOf.set(r.d+"|"+r.o+"|"+t, r.dow||7); }
    }
  }
  // auto-balance station pairs: a turn is one aircraft, so both directions must match
  const rebal = [];
  for(let i=0;i<STA.length;i++) for(let j=i+1;j<STA.length;j++){
    const a=STA[i], b=STA[j];
    for(const t of TYPES){
      const ka=a+"|"+b+"|"+t, kb=b+"|"+a+"|"+t;
      const na=legs.get(ka)||0, nb=legs.get(kb)||0;
      if(na===nb) continue;
      const n=Math.max(na,nb);
      if(n>0){ legs.set(ka,n); legs.set(kb,n); } else { legs.delete(ka); legs.delete(kb); }
      rebal.push({a,b,t,na,nb,n});
    }
  }
  const size = {};
  for(const [k,n] of legs){ const o=k.split("|")[0]; size[o]=(size[o]||0)+n; }
  // ---- feed plan: each spoke is fed by whichever enabled feed station serves it most ----
  const FT_={}; for(const k in FEEDMODE) if(state.feed && state.feed[k]) FT_[k]=FEEDMODE[k];
  const spokeFreq={}, spokeSize={};
  for(const [k,n] of legs){ const [o,d]=k.split("|");
    if(STA.includes(o)&&!STA.includes(d)){ (spokeFreq[d]=spokeFreq[d]||{})[o]=((spokeFreq[d]||{})[o]||0)+n; }
    if(!STA.includes(o)) spokeSize[o]=(spokeSize[o]||0)+n; }
  const FEED_PAIR=new Set(), FEED_OF={};
  for(const d in spokeFreq){
    let best=null;
    for(const b in spokeFreq[d]){ if(FT_[b]===undefined) continue;
      const n=spokeFreq[d][b], near=-dist(d,b);
      if(!best || n>best.n || (n===best.n && near>best.near)) best={b,n,near}; }
    if(best){ FEED_PAIR.add(best.b+"|"+d); FEED_OF[d]=best.b; }
  }
  const FED=new Set(); const RED_USED=new Set();
  const {IN:REDEYE_IN, OUT:REDEYE_OUT}=redeyeSets();
  const NIGHT_PAIR=new Set(), RON_COUNT={}, RON_CAP={};
  // a small station cannot have half its flying start as a dawn push, or it loses its afternoon
  for(const d in spokeSize) RON_CAP[d]=Math.max(1, Math.round(spokeSize[d]/5));
  const SP=SPACING[state.spacing]||SPACING.balanced;
  const MKT_FREQ={}, MKT={}, DAWN_N={};
  for(const [k,n] of legs){ const [o,d]=k.split("|"); const key=o+"|"+d; MKT_FREQ[key]=(MKT_FREQ[key]||0)+n; }
  const wantGap = key => SP.gap ? Math.min(SP.cap, Math.max(SP.gap, Math.floor(SP.win/Math.max(1,MKT_FREQ[key]||1)))) : 0;
  function gapOk(o,d,t){
    const key=o+"|"+d, g=wantGap(key); if(!g) return true;
    const list=MKT[key]; if(!list) return true;
    const lt=mod(loc(o,t),1440);
    for(const x of list){ const dd=Math.abs(lt-x); if(Math.min(dd,1440-dd) < g-EPS) return false; }
    return true;
  }
  const mktAdd=(o,d,t)=>{ const key=o+"|"+d; (MKT[key]=MKT[key]||[]).push(mod(loc(o,t),1440)); };
  // a departure may only sit in the small hours if it is a genuine long red-eye
  const civilOk=(o,t,blkmin)=>{ const lt=mod(loc(o,t),1440); return (lt>=330&&lt<=1410)||blkmin>=240; };
  // assign each turn an owning base
  const turns = new Map(), push=(b,t,d,n)=>{ const k=b+"|"+t; if(!turns.has(k)) turns.set(k,[]);
    const arr=turns.get(k); for(let i=0;i<n;i++) arr.push(d); };
  const donePair = new Set();
  for(const [k,n] of legs){
    const [o,d,t]=k.split("|");
    if(STA.includes(o)&&STA.includes(d)){
      const pk=[o,d].sort().join("|")+"|"+t; if(donePair.has(pk)) continue; donePair.add(pk);
      const [a,b]=[o,d].sort();
      const sa=size[a]||0, sb=size[b]||0, na=Math.max(0,Math.min(n,Math.round(n*sa/((sa+sb)||1))));
      push(a,t,b,na); push(b,t,a,n-na);
    } else if(STA.includes(o)) push(o,t,d,n);
  }
  // pack turns into daily lines
  let lines=[]; const SLOT=new Map();
  const keys=[...turns.keys()].sort((x,y)=> turns.get(y).length-turns.get(x).length || (x<y?-1:1));
  for(const key of keys){
    const [B,T]=key.split("|"); const spec=SPEC[T]; if(!spec) continue;
    const banks=BANKS[ROLE[B]], turn=spec.turn;
    let rem=turns.get(key).slice().sort((x,y)=>(blk(B,y,T)+blk(y,B,T))-(blk(B,x,T)+blk(x,B,T)));
    let li=0, guard=0;
    while(rem.length && guard++<4000){
      li++; const stag=(li%8)*6; let startbank=banks[(li-1)%3];
      let night=null, isFeed=false, isRed=false;
      const dur0=blk(B,rem[0],T)+turn+blk(rem[0],B,T);
      const roomy = d => !NIGHT_PAIR.has(B+"|"+d) && (RON_COUNT[d]||0) < (RON_CAP[d]||1);
      const rj = state.redeye ? rem.findIndex(d=>{ const k=B+"|"+d;
        return (REDEYE_IN.has(k)||REDEYE_OUT.has(k)) && !RED_USED.has(k) && !NIGHT_PAIR.has(k); }) : -1;
      if(rj>=0){ night=rem.splice(rj,1)[0]; RED_USED.add(B+"|"+night); isRed=true; }
      else if(dur0 > 13*60){ night=rem.shift(); }          // too long for a day: must be the overnight
      if(night===null){
        let pick=-1, bestSize=-1;
        for(let i=0;i<rem.length;i++){ const d=rem[i];
          if(FEED_PAIR.has(B+"|"+d) && !FED.has(d) && roomy(d) && (spokeSize[d]||0)>bestSize){ bestSize=spokeSize[d]||0; pick=i; } }
        if(pick>=0){ night=rem.splice(pick,1)[0]; FED.add(night); isFeed=true; }
        else if(dur0>=240){ const j=rem.findIndex(roomy); if(j>=0) night=rem.splice(j,1)[0]; }
      }
      if(night){ NIGHT_PAIR.add(B+"|"+night); RON_COUNT[night]=(RON_COUNT[night]||0)+1; }
      const flights=[]; let block=0, t, latest;
      if(night){
        const bo=blk(night,B,T), bi=blk(B,night,T);
        let best=null;
        const lo_m=CURFEW[night]?Math.max(SPOKE_EARLIEST,CURFEW[night][0]):SPOKE_EARLIEST;
        const named = FT_[B]!==undefined && FT_[B]!=="dawn";
        let depX, slk;
        if(isRed && REDEYE_IN.has(B+"|"+night)){
          // the usual window, or the evening one for a flight too long for it (redeye.js)
          const W=redeyeWindow(night,B,bo)||RED_DEP;
          let bst=null;
          for(let m=W[0];m<=W[1];m+=5){
            if(CURFEW[night] && (m<CURFEW[night][0]||m>CURFEW[night][1])) continue;
            const dX=utc(night,m)-1440, pen=Math.abs(mod(loc(B,dX+bo),1440)-RED_ARR);
            if(!bst||pen<bst[0]) bst=[pen,dX];
          }
          depX = bst ? bst[1] : utc(night,W[0])-1440;
          const fb=banks.find(bk=>utc(B,bk) >= depX+bo+MCT-EPS);
          startbank = fb!==undefined ? fb : banks[0];
        } else if(isRed && REDEYE_OUT.has(B+"|"+night)){
          depX=utc(night,480);
          const fb=banks.find(bk=>utc(B,bk) >= depX+bo+MCT-EPS);
          startbank = fb!==undefined ? fb : banks[banks.length-1];
        } else if(isFeed || named){
          const mode = FT_[B]!==undefined ? FT_[B] : "dawn";
          if(mode==="dawn") depX=utc(night, lo_m + (DAWN_N[night]||0)*DAWN_STAGGER);
          else depX=Math.max(utc(B, mode-MCT-(li%9)*15)-bo, utc(night,lo_m));
          if(CURFEW[B]) depX=Math.max(depX, utc(B,CURFEW[B][0])-bo);
          const fb=banks.find(bk=>utc(B,bk) >= depX+bo+MCT-EPS);
          startbank = fb!==undefined ? fb : banks[0];
        } else {
          const hi_m=CURFEW[night]?Math.min(480,CURFEW[night][1]):480;
          for(let m=lo_m;m<=hi_m;m+=5){ const dX=utc(night,m); const pen=Math.abs(loc(B,dX+bo)-(startbank-30));
            if(!best||pen<best[0]) best=[pen,dX]; }
          depX=best[1];
        }
        { let n2=0; while(!gapOk(night,B,depX) && n2<90){ depX+=5; n2++; } }
        while(((SLOT.get(slk=night+"|"+mod(Math.round(loc(night,depX)),1440)))||0)>=2 &&
              !(CURFEW[night] && mod(loc(night,depX),1440)>=CURFEW[night][1])) depX+=5;
        DAWN_N[night]=(DAWN_N[night]||0)+1;
        mktAdd(night,B,depX);
        SLOT.set(slk,(SLOT.get(slk)||0)+1);
        const arrB=depX+bo;
        flights.push([night,B,depX,arrB,bo]); block+=bo+bi;
        t=arrB+turn; latest=depX+1440-bi-turn-15;
        if(CURFEW[B]) latest=Math.min(latest, utc(B,CURFEW[B][1]));
      } else { t=utc(B,startbank)+stag; latest=t+1440-turn; }
      while(rem.length){
        let pick=null;
        for(let i=0;i<rem.length;i++){
          const d=rem[i], out=blk(B,d,T), back=blk(d,B,T);
          let dep=null;
          if(ROLE[B]==="Hub"){
            for(const b of banks){ const c=utc(B,b)+stag; if(c>=t-EPS){dep=c;break;} }
            if(dep===null) break;
            if(dep-t>60) dep=Math.ceil(t/5)*5;
          } else {
            dep=Math.ceil(Math.max(t, utc(B,startbank)+stag)/5)*5;
            if(dep > utc(B,banks[banks.length-1])+90) break;
          }
          { let n2=0;
            while((!gapOk(B,d,dep) || !gapOk(d,B,dep+out+turn) ||
                   !civilOk(B,dep,out) || !civilOk(d,dep+out+turn,back)) && n2<90){ dep+=5; n2++; } }
          if(CURFEW[B]){ const l=mod(loc(B,dep),1440); if(l<CURFEW[B][0]-EPS||l>CURFEW[B][1]+EPS) continue; }
          if(!civilOk(B,dep,out)||!civilOk(d,dep+out+turn,back)) continue;   // never strand a short flight at night
          const fin=dep+out+turn+back;
          if(fin+turn > latest+EPS) continue;
          if(block+out+back > spec.util*60+90) continue;
          if(!pick || out+back>pick.v) pick={i,v:out+back,dep,out,back,fin};
        }
        if(!pick) break;
        const d=rem.splice(pick.i,1)[0];
        mktAdd(B,d,pick.dep); mktAdd(d,B,pick.dep+pick.out+turn);
        flights.push([B,d,pick.dep,pick.dep+pick.out,pick.out]);
        flights.push([d,B,pick.dep+pick.out+turn,pick.fin,pick.back]);
        block+=pick.out+pick.back; t=pick.fin+turn;
      }
      if(night){
        const bi=blk(B,night,T); let dep;
        if(ROLE[B]==="Hub"){
          const cand=banks.map(b=>utc(B,b)+stag).filter(c=>c>=t-EPS&&c<=latest+EPS);
          dep = cand.length ? Math.min.apply(null,cand) : Math.min(Math.max(t,utc(B,banks[0])),latest);
        } else dep = Math.min(Math.max(Math.ceil(t/5)*5, utc(B,startbank)), latest);
        if(isRed && REDEYE_OUT.has(B+"|"+night)){
          const W=redeyeWindow(B,night,bi)||RED_DEP;
          let hi=W[1]; if(CURFEW[B]) hi=Math.min(hi,CURFEW[B][1]);
          const want=[]; for(let m=W[0];m<=hi;m+=5) want.push(utc(B,m));
          const ok=want.filter(x=>x>=t-EPS&&x<=latest+EPS);
          dep = ok.length ? ok.reduce((a,b)=>Math.abs(mod(loc(night,b+bi),1440)-RED_ARR)<Math.abs(mod(loc(night,a+bi),1440)-RED_ARR)?b:a)
                          : Math.max(t, Math.min.apply(null,want));
        }
        if(CURFEW[B]) dep=Math.min(dep, utc(B,CURFEW[B][1]));
        dep=Math.max(dep,t);
        if(!gapOk(B,night,dep)){                       // keep the evening push clear of its market
          const okAt = x => gapOk(B,night,x) && x>=t-EPS && x<=latest+EPS && civilOk(B,x,bi) &&
            !(CURFEW[B] && (mod(loc(B,x),1440)<CURFEW[B][0]-EPS || mod(loc(B,x),1440)>CURFEW[B][1]+EPS));
          let alt=null;
          for(let step=1;step<=97 && alt===null;step++){
            if(okAt(dep+step*5)) alt=dep+step*5; else if(okAt(dep-step*5)) alt=dep-step*5; }
          if(alt!==null) dep=alt;
        }
        if(!civilOk(B,dep,bi)){
          const okC = x => civilOk(B,x,bi) && x>=t-EPS && x<=latest+EPS &&
            !(CURFEW[B] && (mod(loc(B,x),1440)<CURFEW[B][0]-EPS || mod(loc(B,x),1440)>CURFEW[B][1]+EPS));
          let alt=null;
          for(let step=1;step<=145 && alt===null;step++){
            if(okC(dep-step*5)) alt=dep-step*5; else if(okC(dep+step*5)) alt=dep+step*5; }
          if(alt!==null) dep=alt;
        }
        mktAdd(B,night,dep);
        flights.push([B,night,dep,dep+bi,bi]);
      }
      lines.push({base:B,type:T,ron:night,flights,block});
    }
  }
  // ---- consolidation: fold stub rotations into gaps in other rotations of the same base and gauge ----
  const MAX_SPAN=21*60;
  const spanOf = F => F[F.length-1][3]-F[0][2];
  const atBase = l => l.ron===null && l.flights.every(g=>g[0]===l.base||g[1]===l.base);
  let merged=0;
  const stubs=lines.filter(l=>l.block < 0.45*(SPEC[l.type]?SPEC[l.type].util:11)*60 && atBase(l))
                   .sort((a,b)=>a.block-b.block);
  for(const S of stubs){
    if(S.gone) continue;
    const B=S.base, T=S.type, turn=SPEC[T].turn;
    const s0=S.flights[0][2], s1=S.flights[S.flights.length-1][3];
    let host=null;
    for(const H of lines){
      if(H===S||H.gone||H.base!==B||H.type!==T) continue;
      if(H.block+S.block > SPEC[T].util*60+180) continue;
      const F=H.flights, slots=[];
      for(let i=0;i<F.length-1;i++) if(F[i][1]===B) slots.push([F[i][3],F[i+1][2]]);
      slots.push([F[F.length-1][3], F[0][2]+1440]);
      for(const [a,b] of slots){
        for(const sh of [0,1440,-1440]){
          if(a+turn<=s0+sh && s1+sh+turn<=b){
            const cand=H.flights.concat(S.flights.map(g=>[g[0],g[1],g[2]+sh,g[3]+sh,g[4]]))
                                .sort((x,y)=>x[2]-y[2]);
            if(spanOf(cand)<=MAX_SPAN && cand[0][0]===cand[cand.length-1][1]){ host={H,cand}; break; }
          }
        }
        if(host) break;
      }
      if(host) break;
    }
    if(host){ host.H.flights=host.cand; host.H.block+=S.block; S.gone=true; merged++; }
  }
  lines=lines.filter(l=>!l.gone);
  return assemble(legs,lines,rebal,dowOf,FED,FEED_PAIR,merged);
}

function assemble(legs,lines,rebal,dowOf,FED,FEED_PAIR,merged){
  lines.sort((a,b)=> a.base<b.base?-1:a.base>b.base?1:(a.type<b.type?-1:a.type>b.type?1:a.flights[0][2]-b.flights[0][2]));
  /* Flight-number blocks, one range per base.

     These used to be a fixed map of the eight stations the airline shipped with,
     so a base added later got `undefined` and every flight out of it was
     numbered NaN. The shipped allocations are kept — they are a real decision
     about which range belongs to which base, and changing them would renumber
     an existing schedule for no reason — and anything else is allotted the next
     free block in station order. */
  const BLOCKS = Object.assign({}, CFG.numberBlocks
    || {SJC:100, MCO:900, PIT:1700, RDU:2400, AUS:3100, DEN:3800, LAS:4400, COS:4700});
  {
    const BLOCK_STEP = 700, BLOCK_CAP = 9000;
    const used = new Set(Object.values(BLOCKS));
    let next = BLOCK_STEP;
    for(const s of STA.slice().sort()){
      if(BLOCKS[s] !== undefined) continue;
      while(used.has(next) && next < BLOCK_CAP) next += BLOCK_STEP;
      BLOCKS[s] = next; used.add(next); next += BLOCK_STEP;
    }
  }
  const seq={}, flights=[], rots=[], seen=new Map(), periods=[];
  lines.forEach((l,li)=>{
    const id=l.base+"-"+l.type+"-"+String(li).padStart(3,"0");
    let fn=0;
    l.flights.forEach((g,gi)=>{
      const [o,d,dep,arr,b]=g;
      if(gi%2===0){ seq[l.base]=(seq[l.base]||0)+1; fn=BLOCKS[l.base]+seq[l.base]; }
      const kk=o+"|"+d+"|"+l.type; seen.set(kk,(seen.get(kk)||0)+1);
      flights.push({id: li*100+gi, fn: gi%2===0?fn:fn+500, line:id, base:l.base, t:l.type, o, d,
        depU: mod(Math.round(dep),1440), blkMin: b,
        // Exact UTC departure, unrounded. Published times are rounded to the
        // minute, and testing a 40-minute connection against a rounded time
        // moves connections across the MCT boundary — the same trap that
        // produced 324 phantom breaches in validate.js.
        depX: dep,
        dep: mod(Math.round(dep+off(o)),1440), arr: mod(Math.round(arr+off(d)),1440),
        day: Math.floor((arr+off(d))/1440)-Math.floor((dep+off(o))/1440),
        blk: b/60, nm: dist(o,d), dow: dowOf.get(kk)||7, ron: l.ron||""});
    });
    const F=l.flights, last=F.length-1;
    for(let i=0;i<last;i++) periods.push({ap:F[i][1], s:F[i][3], e:F[i+1][2], arr:li*100+i, dep:li*100+(i+1)});
    periods.push({ap:F[0][0], s:F[last][3], e:F[0][2]+1440, arr:li*100+last, dep:li*100+0});
    const path=[l.flights[0][0]].concat(l.flights.map(g=>g[1])).join("–");
    rots.push({id, base:l.base, t:l.type, legs:l.flights.length, block:l.block/60,
      span:(l.flights[l.flights.length-1][3]-l.flights[0][2])/60,
      first: mod(Math.round(l.flights[0][2]+off(l.flights[0][0])),1440),
      last: mod(Math.round(l.flights[l.flights.length-1][3]+off(l.flights[l.flights.length-1][1])),1440),
      ron: l.ron||l.base, path});
  });
  flights.sort((a,b)=> a.base<b.base?-1:a.base>b.base?1:a.dep-b.dep||a.fn-b.fn);
  // validation
  let unflown=0, extra=0;
  for(const [k,n] of legs){ const g=seen.get(k)||0; if(g!==n) unflown+=Math.abs(n-g); }
  for(const [k,g] of seen){ if(!legs.has(k)) extra+=g; }
  let brkSpace=0, brkGround=0, open=0, brkNight=0, brkSpan=0, rangeBad=[];
  for(const l of lines){
    const f=l.flights, turn=SPEC[l.type].turn;
    for(let i=0;i<f.length-1;i++){
      if(f[i][1]!==f[i+1][0]) brkSpace++;
      if(f[i+1][2]-f[i][3] < turn-1e-6) brkGround++;
    }
    if(f[0][0]!==f[f.length-1][1]) open++;
    else if((f[0][2]+1440)-f[f.length-1][3] < turn-1e-6) brkNight++;
    if(f[f.length-1][3]-f[0][2] > 1440+1e-6) brkSpan++;
  }
  for(const [k,n] of legs){ const [o,d,t]=k.split("|");
    if(dist(o,d) > SPEC[t].rng) rangeBad.push({o,d,t,nm:dist(o,d),rng:SPEC[t].rng}); }
  let curfew=0;
  for(const f of flights) if(CURFEW[f.o] && (f.dep<CURFEW[f.o][0]||f.dep>CURFEW[f.o][1])) curfew++;
  const dep={},arr={};
  for(const [k,n] of legs){ const [o,d]=k.split("|"); dep[o]=(dep[o]||0)+n; arr[d]=(arr[d]||0)+n; }
  const imb=Object.keys(Object.assign({},dep,arr)).filter(a=>(dep[a]||0)!==(arr[a]||0)).length;
  // ground occupancy
  const gp={};
  for(const l of lines){ const f=l.flights;
    for(let i=0;i<f.length-1;i++){ (gp[f[i][1]]=gp[f[i][1]]||[]).push([f[i][3],f[i+1][2]]); }
    (gp[f[0][0]]=gp[f[0][0]]||[]).push([f[f.length-1][3], f[0][2]+1440]); }
  const stations = STA.map(s=>{
    const D=new Array(24).fill(0), A=new Array(24).fill(0), G=new Array(24).fill(0);
    for(const f of flights){ if(f.o===s) D[Math.floor(f.dep/60)]++; if(f.d===s) A[Math.floor(f.arr/60)]++; }
    // Aircraft on the ground, counted exactly: +1 where a ground period starts and
    // -1 where it ends, over two copies of the day so one across midnight counts on
    // both sides of it. G[h] is the most at once during local hour h. This used to
    // look every 15 minutes, which missed a bank's peak that fell between two
    // looks: PIT read 28 gates for a peak of 30. An hour mark is a look of its own,
    // for an hour no period starts in. Ends sort before starts at the same minute,
    // because a gate one aircraft leaves as another arrives is one gate.
    const ev=[];
    for(const [a,b] of gp[s]||[]){ const a0=mod(a+off(s),1440);
      for(const k of [0,1440]) ev.push([a0+k,1],[a0+k+(b-a),-1]); }
    for(let h=0;h<24;h++) ev.push([1440+h*60,0]);
    ev.sort((x,y)=>x[0]-y[0]||x[1]-y[1]);
    let on=0;
    for(const [t,d] of ev){ on+=d;
      if(d>=0 && t>=1440 && t<2880){ const h=Math.floor((t-1440)/60); if(on>G[h]) G[h]=on; } }
    let deps=0,seats=0,asm=0,nmw=0;
    for(const [k,n] of legs){ const [o,d,t]=k.split("|"); if(o!==s) continue;
      deps+=n; seats+=n*SPEC[t].seats; asm+=n*SPEC[t].seats*dist(o,d)*SM; nmw+=n*dist(o,d); }
    return {code:s, name:AP[s]?AP[s][0]:s, role:ROLE[s], D,A,G, gates:Math.max.apply(null,G),
      deps, seats, asm, stage: deps?nmw/deps:0, dests:new Set(state.routes.filter(r=>r.o===s).map(r=>r.d)).size,
      based: rots.filter(r=>r.base===s).length};
  });
  // fleet
  const fleet = state.fleet.map(f=>{
    let deps=0, bh=0, seats=0, asm=0, nmw=0;
    for(const [k,n] of legs){ const [o,d,t]=k.split("|"); if(t!==f.t) continue;
      deps+=n; bh+=n*blk(o,d,f.t)/60; seats+=n*f.seats; asm+=n*f.seats*dist(o,d)*SM; nmw+=n*dist(o,d); }
    const mine=rots.filter(r=>r.t===f.t);
    const tails=mine.length;
    const spare=(state.spare===undefined?0.08:state.spare);
    const total=Math.ceil(tails*(1+spare));
    const roster=Math.max(0, Math.round((state.roster&&state.roster[f.t])||0));
    const availLine=Math.floor(roster/(1+spare));
    const short=Math.max(0, tails-availLine);
    const uncovered=mine.slice().sort((a,b)=>a.block-b.block).slice(0,short);
    return {t:f.t, seats:f.seats, deps, bh, tails, perTail: tails?bh/tails:0, util:f.util,
      total, roster, surplus: roster-total, short, uncovered,
      pinned: FLEET_PINNED[f.t]||0, asm, stage: deps?nmw/deps:0};
  });
  // ---- gate assignment: colour the interval graph of ground periods, per airport ----
  // Ground periods are arcs on a 24-hour clock. Swept in start order from
  // midnight, the aircraft parked across midnight came last and took gates of
  // their own: SJC used 54 gates for a peak of 49. The sweep now starts at the
  // airport's quietest moment. The few aircraft on the ground then take a gate
  // each, held from the start until they leave and again from when they arrive
  // until the sweep comes round. Every other period goes, in start order, to the
  // free gate that came free last, and opens a new gate only when none is free.
  // An airport can be equally quiet at several moments, and the sweep from one
  // can need a gate more than from another (the hub starter's DEN: 23 or 22), so
  // each is tried and the fewest gates kept. That needs exactly the peak at all
  // 128 airports of the shipped network and at every airport of both starters.
  const byAp={};
  for(const p of periods){
    const o=off(p.ap); let s0=p.s+o, e0=p.e+o;
    const shift=Math.floor(s0/1440)*1440; s0-=shift; e0-=shift;
    (byAp[p.ap]=byAp[p.ap]||[]).push({s:s0,e:e0,arr:p.arr,dep:p.dep});
  }
  const gateOfArr=new Map(), gateOfDep=new Map(), gateCount={};
  for(const ap in byAp){
    const ps=byAp[ap], ev=[];
    for(const p of ps) for(const k of [0,1440]) ev.push([p.s+k,1],[p.e+k,-1]);
    ev.sort((x,y)=>x[0]-y[0]||x[1]-y[1]);
    // Cut in the middle of a gap, where nothing starts or ends: cut on the minute
    // an aircraft leaves and rounding can keep it there, which gave MEM a third
    // gate for a peak of two.
    let on=0; const gaps=[];
    for(let i=0;i<ev.length-1;i++){ const [t,d]=ev[i]; on+=d;
      if(t>=1440 && t<2880 && ev[i+1][0]>t) gaps.push({on, T:(t+ev[i+1][0])/2-1440}); }
    const low=Math.min(...gaps.map(x=>x.on));
    const sweep=T=>{
      const arcs=ps.map(p=>{ const s0=mod(p.s-T,1440); return {p, s:s0, e:s0+(p.e-p.s)}; })
        .sort((x,y)=>x.s-y.s||x.e-y.e);
      const gates=[];
      for(const a of arcs) if(a.e>1440) gates.push({free:a.e-1440, until:a.s, ps:[a.p]});
      for(const a of arcs){ if(a.e>1440) continue;
        let g=-1;
        gates.forEach((x,i)=>{ if(x.free<=a.s && a.e<=x.until && (g<0 || x.free>gates[g].free)) g=i; });
        if(g<0){ g=gates.length; gates.push({free:0, until:1440, ps:[]}); }
        gates[g].free=a.e; gates[g].ps.push(a.p);
      }
      return gates;
    };
    let gates=null;
    for(const x of gaps) if(x.on===low){ const g=sweep(x.T); if(!gates || g.length<gates.length) gates=g; }
    if(!gates) gates=sweep(0);
    // the busiest gate is A1, so the letters read from busy to quiet
    const busy=x=>x.ps.reduce((n,p)=>n+p.e-p.s,0);
    gates.sort((x,y)=>busy(y)-busy(x)).forEach((x,i)=>{ for(const p of x.ps) p.g=i; });
    gateCount[ap]=gates.length;
    const n=gates.length, cols=n<=6?n:Math.ceil(n/Math.min(4,Math.ceil(n/6)));
    for(const p of ps){
      const letter=n<=6?"A":String.fromCharCode(65+Math.floor(p.g/cols));
      const label=letter+(n<=6?(p.g+1):((p.g%cols)+1));
      gateOfArr.set(p.arr,label); gateOfDep.set(p.dep,label);
    }
  }
  for(const f of flights){ f.gArr=gateOfArr.get(f.id)||""; f.gDep=gateOfDep.get(f.id)||""; }
  // ---- markets for the map: one entry per undirected pair ----
  const mk=new Map();
  for(const [k,n] of legs){
    const [o,d,t]=k.split("|");
    const a=o<d?o:d, b=o<d?d:o, key=a+"|"+b;
    let m=mk.get(key);
    if(!m){ m={a,b,freq:0,mix:{},nm:dist(a,b),stations:[]}; mk.set(key,m); }
    if(o===a){ m.freq+=n; m.mix[t]=(m.mix[t]||0)+n; }
    if(STA.includes(o)&&!m.stations.includes(o)) m.stations.push(o);
  }
  const markets=[...mk.values()].filter(m=>m.freq>0).sort((x,y)=>x.freq-y.freq);
  const apStats={};
  for(const [k,n] of legs){ const [o,d]=k.split("|");
    (apStats[o]=apStats[o]||{dep:0,arr:0}).dep+=n; (apStats[d]=apStats[d]||{dep:0,arr:0}).arr+=n; }
  const airports = new Set(); for(const [k] of legs){ const [o,d]=k.split("|"); airports.add(o); airports.add(d); }
  const ronSet = new Set(rots.map(r=>r.ron));
  const firstDep={};
  for(const f of flights){ if(STA.includes(f.o)) continue;
    if(firstDep[f.o]===undefined||f.dep<firstDep[f.o]) firstDep[f.o]=f.dep; }
  const spokes=Object.keys(firstDep);
  const mkSeen={};
  for(const f of flights){ const k=f.o+"|"+f.d; (mkSeen[k]=mkSeen[k]||[]).push(f.dep); }
  let tight=0;
  for(const k in mkSeen){ const v=mkSeen[k].slice().sort((a,b)=>a-b);
    for(let i=0;i<v.length-1;i++){ const g=Math.min(v[i+1]-v[i],1440-(v[i+1]-v[i])); if(g<40) tight++; } }
  const redeyes=flights.filter(isRedeyeFlight).length;
  const nightOdd=flights.filter(f=>!(f.dep>=330&&f.dep<=1410)&&f.blk<4).length;
  const lastDep={};
  for(const f of flights){ if(STA.includes(f.o)) continue;
    if(lastDep[f.o]===undefined||f.dep>lastDep[f.o]) lastDep[f.o]=f.dep; }
  const depCount={}; for(const f of flights){ if(!STA.includes(f.o)) depCount[f.o]=(depCount[f.o]||0)+1; }
  const noAft=spokes.filter(a=>(depCount[a]||0)>=3 && lastDep[a]<900).length;
  const feedStats={spokes:spokes.length, early:spokes.filter(a=>firstDep[a]<420).length,
    late:spokes.filter(a=>firstDep[a]>=540).length, fed:FED.size, planned:FEED_PAIR.size, tight, nightOdd, noAft, redeyes,
    lateList:spokes.filter(a=>firstDep[a]>=540).sort(), firstDep};
  return {flights, rots, stations, fleet, legs, rebal, markets, apStats, gateCount, feedStats,
    checks:{unflown, extra, brkSpace, brkGround, open, brkNight, brkSpan, imb, curfew, rangeBad},
    totals:{deps: flights.length, tails: rots.length, blockHrs: fleet.reduce((a,b)=>a+b.bh,0),
      asm: fleet.reduce((a,b)=>a+b.asm,0), gates: stations.reduce((a,b)=>a+b.gates,0),
      airports: airports.size, ron: ronSet.size, routes: state.routes.length,
      nextDay: flights.filter(f=>f.day>0).length, subDaily: flights.filter(f=>f.dow<7).length,
      totalFleet: fleet.reduce((a,b)=>a+b.total,0),
      roster: fleet.reduce((a,b)=>a+b.roster,0),
      surplus: fleet.reduce((a,b)=>a+b.surplus,0),
      shortFlights: fleet.reduce((a,b)=>a+b.uncovered.reduce((x,r)=>x+r.legs,0),0),
      shortRots: fleet.reduce((a,b)=>a+b.short,0),
      pinned: pinTotal(), merged: merged||0}};
}