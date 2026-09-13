/* ---------- events ---------- */
function guard(fn){                                   // never let one bad interaction kill the page
  try { fn(); }
  catch(err){
    reportError(err, "guard");
    toast("Something went wrong applying that change — it was rolled back. " +
          "Press the Model tab for what this tool does and does not do.");
    try { state=load(); M=build(); draw(); } catch(e2){ console.error(e2); }
  }
}
/* Errors used to go to the console and nowhere else, which means a stranger
   hitting a crash produces no signal anybody will ever see: "it works for me"
   becomes the only available evidence.

   The report is deliberately thin — message, where it happened, and which tab
   was open. No state, because a network is the user's and may be identifying,
   and nothing at all unless an endpoint is configured. If none is set, the
   fallback is to make the error copyable so a person can send it if they care
   enough, which is a great deal better than silence. */
let lastErrText = "", errSent = 0;
function reportError(err, where){
  const msg = (err && (err.stack || err.message)) || String(err);
  lastErrText = `${where}: ${msg}\n  tab=${typeof tab!=="undefined"?tab:"?"}`
              + `\n  routes=${(state&&state.routes||[]).length} types=${(state&&state.fleet||[]).length}`
              + `\n  ${navigator.userAgent}`;
  console.error(where, err);
  const url = (typeof CFG!=="undefined" && CFG.errorEndpoint) || "";
  if(url && errSent < 5){                       // a loop must not become a flood
    errSent++;
    try{
      navigator.sendBeacon(url, new Blob([JSON.stringify({
        message: String(msg).slice(0,1200), where,
        tab: typeof tab!=="undefined"?tab:null,
        routes: (state&&state.routes||[]).length,
        ua: navigator.userAgent, at: new Date().toISOString()
      })], {type:"application/json"}));
    }catch(e){}
  }
}
window.addEventListener("error", ev => reportError(ev.error || ev.message, "window"));
window.addEventListener("unhandledrejection", ev => reportError(ev.reason, "promise"));
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
  if(typeof stationEvent==="function" && stationEvent(t)) return;
  if(typeof smEvent==="function" && smEvent(t)) return;
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
$("#btnUndo").addEventListener("click", doUndo);
$("#btnRedo").addEventListener("click", doRedo);
$("#btnStartOver") && $("#btnStartOver").addEventListener("click", ()=>{ welcomeOpen=true; drawWelcome(); });
$("#btnShare").addEventListener("click", ()=>{ doShare(); });
$("#btnAirline").addEventListener("click", ()=>{
  airlineOpen = !airlineOpen; drawAirline();
  if(airlineOpen){ const f=$("#alName"); if(f) f.focus(); }
});
$("#btnHelp").addEventListener("click", ()=>goTab("model"));
document.addEventListener("click", e=>{
  const k = e.target.closest && e.target.closest("[data-goto]");
  if(k) goTab(k.dataset.goto);
});
$("#btnAddType").addEventListener("click", ()=>{
  // The form lives on the seatmap, because designing the cabin is the next
  // thing you do after creating a type.
  smAdding = true; smErr = "";
  if(typeof drawSeatmap==="function") drawSeatmap();
  const p = $("#seatmapPanel"); if(p) p.scrollIntoView({behavior:"smooth", block:"start"});
});
document.addEventListener("click", e=>{
  // Only buttons. Running smEvent on a <select> redraws the panel underneath an
  // open dropdown, which closes it the instant you click — selects and inputs
  // are handled by the input/change listeners instead.
  if(!/^(SELECT|INPUT|TEXTAREA|OPTION)$/.test(e.target.tagName)){
    const b = e.target.closest("button")||e.target;
    if(b && b.dataset && b.dataset.gloss){ showGlossTerm(b.dataset.gloss); return; }
  if(b && b.dataset && b.dataset.help){ helpSection = b.dataset.help; drawModel(); return; }
  if(typeof welcomeEvent==="function" && welcomeEvent(b)) return;
    if(typeof stationEvent==="function" && stationEvent(b)) return;
    if(typeof smEvent==="function" && smEvent(b)) return;
  }
  const d=e.target.dataset && e.target.dataset.del;
  if(d!==undefined && d!==null && d!==""){
    const i=+d, r=state.routes[i];
    if(r && confirm("Remove "+r.o+"–"+r.d+" from the network?")){ state.routes.splice(i,1); M=build(); save(); draw(); }
  }
});
function toast(msg){
  const t=el("div",{class:"toast"},esc(msg)); document.body.appendChild(t);
  setTimeout(()=>t.remove(),2600);
  // Every confirmation in this app arrived only as a floating div, so a screen
  // reader heard nothing at all. Mirror it into the live region.
  const lr=$("#live");
  if(lr){ lr.textContent=""; setTimeout(()=>{ lr.textContent=msg; }, 30); }
}

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
  if(e.target.id==="btnImportDemand"){ const b=$("#importBox"); b.hidden=!b.hidden; }
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
$("#btnReset").onclick=()=>{
  if(!confirm("Discard your edits and return to the baseline network?")) return;
  pushUndo("revert to baseline");          // a full wipe is the thing you most want back
  state=baseline(); applyStationConfig(state); applyBrand();
  M=build(); save(); draw(); toast("Reverted to the baseline network");
};
$("#btnCopy").onclick=async()=>{
  const lines=["origin,dest,destination_name,days_per_week,"+TYPES.join(",")+",flights_per_day,distance_nm,red_eye"];
  for(const r of state.routes){ const n=TYPES.reduce((a,x)=>a+(+r.mix[x]||0),0);
    lines.push([r.o,r.d,'"'+(AP[r.d]?AP[r.d][0]:r.d)+'"',r.dow||7,...TYPES.map(x=>+r.mix[x]||0),n,Math.round(dist(r.o,r.d)),r.red?1:0].join(",")); }
  try{ await navigator.clipboard.writeText(lines.join("\n")); toast("Routes copied — paste them back into the chat to rebuild the workbook"); }
  catch(err){ toast("Couldn't reach the clipboard — try again after clicking the page"); }
};

