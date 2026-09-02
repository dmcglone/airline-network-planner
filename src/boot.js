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
document.title = BRAND.name ? BRAND.name+" "+BRAND.product : BRAND.product;
$("#brandName").textContent = BRAND.name;
$("#brandProduct").textContent = BRAND.product;
$("#designday").textContent = BRAND.designDay ? "Design day · "+BRAND.designDay : "";
state = load();
SPEC={}; state.fleet.forEach(f=>{SPEC[f.t]=f; f.seats=f.F+f.PE+f.Y;});
fillSelects(); drawTabs(); M=build();
$("#bAp").value = M.apStats["PHL"] ? "PHL — "+AP["PHL"][0] : "";
if(!M.apStats["PHL"]) boardAp="SJC";
draw();