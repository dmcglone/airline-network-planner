/* ----- fleet ----- */
function drawRoster(){
  const t=$("#tRoster"); const F=M.fleet;
  $("#spareIn").value=Math.round((state.spare===undefined?0.08:state.spare)*100);
  t.innerHTML="<thead><tr><th>Type</th><th class='r'>Rotations needed</th><th class='r'>Spares</th>"
    +"<th class='r'>Required</th><th class='r'>Baseline</th><th class='r'>Your roster</th>"
    +"<th class='r'>Surplus</th><th>Status</th></tr></thead>";
  const tb=el("tbody");
  tb.innerHTML=F.map((f,i)=>{
    const cls=f.surplus<0?"bad":f.surplus===0?"ok":"";
    const st=f.surplus<0?`${f.short} rotation${f.short===1?"":"s"} unflown`:f.surplus===0?"exactly covered":`${f.surplus} spare`;
    return `<tr><td class="code">${f.t}</td><td class="num">${fmt(f.tails)}</td>`
      +`<td class="num dim">${fmt(f.total-f.tails)}</td><td class="num"><b>${fmt(f.total)}</b></td>`
      +`<td class="num dim">${fmt(f.pinned)}</td>`
      +`<td class="num"><input type="number" min="0" max="900" data-roster="${f.t}" value="${f.roster}"></td>`
      +`<td class="num">${f.surplus>0?"+":""}${fmt(f.surplus)}</td>`
      +`<td><span class="chip ${cls}">${esc(st)}</span></td></tr>`;}).join("");
  t.appendChild(tb);
  const T=M.totals;
  t.appendChild(el("tfoot",null,`<tr><td>Total</td><td class="num">${fmt(T.tails)}</td>`
    +`<td class="num">${fmt(T.totalFleet-T.tails)}</td><td class="num">${fmt(T.totalFleet)}</td>`
    +`<td class="num">${fmt(T.pinned)}</td><td class="num">${fmt(T.roster)}</td>`
    +`<td class="num">${T.surplus>0?"+":""}${fmt(T.surplus)}</td><td></td></tr>`));
  const short=F.filter(f=>f.short>0);
  if(!short.length){
    $("#rosterNote").innerHTML=`<p class="note">Your roster covers the schedule. <b>Baseline</b> is the ${fmt(T.pinned)} aircraft this
      network needed when the roster was pinned — the column is there so you can see how far any change has moved the requirement.
      Spares are carried on top of the rotations at the ratio above; they are not assigned to any flying.</p>`;
    return;
  }
  $("#rosterNote").innerHTML=`<p class="note"><b>${fmt(T.shortRots)} rotation${T.shortRots===1?"":"s"} cannot be flown</b> with this roster,
    covering ${fmt(T.shortFlights)} flights a day. The least productive rotations of each short type are the ones that fall out first —
    they are listed below with the flying they carry, so you can see what you would actually be cancelling.</p>`
    + short.map(f=>`<div style="margin-top:10px"><div class="k mono" style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--bad)">${f.t} — short ${f.short}</div>`
      + f.uncovered.map(r=>`<div class="mkt"><span class="m">${r.id}</span><span class="dim">${r.path}</span><span>${r.block.toFixed(2)} h · ${r.legs} legs</span></div>`).join("")
      + `</div>`).join("");
}
function drawFeed(){
  const F=M.feedStats;
  $("#feedBoxes").innerHTML=Object.keys(FEEDMODE).map(k=>
    `<label style="display:flex;gap:7px;align-items:center;font-size:13px">
      <input type="checkbox" data-feed="${k}" ${state.feed&&state.feed[k]?"checked":""}>
      <span class="code">${k}</span>
      <span class="chip ${ROLE[k]==="Hub"?"hub":"focus"}">${ROLE_LABEL[ROLE[k]]}</span>
      <span class="dim">${FEEDMODE[k]==="dawn"?"dawn feed":"10:00 Caribbean bank"}</span></label>`).join("");
  $("#redeyeChk").checked=!!state.redeye;
  $("#spacingSel").innerHTML=Object.keys(SPACING).map(k=>
    `<option value="${k}"${state.spacing===k?" selected":""}>${esc(SPACING[k].label)}</option>`).join("");
  const items=[["Spokes fed",`${F.fed} of ${F.planned}`],["Departing before 07:00",`${F.early} of ${F.spokes}`],
    ["No departure before 09:00",String(F.late)],["Overnight spoke stations",String(M.totals.ron)],
    ["Same-market gaps under 40 min",String(F.tight)],["Spokes with nothing after 15:00",String(F.noAft)],
    ["Red-eyes operating",String(F.redeyes)]];
  $("#feedStats").innerHTML=items.map(([k,v])=>
    `<div><div class="k mono" style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)">${esc(k)}</div>`
    +`<div style="font-family:var(--disp);font-size:23px;font-weight:600;font-variant-numeric:tabular-nums">${esc(v)}</div></div>`).join("");
}
function drawFleet(){
  drawRoster();
  drawFeed();
  const t=$("#tFleet");
  t.innerHTML="<thead><tr><th>Type</th><th class='r'>Seats</th><th class='r'>Deps/day</th><th class='r'>Block hrs/day</th>"
    +"<th class='r'>Avg stage</th><th class='r'>Tails</th><th class='r'>Block hrs/tail</th><th class='r'>Target</th>"
    +"<th class='r'>vs target</th><th class='r'>Incl. spares</th><th class='r'>Daily ASMs</th><th class='r'>% of ASMs</th></tr></thead>";
  const tot=M.fleet.reduce((a,f)=>({deps:a.deps+f.deps,bh:a.bh+f.bh,tails:a.tails+f.tails,total:a.total+f.total,asm:a.asm+f.asm}),
    {deps:0,bh:0,tails:0,total:0,asm:0});
  const tb=el("tbody");
  tb.innerHTML=M.fleet.map(f=>{
    const u=f.util?f.perTail/f.util:0, cls=u>1.06?"warn":u<0.85?"bad":"ok";
    return `<tr><td class="code">${f.t}</td><td class="num">${f.seats}</td><td class="num">${fmt(f.deps)}</td>`
    +`<td class="num">${fmt(f.bh,1)}</td><td class="num">${fmt(f.stage)}</td><td class="num"><b>${fmt(f.tails)}</b></td>`
    +`<td class="num">${f.perTail.toFixed(2)}</td><td class="num">${f.util.toFixed(1)}</td>`
    +`<td class="num"><span class="chip ${f.tails?cls:""}">${f.tails?Math.round(u*100)+"%":"–"}</span></td>`
    +`<td class="num"><b>${fmt(f.total)}</b></td><td class="num">${fmt(f.asm/1e6,1)}m</td>`
    +`<td class="num">${tot.asm?fmt(f.asm/tot.asm*100,1):"0.0"}%</td></tr>`;}).join("");
  t.appendChild(tb);
  t.appendChild(el("tfoot",null,`<tr><td>Total</td><td></td><td class="num">${fmt(tot.deps)}</td>`
    +`<td class="num">${fmt(tot.bh,1)}</td><td></td><td class="num">${fmt(tot.tails)}</td><td></td><td></td><td></td>`
    +`<td class="num">${fmt(tot.total)}</td><td class="num">${fmt(tot.asm/1e6,1)}m</td><td class="num">100.0%</td></tr>`));

  const a=$("#tAssume");
  a.innerHTML="<thead><tr><th>Type</th><th class='r'>First</th><th class='r'>Prem econ</th><th class='r'>Economy</th>"
    +"<th class='r'>Total seats</th><th class='r'>Range (nm)</th><th class='r'>Cruise (kt)</th>"
    +"<th class='r'>Ground (min)</th><th class='r'>Turn (min)</th><th class='r'>Target block hrs</th></tr></thead>";
  const ab=el("tbody");
  ab.innerHTML=state.fleet.map((f,i)=>`<tr><td class="code">${f.t}</td>`
    +["F","PE","Y"].map(k=>`<td class="num"><input type="number" min="0" max="300" data-f="${i}" data-k="${k}" value="${f[k]}"></td>`).join("")
    +`<td class="num"><b>${f.F+f.PE+f.Y}</b></td>`
    +["rng","kt","gnd","turn"].map(k=>`<td class="num"><input type="number" min="1" max="9000" data-f="${i}" data-k="${k}" value="${f[k]}"></td>`).join("")
    +`<td class="num"><input type="number" min="1" max="20" step="0.5" data-f="${i}" data-k="util" value="${f.util}"></td></tr>`).join("");
  a.appendChild(ab);
}
