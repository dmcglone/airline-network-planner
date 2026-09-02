/* ----- checks ----- */
function drawChecks(){
  const c=M.checks, T=M.totals;
  // src/validate.js re-derives all ten checks from the finished schedule. If it
  // ever disagrees with the engine's own counters, one of them is wrong and the
  // green ticks below cannot be trusted — say so loudly rather than quietly.
  let parity=[]; try{ parity=checkParity(M); }catch(err){ console.error(err); }
  const rows=[["Every required leg is flown exactly once",c.unflown,"legs unflown or double-flown"],
    ["No leg flown that the network does not require",c.extra,"extra legs"],
    ["Rotations continuous in space",c.brkSpace,"breaks"],
    ["Minimum turn time respected on every ground stop",c.brkGround,"violations"],
    ["Every rotation returns its aircraft to its start",c.open,"open rotations"],
    ["Overnight ground time sufficient to repeat daily",c.brkNight,"violations"],
    ["No rotation exceeds 24 hours",c.brkSpan,"violations"],
    ["Departures equal arrivals at every airport",c.imb,"imbalanced airports"],
    ["SJC departure curfew 06:00–23:00 respected",c.curfew,"violations"],
    ["No leg exceeds its aircraft's range",c.rangeBad.length,"legs over range"]];
  let h=rows.map(([t,n,u])=>`<div class="checkrow"><span class="t">${esc(t)}</span>`
    +`<span class="mono dim">${n===0?"0 "+u:fmt(n)+" "+u}</span>`
    +`<span class="chip ${n===0?"ok":"bad"}">${n===0?"PASS":"FAIL"}</span></div>`).join("");
  if(c.rangeBad.length) h+=`<p class="note" style="margin-top:12px"><b>Over range:</b> `
    + c.rangeBad.slice(0,12).map(r=>`${r.o}–${r.d} on ${r.t} (${fmt(r.nm)} nm vs ${fmt(r.rng)})`).join("; ")
    + (c.rangeBad.length>12?` and ${c.rangeBad.length-12} more`:"") + `. Change the gauge on the Network tab, or raise the type's range on the Fleet tab.</p>`;
  const F=M.feedStats;
  h+=`<p class="note" style="margin-top:12px"><b>Departure spacing:</b> ${F.tight} same-market pairs depart within 40 minutes of each other; `
   + `${F.nightOdd} short flights sit outside 05:30–23:30; ${F.noAft} spoke cities with three or more departures have nothing after 15:00. `
   + `${F.redeyes} true red-eyes operate (depart 21:00–23:00, land 05:00–09:00). `
   + `Adjust under Schedule strategy on the Fleet tab.</p>`;
  h+=`<p class="note" style="margin-top:12px"><b>Bank feed:</b> ${F.fed} of ${F.planned} planned spokes got an overnight aircraft; `
   + `${F.early} of ${F.spokes} spoke cities now depart before 07:00. `
   + (F.late ? `${F.late} still have no departure before 09:00: ` + F.lateList.join(", ")
             + `. Most are once-daily long-haul or Caribbean turns where the aircraft flies out and back the same day — switching on RDU and DEN under Bank feed strategy picks up several of the rest.`
             : `Every spoke has a morning departure.`) + `</p>`;
  if(M.rebal.length) h+=`<p class="note" style="margin-top:12px"><b>Auto-balanced ${M.rebal.length} station-pair direction${M.rebal.length===1?"":"s"}:</b> `
    + M.rebal.slice(0,10).map(r=>`${r.a}–${r.b} ${r.t} (${r.na} vs ${r.nb} → ${r.n})`).join("; ")
    + (M.rebal.length>10?` and ${M.rebal.length-10} more`:"")
    + `. A turn is flown by one aircraft, so both directions of a station pair must carry the same gauge and frequency. The larger side wins.</p>`;
  $("#checks").innerHTML=(parity.length ? `<div class="note" style="border-left:3px solid var(--bad);padding:8px 12px;margin-bottom:10px"><b>Validator disagrees with the engine</b> — these results are not trustworthy until this is resolved: ${esc(parity.join("; "))}</div>` : "") + h;
  const shape=[["Flights on the design day",fmt(T.deps),"Monday 8 June 2026"],
    ["Aircraft rotations",fmt(T.tails),"Each is one tail's full day"],
    ["Average legs per aircraft",(T.deps/(T.tails||1)).toFixed(1),"Narrowbody productivity"],
    ["Airports served",fmt(T.airports),"Origins and destinations"],
    ["Airports hosting an overnight aircraft",fmt(T.ron),"Enables early departures from spokes"],
    ["Flights arriving the next calendar day",fmt(T.nextDay),"Late transcons and Latin America"],
    ["Flights operating fewer than 7 days a week",fmt(T.subDaily),"From the days-per-week column"],
    ["Peak gates across all 8 stations",fmt(T.gates),"Check against gates actually available"],
    ["Stub rotations consolidated",fmt(T.merged),"Short rotations folded into gaps in other aircraft's days"]];
  $("#shape").innerHTML=shape.map(([k,v,n])=>
    `<div><div class="k mono" style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)">${esc(k)}</div>`
    +`<div style="font-family:var(--disp);font-size:26px;font-weight:600;font-variant-numeric:tabular-nums">${v}</div>`
    +`<div class="note" style="margin-top:2px">${esc(n)}</div></div>`).join("");
}

