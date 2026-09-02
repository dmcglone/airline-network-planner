/* ---------- events ---------- */
function guard(fn){                                   // never let one bad interaction kill the page
  try { fn(); }
  catch(err){
    console.error(err);
    toast("Something went wrong applying that change — it was rolled back");
    try { state=load(); M=build(); draw(); } catch(e2){ console.error(e2); }
  }
}
window.addEventListener("error", ev=>{ console.error(ev.error||ev.message); });
document.addEventListener("input", e=>{
  const t=e.target;
  if(t.dataset && t.dataset.i!==undefined && t.dataset.t){
    const r=state.routes[+t.dataset.i]; if(!r) return;
    const v=Math.max(0,Math.min(30,Math.round(+t.value||0)));
    if(v>0) r.mix[t.dataset.t]=v; else delete r.mix[t.dataset.t];
    const n=TYPES.reduce((a,x)=>a+(+r.mix[x]||0),0);
    const cell=t.closest("tr").children[4+TYPES.length];
    if(cell) cell.innerHTML="<b>"+n+"</b>";
    rebuild(); return;
  }
  if(t.dataset && t.dataset.red!==undefined){
    guard(()=>{ const r=state.routes[+t.dataset.red];
      if(r){ if(t.checked) r.red=1; else delete r.red; M=build(); save(); draw(); } });
    return; }
  if(t.dataset && t.dataset.w){ const r=state.routes[+t.dataset.i];
    if(r){ r.dow=Math.max(1,Math.min(7,Math.round(+t.value||7))); rebuild(); } return; }
  if(t.dataset && t.dataset.roster){
    guard(()=>{ state.roster=state.roster||{}; state.roster[t.dataset.roster]=Math.max(0,Math.round(+t.value||0));
      M=build(); save(); draw(); }); return; }
  if(t.id==="spareIn"){ state.spare=Math.max(0,Math.min(0.5,(+t.value||0)/100)); M=build(); save(); draw(); return; }
  if(t.id==="demSel"){ guard(()=>{ state.demand=Object.assign({},state.demand,{source:t.value});
      if(t.value==="gravity") delete state.demand.rows; save(); draw(); }); return; }
  if(t.id==="redeyeChk"){ guard(()=>{ state.redeye=t.checked?1:0; M=build(); save(); draw(); }); return; }
  if(t.id==="spacingSel"){ guard(()=>{ state.spacing=t.value; M=build(); save(); draw(); }); return; }
  if(t.dataset && t.dataset.feed){
    guard(()=>{ state.feed=state.feed||{}; state.feed[t.dataset.feed]=t.checked?1:0;
      M=build(); save(); draw(); }); return; }
  if(t.dataset && t.dataset.f!==undefined && t.dataset.k){
    const f=state.fleet[+t.dataset.f]; if(!f) return;
    f[t.dataset.k]=Math.max(0,+t.value||0);
    if(["F","PE","Y"].includes(t.dataset.k)){
      const c=t.closest("tr").children[4]; if(c) c.innerHTML="<b>"+(f.F+f.PE+f.Y)+"</b>"; }
    rebuild(); return; }
  if(["q","fStation","fType","fRed"].includes(t.id)) drawRoutes();
  else if(["sq","sStation","sType","sRon"].includes(t.id)) drawSched();
  else if(["rq","rStation","rType"].includes(t.id)) drawRot();
  else if(t.id==="spacingSel"){ state.spacing=t.value; M=build(); save(); draw(); }
});
document.addEventListener("change", e=>{
  const id=e.target.id;
  if(id==="demSel"){ state.demand=Object.assign({},state.demand,{source:e.target.value});
    if(e.target.value==="gravity") delete state.demand.rows; save(); draw(); return; }
  if(["fStation","fType","fRed"].includes(id)) drawRoutes();
  else if(["sStation","sType","sRon"].includes(id)) drawSched();
  else if(["rStation","rType"].includes(id)) drawRot();
});
document.addEventListener("click", e=>{
  const d=e.target.dataset && e.target.dataset.del;
  if(d!==undefined && d!==null && d!==""){
    const i=+d, r=state.routes[i];
    if(r && confirm("Remove "+r.o+"–"+r.d+" from the network?")){ state.routes.splice(i,1); M=build(); save(); draw(); }
  }
});
function toast(msg){ const t=el("div",{class:"toast"},esc(msg)); document.body.appendChild(t); setTimeout(()=>t.remove(),2600); }

