/* ---------- demand ---------- */
// Three interchangeable sources behind one interface. Gravity ships with the app; DOT is a real
// importer for BTS DB1B / T-100 exports; custom is the hook for licensed O&D data.
/* The demand file is the biggest thing the page loads and the engine does not
   need it: a schedule is built from routes, fleet and geography. On the web it
   therefore arrives AFTER first paint, and everything here has to work with it
   absent — returning no demand rather than throwing — until it lands.

   DEM and DOT are `let` for exactly that reason. The artifact build inlines the
   data and never calls loadDemand(), so both paths end up in the same place. */
let DEM = RAW.demand || {size:{}, beta:1.2, k:1};
let DOT = (DEM.dot && DEM.dot.rows) ? DEM.dot : null;
let demandReady = !!DOT, demandFailed = false;

function loadDemand(){
  if(demandReady || !RAW.demandUrl) return Promise.resolve(false);
  return fetch(RAW.demandUrl, {cache:"force-cache"})
    .then(r => r.ok ? r.json() : Promise.reject(new Error("HTTP "+r.status)))
    .then(j => {
      DEM = Object.assign({}, DEM, j);
      DOT = (DEM.dot && DEM.dot.rows) ? DEM.dot : null;
      demandReady = !!DOT;
      // the labels were built while DOT was null, so rebuild them
      if(DOT){
        DEMAND_SOURCES.dot.label = `US DOT DB1C — ${DOT.period}`;
        DEMAND_SOURCES.dot.note  = dotNote(DOT);
      }
      return true;
    })
    .catch(e => {
      // A 404 here is not fatal — the schedule is already built and the gravity
      // model still answers — but it silently swaps measured demand for
      // estimates, which is exactly the substitution this project refuses to
      // make quietly. Say so where it will be seen.
      demandFailed = true;
      console.warn("demand data unavailable", e);
      if(typeof toast === "function")
        toast("Demand data did not load — showing gravity estimates instead");
      if(typeof draw === "function") draw();
      return false;
    });
}

const dotNote = D => `Real origin-and-destination passengers and fares from the US DOT DB1C `
  + `Market files covering ${D.period} — ${fmt(D.sampled)} sampled tickets at a 40% sample rate, `
  + `grossed up and expressed per direction per day across ${fmt(D.markets)} markets, with a `
  + `monthly demand curve for each. Where a market is not in the sample (international, or under `
  + `about 3 passengers a day) the gravity model fills in.`;
const DEMAND_SOURCES = {
  dot:     {label: DOT?`US DOT DB1C — ${DOT.period}`:"US DOT — loading…", unit:"pax/day",
            note: DOT ? dotNote(DOT)
                      : "The demand file has not loaded, so every market is falling back to "
                      + "the gravity estimate. Reload to try again."},
  gravity: {label:"Gravity model (no real data)", unit:"index",
            note:"Estimates demand from airport size and distance with no ticket data at all. Checked against the real DB1C figures it explains about half the variance (r² 0.52), ranks two markets correctly 75% of the time, and is typically out by a factor of 7. Useful for ordering candidates, not for sizing a route."},
  custom:  {label:"Licensed demand data", unit:"pax/day",
            note:"Placeholder for an acquired O&D dataset. Import it in the same shape and it overrides everything else."}
};
const demandSource = () => (state.demand && state.demand.source) || (DOT ? "dot" : "gravity");
const demandRows   = () => (state.demand && state.demand.rows) || null;
function demandOf(o,d){
  const rows=demandRows();
  if(rows){ const r=rows[o+"|"+d]||rows[d+"|"+o]; if(r) return {v:r.pax, fare:r.fare||null, real:true}; }
  if(DOT && demandSource()!=="gravity"){
    const k = o<d ? o+d : d+o, r=DOT.rows[k];
    if(r) return {v:r[0], fare:r[1]||null, season:r[2]||null, real:true};
  }
  const so=DEM.size[o], sd=DEM.size[d];
  if(!so||!sd) return {v:0, fare:null, real:false};
  const nm=dist(o,d); if(nm<50) return {v:0,fare:null,real:false};
  // Gravity alone says Orlando-Tampa is a huge market. It isn't — people drive it. Air's share of
  // a short market rises steeply between about 100 and 350 nm; below that the car wins.
  const airShare = 1/(1+Math.exp(-(nm-190)/55));
  return {v: so*sd/Math.pow(nm,DEM.beta)*DEM.k*airShare, fare:null, real:false};
}
const SPARK="▁▂▃▄▅▆▇█";
const SEASON_ALPHA="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/";
function seasonCurve(str){
  if(!str||!DOT) return null;
  const sc=DOT.seasonScale||20;
  const v=[...str].map(c=>SEASON_ALPHA.indexOf(c)/sc);
  const lo=Math.min(...v), hi=Math.max(...v);
  const spark=v.map(x=>SPARK[Math.max(0,Math.min(7,Math.round((x-lo)/((hi-lo)||1)*7)))]).join("");
  const pk=v.indexOf(hi), tr=v.indexOf(lo);
  return {v, spark, peak:DOT.months[pk], peakX:hi, trough:DOT.months[tr], troughX:lo};
}
const demandUnit = () => (demandRows() || (DOT && demandSource()!=="gravity")) ? "pax/day" : "index";
