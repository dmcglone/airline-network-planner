/* ================= AIRPORT BOARD ================= */
let boardAp="PHL", boardTick=null;
function nowAt(ap){ const d=new Date();
  return mod(d.getUTCHours()*60+d.getUTCMinutes()+off(ap),1440); }
function delayOf(f){                       // deterministic, opt-in
  if(!$("#bIrr").checked) return 0;
  const h=(f.fn*2654435761 ^ f.dep*40503)>>>0;
  const r=h%100;
  if(r<62) return 0;
  if(r<86) return 5+(h>>7)%20;
  if(r<96) return 25+(h>>11)%40;
  return 65+(h>>13)%55;
}
function statusDep(t,now,del){
  const d=mod(t+del-now,1440);
  if(del>=15 && d>2) return ["late","Delayed "+hhmm(t+del)];
  if(d>1380) return ["past","Departed"];
  if(d<=15) return ["brd","Final call"];
  if(d<=45) return ["brd","Boarding"];
  if(d<=120) return ["go","On time"];
  return ["","Scheduled"];
}
function statusArr(t,now,del){
  const d=mod(t+del-now,1440);
  if(del>=15 && d>2) return ["late","Delayed "+hhmm(t+del)];
  if(d>1380) return ["past","Landed"];
  if(d<=25) return ["brd","Landing"];
  if(d<=150) return ["go","En route"];
  return ["","Scheduled"];
}
function boardRows(list,now,when,key){
  const rows=list.slice();
  if(when==="now") rows.sort((a,b)=>mod(a[key]-now,1440)-mod(b[key]-now,1440));
  else rows.sort((a,b)=>a[key]-b[key]);
  return rows;
}
function drawBoard(){
  const ap=boardAp;
  if(!M.apStats[ap]){ $("#apsum").innerHTML=`<div class="note">${esc(BRAND.possessive)} does not serve <b>${esc(ap)}</b> in the current network. Pick another airport, or add a route to it on the Network tab.</div>`;
    $("#fidsDep").innerHTML=""; $("#fidsArr").innerHTML=""; return; }
  const when=$("#bWhen").value, now=nowAt(ap);
  const deps=M.flights.filter(f=>f.o===ap), arrs=M.flights.filter(f=>f.d===ap);
  const A=AP[ap];
  const gauges=[...new Set(deps.concat(arrs).map(f=>f.t))].sort((a,b)=>TYPES.indexOf(a)-TYPES.indexOf(b));
  const cities=new Set(deps.map(f=>f.d).concat(arrs.map(f=>f.o)));
  const seatsOut=deps.reduce((a,f)=>a+SPEC[f.t].seats,0);
  $("#apsum").innerHTML=[["Airport",`${ap} · ${cityName(ap)}`],["Departures",fmt(deps.length)],["Arrivals",fmt(arrs.length)],
    ["Gates in use",fmt(M.gateCount[ap]||0)],["Seats out",fmt(seatsOut)],["Cities served",fmt(cities.size)],
    ["Gauges",gauges.join(" ")],["Local time",hhmm(now)]]
    .map(([k,v])=>`<div><div class="k">${esc(k)}</div><div class="v">${esc(String(v))}</div></div>`).join("");

  const dep=boardRows(deps,now,when,"dep"), arr=boardRows(arrs,now,when,"arr");
  const mk=(title,rows,isDep)=>{
    const head=`<div class="fhead"><h3>${title}</h3><span class="clk">${ap} · ${hhmm(now)}</span></div>`;
    if(!rows.length) return `<div class="fids-inner">${head}<div class="empty">No movements.</div></div>`;
    const body=rows.map(f=>{
      const t=isDep?f.dep:f.arr, del=delayOf(f);
      const [cls,txt]=isDep?statusDep(t,now,del):statusArr(t,now,del);
      const other=isDep?f.d:f.o, oa=AP[other];
      return `<tr><td class="t">${hhmm(t)}${del?`<div class="sub" style="color:#FF7A6B">${hhmm(t+del)}</div>`:""}</td>`
        +`<td class="t">FR ${f.fn}</td>`
        +`<td><span class="city">${esc(oa?cityName(other):other)}</span> <span class="sub">${other}</span>`
        +`<div class="sub">${esc(oa?oa[0]:"")}</div></td>`
        +`<td class="gate">${isDep?f.gDep:f.gArr||"—"}</td>`
        +`<td>${f.t}<div class="sub">${SPEC[f.t].seats} seats</div></td>`
        +`<td class="st ${cls}">${esc(txt)}${f.dow<7?`<div class="sub">${f.dow} days/wk</div>`:""}</td></tr>`;
    }).join("");
    return head+`<div class="fscroll"><table><thead><tr><th>Time</th><th>Flight</th>`
      +`<th>${isDep?"Destination":"Origin"}</th><th>Gate</th><th>Aircraft</th><th>Status</th></tr></thead>`
      +`<tbody>${body}</tbody></table></div>`;
  };
  $("#fidsDep").innerHTML=mk("Departures",dep,true);
  $("#fidsArr").innerHTML=mk("Arrivals",arr,false);
  clearInterval(boardTick);
  boardTick=setInterval(()=>{ if(tab==="board") drawBoard(); }, 30000);
}
/* board picker */
(function(){
  const inp=$("#bAp"), box=el("div",{class:"aclist"}); box.hidden=true; inp.parentElement.appendChild(box);
  inp.addEventListener("input",()=>{
    const q=inp.value.trim().toUpperCase();
    if(q.length<2){ box.hidden=true; return; }
    const served=Object.keys(M.apStats);
    const hits=served.filter(c=>{const a=AP[c]; return c.startsWith(q)||a[1].toUpperCase().startsWith(q)||a[0].toUpperCase().includes(q);})
      .sort((a,b)=>(M.apStats[b].dep+M.apStats[b].arr)-(M.apStats[a].dep+M.apStats[a].arr)).slice(0,9);
    box.innerHTML=hits.map(c=>`<div data-code="${c}"><span class="c">${c}</span>${esc(AP[c][0])} <span class="dim">· ${esc(cityName(c))} · ${M.apStats[c].dep+M.apStats[c].arr} movements</span></div>`).join("");
    box.hidden=!hits.length;
  });
  box.addEventListener("mousedown",e=>{ const d=e.target.closest("[data-code]"); if(!d) return;
    boardAp=d.dataset.code; inp.value=boardAp+" — "+AP[boardAp][0]; box.hidden=true; drawBoard(); });
  inp.addEventListener("blur",()=>setTimeout(()=>{box.hidden=true;},150));
  $("#bWhen").onchange=drawBoard; $("#bIrr").onchange=drawBoard;
  $("#mStation").onchange=()=>{drawMap(); requestAnimationFrame(()=>{restyle(); drawPlanes();});};
  $("#mType").onchange=()=>{drawMap(); requestAnimationFrame(()=>{restyle(); drawPlanes();});}; $("#mLab").onchange=()=>drawMap();
})();
