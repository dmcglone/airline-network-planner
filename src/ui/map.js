/* ================= ROUTE MAP ================= */
const GEO = (()=>{ try { const e=document.getElementById("geo");
  return e ? JSON.parse(e.textContent) : {land:[],lines:[]}; }
  catch(err){ console.error("geo data unreadable",err); return {land:[],lines:[]}; } })();
const parseRings = a => a.map(str => str.split(" ").map(p=>{const[x,y]=p.split(",");return [+x,+y];}));
const LAND = parseRings(GEO.land), BORD = parseRings(GEO.lines);
const merc = (lon,lat) => [lon, -(180/Math.PI)*Math.log(Math.tan(Math.PI/4 + Math.max(-84,Math.min(84,lat))*Math.PI/360))];
const RAMP = ["#BCD3E4","#8FB6D2","#6698BF","#3F7BA8","#1E5F8C","#0E456B"];
function rampColor(f,max){ const i=Math.min(RAMP.length-1, Math.floor((f-1)/Math.max(1,max-1)*RAMP.length)); return RAMP[Math.max(0,i)]; }
let VIEW=null, mapSel=null, mapDrag=null;

function gcPath(a,b){
  const A=AP[a], B=AP[b]; if(!A||!B) return "";
  const r=Math.PI/180, la1=A[2]*r, lo1=A[3]*r, la2=B[2]*r, lo2=B[3]*r;
  const d=2*Math.asin(Math.sqrt(Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2));
  const N=Math.max(8,Math.min(40,Math.round(d*40))), pts=[];
  for(let i=0;i<=N;i++){
    const f=i/N;
    if(d===0){ pts.push(merc(A[3],A[2])); break; }
    const s1=Math.sin((1-f)*d)/Math.sin(d), s2=Math.sin(f*d)/Math.sin(d);
    const x=s1*Math.cos(la1)*Math.cos(lo1)+s2*Math.cos(la2)*Math.cos(lo2);
    const y=s1*Math.cos(la1)*Math.sin(lo1)+s2*Math.cos(la2)*Math.sin(lo2);
    const z=s1*Math.sin(la1)+s2*Math.sin(la2);
    pts.push(merc(Math.atan2(y,x)/r, Math.atan2(z,Math.sqrt(x*x+y*y))/r));
  }
  return "M"+pts.map(p=>p[0].toFixed(2)+" "+p[1].toFixed(2)).join("L");
}
function gcPoint(a,b,f){
  const A=AP[a], B=AP[b]; if(!A||!B) return null;
  const r=Math.PI/180, la1=A[2]*r, lo1=A[3]*r, la2=B[2]*r, lo2=B[3]*r;
  const d=2*Math.asin(Math.sqrt(Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2));
  if(d===0) return {lat:A[2], lon:A[3]};
  const s1=Math.sin((1-f)*d)/Math.sin(d), s2=Math.sin(f*d)/Math.sin(d);
  const x=s1*Math.cos(la1)*Math.cos(lo1)+s2*Math.cos(la2)*Math.cos(lo2);
  const y=s1*Math.cos(la1)*Math.sin(lo1)+s2*Math.cos(la2)*Math.sin(lo2);
  const z=s1*Math.sin(la1)+s2*Math.sin(la2);
  return {lat: Math.atan2(z,Math.sqrt(x*x+y*y))/r, lon: Math.atan2(y,x)/r};
}
function ringPath(r){ return "M"+r.map(p=>{const q=merc(p[0],p[1]);return q[0].toFixed(2)+" "+q[1].toFixed(2);}).join("L"); }

function fitView(all){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  // default frame is the eight stations, generously padded: that is where the network lives.
  // "Fit all" widens to every airport served, Hawaii and South America included.
  const codes = all ? Object.keys(M.apStats) : STA;
  for(const c of codes){ const A=AP[c]; if(!A) continue;
    const p=merc(A[3],A[2]); x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]); y0=Math.min(y0,p[1]); y1=Math.max(y1,p[1]); }
  const pad = all ? 0.07 : 0.42;
  const px=(x1-x0)*pad, py=(y1-y0)*(all?0.10:0.55);
  VIEW={x:x0-px, y:y0-py, w:(x1-x0)+px*2, h:(y1-y0)+py*2};
}
function applyView(){ const svg=$("#map"); if(LIVE && LIVE.on) requestAnimationFrame(drawPlanes);
  if(VIEW) svg.setAttribute("viewBox",`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`);
  restyle(); }
