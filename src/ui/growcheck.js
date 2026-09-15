/* ----- Grow, checked against the network -----
   Grow ranks unserved markets on each route's own estimated contribution. That
   is fast enough for hundreds of candidates and blind to the network: a spoke
   that takes passengers from connections you already sell ranks as well as one
   that feeds your other flights.

   So the suggestions it shows are checked the same way Add route checks a
   route, one at a time in the background, top pick from every base first. Each
   check holds the page for a fraction of a second; the gaps between them keep it
   usable. When a base's picks are all checked they are re-ranked on what they do
   for the network. Results share Add route's cache, so Review opens instantly. */

let growGen = 0;
let GROW = [];                 // [{base, items}] as last drawn
let FILL_SPECS = [];           // Fill's proposed routes, checked after Grow's

/* The network verdict for one proposed route, as a pill and a short reason. */
function netPillHTML(R){
  if(!R) return `<span class="gi-pill pending">checking…</span>`;
  if(R.err) return `<span class="gi-pill">not checked</span>`;
  const tone = netTone(R);
  const v = `${R.net < 0 ? "−" : "+"}${netK(R.net)}/day`;
  const why = [];
  if(R.moreShort > 0) why.push(`needs ${fmt(R.moreShort)} more ${esc(R.type)} than you own`);
  else if(R.net >= 0 && R.netAlloc < 0) why.push(`doesn't cover ownership and overhead`);
  if(R.restRev < -250) why.push(`takes ${netK(-R.restRev)} from your flights`);
  else if(R.restRev > 250) why.push(`feeds ${netK(R.restRev)} onto your flights`);
  return `<span class="gi-pill ${tone}">Network ${v}</span>`
    + (why.length ? `<span class="gi-why">${why.join("; ")}</span>` : "");
}

function growItemHTML(it, i){
  const R = netCached(it.spec), F = it.facts;
  const net = netPillHTML(R);
  const alone = it.contrib != null
    ? `on its own ${it.contrib < 0 ? "−" : "+"}${netK(it.contrib)}/day `
      + `(${netK(F.rev)} rev, ${netK(F.cost)} direct cost)` : "";
  const facts = [
    `${fmt(F.dem)} ${demandUnit()}`,
    F.fare ? `$${fmt(F.fare)} avg fare` : "",
    alone
  ].filter(Boolean).join(" · ");
  const season = F.season
    ? ` <span class="mono" title="Jul 2025 → May 2026">${F.season.spark}</span> peak ${esc(F.season.peak)} ${F.season.peakX.toFixed(1)}×` : "";
  return `<div class="opt gi" data-gi="${esc(it.spec.o)}|${esc(it.spec.d)}">`
    + `<div class="gi-title"><b>${esc(F.base)}–${esc(it.code)}</b> ${esc(F.city)}`
    + `<span class="dim"> · ${fmt(F.nm)} nm · ${esc(F.g)}</span></div>`
    + `<div class="gi-net">${net}</div>`
    + `<div class="gi-facts">${facts}${season}</div>`
    + `<div class="gi-facts">${F.others ? `already flown from ${fmt(F.others)} of your stations` : "new city for the network"}</div>`
    + `<div class="gi-act"><button class="btn sm" data-review="${i}">Review</button>`
    + `<button class="btn sm" data-apply="${i}">Add</button></div></div>`;
}

/* Once a base's picks are all checked: the ones your fleet can fly first, then by
   what they add to the network. A route that needs aircraft you don't own is a
   purchase decision, not a schedule change, so it does not outrank one you can
   add today. Until then the original order holds, so cards don't jump while
   checks are still arriving. */
function growOrder(items){
  const all = items.every(it => { const R = netCached(it.spec); return R && !R.err; });
  if(!all) return items.slice().sort((a, b) => a.rank - b.rank);
  // Profitable and flyable, then profitable but needing aircraft, then losing.
  const key = it => { const R = netCached(it.spec);
    return [R.net < 0 ? 2 : R.moreShort > 0 ? 1 : 0, -R.net]; };
  return items.slice().sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1]; });
}

function growBaseHTML(g){
  const ranked = growOrder(g.items);

  return `<h4>From ${esc(g.base)}</h4>`
    + ranked.map(it => growItemHTML(it, it._i)).join("");
}

/* Once Fill is checked, say what it found in a sentence rather than leaving it to
   eighteen red pills. An idle aircraft costs its ownership whether it flies or not;
   a thin route on top of that can cost more than the idleness does. */
