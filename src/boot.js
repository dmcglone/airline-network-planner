/* ---------- page source for self-publish ---------- */
function pageSource(){
  const c=document.documentElement.cloneNode(true);
  c.removeAttribute("data-theme"); c.removeAttribute("style");
  // drop anything the artifact runtime injected — it is re-added on publish
  c.querySelectorAll("script").forEach(n=>{
    const t=(n.textContent||"");
    if(t.indexOf("__FRAME_PREAMBLE")===0 || /frame-runtime/.test(n.getAttribute("src")||"")) n.remove();
  });
  c.querySelectorAll(".tip,.aclist,.toast").forEach(n=>n.remove());
  {const e=c.querySelector("#kpis"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#tabs"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#tRoutes"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#tSched"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#tRot"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#stnGrid"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#tFleet"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#tAssume"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#tRoster"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#checks"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#shape"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#feedBoxes"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#feedStats"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#rosterNote"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#map"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#mapside"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#apsum"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#fidsDep"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#fidsArr"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#addInfo"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#routeCount"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#schedCount"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#rotCount"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#mapCount"); if(e) e.innerHTML="";}
  {const e=c.querySelector("#ramp"); if(e) e.innerHTML="";}
  
  return "<!doctype html>\n" + c.outerHTML;
}
/* ---------- go ---------- */
PRISTINE = pageSource();
/* The airline's name belongs to whoever is planning it, not to the file that
   shipped with the planner. It lives in state, so it exports, imports and
   survives a reload like every other decision. */
function applyBrand(){
  const n = (state && state.brand) || BRAND.name;
  const c = (state && state.code)  || BRAND.code;
  // The site owns the title; the airline is what you are currently planning, so
  // it qualifies the title rather than being it.
  document.title = n ? `${n} — ${SITE.name}` : SITE.name;
  $("#brandName").textContent = n;
  const cc = $("#brandCode"); if(cc) cc.textContent = c || "";
}
$("#brandName").addEventListener("blur", ()=>{
  const n = $("#brandName").textContent.trim().slice(0,40) || BRAND.name;
  state.brand = n;
  if(!state.codeSetByUser) state.code = suggestCode(n);
  applyBrand(); save();
});
$("#brandName").addEventListener("keydown", e=>{
  if(e.key === "Enter"){ e.preventDefault(); $("#brandName").blur(); }
});
$("#siteName").textContent = SITE.name;
$("#designday").textContent = BRAND.designDay ? "Design day · "+BRAND.designDay : "";
state = load();
applyStationConfig(state);   // STA and ROLE come from state, not just the config file
syncFeedModes();             // and the feed list follows the roles
applyBrand();          // reads state.brand, so it has to follow the load
// The loaded fleet may carry types the shipped data has never heard of, and
// fillSelects() below reads TYPES. build() syncs it, but build() runs after
// this line, so without an explicit sync every gauge dropdown on a reloaded
// page is built from the six shipped types and stays that way until something
// triggers a rebuild.
syncTypes();
SPEC={}; state.fleet.forEach(f=>{SPEC[f.t]=f; f.seats=f.F+f.PE+f.Y;});
fillSelects(); drawTabs(); M=build();
if(typeof markCommitted==="function") markCommitted();
// Nobody has been here before: offer a network to start from rather than
// opening on somebody else's 404-route airline with no explanation.
/* A shared link is the most specific thing anyone can arrive with: it beats
   saved state and it means they are not a first-time visitor needing the
   picker. Loading it is async, so the page is already built and on screen by
   the time it swaps in. */
if(typeof stateFromHash === "function"){
  stateFromHash().then(shared => {
    if(!shared){
      if(!sawSavedState){ welcomeOpen = true; drawWelcome(); }
      return;
    }
    state = shared;
    applyStationConfig(state); syncFeedModes(); reconcileGeom(state.fleet); applyBrand();
    save(); M = build();
    if(typeof fillSelects === "function") fillSelects();
    draw(); markCommitted(); paintUndo();
    toast(`Opened a shared airline — ${state.brand || "unnamed"}`);
  });
} else if(!sawSavedState){ welcomeOpen = true; drawWelcome(); }

/* Demand arrives after the schedule is already on screen. Nothing waits for it:
   the engine never needed it, and the panels that do simply show no demand until
   it lands and then redraw. */
if(typeof drawHint === "function" && sawSavedState) drawHint();

if(typeof loadDemand === "function")
  loadDemand().then(ok => { if(ok){ draw(); } });
$("#bAp").value = M.apStats["PHL"] ? "PHL — "+AP["PHL"][0] : "";
// The board opened at PHL and fell back to SJC, both of which are just stations
// this airline happened to have. Fall back to whatever the network actually
// serves most.
if(!M.apStats[boardAp]){
  const busiest = Object.keys(M.apStats||{})
    .sort((x,y)=>(M.apStats[y].deps||0)-(M.apStats[x].deps||0))[0];
  boardAp = busiest || STA[0] || boardAp;
}
draw();