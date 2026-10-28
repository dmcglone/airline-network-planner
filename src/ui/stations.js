/* ----- stations ----- */
function drawStations(){
  if(typeof drawStationRoles==="function") drawStationRoles();
  if(typeof wireStationAC==="function") wireStationAC();
  const gt=$("#stnGateTotal"); if(gt) gt.textContent = `${fmt(M.totals.gates)} peak gates across the network`;
  const g=$("#stnGrid"); g.innerHTML="";
  for(const s of M.stations){
    const mx=Math.max(1,...s.D,...s.A);
    const bars=s.D.map((_,h)=>`<span class="hr" title="${String(h).padStart(2,"0")}:00 — ${s.D[h]} dep, ${s.A[h]} arr, ${s.G[h]} on ground">`
      +`<i class="d" style="height:${(s.D[h]/mx*36).toFixed(1)}px"></i>`
      +`<i style="height:${(s.A[h]/mx*36).toFixed(1)}px"></i></span>`).join("");
    const roleCls = s.role==="Hub"?"hub":s.role==="Focus"?"focus":"";
    g.appendChild(el("div",{class:"stn"},
      `<h3><span class="code">${s.code}</span> <span class="chip ${roleCls}">${ROLE_LABEL[s.role]}</span></h3>
       <div class="meta"><span>${esc(s.name)}</span></div>
       <div class="meta"><span>Departures <b>${fmt(s.deps)}</b></span><span>Destinations <b>${fmt(s.dests)}</b></span>
         <span>Peak gates <b>${fmt(s.gates)}</b></span><span>Aircraft based <b>${fmt(s.based)}</b></span>
         <span>Avg stage <b>${fmt(s.stage)}</b> nm</span><span>Seats/day <b>${fmt(s.seats)}</b></span></div>
       <div class="chart">${bars}</div>
       <div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>`));
  }
  drawGateChart();
}

/* The gates at one station: a row per gate and a bar per aircraft on it, in the
   station's local time, read from the gate each flight already carries. The rows
   are the card's peak gates, and the bars show what fills them: at a hub the
   banks stand as columns, and the quiet gates at the bottom are the ones only a
   bank or the night needs. */
