/* ---------- events ---------- */
function guard(fn){                                   // never let one bad interaction kill the page
  try { fn(); }
  catch(err){
    reportError(err, "guard");
    toast("Something went wrong applying that change. It was rolled back. " +
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
$("#schedModeList").addEventListener("click", ()=>{ schedMode="list"; drawSched(); });
$("#schedModeBanks").addEventListener("click", ()=>{ schedMode="banks"; drawSched(); });
$("#btnAirline").addEventListener("click", ()=>{
  airlineOpen = !airlineOpen; drawAirline();
  if(airlineOpen){ const f=$("#alName"); if(f) f.focus(); }
});
$("#btnHelp").addEventListener("click", ()=>{ dismissHint(true); goTab("model"); });

/* A single line pointing at Help, shown only to someone who has never opened it.
   Not a tour and not a modal: the picker has already taken one full screen of
   this person's attention, and spending another on chrome would be rude. It
   disappears for good the moment they either read it or dismiss it. */
function hintSeen(){ try{ return localStorage.getItem("anp-hint") === "1"; }catch(e){ return true; } }
function dismissHint(seen){
  try{ if(seen) localStorage.setItem("anp-hint","1"); }catch(e){}
  const h = $("#firstHint"); if(h){ h.hidden = true; h.innerHTML = ""; }
}
function drawHint(){
  const h = $("#firstHint"); if(!h || hintSeen()) return;
  h.hidden = false;
  h.innerHTML = `<div class="hintbar"><span>New here? <b>Getting started</b> has three things to `
    + `try, and the Glossary explains the words.</span>`
    + `<button class="btn sm" data-hint="open">Open Help</button>`
    + `<button class="btn sm" data-hint="close" aria-label="Dismiss">Dismiss</button></div>`;
}
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
    if(b && b.dataset && b.dataset.hint){
    dismissHint(true); if(b.dataset.hint === "open") goTab("model"); return;
  }
  if(b && b.dataset && b.dataset.fit){ const g=$("#nT"); if(g){ g.value=b.dataset.fit; addInfo(); } return; }
  if(b && b.dataset && b.dataset.bank){ bankStation = b.dataset.bank; drawBanks(); return; }
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
      fn(); M=build(); save(); draw(); toast("Applied. Schedule rebuilt"); });
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
      if(!found){ out.textContent=`no single swap among ${Math.min(30,cands.length)} candidates clears it. You would need another ${f.t}`; return; }
      const {t,after,tails}=found;
      out.innerHTML=`<b>${t.r.o}–${t.r.d}: ${f.t} → ${t.g.t}</b> · shortfall ${now} → ${after}, fleet ${fmt(M.totals.tails)} → ${fmt(tails)} `
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
/* Replacing the whole network, in one place.

   Several paths swap every route, station and aircraft type at once: the first-
   run picker, Revert to baseline, Import state, Undo. Each one was doing its own
   sequence of applyStationConfig / syncFeedModes / reconcileGeom / build / save /
   fillSelects / draw, and each one remembered a different subset. Revert forgot
   fillSelects, so the Add route dropdowns kept offering the PREVIOUS network's
   stations and gauges while the table below showed the new routes.

   The steps are order-dependent and there is no reason for four copies of them.
   Anything that replaces the network calls this. */
function swapNetwork(mutate, label){
  if(label) pushUndo(label);
  mutate();
  applyStationConfig(state);
  if(typeof syncFeedModes === "function") syncFeedModes();
  if(typeof reconcileGeom === "function") reconcileGeom(state.fleet);
  applyBrand();
  M = build();
  save();
  fillSelects();                      // stations and gauges, or the form lies
  draw();
  if(typeof markCommitted === "function") markCommitted();
  if(typeof paintUndo === "function") paintUndo();
}

$("#btnReset").onclick=()=>{
  if(!confirm("Discard your edits and return to the baseline network?")) return;
  swapNetwork(() => { state = baseline(); }, "revert to baseline");
  toast("Reverted to the baseline network");
};
$("#btnCopy").onclick=async()=>{
  const lines=["origin,dest,destination_name,days_per_week,"+TYPES.join(",")+",flights_per_day,distance_nm,red_eye"];
  for(const r of state.routes){ const n=TYPES.reduce((a,x)=>a+(+r.mix[x]||0),0);
    lines.push([r.o,r.d,'"'+(AP[r.d]?AP[r.d][0]:r.d)+'"',r.dow||7,...TYPES.map(x=>+r.mix[x]||0),n,Math.round(dist(r.o,r.d)),r.red?1:0].join(",")); }
  try{ await navigator.clipboard.writeText(lines.join("\n")); toast("Routes copied. Paste them back into the chat to rebuild the workbook"); }
  catch(err){ toast("Couldn't reach the clipboard. Try again after clicking the page"); }
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
/* Is this route worth flying?

   The form answered "can this aircraft physically reach it" and stopped. That
   is the easy half. Everything needed for the other half is already here:
   demandOf() gives passengers and an average fare with provenance, and
   econFlightCost() gives the direct cost of a departure. The Grow tab does this
   arithmetic for markets you do NOT serve; the one place you are actually
   deciding had none of it.

   It informs and does not block. Flying a thin route on purpose is a real
   strategy — feed, presence, a base you are building toward — so the job is to
   say what you are choosing, not to argue.

   A measured number and an estimate are marked differently on purpose. A
   confident-looking contribution built on the gravity model is exactly the
   quiet substitution this project keeps refusing to make. */
function routeVerdict(o, d, t, freq){
  const A = routeAnalysis(o, d, t, freq);
  return A ? verdictHTML(A) : "";   // the quick read alone; addInfo adds the network
}

/* The numbers behind the verdict, kept apart from how they are drawn. */
function routeAnalysis(o, d, t, freq){
  if(!SPEC[t] || !AP[o] || !AP[d]) return null;
  const dem = demandOf(o, d);
  const nm = dist(o, d), seats = SPEC[t].seats || 0;
  const adding = seats * (freq || 1);

  /* Already flying this market changes the question. What matters is what the
     market looks like afterwards: a second daily on a route already turning
     people away is a different decision from one on a route flying half empty. */
  const cur = (state.routes || []).find(r => (r.o===o && r.d===d) || (r.o===d && r.d===o));
  let already = 0; const curDesc = [];
  if(cur){
    for(const x of TYPES){
      const n = +cur.mix[x] || 0;
      if(!n || !SPEC[x]) continue;
      already += (SPEC[x].seats || 0) * n;
      curDesc.push(`${n} × ${x}`);
    }
  }
  const offered = already + adding;
  const A = {o, d, t, nm, seats, offered, already, curDesc, real: !!dem.real, has: !!dem.v};
  if(!dem.v) return A;

  // Demand is a market total in both directions; a departure carries one way.
  const each = dem.v / 2;
  A.each = each;
  A.lf = offered ? Math.min(1, each / offered) : 0;
  A.spilled = Math.max(0, each - offered);

  if(already){
    A.lfBefore = Math.min(1, each / already);
    A.spillBefore = Math.max(0, each - already);
  }

  const fare = dem.fare || (typeof FARE_FIT !== "undefined" ? FARE_FIT.a * Math.pow(nm, FARE_FIT.b) : null);
  const cost = econFlightCost(t, blk(o, d, t) / 60);
  if(fare && cost){
    // Carried passengers, not demand. On a market already served, price the
    // ADDITION: pricing the whole market would credit this decision with revenue
    // the existing flights already earn. Direct cost only, before ownership and
    // overhead, so this is contribution and never "profit".
    const gained = Math.min(each, offered) - Math.min(each, already);
    A.gained = gained * 2;
    A.rev = gained * fare * 2;
    A.cost = cost.direct * 2 * (freq || 1);
    A.contrib = A.rev - A.cost;
  }

  // Which of your fleet fits the demand best, in range.
  const fits = TYPES.filter(x => SPEC[x] && nm <= SPEC[x].rng && SPEC[x].seats)
    .map(x => ({t:x, seats:SPEC[x].seats, gap:Math.abs(SPEC[x].seats - each)}))
    .sort((a, b) => a.gap - b.gap);
  if(fits.length && fits[0].t !== t && Math.abs(fits[0].seats - each) < Math.abs(seats - each) * 0.7)
    A.fit = fits[0];

  A.opened = (typeof connectionsOpened === "function") ? connectionsOpened(o, d) : null;
  A.hubNoConn = !(A.opened && A.opened.markets)
    && (ROLE[o] === "Hub" || ROLE[o] === "Focus") && (state.routes || []).length > 2;
  return A;
}

const moneyK = n => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if(a >= 1e6) return `${s}$${(a/1e6).toFixed(1)}m`;
  if(a >= 1e4) return `${s}$${(a/1e3).toFixed(1)}k`;
  return s + "$" + fmt(Math.round(a));
};
const durHM = min => `${Math.floor(min/60)}h${String(Math.round(min)%60).padStart(2,"0")}`;

/* Answer first, then the three numbers that decide it, then the one picture that
   puts local and connecting traffic on the same axis. Colour comes from the
   money, so a healthy side-signal never paints a losing route green. */
/* The quick read: what the route looks like on its own, from its own demand and
   cost. Returned as parts so the panel can put the network answer on top once it
   arrives, and keep these numbers underneath as the explanation. */
function quickVerdict(A){
  if(!A.has)
    return {tone: "warn", head: "No demand estimate",
            why: [`Nothing in the data reaches this market, so the planner can't say whether anyone wants it.`]};
  const pct = x => `${Math.round(x * 100)}%`;
  const hasMoney = A.contrib != null;
  const tone = hasMoney
    ? (A.contrib < 0 ? "bad" : A.lf < 0.5 ? "warn" : "ok")
    : (A.lf < 0.5 ? "warn" : "ok");

  let head;
  if(hasMoney && A.contrib < 0) head = `Loses about ${money(Math.round(-A.contrib / 100) * 100)} a day on its own`;
  else if(hasMoney && tone === "warn") head = `Covers its direct cost on its own, but flies ${pct(A.lf)} full`;
  else if(hasMoney) head = `Earns about ${money(Math.round(A.contrib / 100) * 100)} a day on its own`;
  else head = tone === "warn" ? `Flies ${pct(A.lf)} full` : `Fills ${pct(A.lf)} of the seats`;

  const why = [];
  if(A.already){
    if(A.spillBefore > A.spilled + 0.5)
      why.push(`Soaks up spill: you turn away ${fmt(Math.round(A.spillBefore))} a day now, `
        + `${fmt(Math.round(A.spilled))} after.`);
    else if(A.lfBefore > 0.55 && A.lf < 0.45)
      why.push(`Dilutes the market: ${pct(A.lfBefore)} full today, ${pct(A.lf)} after this.`);
  }
  if(!why.length){
    if(A.spilled >= 1) why.push(`More people want it than you'd seat.`);
    else if(A.lf < 0.2) why.push(`Almost no local demand.`);
    else if(A.lf < 0.5) why.push(`Local demand fills under half the seats.`);
  }
  if(A.hubNoConn)
    why.push(`Nothing connects through ${esc(A.o)} to ${esc(A.d)}, so it earns only its own traffic.`);
  return {tone, head, why};
}

function bannerHTML(v, extra){
  const icon = v.tone === "bad" ? "▲" : v.tone === "warn" ? "●" : v.tone === "ok" ? "✓" : "…";
  const why = (v.why || []).join(" ");
  return `<div class="rv-banner ${v.tone}"><span class="rv-icon" aria-hidden="true">${icon}</span><div>`
    + (v.label ? `<div class="rv-label">${v.label}</div>` : "")
    + `<div class="rv-head">${v.head}</div>`
    + (why ? `<div class="rv-why">${why}</div>` : "")
    + (extra || "") + `</div></div>`;
}

/* net: undefined when no check applies, "pending" while it runs, or a result. */
function verdictHTML(A, net){
  const q = quickVerdict(A);
  const pending = net === "pending";
  const R = net && net !== "pending" ? net : null;

  let banner;
  if(R && !R.err) banner = bannerHTML(netBanner(R));
  else if(pending)
    banner = bannerHTML({tone: "pending", label: "First look, this route on its own",
      head: q.head, why: q.why},
      `<div class="rv-checking">Checking against your network…</div>`);
  else banner = bannerHTML(q, R && R.err ? `<div class="rv-why">${esc(R.err)}</div>` : "");

  if(!A.has) return banner + (R && !R.err ? netBreakdown(R, A) : "");

  const pct = x => `${Math.round(x * 100)}%`;
  const lfTone = A.lf < 0.5 ? " bad" : "";
  const seatsNote = A.already
    ? `${fmt(A.already)} → ${fmt(A.offered)} seats each way`
    : `${fmt(A.offered)} seats each way`;
  const third = net === undefined
    ? (A.contrib != null
        ? `<div class="rv-m"><div class="rv-l">On its own</div>`
          + `<div class="rv-v${A.contrib < 0 ? " bad" : ""}">${A.contrib < 0 ? "" : "+"}${moneyK(A.contrib)}</div>`
          + `<div class="rv-n">${moneyK(A.rev)} rev · ${moneyK(A.cost)} direct cost</div></div>`
        : `<div class="rv-m"><div class="rv-l">On its own</div><div class="rv-v dim">—</div>`
          + `<div class="rv-n">no fare or cost basis</div></div>`)
    : netAircraftCard(R, pending);
  const metrics = `<div class="rv-metrics">`
    + `<div class="rv-m"><div class="rv-l">Local demand</div>`
      + `<div class="rv-v">${fmt(Math.round(A.each))}<small>/day</small></div>`
      + `<div class="rv-n${A.real ? "" : " warn"}">${A.real ? "Measured, DB1C"
          : "Estimated, often off 7×"}</div></div>`
    + `<div class="rv-m"><div class="rv-l">Load factor</div>`
      + `<div class="rv-v${lfTone}">${pct(A.lf)}</div>`
      + `<div class="rv-n">${A.spilled >= 1 ? `turns away ${fmt(Math.round(A.spilled))} a day` : seatsNote}</div></div>`
    + third + `</div>`;

  // Local and connecting traffic on one axis. The connecting part is a ceiling:
  // the whole market, before competition or timing, so it is hatched and says so.
  const op = A.opened && A.opened.markets ? A.opened : null;
  // The bar shows how full the route is, which the network verdict says nothing
  // about, so it is drawn neutral rather than in the verdict's colour.
  const tone = "local";
  const localW = A.lf * 100;
  const connW = op ? Math.max(0, Math.min(100 - localW, op.each / A.offered * 100)) : 0;
  const more = op ? op.markets - op.top.length : 0;
  const bar = `<div class="rv-bar-wrap">`
    + `<div class="rv-bar-h"><span>Seats filled, per direction</span><span>${fmt(A.offered)} seats</span></div>`
    + `<div class="rv-bar" role="img" aria-label="Local ${pct(A.lf)}`
      + (op ? `, connecting ceiling ${Math.round(connW)}% more` : "") + `">`
      + `<div class="rv-local ${tone}" style="width:${localW.toFixed(1)}%"></div>`
      + (connW ? `<div class="rv-conn" style="width:${connW.toFixed(1)}%"></div>` : "")
    + `</div>`
    + `<div class="rv-legend"><span><i class="rv-sw ${tone}"></i>Local ${fmt(Math.round(A.each))}</span>`
    + (op ? `<span><i class="rv-sw conn"></i>Connecting ceiling ${fmt(Math.round(op.each))}, via `
        + op.top.map(x => esc(x.s)).join(", ")
        + (more > 0 ? ` and ${fmt(more)} more` : "") + `</span>` : "")
    + `</div></div>`;

  // A downgauge nudge on a route that already pays and fills is noise.
  // Judged on the route's own economics: a network loss from cannibalisation is
  // not a sign the aircraft is the wrong size.
  const good = q.tone === "ok";
  const showFit = A.fit && !(good && A.fit.seats < A.seats);
  const fit = showFit
    ? `<div class="rv-fit">A ${A.fit.seats < A.seats ? "smaller" : "larger"} gauge fits `
      + `demand of ${fmt(Math.round(A.each))} a day better. `
      + `<button class="btn sm" data-fit="${esc(A.fit.t)}">Try ${esc(A.fit.t)}, ${fmt(A.fit.seats)} seats</button></div>`
    : "";

  return banner + metrics + bar + fit + (R && !R.err ? netBreakdown(R, A) : "");
}

function addInfo(){
  const o=$("#nO").value, d=addDest;
  const box=$("#addInfo");
  if(!d||!AP[d]){ box.innerHTML='<span class="dim">Pick a destination to see distance, block time and whether the route is worth flying.</span>'; return; }
  const nm=dist(o,d), t=$("#nT").value;
  const ok=TYPES.filter(x=>nm<=SPEC[x].rng);
  const rv=redeyeInfo(o,d,t);
  const exists=state.routes.find(r=>(r.o===o&&r.d===d)||(r.o===d&&r.d===o));
  const short = SPEC[t] && nm > SPEC[t].rng;
  // Set the overnight option's visibility first: the form values read it.
  const rb=$("#nRedWrap");
  if(rb){ rb.hidden=!rv.ok; $("#nRedLbl").textContent = rv.ok ? `${rv.from}→${rv.to}` : ""; }

  const header = `<div class="rv-title"><span class="rv-pair">${esc(o)} → ${esc(d)}</span>`
    + `<span class="rv-sub">${esc(AP[d][0])}, ${esc(cityOf(d))} · ${fmt(nm)} nm · `
    + `${durHM(blk(o,d,t))} on ${esc(t)}</span></div>`;

  // Things that stop the route outright come before any verdict.
  let body;
  if(!ok.length)
    body = `<div class="rv-banner bad"><span class="rv-icon" aria-hidden="true">▲</span><div>`
      + `<div class="rv-head">Out of range for your whole fleet</div>`
      + `<div class="rv-why">${fmt(nm)} nm is beyond every type you fly.</div></div></div>`;
  else if(short)
    body = `<div class="rv-banner bad"><span class="rv-icon" aria-hidden="true">▲</span><div>`
      + `<div class="rv-head">${esc(t)} can't make it</div>`
      + `<div class="rv-why">${fmt(nm - SPEC[t].rng)} nm short. In range: ${esc(ok.join(", "))}.</div>`
      + `</div></div>`
      + `<div class="rv-fit"><button class="btn sm" data-fit="${esc(ok[0])}">Try ${esc(ok[0])}</button></div>`;
  else {
    // The quick read shows at once; the network check follows when typing stops,
    // and its answer becomes the verdict.
    const a = addFormValues();
    const A = routeAnalysis(o, d, t, a.n);
    const R = netCached(a);
    if(!R) scheduleNetCheck(a);
    body = A ? verdictHTML(A, R || "pending") : "";
  }
  const details = `<details class="rv-details"><summary>Route details`
    + ` <span class="dim">in range for ${fmt(ok.length)} type${ok.length===1?"":"s"}</span></summary>`
    + `<div>${fmt(nm)} nm (${fmt(nm*SM)} statute miles), block ${durHM(blk(o,d,t))} on ${esc(t)}.<br>`
    + `In range: ${ok.length ? esc(ok.join(", ")) : "none of your fleet"}.`
    + (exists ? `<br>You already fly this market, so adding merges into it.` : "")
    + (rv.ok ? "" : `<br>No red-eye: ${esc(rv.why)}.`)
    + `</div></details>`;
  const red = rv.ok
    ? `<span class="rv-red">Red-eye viable, ${hhmm(rv.dep)} to ${hhmm(rv.arr)}</span>` : "";

  // Keep the details panel open across the re-render that the check triggers.
  const wasOpen = !!(box.querySelector(".rv-details") || {}).open;
  const howOpen = !!(box.querySelector(".nc-how") || {}).open;
  box.innerHTML = `<div class="rv-card">${header}${body}`
    + `<div class="rv-foot">${details}${red}</div></div>`;
  if(wasOpen) box.querySelector(".rv-details").open = true;
  if(howOpen && box.querySelector(".nc-how")) box.querySelector(".nc-how").open = true;
}
$("#btnAdd").onclick=()=>{ $("#addRow").hidden=false; $("#nD").focus(); addInfo(); };
$("#btnAddCancel").onclick=()=>{ $("#addRow").hidden=true; addDest=null; $("#nD").value=""; };
$("#nO").onchange=addInfo; $("#nT").onchange=addInfo;
if($("#nN")) $("#nN").addEventListener("input", addInfo);
if($("#nW")) $("#nW").addEventListener("input", addInfo);
if($("#nRed")) $("#nRed").addEventListener("change", addInfo);   // seats offered move with frequency
/* Airport typeahead, shared.

   This was written once for the Add route destination and nowhere else, so the
   Add a station field was a bare text box that expected you to know the code.
   Two fields asking for the same thing should behave the same way.

   `onPick` receives the code. `exclude` hides airports that would be pointless
   to offer, such as stations you already have. */
function attachAirportAC(input, onPick, exclude){
  if(!input || input.dataset.acWired) return;
  input.dataset.acWired = "1";
  const box = el("div", {class:"aclist"}); box.hidden = true;
  (input.parentElement || input).appendChild(box);
  const skip = exclude || (() => false);
  input.addEventListener("input", () => {
    const q = input.value.trim().toUpperCase();
    if(q.length < 2){ box.hidden = true; return; }
    const hits = [];
    for(const c in AP){
      if(skip(c)) continue;
      const a = AP[c];
      if(c === q){ hits.unshift([c, a]); continue; }
      if(hits.length < 60 && (c.startsWith(q) || a[1].toUpperCase().startsWith(q)
                              || a[0].toUpperCase().includes(q))) hits.push([c, a]);
    }
    box.innerHTML = hits.slice(0, 9).map(([c, a]) =>
      `<div data-code="${c}"><span class="c">${c}</span>${esc(a[0])} `
      + `<span class="dim">· ${esc(tc(a[1]))}, ${esc(a[5] === "United States" ? "US" : a[5])}</span></div>`
    ).join("");
    box.hidden = !hits.length;
  });
  box.addEventListener("mousedown", ev => {
    const div = ev.target.closest("[data-code]"); if(!div) return;
    box.hidden = true;
    onPick(div.dataset.code, input);
  });
  input.addEventListener("blur", () => setTimeout(() => { box.hidden = true; }, 150));
  return box;
}

attachAirportAC($("#nD"), (code, input) => {
  addDest = code; input.value = code + " — " + AP[code][0]; addInfo();
});
$("#nD").addEventListener("input", () => { addDest = null; addInfo(); });
$("#btnAddGo").onclick=()=>{
  const a=addFormValues();
  if(!a.d||!AP[a.d]){ toast("Pick a destination airport from the list"); return; }
  if(a.d===a.o){ toast("Origin and destination are the same airport"); return; }
  applyAddRoute(state.routes, a);
  const {o, d, t, n}=a;
  addDest=null; $("#nD").value=""; $("#nRed").checked=false; $("#addRow").hidden=true;
  clearTimeout(netTimer);
  M=build(); save(); draw(); toast("Added "+o+"–"+d+" · "+n+"× "+t);
};

/* ----- export / import state ----- */
(function(){
  let DL=null, DB=null;
  // guard() runs its function immediately and is sync-only; these handlers are
  // async, so they need a wrapper that returns a function and catches rejections.
  const safe = fn => (...a) => Promise.resolve().then(()=>fn(...a)).catch(err=>{
    console.error(err); toast("Something went wrong. "+((err&&err.message)||err)); });
  if(window.claude && claude.use){
    claude.use("downloads").then(d=>{DL=d;}).catch(()=>{});
    claude.use("db").then(d=>{ DB=d; const bb=$("#btnBackup"); if(d && bb) bb.hidden=false; }).catch(()=>{});
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
      + `what to use if downloads are blocked here. Import state takes a paste.</div></div>`;
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
        "If no file appeared, this view blocks downloads. Use Copy to clipboard instead.";
    });
    $("#btnCopyState").onclick = safe(async ()=>{
      try{ await navigator.clipboard.writeText(json);
           h.hidden = true; toast(`Copied ${kb} KB. Paste it into Import state`); }
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
      swapNetwork(() => importState(parsed), "import");
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
    catch(err){ toast("Import failed. "+(err.message||err)); ev.target.value=""; return; }
    ev.target.value="";
    toast(r.want && r.diff.length
      ? "Imported, but "+r.diff.length+" metric"+(r.diff.length>1?"s":"")+" differ: "+r.diff.join(", ")
      : "Imported "+fmt(r.got.routes)+" routes, "+fmt(r.got.tails)+" rotations");
  });

  // The header is rearranged from time to time; a control that is not in this
// build should not stop the page booting.
if($("#btnBackup")) $("#btnBackup").onclick = safe(async ()=>{
    if(!DB) return;
    const b=$("#btnBackup"); b.disabled=true; b.textContent="Backing up…";
    try{
      const snap = exportState();
      await DB.doc("state/current").set(snap);
      await DB.doc("state/"+Date.now()).set(snap);
      toast("Backed up. This state can now be recovered from outside the page");
    }catch(e){ toast("Backup failed. "+((e&&e.message)||e)); }
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
      if(RAW.demand && payload.indexOf('"demand"')<0) throw new Error("payload lost demand data, so refusing to save");
      const src = PRISTINE || pageSource();
      // A truncated self-publish once shipped a dead artifact, and a save that
      // dropped the demand block once emptied the Grow tab. Check for every
      // block the page cannot run without, not just the ones that broke before.
      for(const need of ['id="geo"', 'id="cfg"', 'id="fleet"', "function drawMap", "function build("])
        if(src.indexOf(need)<0)
          throw new Error("page source is missing "+need+", so refusing to publish a broken document");
      const next=src.replace(/(<script type="application\/json" id="net">)[\s\S]*?(<\/script>)/, (m,a,c)=>a+payload+c);
      await art.publish(next);
      toast("Network saved. This is now the version everyone opens");
    }catch(err){
      toast(err && err.code==="conflict" ? "Someone else saved first. Reload to see their version" : "Couldn't save this version");
    }
    b.disabled=false; b.textContent="Save network";
  };
})();