/* ----- add route ----- */
let addDest=null;
/* Populate every station and gauge dropdown.

   This ran once at boot, so a fleet type added later never appeared in the Add
   route gauge list or in any of the four gauge filters — you could own the
   aircraft and still not be able to put it on a route. It now runs on every
   rebuild, and preserves whatever the user had selected so that refreshing the
   options does not quietly reset their filters. */
function fillSelects(){
  const keep = {};
  for(const id of ["nO","nT","fStation","sStation","rStation","fType",
                   "mStation","mType","sType","rType"]){
    const el = $("#"+id); if(el) keep[id] = el.value;
  }
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
  for(const id in keep){
    const el = $("#"+id); if(!el) continue;
    // only restore a value the new option set still offers -- a deleted type
    // must not linger as a filter nobody can clear
    if([...el.options].some(o=>o.value===keep[id])) el.value = keep[id];
  }
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

  /* Save the network as a file.

     Three surfaces, tried in order. DL is the Artifact tool's download API and
     only exists there. Everywhere else — including the deployed site — a Blob
     and an <a download> is the ordinary browser way to save a file, and it was
     simply missing: the code fell straight from DL to the clipboard, so on the
     real website Export quietly produced a clipboard copy rather than a file.
     The clipboard stays as the last resort, for a sandboxed frame that refuses
     downloads. */
  function downloadJson(json, filename){
    try{
      const url = URL.createObjectURL(new Blob([json], {type:"application/json"}));
      const a = el("a", {href:url, download:filename});
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 4000);
      return true;
    }catch(e){ return false; }
  }

  /* Export offers the choice rather than guessing.

     A chain of fallbacks looked tidier, but it cannot tell whether it worked: a
     sandboxed frame blocks the download silently, the anchor click throws
     nothing, and the code cheerfully reports "Saved". Asking is both honest and
     symmetric with Import, which offers a file and a paste box for the same
     reason. */
  $("#btnExport").onclick = safe(()=>{
    const h = $("#stateExport");
    h.hidden = !h.hidden;
    if(h.hidden) return;
    const json = JSON.stringify(exportState(), null, 1);
    const kb = Math.round(json.length/1024);
    const name = `${(state.brand||"network").replace(/[^A-Za-z0-9]+/g,"-").toLowerCase()}-${stamp()}.json`;
    h.innerHTML =
        `<div class="pad" style="border-top:1px solid var(--line-2)">`
      + `<div class="mkt" style="gap:9px;flex-wrap:wrap;align-items:center">`
      + `<b>${esc(name)}</b><span class="dim">${kb} KB</span>`
      + `<button class="btn sm" id="btnDlState">Download</button>`
      + `<button class="btn sm" id="btnCopyState">Copy to clipboard</button>`
      + `<button class="btn sm" id="btnCloseExport">Close</button></div>`
      + `<div class="dim" id="exportStatus" style="font-size:12.5px;margin-top:6px">`
      + `Download saves a file. Copy puts the same JSON on the clipboard, which is `
      + `what to use if downloads are blocked here — Import state takes a paste.</div></div>`;
    $("#btnCloseExport").onclick = ()=>{ h.hidden = true; };
    $("#btnDlState").onclick = safe(async ()=>{
      if(DL){
        try{ await DL.save({filename:name, data:json});
             h.hidden = true; toast("Exported "+kb+" KB"); return; }
        catch(err){ if(err && err.code==="declined"){ toast("Export cancelled"); return; } }
      }
      const url = URL.createObjectURL(new Blob([json], {type:"application/json"}));
      const a = el("a", {href:url, download:name});
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 4000);
      $("#exportStatus").textContent =
        "If no file appeared, this view blocks downloads — use Copy to clipboard instead.";
    });
    $("#btnCopyState").onclick = safe(async ()=>{
      try{ await navigator.clipboard.writeText(json);
           h.hidden = true; toast(`Copied ${kb} KB — paste it into Import state`); }
      catch(err){ $("#exportStatus").textContent =
           "The clipboard is not available here. Use Download, or Share for a link."; }
    });
  });