function sgCard(x){
  return `<div class="sg ${x.sev||""}"><h4>${x.title}</h4><div class="why">${x.why}</div>`
    + (x.action?`<div class="act"><b>${x.action}</b><span class="imp">${x.impact||""}</span>`
        + (x.apply?`<button class="btn sm" data-apply="${x._i}">Apply</button>`:"")
    + (x.search?`<button class="btn sm" data-search="${x._i}">Search</button><span class="imp" id="sr${x._i}"></span>`:"")+`</div>`:"")
    + (x.options?x.options.map((o,j)=>`<div class="opt"><span class="m">${o.txt}</span>`
        + `<button class="btn sm" data-apply="${x._i}" data-opt="${j}">Add</button></div>`).join(""):"")
    + `</div>`;
}
let SUGG=[];
function drawSuggest(){
  const src=demandSource(), meta=DEMAND_SOURCES[src];
  $("#demSel").innerHTML=Object.keys(DEMAND_SOURCES).map(k=>
    `<option value="${k}"${src===k?" selected":""}>${esc(DEMAND_SOURCES[k].label)}</option>`).join("");
  const rows=demandRows();
  $("#demNote").innerHTML=esc(meta.note)+(rows?` <b>${fmt(Object.keys(rows).length)} markets loaded.</b>`:"");
  $("#btnClearDem").hidden=!rows;
  SUGG=[];
  const fix=suggestFix(), fill=suggestFill(), grow=suggestGrow();
  [...fix,...fill].forEach(x=>{ x._i=SUGG.length; SUGG.push(x); });
  $("#sFix").innerHTML=fix.length?fix.map(sgCard).join("")
    :`<p class="note">Nothing to fix — every gauge is covered, no leg is out of range, and no rotation is stranded.</p>`;
  $("#sFill").innerHTML=fill.length?fill.map(sgCard).join("")
    :`<p class="note">No under-used rotations with a route that fits their idle window.</p>`;
  if(!grow.length && !Object.keys(DEM.size||{}).length){
    $("#sGrow").innerHTML=`<p class="note"><b>No demand data in this version of the page.</b> Grow ranks unserved markets by passenger demand, and this build's data block has no demand table — so it has nothing to rank. Reload the latest published version, or paste your own market data in the box above.</p>`;
    return;
  }
  $("#sGrow").innerHTML=`<p class="note">Ranked by ${src==="gravity"?"modelled":"imported"} demand (${demandUnit()}), ranked on market revenue where real fares exist, within range of a gauge you fly, at least ${MIN_SUGG_NM} nm so the route competes with airlines rather than with driving. Cities already served from that station are excluded. <b>US destinations only</b> — the demand model is calibrated on US scheduled service, so it has nothing reliable to say about international markets.</p><div class="growgrid">`
    + grow.map(g=>{
        const items=g.items.map(o=>{ const i=SUGG.length; SUGG.push({apply:o.apply});
          return `<div class="opt"><span><span class="m">${o.txt}</span><br><span class="dim" style="font-size:11.5px">${o.sub}</span></span>`
               + `<button class="btn sm" data-apply="${i}">Add</button></div>`; }).join("");
        return `<div class="sg"><h4>From ${g.base}</h4>${items}</div>`; }).join("")
    + `</div>`;
}
function draw(){
  drawKpis();
  if(tab==="network") drawRoutes();
  else if(tab==="schedule") drawSched();
  else if(tab==="rot") drawRot();
  else if(tab==="stations") drawStations();
  else if(tab==="fleet") drawFleet();
  else if(tab==="suggest") drawSuggest();
  else if(tab==="map"){ drawMap(); requestAnimationFrame(()=>{restyle(); drawPlanes();}); }
  else if(tab==="suggest") drawSuggest();
  else if(tab==="board") drawBoard();
  else drawChecks();
}
let pending=null;
function rebuild(){
  clearTimeout(pending);
  pending=setTimeout(()=>guard(()=>{ M=build(); save(); draw(); }), 120);
}
