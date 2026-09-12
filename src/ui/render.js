/* ---------- render ---------- */
let M = null;
const $ = s => document.querySelector(s);
const el = (tag,attrs,html) => { const e=document.createElement(tag);
  if(attrs) for(const k in attrs){ if(k==="class") e.className=attrs[k]; else e.setAttribute(k,attrs[k]); }
  if(html!=null) e.innerHTML=html; return e; };
const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const tc = s => String(s).replace(/([A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ']*)/g,(m,a,b)=>a.toUpperCase()+b.toLowerCase());
const cityOf = a => AP[a] ? (tc(AP[a][1])+", "+(AP[a][5]==="United States"?"US":AP[a][5])) : "";
const cityName = a => AP[a] ? tc(AP[a][1]) : a;

/* Tabs are working surfaces. Checks is a status readout and already has a
   header metric, Model is documentation and Airline is configuration -- none of
   them belongs in this bar, so they live on the header instead. The gaps group
   what is left by what it is for: decide the network, see the day it produces,
   judge the result. */
const TABS=[["network","Network"],["map","Map"],["suggest","Suggestions"],["gap"],
            ["schedule","Schedule"],["rot","Rotations"],["board","Board"],["stations","Stations"],["gap"],
            ["fleet","Fleet"],["econ","Economics"]];
let tab="network";
/* Somewhere to send people from outside the bar -- the Checks metric, a link. */
function goTab(id){
  tab=id; drawTabs();
  ALL_PANES.forEach(x=>{ const p=$("#pane-"+x); if(p) p.hidden = x!==id; });
  draw();
}
const ALL_PANES=["network","map","board","schedule","rot","stations","fleet","econ","suggest","checks","model"];
function drawTabs(){
  const c=$("#tabs"); c.innerHTML="";
  TABS.forEach(([id,label])=>{
    if(id==="gap"){ c.appendChild(el("span",{class:"tabgap","aria-hidden":"true"})); return; }
    const b=el("button",{class:"tab",role:"tab","aria-selected":String(tab===id)},esc(label));
    b.onclick=()=>goTab(id);
    c.appendChild(b);
  });
}
function drawKpis(){
  const T=M.totals, bad=failCount();
  const dPin=T.totalFleet-T.pinned;
  const R=M.feedStats?M.feedStats.redeyes:0;
  const items=[["Daily flights",fmt(T.deps),"", R?fmt(R)+" fly overnight":"no red-eyes"],
    ["Aircraft rotations",fmt(T.tails),"",""],
    ["Fleet required",fmt(T.totalFleet),"", dPin===0?"level with baseline":(dPin>0?"+":"")+fmt(dPin)+" vs baseline"],
    ["Fleet roster",fmt(T.roster),"",""],
    ["Surplus",(T.surplus>0?"+":"")+fmt(T.surplus),"", T.surplus<0?fmt(T.shortRots)+" rotations unflown":"aircraft spare"],
    ["Block hours/day",fmt(T.blockHrs),"",""],
    ["Daily ASMs",fmt(T.asm/1e6,1),"m",""],["Peak gates",fmt(T.gates),"",""],
    ["Routes",fmt(T.routes),"",""],["Checks failing",String(bad),"",""]];
  $("#kpis").innerHTML=items.map(([k,v,u,note],i)=>{
    const flag=(i===9&&bad>0)||(i===4&&T.surplus<0)||(i===2&&dPin>0);
    const go=i===9?` data-goto="checks" title="Open the schedule integrity checks"`:"";
    return `<div class="kpi${flag?" flag":""}${i===9?" clickable":""}"${go}><div class="k">${esc(k)}</div>`
      +`<div class="v">${v}${u?`<small>${u}</small>`:""}</div>`
      +(note?`<div class="knote">${esc(note)}</div>`:"")+`</div>`;}).join("");
}
function failCount(){ const c=M.checks;
  return [c.unflown,c.extra,c.brkSpace,c.brkGround,c.open,c.brkNight,c.brkSpan,c.imb,c.curfew,c.rangeBad.length].filter(x=>x>0).length; }
