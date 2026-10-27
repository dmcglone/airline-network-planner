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

/* The gaps group the tabs by what they are for: decide the network, see the day
   it produces, judge the money, then check, configure and read up. Each group is
   drawn as one unit, so a narrow window wraps between groups rather than inside
   one. Settings is a tab and nothing else: the header scrolls away, the tab bar
   stays. */
const TABS=[["network","Network"],["map","Map"],["suggest","Suggestions"],["gap"],
            ["schedule","Schedule"],["rot","Rotations"],["board","Board"],["stations","Stations"],["gap"],
            ["fleet","Fleet"],["econ","Economics"],["gap"],["checks","Checks"],["settings","Settings"],["model","Help"]];
let tab="network";
/* Somewhere to send people from outside the bar -- the Checks metric, a link. */
function goTab(id){
  tab=id; drawTabs();
  const t=$("#tab-"+id); if(t && document.activeElement && document.activeElement.classList
     && document.activeElement.classList.contains("tab")) t.focus();
  ALL_PANES.forEach(x=>{ const p=$("#pane-"+x); if(p) p.hidden = x!==id; });
  draw();
}
const ALL_PANES=["network","map","board","schedule","rot","stations","fleet","econ","suggest","checks","settings","model"];
/* A tablist is a single tab stop: Tab moves past it, arrows move within it.
   Without this the bar was nine separate tab stops and the roles promised a
   pattern the keyboard did not deliver. */
function tabKeys(e){
  const ids=TABS.filter(([x])=>x!=="gap").map(([x])=>x);
  const i=ids.indexOf(tab); if(i<0) return;
  let j=null;
  if(e.key==="ArrowRight") j=(i+1)%ids.length;
  else if(e.key==="ArrowLeft") j=(i-1+ids.length)%ids.length;
  else if(e.key==="Home") j=0;
  else if(e.key==="End") j=ids.length-1;
  if(j===null) return;
  e.preventDefault(); goTab(ids[j]);
}

function drawTabs(){
  const c=$("#tabs"); c.innerHTML="";
  c.onkeydown = tabKeys;
  let g=null;
  TABS.forEach(([id,label])=>{
    if(id==="gap" || !g){ g=el("span",{class:"tabgroup", role:"none"}); c.appendChild(g); }
    if(id==="gap") return;
    const b=el("button",{class:"tab", role:"tab", id:"tab-"+id,
                         "aria-selected":String(tab===id),
                         "aria-controls":"pane-"+id,
                         tabindex: tab===id ? "0" : "-1"}, esc(label));
    b.onclick=()=>goTab(id);
    g.appendChild(b);
  });
  paintChecksTab();
  markTabRows();
}
/* A group whose neighbour wrapped onto the next row ends that row, and a divider
   there would point at nothing. */
function markTabRows(){
  const gs=[...document.querySelectorAll("#tabs .tabgroup")];
  gs.forEach((g,i)=>g.classList.toggle("lineend", !!gs[i+1] && gs[i+1].offsetTop > g.offsetTop));
}

/* Only the tab bar stays pinned, plus a one-line copy of the metric cards once
   the cards themselves have scrolled away. The whole header used to stay pinned,
   which on a laptop screen was a third of the height before any content.
   --pinh is the bar's height, for anything else that pins below it. */
(function pinbar(){
  const bar=$("#pinbar"), cards=$("#kpis");
  if(!bar || !cards) return;
  if("IntersectionObserver" in window)
    new IntersectionObserver(([e])=>bar.classList.toggle("stuck", !e.isIntersecting)).observe(cards);
  const setH=()=>{ markTabRows();
    document.documentElement.style.setProperty("--pinh", bar.offsetHeight+"px"); };
  if("ResizeObserver" in window) new ResizeObserver(setH).observe(bar);
  setH();
})();

/* The Checks tab carries its own status, so a failure is visible from anywhere. */
function paintChecksTab(){
  const b=$("#tab-checks"); if(!b || typeof M==="undefined" || !M) return;
  const bad=failCount();
  b.innerHTML = `Checks <span class="tabbadge ${bad?"bad":"ok"}">${bad?fmt(bad):"✓"}</span>`;
  b.setAttribute("aria-label", bad ? `Checks, ${bad} failing` : "Checks, all passing");
}
function failCount(){ const c=M.checks;
  return [c.unflown,c.extra,c.brkSpace,c.brkGround,c.open,c.brkNight,c.brkSpan,c.imb,c.curfew,c.rangeBad.length].filter(x=>x>0).length; }