document.addEventListener("click",e=>{
  const ai=e.target.dataset && e.target.dataset.apply;
  if(ai!==undefined && ai!==null && ai!==""){
    guard(()=>{ const x=SUGG[+ai]; if(!x) return;
      const oi=e.target.dataset.opt;
      const fn = (oi!==undefined && x.options) ? x.options[+oi].apply : x.apply;
      if(!fn) return;
      fn(); M=build(); save(); draw(); toast("Applied — schedule rebuilt"); });
    return;
  }
  const si=e.target.dataset && e.target.dataset.search;
  if(si!==undefined && si!==null && si!==""){
    guard(()=>{
      const x=SUGG[+si]; if(!x||!x.fleetShort) return;
      const {f,cands}=x.fleetShort, out=$("#sr"+si);
      out.textContent="testing…";
      const now=M.fleet.reduce((a,g)=>a+g.short,0);
      let found=null;
      for(const t of cands.slice(0,30)){
        let m; try{
          m=trialBuild(()=>{ const r=state.routes.find(y=>y.o===t.r.o&&y.d===t.r.d); if(!r) return;
            r.mix[f.t]=(+r.mix[f.t]||0)-1; if(!r.mix[f.t]) delete r.mix[f.t];
            r.mix[t.g.t]=(+r.mix[t.g.t]||0)+1; });
        }catch(err){ continue; }
        const after=m.fleet.reduce((a,g)=>a+g.short,0);
        if(after<now){ found={t,after,tails:m.totals.tails}; break; }
      }
      if(!found){ out.textContent=`no single swap among ${Math.min(30,cands.length)} candidates clears it — you would need another ${f.t}`; return; }
      const {t,after,tails}=found;
      out.innerHTML=`<b>${t.r.o}–${t.r.d}: ${f.t} → ${t.g.t}</b> — shortfall ${now} → ${after}, fleet ${fmt(M.totals.tails)} → ${fmt(tails)} `
        + `<button class="btn sm" data-apply="${SUGG.length}">Apply</button>`;
      SUGG.push({apply:()=>{ const r=state.routes.find(y=>y.o===t.r.o&&y.d===t.r.d);
        r.mix[f.t]=(+r.mix[f.t]||0)-1; if(!r.mix[f.t]) delete r.mix[f.t];
        r.mix[t.g.t]=(+r.mix[t.g.t]||0)+1; }});
    });
    return;
  }
  if(e.target.id==="btnImport"){ const b=$("#importBox"); b.hidden=!b.hidden; }
  if(e.target.id==="btnClearDem"){ guard(()=>{ state.demand={source:"gravity"}; M=build(); save(); draw(); toast("Back to the gravity model"); }); }
  if(e.target.id==="btnDoImport"){
    guard(()=>{
      const txt=$("#demCsv").value.trim(); if(!txt){ $("#demStatus").textContent="Nothing pasted."; return; }
      const lines=txt.split(/\r?\n/).filter(Boolean);
      const head=lines[0].split(",").map(h=>h.trim().toLowerCase());
      const iO=head.findIndex(h=>/^(origin|orig|src)/.test(h)), iD=head.findIndex(h=>/^(dest|destination|dst)/.test(h));
      const iP=head.findIndex(h=>/(passenger|pax|traffic)/.test(h)), iF=head.findIndex(h=>/fare|yield|price/.test(h));
      if(iO<0||iD<0||iP<0){ $("#demStatus").textContent="Need columns for origin, dest and passengers."; return; }
      const annual=$("#demAnnual").checked, rows={}; let n=0, skipped=0;
      for(const ln of lines.slice(1)){
        const c=ln.split(",").map(v=>v.trim().replace(/^"|"$/g,""));
        const o=(c[iO]||"").toUpperCase(), d=(c[iD]||"").toUpperCase();
        let p=parseFloat((c[iP]||"").replace(/,/g,""));
        if(o.length!==3||d.length!==3||!isFinite(p)){ skipped++; continue; }
        if(annual) p=p/365/2;                       // annual round trips -> daily one-way
        const k=o+"|"+d;
        rows[k]={pax:Math.round(p*10)/10, fare: iF>=0?parseFloat(c[iF])||null:null};
        n++;
      }
      if(!n){ $("#demStatus").textContent="No usable rows found."; return; }
      state.demand={source:"dot",rows};
      M=build(); save(); draw();
      toast(fmt(n)+" markets imported");
    });
  }
  if(e.target.id==="btnMatch"){ state.roster={}; M.fleet.forEach(f=>state.roster[f.t]=f.total); M=build(); save(); draw(); toast("Roster matched to the current requirement"); }
  if(e.target.id==="btnPinReset"){ state.roster=Object.assign({},FLEET_PINNED); M=build(); save(); draw(); toast("Roster reset to the baseline fleet"); }
});
$("#btnTheme").onclick=()=>{
  const cur=document.documentElement.getAttribute("data-theme");
  const dark=cur ? cur==="dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", dark?"light":"dark");
};
$("#btnReset").onclick=()=>{ if(confirm("Discard your edits and return to the baseline network?")){
  state=baseline(); M=build(); save(); draw(); toast("Reverted to the baseline network"); } };