function fillSummary(){
  const host = $("#fillSummary"); if(!host) return;
  const rs = FILL_SPECS.map(sp => netCached(sp)).filter(R => R && !R.err);
  if(!FILL_SPECS.length || rs.length < FILL_SPECS.length){ host.innerHTML = ""; return; }
  const good = rs.filter(R => R.net >= 0).length;
  host.innerHTML = good
    ? `<b>${fmt(good)} of these ${fmt(rs.length)}</b> would earn your network money. The rest cost more than leaving the aircraft idle.`
    : `<b>None of these would earn your network money.</b> Each costs more to fly than leaving the aircraft idle, `
      + `so the idle time is cheaper as it is, or better spent on a Grow pick for that base.`;
}

function growProgress(){
  fillSummary();
  const all = GROW.flatMap(g => g.items).map(it => it.spec).concat(FILL_SPECS);
  const done = all.filter(sp => netCached(sp)).length;
  const host = $("#growProgress"); if(!host) return;
  host.innerHTML = done < all.length
    ? `<span class="rv-checking">Checking against your network… ${fmt(done)} of ${fmt(all.length)}</span>`
    : `Each pick, here and under Fill, is checked against your whole network and ranked by what it adds there, `
      + `not by the route alone. Profitable picks your fleet can fly come first, then ones that need more aircraft, then ones that lose money. `
      + `<b>Review</b> opens one in Add route with the full breakdown.`;
}

function renderGrow(grow, intro){
  GROW = grow;
  for(const g of grow) for(const it of g.items){ it._i = SUGG.length; SUGG.push({apply: it.apply}); }
  $("#sGrow").innerHTML = intro
    + `<p class="note" id="growProgress"></p><div class="growgrid">`
    + grow.map(g => `<div class="sg" data-growbase="${esc(g.base)}">${growBaseHTML(g)}</div>`).join("")
    + `</div>`;
  growProgress();
  startGrowChecks();
}

function startGrowChecks(){
  const gen = ++growGen;
  // Breadth first: every base's top pick, then every base's second, and so on,
  // so the whole tab gets useful quickly rather than one base at a time.
  const queue = [];
  const depth = Math.max(0, ...GROW.map(g => g.items.length));
  for(let r = 0; r < depth; r++)
    for(const g of GROW){ const it = g.items.find(x => x.rank === r); if(it) queue.push({g, it}); }
  for(const sp of FILL_SPECS) queue.push({spec: sp});
  const tick = () => {
    if(gen !== growGen || tab !== "suggest") return;          // redrawn or left the tab
    const next = queue.find(q => !netCached(q.spec || q.it.spec));
    if(!next){ growProgress(); return; }
    computeNetCheck(next.spec || next.it.spec);
    if(next.g){
      const box = document.querySelector(`[data-growbase="${CSS.escape(next.g.base)}"]`);
      if(box) box.innerHTML = growBaseHTML(next.g);
    } else paintFill(next.spec);
    growProgress();
    setTimeout(tick, 60);
  };
  setTimeout(tick, 150);
}

/* A Fill option's verdict, and its Add button: a route that loses the network money
   is still there, but not offered as the answer. */
function fillNetHTML(spec){ return netPillHTML(netCached(spec)); }
function paintFill(spec){
  const sig = netSig(spec), R = netCached(spec);
  document.querySelectorAll(`[data-fillsig="${CSS.escape(sig)}"]`).forEach(n => { n.innerHTML = fillNetHTML(spec); });
  document.querySelectorAll(`[data-fillbtn="${CSS.escape(sig)}"]`).forEach(b => {
    const worse = R && !R.err && R.net < 0;
    b.classList.toggle("quiet", !!worse);
    b.textContent = worse ? "Add anyway" : "Add";
  });
}

/* Open a suggestion in Add route, where the full breakdown lives. */
function reviewGrow(i){
  const it = GROW.flatMap(g => g.items).find(x => x._i === i);
  if(!it) return;
  const a = it.spec;
  goTab("network");
  resetAddDays();
  $("#addRow").hidden = false;
  $("#nO").value = a.o; $("#nT").value = a.t; $("#nN").value = a.n; $("#nW").value = a.w;
  addDest = a.d; $("#nD").value = a.d;
  addInfo();
  $("#addRow").scrollIntoView({behavior: "smooth", block: "start"});
}
