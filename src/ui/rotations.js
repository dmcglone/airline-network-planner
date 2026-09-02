/* ----- rotations ----- */
function drawRot(){
  const q=$("#rq").value.trim().toUpperCase(), fs=$("#rStation").value, ft=$("#rType").value;
  const rows=M.rots.filter(r=>{
    if(fs&&r.base!==fs) return false;
    if(ft&&r.t!==ft) return false;
    if(!q) return true;
    return (r.id+r.ron+r.path).toUpperCase().includes(q);
  });
  $("#rotCount").textContent = fmt(rows.length)+" of "+fmt(M.rots.length)+" rotations";
  const t=$("#tRot");
  t.innerHTML="<thead><tr><th>Rotation</th><th>Base</th><th>Gauge</th><th class='r'>Legs</th><th class='r'>Block</th>"
    +"<th class='r'>Duty span</th><th class='r'>Ground</th><th class='r'>vs target</th><th class='r'>First dep</th>"
    +"<th class='r'>Last arr</th><th>Overnights at</th><th>Routing</th></tr></thead>";
  const tb=el("tbody");
  tb.innerHTML = rows.slice(0,500).map(r=>{
    const u=r.block/(SPEC[r.t].util||1);
    const cls = u>1.08?"warn":u<0.75?"":"ok";
    return `<tr><td class="mono">${r.id}</td><td class="code">${r.base}</td><td>${r.t}</td>`
    +`<td class="num">${r.legs}</td><td class="num">${r.block.toFixed(2)}</td>`
    +`<td class="num">${r.span.toFixed(2)}</td><td class="num">${(r.span-r.block).toFixed(2)}</td>`
    +`<td class="num"><span class="chip ${cls}">${Math.round(u*100)}%</span></td>`
    +`<td class="num">${hhmm(r.first)}</td><td class="num">${hhmm(r.last)}</td>`
    +`<td class="code">${r.ron}</td><td class="mono dim">${r.path}</td></tr>`; }).join("");
  t.appendChild(tb);
}
