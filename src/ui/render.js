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

const TABS=[["network","Network"],["map","Map"],["board","Board"],["schedule","Schedule"],["rot","Rotations"],["stations","Stations"],["fleet","Fleet"],["suggest","Suggestions"],["checks","Checks"]];
let tab="network";
function drawTabs(){
  const c=$("#tabs"); c.innerHTML="";
  TABS.forEach(([id,label])=>{
    const b=el("button",{class:"tab",role:"tab","aria-selected":String(tab===id)},esc(label));
    b.onclick=()=>{ tab=id; drawTabs(); TABS.forEach(([x])=>$("#pane-"+x).hidden = x!==id); draw(); };
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
    return `<div class="kpi${flag?" flag":""}"><div class="k">${esc(k)}</div>`
      +`<div class="v">${v}${u?`<small>${u}</small>`:""}</div>`
      +(note?`<div class="knote">${esc(note)}</div>`:"")+`</div>`;}).join("");
}
function failCount(){ const c=M.checks;
  return [c.unflown,c.extra,c.brkSpace,c.brkGround,c.open,c.brkNight,c.brkSpan,c.imb,c.curfew,c.rangeBad.length].filter(x=>x>0).length; }