let gateSt = null;
function drawGateChart(){
  const host = $("#gateChart"), pick = $("#gateSt"); if(!host || !pick) return;
  if(!STA.includes(gateSt)) gateSt = STA[0];
  pick.innerHTML = STA.map(s => `<option value="${s}"${s === gateSt ? " selected" : ""}>${s} ${esc(AP[s] ? AP[s][0] : "")}</option>`).join("");
  pick.onchange = () => { gateSt = pick.value; drawGateChart(); };
  const ap = gateSt, DAY = 1440, wrap = m => mod(m, DAY), X = m => (m / DAY * 100).toFixed(3);
  const pieces = (a, b) => { const s0 = wrap(a), len = Math.min(DAY, b - a);
    return s0 + len <= DAY ? [[s0, s0 + len]] : [[s0, DAY], [0, s0 + len - DAY]]; };

  // Every stop here: in on one flight, out on the same aircraft's next.
  const byLine = new Map();
  for(const f of M.flights){ if(!byLine.has(f.line)) byLine.set(f.line, []); byLine.get(f.line).push(f); }
  const stops = [];
  for(const L of byLine.values()){
    L.sort((x, y) => x.id - y.id);
    L.forEach((a, i) => { if(a.d !== ap) return;
      const last = i === L.length - 1, b = L[last ? 0 : i + 1];
      const s = loc(ap, a.depX + a.blkMin), e = loc(ap, b.depX) + (last ? DAY : 0);
      // overnight: still on the gate at three in the morning
      stops.push({g: a.gArr, a, b, s, e, night: [180, 180 + DAY].some(m => wrap(s) <= m && m < wrap(s) + e - s)}); });
  }
  if(!stops.length){ host.innerHTML = `<p class="note">No aircraft use a gate at ${esc(ap)} yet.</p>`; $("#gateSum").textContent = ""; return; }

  const byGate = new Map();
  for(const p of stops){ if(!byGate.has(p.g)) byGate.set(p.g, []); byGate.get(p.g).push(p); }
  const key = g => [g.replace(/\d+/, ""), +g.replace(/\D+/, "")];
  const gates = [...byGate.keys()].sort((x, y) => { const [a, n] = key(x), [b, m] = key(y); return a < b ? -1 : a > b ? 1 : n - m; });
  // when the most aircraft are on the ground, counted the way the engine counts it
  const ev = [];
  for(const p of stops) for(const k of [0, DAY]) ev.push([wrap(p.s) + k, 1], [wrap(p.s) + k + p.e - p.s, -1]);
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let on = 0, peak = 0, at = 0;
  for(const [t, d] of ev){ on += d; if(d > 0 && t >= DAY && t < 2 * DAY && on > peak){ peak = on; at = t - DAY; } }

  const role = ROLE[ap], banks = (role === "Hub" || role === "Focus") ? (BANKS[role] || []) : [];
  const back = banks.flatMap(b => pieces(b - 30, b + 30))
    .map(([x0, x1]) => `<i class="tl-bank" style="left:${X(x0)}%;width:${X(x1 - x0)}%"></i>`).join("");
  const ticks = [];
  for(let m = 0; m <= DAY; m += 120) ticks.push(`<span class="tl-tick" style="left:${X(m)}%">${String(m / 60 % 24).padStart(2, "0")}</span>`);
  const code = state.code || BRAND.code;
  let html = `<div class="tl-legend"><span><i class="tl-sw fl"></i>Turn</span><span><i class="tl-sw gt-night"></i>Overnight</span>`
    + (banks.length ? `<span><i class="tl-sw bank"></i>Bank</span>` : "")
    + `<span class="dim">A bar past midnight carries on at the left. Hover a bar for its flights.</span></div>`
    + `<div class="gt-row tl-head"><div class="gt-lab dim">${esc(ap)}</div>`
    + `<div class="tl-track tl-axis">${back}${ticks.join("")}</div><div class="gt-end dim">in use</div></div>`;
  let prev = "";
  for(const g of gates){
    let used = 0, bars = "";
    for(const p of byGate.get(g)){
      used += p.e - p.s;
      const tip = `Gate ${g} · in ${code} ${p.a.fn} from ${p.a.o} at ${hhmm(p.s)} · out ${code} ${p.b.fn} to ${p.b.d} at ${hhmm(p.e)}`
        + ` · ${p.a.t} · ${hrsHM((p.e - p.s) / 60)} on the gate${p.night ? ", overnight" : ""}`;
      bars += pieces(p.s, p.e).map(([x0, x1]) => `<span class="tl-fl${p.night ? " gt-night" : ""}" style="left:${X(x0)}%;width:${X(x1 - x0)}%"`
        + ` title="${esc(tip)}"><span>${esc(p.a.t)}</span></span>`).join("");
    }
    const conc = key(g)[0];
    html += `<div class="gt-row${prev && conc !== prev ? " gt-first" : ""}"><div class="gt-lab">${esc(g)}</div>`
      + `<div class="tl-track">${back}${bars}</div><div class="gt-end">${hrsHM(used / 60)}</div></div>`;
    prev = conc;
  }
  host.innerHTML = html;
  const turns = stops.filter(p => !p.night).length;
  $("#gateSum").textContent = (gates.length === peak ? `${fmt(gates.length)} gates, all in use at ${hhmm(at)}`
      : `${fmt(gates.length)} gates for a peak of ${fmt(peak)} aircraft on the ground, at ${hhmm(at)}`)
    + ` · ${fmt(turns)} turns and ${fmt(stops.length - turns)} overnights a day`;
}
