/* ----- rotations ----- */
let rotMode = "timeline";

/* The rotations the filters and sort select, shared by both views. */
function rotRows(){
  const q=$("#rq").value.trim().toUpperCase(), fs=$("#rStation").value, ft=$("#rType").value;
  const so=($("#rSort")||{}).value||"";
  let rows=M.rots.filter(r=>{
    if(fs&&r.base!==fs) return false;
    if(ft&&r.t!==ft) return false;
    if(!q) return true;
    return (r.id+r.ron+r.path).toUpperCase().includes(q);
  });
  const use=r=>r.block/((SPEC[r.t]&&SPEC[r.t].util)||11);
  if(so==="idle") rows=rows.slice().sort((a,b)=>use(a)-use(b));
  else if(so==="ron") rows=rows.slice().sort((a,b)=>a.ron<b.ron?-1:a.ron>b.ron?1:a.first-b.first);
  return rows;
}

function drawRot(){
  const tl=rotMode==="timeline";
  $("#rotModeTime").classList.toggle("on", tl);
  $("#rotModeTable").classList.toggle("on", !tl);
  $("#rotTimeline").hidden=!tl;
  $("#rotTableWrap").hidden=tl;
  if(tl) drawRotTimeline(); else drawRotTable();
}

function drawRotTable(){
  const rows=rotRows();
  $("#rotCount").textContent = fmt(rows.length)+" of "+fmt(M.rots.length)+" rotations";
  const t=$("#tRot");
  t.innerHTML="<thead><tr><th>Rotation</th><th>Base</th><th>Gauge</th><th class='r'>Legs</th><th class='r'>Block</th>"
    +"<th class='r'>Duty span</th><th class='r'>Ground</th><th class='r'>vs target</th><th class='r'>First dep</th>"
    +"<th class='r'>Last arr</th><th>Overnights at</th><th>Routing</th></tr></thead>";
  const tb=el("tbody");
  tb.innerHTML = rows.slice(0,500).map(r=>{
    const u=r.block/(SPEC[r.t].util||1);
    // The problem worth colouring is an idle aircraft. Flying past the target is
    // information, not a fault: the target is a planning norm, not a limit.
    const cls = u<0.40?"bad":u<0.75?"warn":u>1.08?"":"ok";
    const tip = u<0.40?"Stranded: under 40% of this type's target, see Fill on the Suggestions tab"
              : u<0.75?"Under-used: well short of this type's daily target"
              : u>1.08?"Flying more than this type's daily target" : "Close to this type's daily target";
    return `<tr><td class="mono">${r.id}</td><td class="code">${r.base}</td><td>${r.t}</td>`
    +`<td class="num">${r.legs}</td><td class="num">${hrsHM(r.block)}</td>`
    +`<td class="num">${hrsHM(r.span)}</td><td class="num">${hrsHM(r.span-r.block)}</td>`
    +`<td class="num"><span class="chip ${cls}" title="${tip}">${Math.round(u*100)}%</span></td>`
    +`<td class="num">${hhmm(r.first)}</td><td class="num">${hhmm(r.last)}</td>`
    +`<td class="code">${r.ron}</td><td class="mono dim">${r.path}</td></tr>`; }).join("");
  t.appendChild(tb);
}
