/* ----- fleet ----- */
/* One table: what the schedule needs of each type, and what you own. It used to be
   two tables that repeated each other's first half. */
function drawRoster(){
  const t=$("#tFleet"); const F=M.fleet, T=M.totals;
  const sp=Math.round((state.spare===undefined?0.08:state.spare)*100);
  $("#spareNote").innerHTML=`Needed includes ${sp}% spares · <button class="linkbtn" data-goto="settings">change</button>`;
  const totAsm=F.reduce((a,f)=>a+f.asm,0)||1;
  t.innerHTML="<thead><tr><th>Type</th><th class='r'>Seats</th><th class='r'>Flights/day</th><th class='r'>Avg stage</th>"
    +"<th class='r' title='Block time each aircraft flies a day, against the type\'s target'>Block per aircraft</th>"
    +"<th class='r'>Rotations</th><th class='r'>+ spares</th><th class='r'>Needed</th>"
    +"<th class='r'>You own</th><th>Status</th><th class='r'>Share of ASMs</th></tr></thead>";
  const tb=el("tbody");
  tb.innerHTML=F.map(f=>{
    const u=f.util?f.perTail/f.util:0, ucls=u>1.06?"":u<0.85?"warn":"ok";
    const cls=f.surplus<0?"bad":f.surplus===0?"ok":"";
    const st=f.surplus<0?`${f.short} rotation${f.short===1?"":"s"} can't be flown`:f.surplus===0?"exactly covered":`${f.surplus} spare`;
    return `<tr><td class="code">${f.t}</td><td class="num">${fmt(f.seats)}</td><td class="num">${fmt(f.deps)}</td>`
      +`<td class="num">${fmt(f.stage)} nm</td>`
      +`<td class="num">${f.tails?`${hrsHM(f.perTail)} <span class="chip ${ucls}" title="Target ${hrsHM(f.util)}">${Math.round(u*100)}%</span>`:`<span class="dim">not flying</span>`}</td>`
      +`<td class="num">${fmt(f.tails)}</td><td class="num dim">${fmt(f.total-f.tails)}</td>`
      +`<td class="num" title="Baseline fleet: ${fmt(f.pinned)}"><b>${fmt(f.total)}</b></td>`
      +`<td class="num"><input type="number" min="0" max="900" data-roster="${f.t}" value="${f.roster}" aria-label="${esc(f.t)} aircraft owned"></td>`
      +`<td><span class="chip ${cls}">${esc(st)}</span></td>`
      +`<td class="num">${(f.asm/totAsm*100).toFixed(1)}%</td></tr>`;}).join("");
  t.appendChild(tb);
  t.appendChild(el("tfoot",null,`<tr><td>Total</td><td></td><td class="num">${fmt(T.deps)}</td><td></td>`
    +`<td class="num dim">${fmt(Math.round(T.blockHrs))} h a day</td>`
    +`<td class="num">${fmt(T.tails)}</td><td class="num">${fmt(T.totalFleet-T.tails)}</td><td class="num">${fmt(T.totalFleet)}</td>`
    +`<td class="num">${fmt(T.roster)}</td><td>${T.shortRots?`<span class="chip bad">${fmt(T.shortRots)} can't be flown</span>`:""}</td>`
    +`<td class="num dim">${fmt(T.asm/1e6,1)}m</td></tr>`));
  const short=F.filter(f=>f.short>0);
  if(!short.length){
    $("#rosterNote").innerHTML=`<p class="note">You own enough of every type to fly this schedule. <b>Needed</b> is the
      rotations plus spares; hover it to see the ${fmt(T.pinned)}-aircraft baseline fleet, the requirement when the fleet was
      last pinned. Spares are carried on top of the rotations at the ratio set under Settings, and are assigned to no flying.</p>`;
    return;
  }
  $("#rosterNote").innerHTML=`<p class="note"><b>${fmt(T.shortRots)} rotation${T.shortRots===1?"":"s"} cannot be flown</b>,
    covering ${fmt(T.shortFlights)} flights a day, with the aircraft you own. The least productive rotations of each short type are the ones that fall out first:
    they are listed below with the flying they carry, so you can see what you would actually be cancelling.</p>`
    + short.map(f=>`<div style="margin-top:10px"><div class="k mono" style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--bad)">${f.t} — short ${f.short}</div>`
      + f.uncovered.map(r=>`<div class="mkt"><span class="m">${r.id}</span><span class="dim">${r.path}</span><span>${hrsHM(r.block)} · ${r.legs} legs</span></div>`).join("")
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
  const p2p = STA.filter(s=>ROLE[s]!=="Hub" && ROLE[s]!=="Focus");
  if(p2p.length)
    $("#feedBoxes").innerHTML += `<span class="dim" style="font-size:12.5px;align-self:center">`
      + `${esc(p2p.join(", "))} ${p2p.length===1?"is a point-to-point base":"are point-to-point bases"}`
      + ` and ${p2p.length===1?"has":"have"} no connecting bank to feed.</span>`;
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
  if(typeof drawSeatmap==='function') drawSeatmap();
  drawRoster();
  const a=$("#tAssume");
  a.innerHTML="<thead><tr><th>Type</th>"
    +"<th class='r'>Seats</th><th class='r'>Range (nm)</th><th class='r'>Cruise (kt)</th>"
    +"<th class='r'>Ground (min)</th><th class='r'>Turn (min)</th><th class='r'>Target block hrs</th></tr></thead>";
  const ab=el("tbody");
  ab.innerHTML=state.fleet.map((f,i)=>`<tr><td class="code">${f.t}</td>`
    +`<td class="num"><b>${f.F+f.PE+f.Y}</b>`
     +`<span class="dim" style="margin-left:6px;font-size:11px">${f.F+f.PE}J</span></td>`
    +["rng","kt","gnd","turn"].map(k=>`<td class="num"><input type="number" min="1" max="9000" data-f="${i}" data-k="${k}" value="${f[k]}"></td>`).join("")
    +`<td class="num"><input type="number" min="1" max="20" step="0.5" data-f="${i}" data-k="util" value="${f.util}"></td></tr>`).join("");
  a.appendChild(ab);
}