/* Import used to be a file picker and nothing else, while Export falls back to
   the clipboard whenever there is no download surface — a published artifact, a
   preview frame. So in exactly the view where Export gives you JSON on the
   clipboard, Import could not read it. Offer both, always. */
function drawStateImport(){
  const host = $("#stateImport"); if(!host) return;
  host.innerHTML =
      `<div class="pad" style="border-top:1px solid var(--line-2)">`
    + `<div class="mkt" style="gap:9px;flex-wrap:wrap;align-items:center">`
    + `<button class="btn sm" id="btnPickFile">Choose a file…</button>`
    + `<span class="dim" style="font-size:12.5px">or paste the JSON you exported:</span>`
    + `<button class="btn sm" id="btnPasteState">Load pasted state</button>`
    + `<button class="btn sm" id="btnCancelImport">Cancel</button></div>`
    + `<textarea id="stateJson" rows="4" spellcheck="false" placeholder='{"state":{...}}'`
    + ` style="width:100%;margin-top:9px;font-family:var(--mono);font-size:12px"></textarea>`
    + `<div class="dim" id="importStatus" style="font-size:12.5px;margin-top:6px"></div></div>`;
  $("#btnPickFile").onclick = ()=> $("#fileImport").click();
  $("#btnCancelImport").onclick = ()=>{ $("#stateImport").hidden = true; };
  $("#btnPasteState").onclick = safe(()=>{
    const txt = ($("#stateJson").value || "").trim();
    if(!txt){ $("#importStatus").textContent = "Nothing pasted."; return; }
    let parsed; try{ parsed = JSON.parse(txt); }
    catch(err){ $("#importStatus").textContent = "That is not valid JSON."; return; }
    try{
      pushUndo("import");
      importState(parsed);
      M = build(); save();
      if(typeof fillSelects === "function") fillSelects();
      draw(); markCommitted(); paintUndo();
      $("#stateImport").hidden = true;
      toast(`Imported ${state.routes.length} routes`);
    }catch(err){ $("#importStatus").textContent = String(err.message || err); }
  });
}
$("#btnImport").onclick = ()=>{
  const h = $("#stateImport");
  h.hidden = !h.hidden;
  if(!h.hidden){ drawStateImport(); const f = $("#stateJson"); if(f) f.focus(); }
};
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
      // A truncated self-publish once shipped a dead artifact, and a save that
      // dropped the demand block once emptied the Grow tab. Check for every
      // block the page cannot run without, not just the ones that broke before.
      for(const need of ['id="geo"', 'id="cfg"', 'id="fleet"', "function drawMap", "function build("])
        if(src.indexOf(need)<0)
          throw new Error("page source is missing "+need+" — refusing to publish a broken document");
      const next=src.replace(/(<script type="application\/json" id="net">)[\s\S]*?(<\/script>)/, (m,a,c)=>a+payload+c);
      await art.publish(next);
      toast("Network saved — this is now the version everyone opens");
    }catch(err){
      toast(err && err.code==="conflict" ? "Someone else saved first — reload to see their version" : "Couldn't save this version");
    }
    b.disabled=false; b.textContent="Save network";
  };
})();