$("#btnCopy").onclick=async()=>{
  const lines=["origin,dest,destination_name,days_per_week,"+TYPES.join(",")+",flights_per_day,distance_nm,red_eye"];
  for(const r of state.routes){ const n=TYPES.reduce((a,x)=>a+(+r.mix[x]||0),0);
    lines.push([r.o,r.d,'"'+(AP[r.d]?AP[r.d][0]:r.d)+'"',r.dow||7,...TYPES.map(x=>+r.mix[x]||0),n,Math.round(dist(r.o,r.d)),r.red?1:0].join(",")); }
  try{ await navigator.clipboard.writeText(lines.join("\n")); toast("Routes copied — paste them back into the chat to rebuild the workbook"); }
  catch(err){ toast("Couldn't reach the clipboard — try again after clicking the page"); }
};

/* ----- add route ----- */
let addDest=null;
function fillSelects(){
  const stOpts=STA.map(s=>`<option value="${s}">${s}</option>`).join("");
  const tyOpts=TYPES.map(t=>`<option value="${t}">${t}</option>`).join("");
  $("#nO").innerHTML=stOpts; $("#nT").innerHTML=tyOpts;
  $("#fStation").innerHTML='<option value="">All stations</option>'+stOpts;
  $("#sStation").innerHTML='<option value="">All origins</option>'+stOpts;
  $("#rStation").innerHTML='<option value="">All bases</option>'+stOpts;
  $("#fType").innerHTML='<option value="">All gauges</option>'+tyOpts;
  $("#mStation").innerHTML='<option value="">Whole network</option>'+stOpts;
  $("#mType").innerHTML='<option value="">All gauges</option>'+tyOpts;
  $("#sType").innerHTML='<option value="">All gauges</option>'+tyOpts;
  $("#rType").innerHTML='<option value="">All gauges</option>'+tyOpts;
}
function addInfo(){
  const o=$("#nO").value, d=addDest;
  const box=$("#addInfo");
  if(!d||!AP[d]){ box.innerHTML='<span class="dim">Pick a destination to see distance, block time and which gauges can make it.</span>'; return; }
  const nm=dist(o,d), t=$("#nT").value;
  const ok=TYPES.filter(x=>nm<=SPEC[x].rng);
  const rv=redeyeInfo(o,d,t);
  const redLine = rv.ok
    ? `<span class="chip ok">red-eye viable</span> ${rv.from}→${rv.to}, depart <b>${hhmm(rv.dep)}</b>, land <b>${hhmm(rv.arr)}</b> next morning`
    : `<span class="chip">no red-eye</span> ${esc(rv.why)}`;
  const exists=state.routes.find(r=>r.o===o&&r.d===d);
  box.innerHTML=`<b>${o}–${d}</b> ${esc(AP[d][0])}, ${esc(cityOf(d))} · <b>${fmt(nm)} nm</b> `
    +`(${fmt(nm*SM)} sm) · block on ${t} <b>${(blk(o,d,t)/60).toFixed(2)} h</b> · `
    +(ok.length?`in range for ${ok.join(", ")}`:`<span class="chip bad">no gauge in your fleet can make this</span>`)
    +(nm>SPEC[t].rng?` · <span class="chip bad">${t} is ${fmt(nm-SPEC[t].rng)} nm short</span>`:"")
    +(exists?` · <span class="chip warn">this route already exists — adding will merge into it</span>`:"")
    +`<br>${redLine}`;
  const rb=$("#nRedWrap");
  if(rb){ rb.hidden=!rv.ok; $("#nRedLbl").textContent = rv.ok ? `${rv.from}→${rv.to}` : ""; }
}
$("#btnAdd").onclick=()=>{ $("#addRow").hidden=false; $("#nD").focus(); addInfo(); };
$("#btnAddCancel").onclick=()=>{ $("#addRow").hidden=true; addDest=null; $("#nD").value=""; };
$("#nO").onchange=addInfo; $("#nT").onchange=addInfo;
const acBox=el("div",{class:"aclist"}); acBox.hidden=true; $("#nD").parentElement.appendChild(acBox);
$("#nD").addEventListener("input",()=>{
  const q=$("#nD").value.trim().toUpperCase(); addDest=null; addInfo();
  if(q.length<2){ acBox.hidden=true; return; }
  const hits=[];
  for(const c in AP){ const a=AP[c];
    if(c===q){ hits.unshift([c,a]); continue; }
    if(hits.length<60 && (c.startsWith(q)||a[1].toUpperCase().startsWith(q)||a[0].toUpperCase().includes(q))) hits.push([c,a]); }
  acBox.innerHTML=hits.slice(0,9).map(([c,a])=>
    `<div data-code="${c}"><span class="c">${c}</span>${esc(a[0])} <span class="dim">· ${esc(tc(a[1]))}, ${esc(a[5]==="United States"?"US":a[5])}</span></div>`).join("");
  acBox.hidden=!hits.length;
});
acBox.addEventListener("mousedown",e=>{
  const div=e.target.closest("[data-code]"); if(!div) return;
  addDest=div.dataset.code; $("#nD").value=addDest+" — "+AP[addDest][0];
  acBox.hidden=true; addInfo();
});
$("#nD").addEventListener("blur",()=>setTimeout(()=>{acBox.hidden=true;},150));
$("#btnAddGo").onclick=()=>{
  const o=$("#nO").value, d=addDest, t=$("#nT").value;
  const n=Math.max(1,Math.round(+$("#nN").value||1)), w=Math.max(1,Math.min(7,Math.round(+$("#nW").value||7)));
  if(!d||!AP[d]){ toast("Pick a destination airport from the list"); return; }
  if(d===o){ toast("Origin and destination are the same airport"); return; }
  const ex=state.routes.find(r=>r.o===o&&r.d===d);
  const wantRed=$("#nRed").checked && !$("#nRedWrap").hidden;
  if(ex){ ex.mix[t]=(+ex.mix[t]||0)+n; ex.dow=w; if(wantRed) ex.red=1; }
  else state.routes.push(Object.assign({o,d,dow:w,mix:{[t]:n}}, wantRed?{red:1}:{}));
  if(STA.includes(d)){                       // trunk: mirror the other direction
    const back=state.routes.find(r=>r.o===d&&r.d===o);
    if(back){ back.mix[t]=(+back.mix[t]||0)+n; back.dow=w; }
    else state.routes.push({o:d,d:o,dow:w,mix:{[t]:n}});
  }
  state.routes.sort((a,b)=> a.o<b.o?-1:a.o>b.o?1:(a.d<b.d?-1:1));
  addDest=null; $("#nD").value=""; $("#nRed").checked=false; $("#addRow").hidden=true;
  M=build(); save(); draw(); toast("Added "+o+"–"+d+" · "+n+"× "+t);
};

