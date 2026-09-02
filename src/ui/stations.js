/* ----- stations ----- */
function drawStations(){
  const g=$("#stnGrid"); g.innerHTML="";
  for(const s of M.stations){
    const mx=Math.max(1,...s.D,...s.A);
    const bars=s.D.map((_,h)=>`<span class="hr" title="${String(h).padStart(2,"0")}:00 — ${s.D[h]} dep, ${s.A[h]} arr, ${s.G[h]} on ground">`
      +`<i class="d" style="height:${(s.D[h]/mx*36).toFixed(1)}px"></i>`
      +`<i style="height:${(s.A[h]/mx*36).toFixed(1)}px"></i></span>`).join("");
    const roleCls = s.role==="Hub"?"hub":s.role==="Focus"?"focus":"";
    g.appendChild(el("div",{class:"stn"},
      `<h3><span class="code">${s.code}</span> <span class="chip ${roleCls}">${ROLE_LABEL[s.role]}</span></h3>
       <div class="meta"><span>${esc(s.name)}</span></div>
       <div class="meta"><span>Departures <b>${fmt(s.deps)}</b></span><span>Destinations <b>${fmt(s.dests)}</b></span>
         <span>Peak gates <b>${fmt(s.gates)}</b></span><span>Based <b>${fmt(s.based)}</b></span>
         <span>Avg stage <b>${fmt(s.stage)}</b> nm</span><span>Seats/day <b>${fmt(s.seats)}</b></span></div>
       <div class="chart">${bars}</div>
       <div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>`));
  }
}
