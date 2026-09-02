/* ----- network tab ----- */
function redCell(r,i){
  const typ=TYPES.find(t=>+r.mix[t]>0)||"A319";
  const v=redeyeInfo(r.o,r.d,typ);
  if(!v.ok) return `<span class="dim" title="${esc(v.why)}">—</span>`;
  const keys=new Set(state.routes.map(x=>x.o+"|"+x.d));
  const carrier = r.o===v.from || !keys.has(v.from+"|"+v.to);
  if(!carrier) return `<span class="dim" title="The overnight direction is ${v.from}→${v.to}; tick it on that row.">${v.from}→${v.to}</span>`;
  return `<label style="display:flex;gap:5px;align-items:center;white-space:nowrap;cursor:pointer" title="Departs ${hhmm(v.dep)}, lands ${hhmm(v.arr)} next morning">`
    + `<input type="checkbox" data-red="${i}"${r.red?" checked":""}>`
    + `<span class="mono" style="font-size:11px">${v.from}→${v.to} ${hhmm(v.dep)}</span></label>`;
}
function drawRoutes(){
  const q=$("#q").value.trim().toUpperCase(), fs=$("#fStation").value, ft=$("#fType").value, fr=$("#fRed").value;
  const rows=state.routes.filter(r=>{
    if(fs&&r.o!==fs) return false;
    if(ft&&!(+r.mix[ft]>0)) return false;
    if(fr==="on" && !r.red) return false;
    if(fr==="ok" && !redeyeInfo(r.o,r.d,TYPES.find(t=>+r.mix[t]>0)||"A319").ok) return false;
    if(!q) return true;
    return (r.o+r.d+(AP[r.d]?AP[r.d][0]+AP[r.d][1]+AP[r.d][5]:"")).toUpperCase().includes(q);
  });
  $("#routeCount").textContent = rows.length+" of "+state.routes.length+" routes shown";
  const t=$("#tRoutes");
  t.innerHTML = "<thead><tr><th>From</th><th>To</th><th class='r'>Distance</th>"
    + TYPES.map(x=>`<th class='r'>${x}</th>`).join("")
    + "<th class='r'>Flights/day</th><th class='r'>Demand</th><th>Season</th><th class='r'>Days/wk</th><th>Red-eye</th><th></th></tr></thead>";
  const tb=el("tbody");
  for(const r of rows){
    const i=state.routes.indexOf(r), nm=dist(r.o,r.d), n=TYPES.reduce((a,x)=>a+(+r.mix[x]||0),0);
    const dd=demandOf(r.o,r.d), sc=seasonCurve(dd.season);
    const over=TYPES.some(x=>(+r.mix[x]||0)>0 && nm>SPEC[x].rng);
    const tr=el("tr");
    tr.innerHTML = `<td><span class="code">${r.o}</span> <span class="chip ${ROLE[r.o]==="Hub"?"hub":ROLE[r.o]==="Focus"?"focus":""}">${ROLE_SHORT[ROLE[r.o]]}</span></td>`
      + `<td><span class="code apn" title="${esc((AP[r.d]?AP[r.d][0]:r.d)+" · "+cityOf(r.d))}">${r.d}</span>${STA.includes(r.d)?' <span class="chip">trunk</span>':""}</td>`
      + `<td class="num">${fmt(nm)} nm${over?' <span class="chip bad">range</span>':""}</td>`
      + TYPES.map(x=>`<td class="num"><input type="number" min="0" max="30" data-i="${i}" data-t="${x}" value="${+r.mix[x]||""}"></td>`).join("")
      + `<td class="num"><b>${n}</b></td>`
      + `<td class="num">${dd.v>0?fmt(dd.v)+(dd.real?"":"*"):"—"}</td>`
      + `<td class="mono" style="font-size:13px" title="${sc?`Jul 2025 → May 2026 · peak ${sc.peak} ${sc.peakX.toFixed(1)}×, trough ${sc.trough} ${sc.troughX.toFixed(1)}×`:"no monthly data"}">${sc?sc.spark:""}</td>`
      + `<td class="num"><input type="number" min="1" max="7" data-i="${i}" data-w="1" value="${r.dow||7}"></td>`
      + `<td>${redCell(r,i)}</td>`
      + `<td><button class="iconbtn" data-del="${i}" title="Remove route">&times;</button></td>`;
    tb.appendChild(tr);
  }
  t.appendChild(tb);
}