/* ----- export / import state ----- */
(function(){
  let DL=null, DB=null;
  // guard() runs its function immediately and is sync-only; these handlers are
  // async, so they need a wrapper that returns a function and catches rejections.
  const safe = fn => (...a) => Promise.resolve().then(()=>fn(...a)).catch(err=>{
    console.error(err); toast("Something went wrong — "+((err&&err.message)||err)); });
  if(window.claude && claude.use){
    claude.use("downloads").then(d=>{DL=d;}).catch(()=>{});
    claude.use("db").then(d=>{ DB=d; if(d) $("#btnBackup").hidden=false; }).catch(()=>{});
  }
  const stamp = () => new Date().toISOString().slice(0,10);

  $("#btnExport").onclick = safe(async ()=>{
    const json = JSON.stringify(exportState(), null, 1);
    if(DL){
      try{ await DL.save({filename:"network-"+stamp()+".json", data:json});
           toast("Exported "+Math.round(json.length/1024)+" KB"); return; }
      catch(e){ if(e && e.code==="declined"){ toast("Export cancelled"); return; } }
    }
    // no download surface in this view — fall back to the clipboard
    try{ await navigator.clipboard.writeText(json);
         toast("Copied "+Math.round(json.length/1024)+" KB of state to the clipboard"); }
    catch(e){ toast("Couldn't export — no download or clipboard access in this view"); }
  });

  $("#btnImport").onclick = ()=> $("#fileImport").click();
  $("#fileImport").onchange = safe(async (ev)=>{
    const f = ev.target.files && ev.target.files[0]; if(!f) return;
    let r;
    try{ r = importState(await f.text()); }
    catch(err){ toast("Import failed — "+(err.message||err)); ev.target.value=""; return; }
    ev.target.value="";
    toast(r.want && r.diff.length
      ? "Imported, but "+r.diff.length+" metric"+(r.diff.length>1?"s":"")+" differ: "+r.diff.join(", ")
      : "Imported — "+fmt(r.got.routes)+" routes, "+fmt(r.got.tails)+" rotations");
  });

  $("#btnBackup").onclick = safe(async ()=>{
    if(!DB) return;
    const b=$("#btnBackup"); b.disabled=true; b.textContent="Backing up…";
    try{
      const snap = exportState();
      await DB.doc("state/current").set(snap);
      await DB.doc("state/"+Date.now()).set(snap);
      toast("Backed up — this state can now be recovered from outside the page");
    }catch(e){ toast("Backup failed — "+((e&&e.message)||e)); }
    b.disabled=false; b.textContent="Back up";
  });
})();

/* ----- save to artifact ----- */
(async()=>{
  const art = window.claude && claude.use ? await claude.use("artifact") : null;
  if(!art) return;
  const b=$("#btnSave"); b.hidden=false;
  b.onclick=async()=>{
    b.disabled=true; b.textContent="Saving…";
    try{
      const payload=JSON.stringify({airports:AP,routes:state.routes,stations:STA,demand:RAW.demand}).replace(/<\//g,"<\\/");
      if(RAW.demand && payload.indexOf('"demand"')<0) throw new Error("payload lost demand data — refusing to save");
      const src = PRISTINE || pageSource();
      if(src.indexOf('id="geo"')<0 || src.indexOf("function drawMap")<0)
        throw new Error("page source incomplete — refusing to publish a truncated document");
      const next=src.replace(/(<script type="application\/json" id="net">)[\s\S]*?(<\/script>)/, (m,a,c)=>a+payload+c);
      await art.publish(next);
      toast("Network saved — this is now the version everyone opens");
    }catch(err){
      toast(err && err.code==="conflict" ? "Someone else saved first — reload to see their version" : "Couldn't save this version");
    }
    b.disabled=false; b.textContent="Save network";
  };
})();

