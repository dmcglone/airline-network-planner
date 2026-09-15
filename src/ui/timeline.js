/* ----- rotation timeline -----
   A rotation is one aircraft's day, and a planner reads it as a line across the
   day rather than as a row of numbers: when it leaves, where it goes, how long it
   sits, where it sleeps. The table had all of that and showed none of it.

   Rows are grouped by base, and each group is drawn on a 24-hour clock in that
   base's local time, which is how a base's day is planned. The day repeats, so a
   line that runs past midnight wraps to the left of its own row. Positions are percentages, so the
   chart follows the width of the page without measuring anything.

   Hubs and focus cities show their bank times as bands behind the rows: a flight
   that lines up with a band is feeding or leaving a bank, and one that doesn't is
   visibly off it. Ground time longer than IDLE_MIN is drawn as idle. */

const IDLE_MIN = 180;

function drawRotTimeline(){
  const host = $("#rotTimeline");
  const rows = rotRows();
  $("#rotCount").textContent = fmt(rows.length) + " of " + fmt(M.rots.length) + " rotations";
  if(!rows.length){ host.innerHTML = `<div class="pad"><p class="note">No rotations match these filters.</p></div>`; return; }

  const byLine = new Map();
  for(const f of M.flights){ if(!byLine.has(f.line)) byLine.set(f.line, []); byLine.get(f.line).push(f); }
  const short = new Set(M.fleet.flatMap(f => f.uncovered.map(u => u.id)));

  // Each flight in its base's local time, as a continuous clock.
  const legsOf = r => (byLine.get(r.id) || []).slice().sort((a, b) => a.depX - b.depX)
    .map(f => ({f, s: loc(r.base, f.depX), e: loc(r.base, f.depX + f.blkMin)}));

  // Every rotation repeats daily, so the chart is one 24-hour clock in the base's
  // local time. Anything that runs past midnight wraps to the start of its own
  // row, which is exactly what the aircraft does tomorrow.
  const cache = new Map();
  for(const r of rows) cache.set(r.id, legsOf(r));
  const DAY = 1440;
  const wrap = m => ((m % DAY) + DAY) % DAY;
  const X = m => (m / DAY * 100).toFixed(3);
  // A span on the clock, split in two where it crosses midnight.
  const pieces = (a, b) => {
    const s0 = wrap(a), len = Math.min(DAY, b - a);
    return s0 + len <= DAY ? [[s0, s0 + len]] : [[s0, DAY], [0, s0 + len - DAY]];
  };
  const clock = m => { const v = wrap(Math.round(m));
    return String(Math.floor(v / 60)).padStart(2, "0") + ":" + String(v % 60).padStart(2, "0"); };
  const ticks = [];
  for(let m = 0; m <= DAY; m += 120)
    ticks.push(`<span class="tl-tick" style="left:${X(m)}%">${clock(m % DAY).slice(0, 2)}</span>`);

  const groups = new Map();
  for(const r of rows){ if(!groups.has(r.base)) groups.set(r.base, []); groups.get(r.base).push(r); }

  let html = `<div class="tl-legend">`
    + `<span><i class="tl-sw fl"></i>Flight</span><span><i class="tl-sw red"></i>Red-eye</span>`
    + `<span><i class="tl-sw gnd"></i>On the ground</span><span><i class="tl-sw idle"></i>Idle over ${hrsHM(IDLE_MIN / 60)}</span>`
    + `<span><i class="tl-sw night"></i>Overnight, with where</span><span><i class="tl-sw bank"></i>Bank</span>`
    + `<span class="dim">One repeating day in each base's local time; a line past midnight carries on at the left. Hover for details.</span></div>`;

  for(const [base, rs] of groups){
    const banks = (ROLE[base] === "Hub" || ROLE[base] === "Focus") ? (BANKS[ROLE[base]] || []) : [];
    const bands = [];
    for(const b of banks) for(const [x0, x1] of pieces(b - 30, b + 30))
      bands.push(`<i class="tl-bank" style="left:${X(x0)}%;width:${X(x1 - x0)}%"></i>`);
    const back = bands.join("");
    html += `<div class="tl-group">`
      + `<div class="tl-title"><b>${esc(base)}</b> <span class="dim">${esc(ROLE_LABEL[ROLE[base]] || "")}`
      + ` · ${fmt(rs.length)} aircraft${banks.length ? ` · ${fmt(banks.length)} banks shaded` : ""}</span></div>`
      + `<div class="tl-row tl-head"><div class="tl-lab dim">${esc(base)} local</div>`
      + `<div class="tl-track tl-axis">${back}${ticks.join("")}</div><div class="tl-end dim">block · use</div></div>`;

    for(const r of rs){
      const L = cache.get(r.id) || [];
      const util = r.block / ((SPEC[r.t] && SPEC[r.t].util) || 11);
      const ucls = util < 0.40 ? "bad" : util < 0.75 ? "warn" : util > 1.08 ? "" : "ok";
      let bars = "";
      const seg = (cls, a0, b0, title, inner) => pieces(a0, b0).map(([x0, x1]) =>
        `<${inner != null ? "span" : "i"} class="${cls}" style="left:${X(x0)}%;width:${X(x1 - x0)}%"`
        + (title ? ` title="${esc(title)}"` : "") + `>${inner != null ? inner : ""}</${inner != null ? "span" : "i"}>`).join("");
      for(let i = 0; i < L.length; i++){
        const {f, s, e} = L[i];
        // The engine's own red-eye test, so the chart and the Settings count agree.
        const red = (f.dep >= 1230 || f.dep <= 90) && f.day > 0 && f.blk >= 3.25 && f.arr >= 300 && f.arr <= 540;
        const tip = `${state.code || BRAND.code} ${f.fn} · ${f.o}→${f.d} · dep ${hhmm(f.dep)} ${f.o} · arr ${hhmm(f.arr)} ${f.d} `
          + `(local) · ${hrsHM(f.blk)}${f.gDep ? ` · gate ${f.gDep}` : ""}${red ? " · red-eye" : ""}`;
        bars += seg(`tl-fl${red ? " red" : ""}`, s, e, tip, `<span>${esc(f.d)}</span>`);
        if(i + 1 < L.length){
          const g0 = e, g1 = L[i + 1].s, idle = g1 - g0 >= IDLE_MIN;
          bars += seg(`tl-gnd${idle ? " idle" : ""}`, g0, g1,
            `${idle ? "Idle" : "On the ground"} at ${f.d} for ${hrsHM((g1 - g0) / 60)}`);
        }
      }
      // The overnight: from the last arrival round to the first departure tomorrow.
      if(L.length){
        const n0 = L[L.length - 1].e, n1 = L[0].s + DAY, where = L[L.length - 1].f.d;
        if(n1 > n0){
          bars += seg("tl-night", n0, n1, `Overnight at ${where} for ${hrsHM((n1 - n0) / 60)}`);
          // Label it where the night has the most room.
          const ps = pieces(n0, n1).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
          if(ps[1] - ps[0] >= 75)
            bars += `<span class="tl-ron" style="left:${X((ps[0] + ps[1]) / 2)}%">${esc(where)}</span>`;
        }
      }
      const isShort = short.has(r.id);
      html += `<div class="tl-row${isShort ? " short" : ""}">`
        + `<div class="tl-lab"><span class="mono"${isShort ? ` title="You don't own enough ${esc(r.t)} to fly this one"` : ""}>`
        + `${esc(r.id.slice(r.base.length + 1))}</span></div>`
        + `<div class="tl-track">${back}${bars}</div>`
        + `<div class="tl-end"><span class="mono">${hrsHM(r.block)}</span> `
        + (isShort ? `<span class="chip bad" title="You don't own enough ${esc(r.t)} to fly this one">can't fly</span>`
                   : `<span class="chip ${ucls}" title="Block time against this type's daily target">${Math.round(util * 100)}%</span>`)
        + `</div></div>`;
    }
    html += `</div>`;
  }
  host.innerHTML = html;
}
