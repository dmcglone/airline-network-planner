/* ---------- demand ---------- */
// Three interchangeable sources behind one interface. Gravity ships with the app; DOT is a real
// importer for BTS DB1B / T-100 exports; custom is the hook for licensed O&D data.
const DEM = RAW.demand || {size:{},beta:1.2,k:1};
const DOT = (DEM.dot && DEM.dot.rows) ? DEM.dot : null;
const DEMAND_SOURCES = {
  dot:     {label: DOT?`US DOT DB1C — ${DOT.period}`:"US DOT (none loaded)", unit:"pax/day",
            note: DOT?`Real origin-and-destination passengers and fares from the US DOT DB1C Market files covering ${DOT.period} — ${fmt(DOT.sampled)} sampled tickets at a 40% sample rate, grossed up and expressed per direction per day across ${fmt(DOT.markets)} markets, with a monthly demand curve for each. Where a market is not in the sample (international, or under about 3 passengers a day) the gravity model fills in.`:"No DOT file loaded."},
  gravity: {label:"Gravity model (no real data)", unit:"index",
            note:"Estimates demand from airport size and distance with no ticket data at all. Checked against the real DB1C figures it explains about half the variance (r² 0.52), ranks two markets correctly 75% of the time, and is typically out by a factor of 7. Useful for ordering candidates, not for sizing a route."},
  custom:  {label:"Licensed demand data", unit:"pax/day",
            note:"Placeholder for an acquired O&D dataset. Import it in the same shape and it overrides everything else."}
};
const demandSource = () => (state.demand && state.demand.source) || (DOT?"dot":"gravity");
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
