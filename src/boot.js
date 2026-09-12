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
  document.title = n ? n+" "+BRAND.product : BRAND.product;
  $("#brandName").textContent = n;
}
$("#brandName").addEventListener("blur", ()=>{
  const n = $("#brandName").textContent.trim().slice(0,40) || BRAND.name;
  state.brand = n; $("#brandName").textContent = n;
  document.title = n+" "+BRAND.product;
  save();
});
$("#brandName").addEventListener("keydown", e=>{
  if(e.key === "Enter"){ e.preventDefault(); $("#brandName").blur(); }
});
$("#brandProduct").textContent = BRAND.product;
$("#designday").textContent = BRAND.designDay ? "Design day · "+BRAND.designDay : "";
state = load();
applyBrand();          // reads state.brand, so it has to follow the load
// The loaded fleet may carry types the shipped data has never heard of, and
// fillSelects() below reads TYPES. build() syncs it, but build() runs after
// this line, so without an explicit sync every gauge dropdown on a reloaded
// page is built from the six shipped types and stays that way until something
// triggers a rebuild.
syncTypes();
SPEC={}; state.fleet.forEach(f=>{SPEC[f.t]=f; f.seats=f.F+f.PE+f.Y;});
fillSelects(); drawTabs(); M=build();
$("#bAp").value = M.apStats["PHL"] ? "PHL — "+AP["PHL"][0] : "";
if(!M.apStats["PHL"]) boardAp="SJC";
draw();