function restyle(){
  const svg=$("#map"); if(!VIEW) return;
  const k = VIEW.w / (svg.clientWidth || svg.getBoundingClientRect().width || 1000);
  svg.querySelectorAll("circle.dot").forEach(c=>c.setAttribute("r",(+c.dataset.r*k).toFixed(3)));
  const zoomed = VIEW.w < 46, tight = VIEW.w < 22;
  svg.querySelectorAll("text.dotlab").forEach(t=>{
    const rank=+t.dataset.rank;
    const show = rank<8 || (zoomed && rank<26) || tight;
    t.setAttribute("display", show?"inline":"none");
    if(!show) return;
    t.setAttribute("font-size",((rank<8?12:10)*k).toFixed(3));
    t.setAttribute("stroke-width",(3*k).toFixed(3));
    t.setAttribute("x",(+t.dataset.x + (+t.dataset.r+1.6)*k).toFixed(3));
    t.setAttribute("y",(+t.dataset.y + 3.4*k).toFixed(3));
  });
}

function drawMap(){
  const fs=$("#mStation").value, ft=$("#mType").value, lab=$("#mLab").checked;
  const svg=$("#map");
  if(!VIEW) fitView();
  const mkts=M.markets.filter(m=>{
    if(ft && !(m.mix[ft]>0)) return false;
    return true;
  });
  const maxF=Math.max(1,...M.markets.map(m=>m.freq));
  $("#rampMax").textContent=maxF;
  $("#ramp").innerHTML=RAMP.map(c=>`<i style="background:${c}"></i>`).join("");
  $("#mapCount").textContent=`${fmt(mkts.length)} markets · ${fmt(Object.keys(M.apStats).length)} airports`;
  const active = c => !fs || c===fs;
  let h = `<g>${LAND.map(r=>`<path class="land" d="${ringPath(r)}Z"/>`).join("")}</g>`
        + `<g>${BORD.map(r=>`<path class="bord" d="${ringPath(r)}"/>`).join("")}</g><g id="arcs">`;
  for(const m of mkts){
    const on = (!fs || m.a===fs || m.b===fs) && (!mapSel || m.a===mapSel || m.b===mapSel);
    const w = (0.55 + Math.min(m.freq,12)*0.22).toFixed(2);
    h += `<path class="arc${on?"":" mute"}" d="${gcPath(m.a,m.b)}" stroke="${rampColor(m.freq,maxF)}"`
       + ` stroke-width="${w}" data-a="${m.a}" data-b="${m.b}"/>`;
  }
  h += `</g><g id="dots">`;
  const codes=Object.keys(M.apStats).sort((a,b)=>(M.apStats[b].dep+M.apStats[b].arr)-(M.apStats[a].dep+M.apStats[a].arr));
  for(const c of codes){
    const A=AP[c]; if(!A) continue;
    const p=merc(A[3],A[2]), st=STA.includes(c);
    const v=M.apStats[c].dep+M.apStats[c].arr;
    const r=(st?3.0:1.1)+Math.min(2.8,Math.sqrt(v)/6.5);
    const dim = (fs && !st && !M.markets.some(m=>(m.a===c||m.b===c)&&(m.a===fs||m.b===fs))) || (mapSel && c!==mapSel && !M.markets.some(m=>(m.a===c||m.b===c)&&(m.a===mapSel||m.b===mapSel)));
    h += `<circle class="dot ${st?"stn":"spk"}${dim?" mute":""}" cx="${p[0].toFixed(3)}" cy="${p[1].toFixed(3)}" r="0" data-r="${r.toFixed(2)}" data-c="${c}"><title>${c} — ${esc(A[0])}</title></circle>`;
  }
  h += `</g>`;
  if(lab){ h += `<g id="labs">`;
    const ordered = STA.concat(codes.filter(c=>!STA.includes(c))).slice(0,70);
    ordered.forEach((c,i)=>{ const A=AP[c]; if(!A) return;
      const p=merc(A[3],A[2]), st=STA.includes(c);
      const v=M.apStats[c] ? M.apStats[c].dep+M.apStats[c].arr : 0;
      const rr=(st?3.0:1.1)+Math.min(2.8,Math.sqrt(v)/6.5);
      h += `<text class="dotlab" display="none" data-rank="${i}" data-x="${p[0].toFixed(3)}" data-y="${p[1].toFixed(3)}" data-r="${rr.toFixed(2)}" x="0" y="0">${c}</text>`; });
    h += `</g>`; }
  svg.innerHTML=h;
  applyView();
  drawMapSide();
}
function drawMapSide(){
  const box=$("#mapside");
  if(!mapSel){
    const top=M.markets.slice().sort((a,b)=>b.freq-a.freq).slice(0,14);
    box.innerHTML=`<h3>Busiest markets</h3><p class="note" style="margin:0 0 9px">Click any airport on the map to see its markets and open its board.</p>`
      + top.map(m=>`<div class="mkt"><span class="m">${m.a}–${m.b}</span><span>${m.freq}×<span class="dim"> · ${fmt(m.nm)} nm</span></span></div>`).join("");
    return;
  }
  const A=AP[mapSel], st=M.apStats[mapSel]||{dep:0,arr:0};
  const mine=M.markets.filter(m=>m.a===mapSel||m.b===mapSel).sort((a,b)=>b.freq-a.freq);
  box.innerHTML=`<h3><span class="code">${mapSel}</span> ${STA.includes(mapSel)?`<span class="chip hub">${ROLE_LABEL[ROLE[mapSel]]}</span>`:""}</h3>`
    +`<p class="note" style="margin:0 0 4px">${esc(A[0])}<br>${esc(cityOf(mapSel))}</p>`
    +`<div class="mkt"><span>Departures / day</span><span class="m">${st.dep}</span></div>`
    +`<div class="mkt"><span>Markets</span><span class="m">${mine.length}</span></div>`
    +`<div class="mkt"><span>Gates in use</span><span class="m">${M.gateCount[mapSel]||0}</span></div>`
    +`<div style="display:flex;gap:6px;margin:11px 0">`
    +`<button class="btn sm" id="goBoard">Open airport board</button>`
    +`<button class="btn sm" id="clrSel">Clear</button></div>`
    + mine.map(m=>{const o=m.a===mapSel?m.b:m.a;
        return `<div class="mkt"><span class="m">${o}</span><span>${m.freq}×<span class="dim"> · ${fmt(m.nm)} nm</span></span></div>`;}).join("");
  $("#goBoard").onclick=()=>{ boardAp=mapSel; $("#bAp").value=mapSel+" — "+AP[mapSel][0];
    tab="board"; drawTabs(); TABS.forEach(([x])=>$("#pane-"+x).hidden=x!=="board"); draw(); };
  $("#clrSel").onclick=()=>{ mapSel=null; drawMap(); };
}
/* ---------- live traffic ---------- */
let LIVE={on:true, speed:1, clock:null, timer:null, sel:null};
function utcNowMin(){ const d=new Date(); return d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60; }
function liveClock(){ return LIVE.clock===null ? utcNowMin() : LIVE.clock; }
function airborne(now,filt){
  const fs=filt?filt.st:"", ft=filt?filt.ty:"";
  const out=[];
  for(const f of M.flights){
    if(fs && f.o!==fs && f.d!==fs) continue;
    if(ft && f.t!==ft) continue;
    const t=mod(now-f.depU,1440);
    if(t<f.blkMin){
      const fr=t/f.blkMin;
      const p=gcPoint(f.o,f.d,fr); if(!p) continue;
      const q=gcPoint(f.o,f.d,Math.min(1,fr+0.01));
      out.push({f,fr,p,q,mins:Math.round(f.blkMin-t)});
    }
  }
  return out;
}
function drawPlanes(){
  const svg=$("#map"); if(!svg||!VIEW) return;
  let g=svg.querySelector("#planes");
  if(!g){ g=document.createElementNS("http://www.w3.org/2000/svg","g"); g.id="planes"; svg.appendChild(g); }
  if(!LIVE.on){ g.innerHTML=""; $("#liveStat").textContent=""; return; }
  const fs=$("#mStation").value, ft=$("#mType").value;
  const now=liveClock(), all=airborne(now), list=airborne(now,{st:fs,ty:ft});
  const k=VIEW.w/(svg.clientWidth||1000), sz=(6.5*k).toFixed(3);
  g.innerHTML=list.map(a=>{
    const m1=merc(a.p.lon,a.p.lat), m2=merc(a.q.lon,a.q.lat);
    const ang=Math.atan2(m2[1]-m1[1],m2[0]-m1[0])*180/Math.PI+90;
    const on=LIVE.sel===a.f.fn;
    return `<g transform="translate(${m1[0].toFixed(3)} ${m1[1].toFixed(3)}) rotate(${ang.toFixed(1)})" class="plane${on?" on":""}" data-fn="${a.f.fn}">`
      + `<path d="M0,${-sz} L${sz*0.62},${sz*0.8} L0,${sz*0.42} L${-sz*0.62},${sz*0.8} Z" vector-effect="non-scaling-stroke"/></g>`;
  }).join("");
  const hh=Math.floor(mod(now,1440)/60), mm=Math.floor(mod(now,1440)%60);
  $("#liveClock").textContent=String(hh).padStart(2,"0")+":"+String(mm).padStart(2,"0")+" UTC";
  const scoped=!!(fs||ft);
  $("#liveStat").innerHTML=`<b>${fmt(list.length)}</b> airborne`
    + (scoped ? ` <span style="opacity:.7">of ${fmt(all.length)} network-wide</span> · `
              : ` · ${fmt(M.totals.tails-all.length)} on the ground · `)
    + `${fmt(list.reduce((s,a)=>s+a.f.nm,0))} nm in the air`;
}
function liveTick(){
  if(LIVE.clock!==null && LIVE.speed>0) LIVE.clock=mod(LIVE.clock+LIVE.speed*0.25/60,1440);
  if(tab==="map") drawPlanes();
}
function liveStart(){ clearInterval(LIVE.timer); LIVE.timer=setInterval(liveTick,250); }
/* map interaction */
(function(){
  const wrap=$("#mapwrap"), svg=$("#map");
  const tip=el("div",{class:"tip"}); tip.hidden=true; wrap.appendChild(tip);
  svg.addEventListener("mousemove",e=>{
    const t=e.target;
    const pl=t.closest && t.closest(".plane");
    if(pl){
      const fn=+pl.dataset.fn, a=airborne(liveClock()).find(x=>x.f.fn===fn);
      if(a){ const f=a.f;
        tip.innerHTML=`<b>FR ${f.fn}</b> ${f.o} → ${f.d} · ${f.t}<br>${esc(cityName(f.o))} to ${esc(cityName(f.d))}<br>`
          +`${Math.round(a.fr*100)}% flown · ${a.mins} min to run · ${fmt(f.nm)} nm<br>`
          +`<span style="opacity:.75">rotation ${f.line}</span>`;
        tip.hidden=false;
        const r=wrap.getBoundingClientRect();
        tip.style.left=Math.min(r.width-260, e.clientX-r.left+14)+"px";
        tip.style.top=Math.max(4, e.clientY-r.top-12)+"px";
        return; }
    }
    if(t.classList.contains("arc")){
      const m=M.markets.find(x=>x.a===t.dataset.a&&x.b===t.dataset.b); if(!m) return;
      const mix=Object.entries(m.mix).sort((a,b)=>b[1]-a[1]).map(([k,v])=>v+"× "+k).join(", ");
      tip.innerHTML=`<b>${m.a}–${m.b}</b><br>${esc(cityName(m.a))} – ${esc(cityName(m.b))}<br>`
        +`${m.freq} flights/day each way · ${fmt(m.nm)} nm<br><span style="opacity:.75">${esc(mix)}</span>`;
    } else if(t.classList.contains("dot")){
      const c=t.dataset.c, s=M.apStats[c]||{dep:0,arr:0};
      tip.innerHTML=`<b>${c}</b> ${esc(AP[c][0])}<br>${esc(cityOf(c))}<br>${s.dep} departures · ${s.arr} arrivals`;
    } else { tip.hidden=true; return; }
    tip.hidden=false;
    const r=wrap.getBoundingClientRect();
    tip.style.left=Math.min(r.width-260, e.clientX-r.left+14)+"px";
    tip.style.top=Math.max(4, e.clientY-r.top-12)+"px";
  });
  svg.addEventListener("mouseleave",()=>{tip.hidden=true;});
  $("#liveOn").onchange=e=>{ LIVE.on=e.target.checked; drawPlanes(); };
  $("#liveNow").onclick=()=>{ LIVE.clock=null; drawPlanes(); };
  $("#liveSpeed").onchange=e=>{ LIVE.speed=+e.target.value;
    if(LIVE.speed>1 && LIVE.clock===null) LIVE.clock=utcNowMin(); };
  LIVE.speed=120; LIVE.clock=utcNowMin(); liveStart();
  svg.addEventListener("click",e=>{
    const pl=e.target.closest && e.target.closest(".plane");
    if(pl){ const fn=+pl.dataset.fn;
      LIVE.sel = LIVE.sel===fn ? null : fn;
      const f=M.flights.find(x=>x.fn===fn);
      if(f && LIVE.sel){ mapSel=null; drawMapSide();
        const rot=M.rots.find(r=>r.id===f.line);
        $("#mapside").innerHTML=`<h3>FR ${f.fn}</h3>`
          +`<p class="note" style="margin:0 0 8px">${f.o} → ${f.d} · ${f.t}<br>${esc(cityName(f.o))} to ${esc(cityName(f.d))}</p>`
          +(rot?`<div class="mkt"><span>Rotation</span><span class="m">${rot.id}</span></div>`
            +`<div class="mkt"><span>Block hours today</span><span class="m">${rot.block.toFixed(2)}</span></div>`
            +`<div class="mkt"><span>Legs</span><span class="m">${rot.legs}</span></div>`
            +`<div class="mkt"><span>Overnights at</span><span class="m">${rot.ron}</span></div>`
            +`<p class="note" style="margin-top:9px"><span class="mono">${rot.path}</span></p>`:"")
          +`<button class="btn sm" id="clrSel" style="margin-top:9px">Clear</button>`;
        const c=$("#clrSel"); if(c) c.onclick=()=>{ LIVE.sel=null; drawMapSide(); drawPlanes(); };
      } else drawMapSide();
      drawPlanes(); return; }
    if(e.target.classList.contains("dot")){ mapSel=e.target.dataset.c; drawMap(); }
    else if(e.target.tagName==="svg"){ mapSel=null; drawMap(); }
  });
  svg.addEventListener("wheel",e=>{
    if(!VIEW) return; e.preventDefault();
    const r=svg.getBoundingClientRect(), fx=(e.clientX-r.left)/r.width, fy=(e.clientY-r.top)/r.height;
    const k=e.deltaY>0?1.12:1/1.12;
    const nw=Math.max(2,Math.min(260,VIEW.w*k)), nh=VIEW.h*(nw/VIEW.w);
    VIEW.x+=(VIEW.w-nw)*fx; VIEW.y+=(VIEW.h-nh)*fy; VIEW.w=nw; VIEW.h=nh; applyView();
  },{passive:false});
  svg.addEventListener("pointerdown",e=>{ if(e.target.classList.contains("dot")) return;
    mapDrag={x:e.clientX,y:e.clientY,vx:VIEW.x,vy:VIEW.y}; svg.classList.add("drag"); svg.setPointerCapture(e.pointerId); });
  svg.addEventListener("pointermove",e=>{ if(!mapDrag) return;
    const r=svg.getBoundingClientRect();
    VIEW.x=mapDrag.vx-(e.clientX-mapDrag.x)/r.width*VIEW.w;
    VIEW.y=mapDrag.vy-(e.clientY-mapDrag.y)/r.height*VIEW.h; applyView(); });
  const end=()=>{ mapDrag=null; svg.classList.remove("drag"); };
  svg.addEventListener("pointerup",end); svg.addEventListener("pointercancel",end);
  $("#mIn").onclick=()=>{ VIEW.x+=VIEW.w*.09; VIEW.y+=VIEW.h*.09; VIEW.w*=.82; VIEW.h*=.82; applyView(); };
  $("#mOut").onclick=()=>{ VIEW.x-=VIEW.w*.11; VIEW.y-=VIEW.h*.11; VIEW.w/=.82; VIEW.h/=.82; applyView(); };
  $("#mFit").onclick=()=>{ fitView(true); applyView(); };
})();
