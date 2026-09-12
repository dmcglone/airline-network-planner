/* ----- seatmap designer -----
   A top-down cabin layout for one fleet type at a time, drawn from the seat
   counts and the airframe geometry in state.fleet. Seat counts are the same
   numbers the Assumptions table edits; pitch and abreast live in `geom` and
   are edited only here.

   Changing a seat count rebuilds, because seats change what the revenue model
   can carry. Changing pitch or abreast does not: they are cabin geometry, and
   the engine has no opinion about them, so those redraw this panel only.

   Violations are reported, never enforced. Same posture as validate.js — the
   tool says what is wrong with a cabin and leaves the decision alone. */

let smType = null;                       // which type is on the drawing board


const SM_MAX_SEAT_GROWTH = 1.6;   // a First seat is wider, not twice as wide
const SM_CABIN_FILL = {F:"var(--accent)", PE:"var(--steel)", Y:"var(--ink-3)"};

function smFleet(){ return state.fleet.find(f=>f.t===smType) || state.fleet[0]; }

/* ---- the drawing ---- */

/* Seats sit either side of a single aisle. An odd cabin is 1-2 rather than
   2-1: the E145's single seat is on the left, which is how it is actually
   built, and floor() gives that without a special case. */
const smSplit = ab => [Math.floor(ab/2), ab - Math.floor(ab/2)];

/* Where the wing crosses the cabin. Overwing exits sit at the wing, so their
   mean locates it; without any, fall back to mid-cabin. */
function smWingAt(exits){
  const three = exits.filter(e => e.type === "III");
  if(!three.length) return 0.5;
  return three.reduce((a,e)=>a+e.x, 0)/three.length;
}

function smSvg(L, f){
  const PX = 0.62;
  const seatW = 14, seatGap = 2.6, aisle = 15;
  const padL = 30, padR = 34;
  const maxAb = Math.max(...CABINS.map(c=>L.abreast[c]||0), 1);
  const bodyH = maxAb*(seatW+seatGap) - seatGap + aisle + 18;
  const capLen = L.cabinLength*PX;
  const wingSpan = 46, topPad = 46 + wingSpan, botPad = 34 + wingSpan;
  // three stacked label lanes above the fuselage, so an exit marker and a
  // cabin name can never land on the same pixels
  const yExit = () => cy - bodyH/2 - 38, yRate = () => cy - bodyH/2 - 29,
        yName = () => cy - bodyH/2 - 17, yBand = () => cy - bodyH/2 - 9;
  // Every type is drawn to ONE scale, set by the longest cabin in the fleet.
  // Sizing each SVG to its own aircraft and letting the panel scale it down to
  // fit means the LONGEST aeroplane is shrunk the most, so a short type renders
  // with bigger seats than a long one. That is exactly backwards, and it makes
  // two types impossible to compare by eye.
  const fleetMaxCabin = Math.max(...state.fleet.map(x=>(x.geom&&x.geom.cabinLength)||0),
                                 L.cabinLength);
  const W = fleetMaxCabin*PX + padL + padR, H = bodyH + topPad + botPad;
  const cy = topPad + bodyH/2, x0 = padL;
  // The aisle is a feature of the fuselage, not of a cabin. Fix its position
  // from the widest cabin and let every other cabin sit inside that envelope --
  // otherwise a 1-2 First shifts the aisle relative to the 2-2 behind it, which
  // is not something an aeroplane can do.
  const [maxL, maxR] = smSplit(maxAb);
  const leftBandH  = maxL*(seatW+seatGap) - seatGap;
  const rightBandH = maxR*(seatW+seatGap) - seatGap;
  const fTop = cy - (leftBandH + aisle + rightBandH)/2;
  const aisleBot = fTop + leftBandH + aisle;
  const p = [];

  // --- wing under the fuselage
  const wx = x0 + smWingAt(L.exits)*capLen, chord = Math.max(60, capLen*0.17);
  for(const dir of [-1, 1]){
    const y = cy + dir*(bodyH/2 - 4), tip = y + dir*wingSpan;
    p.push(`<path d="M${(wx-chord*0.45).toFixed(1)} ${y.toFixed(1)}`
      + ` L${(wx+chord*0.55).toFixed(1)} ${y.toFixed(1)}`
      + ` L${(wx+chord*0.30).toFixed(1)} ${tip.toFixed(1)}`
      + ` L${(wx-chord*0.02).toFixed(1)} ${tip.toFixed(1)}Z"`
      + ` fill="var(--line-2)" stroke="var(--line)" stroke-width="1"/>`);
  }

  // --- fuselage
  const noseR = 30, tailR = 46;
  p.push(`<path d="M${x0-noseR} ${cy}`
    + ` C${x0-noseR} ${cy-bodyH/2} ${x0-14} ${cy-bodyH/2} ${x0+6} ${cy-bodyH/2}`
    + ` L${x0+capLen-6} ${cy-bodyH/2}`
    + ` C${x0+capLen+tailR*0.6} ${cy-bodyH/2} ${x0+capLen+tailR} ${cy-bodyH*0.18} ${x0+capLen+tailR} ${cy}`
    + ` C${x0+capLen+tailR} ${cy+bodyH*0.18} ${x0+capLen+tailR*0.6} ${cy+bodyH/2} ${x0+capLen-6} ${cy+bodyH/2}`
    + ` L${x0+6} ${cy+bodyH/2}`
    + ` C${x0-14} ${cy+bodyH/2} ${x0-noseR} ${cy+bodyH/2} ${x0-noseR} ${cy}Z"`
    + ` fill="var(--surface-2)" stroke="var(--line)" stroke-width="1.5"/>`);

  // --- blockers: monuments as quiet neutral blocks, passageways marked.
  // An earlier version split each monument into coloured lavatory and galley
  // units with glyphs. It was busier than the seats it sits between, and the
  // lavatory blue collided with premium economy. The drawing's job is to show
  // where seats can and cannot go; the monument only has to read as "not here".
  const MON_LABEL = {galley:"GALLEY", lav:"LAV · GALLEY", closet:"CLOSET"};
  for(const b of L.blockers){
    const bx = x0 + b.a*PX, bw = (b.b - b.a)*PX;
    if(b.kind === "door"){
      p.push(`<rect x="${bx.toFixed(1)}" y="${(cy-bodyH/2+7).toFixed(1)}" width="${bw.toFixed(1)}"`
        + ` height="${bodyH-14}" fill="var(--ok)" fill-opacity="0.10"/>`
        + `<line x1="${bx.toFixed(1)}" y1="${(cy-bodyH/2+7).toFixed(1)}" x2="${bx.toFixed(1)}"`
        + ` y2="${(cy+bodyH/2-7).toFixed(1)}" stroke="var(--ok)" stroke-width="0.8" stroke-dasharray="3 2"/>`
        + `<line x1="${(bx+bw).toFixed(1)}" y1="${(cy-bodyH/2+7).toFixed(1)}" x2="${(bx+bw).toFixed(1)}"`
        + ` y2="${(cy+bodyH/2-7).toFixed(1)}" stroke="var(--ok)" stroke-width="0.8" stroke-dasharray="3 2"/>`);
      continue;
    }
    p.push(`<rect x="${bx.toFixed(1)}" y="${(cy-bodyH/2+7).toFixed(1)}" width="${bw.toFixed(1)}"`
      + ` height="${bodyH-14}" rx="3" fill="var(--line-2)" stroke="var(--line)"`
      + ` stroke-dasharray="2.5 2.5"/>`);
    if(bw > 24)
      p.push(`<text x="${(bx+bw/2).toFixed(1)}" y="${(cy+3).toFixed(1)}" text-anchor="middle"`
        + ` font-size="8" letter-spacing="0.8" fill="var(--ink-3)"`
        + ` transform="rotate(-90 ${(bx+bw/2).toFixed(1)} ${cy.toFixed(1)})">${MON_LABEL[b.kind]||""}</text>`);
  }

  // --- a sheared tile necessarily reaches past its own pitch, so the last
  // suite in a cabin would otherwise lean into the cabin behind it. Clip each
  // lie-flat cabin to its own extent.
  const clipIds = {};
  for(const cb of L.cabins){
    if(!cb.rows || SEAT_KIND[L.kinds[cb.c]] === undefined) continue;
    if(!SEAT_KIND[L.kinds[cb.c]].footwell) continue;
    const rs = L.rows.filter(r=>r.c===cb.c); if(!rs.length) continue;
    const last = rs[rs.length-1];
    // include the run-out, or the clip slices the aft-most suite in half
    const ro = (SEAT_KIND[L.kinds[cb.c]] || {}).runout || 0;
    const cx0 = x0 + rs[0].x*PX, cx1 = x0 + (last.x + last.pitch + ro)*PX;
    const id = `smclip-${esc(f.t)}-${cb.c}`.replace(/[^A-Za-z0-9-]/g, "");
    clipIds[cb.c] = id;
    p.push(`<clipPath id="${id}"><rect x="${cx0.toFixed(1)}" y="${(cy-bodyH/2).toFixed(1)}"`
      + ` width="${(cx1-cx0).toFixed(1)}" height="${bodyH}"/></clipPath>`);
  }

  // --- seats, from the placed rows
  for(const r of L.rows){
    const [lft, rgt] = smSplit(r.abreast);
    // The fuselage is a fixed width, so a cabin with fewer seats across has
    // WIDER seats -- an A320 First at 2-2 is two wide seats where economy puts
    // three, not two economy seats pushed against the wall. Each side divides
    // its own band, which is why the two sides of a 1-2 can differ: that lone
    // First seat really is the wide one.
    //
    // Growth is capped, because the spare width in a real cabin does not all go
    // into the seat -- some of it becomes armrest and aisle clearance. Without
    // the cap the single seat of a 1-2 would draw double-width.
    const grow = (SEAT_KIND[r.kind] || SEAT_KIND.standard).grow;
    const sizeSide = (band, n) => Math.min(seatW*grow, (band - (n-1)*seatGap)/n);
    const shL = sizeSide(leftBandH,  lft), shR = sizeSide(rightBandH, rgt);
    const l0 = fTop     + (leftBandH  - (lft*shL + (lft-1)*seatGap))/2;
    const r0 = aisleBot + (rightBandH - (rgt*shR + (rgt-1)*seatGap))/2;
    const yOf = i => i < lft ? l0 + i*(shL+seatGap) : r0 + (i-lft)*(shR+seatGap);
    const shOf = i => i < lft ? shL : shR;
    const rx = x0 + r.x*PX, w = Math.max(5.5, r.pitch*PX - 4);
    const kind = SEAT_KIND[r.kind] || SEAT_KIND.standard;
    for(let i=0; i<r.seats; i++){
      const sy = yOf(i), sh = shOf(i), col = SM_CABIN_FILL[r.c];
      if(kind.footwell){
        // A lie-flat suite in herringbone. Nose is LEFT, so forward is -x.
        //
        // The tile is a PARALLELOGRAM, not a trapezoid: the aisle edge and the
        // wall edge are both full length, offset from one another. That matters
        // because parallelograms tessellate — consecutive suites abut along
        // their diagonals with no gap, which is what gives a herringbone cabin
        // its continuous run of parallel lines. Earlier attempts cut a corner
        // off a rectangle instead, which leaves white wedges between rows and
        // reads as chipped blocks.
        //
        // The shear is mirrored either side of the aisle. That mirroring is
        // the herring's bone: the aisle edge of every suite leads forward, so
        // feet point inboard and heads sit outboard and aft.
        const outboardUp = i < lft;
        const skew  = sh * 0.26;                      // a readable angle, not a true 20 degrees
        const x0 = rx, x1 = rx + w + skew*0.0 + 1.2;
        const yOut = outboardUp ? sy : sy + sh;
        const yIn  = outboardUp ? sy + sh : sy;
        // wall edge trails aft by `skew`; aisle edge leads
        const oX0 = x0 + skew, oX1 = x1 + skew;
        const iX0 = x0,        iX1 = x1;
        const quad = (ax0,ax1,bx1,bx0,inset) => {
          const t = inset || 0;
          return `M${(oX0+t).toFixed(1)} ${(yOut + (outboardUp?t:-t)).toFixed(1)}`
               + ` L${(oX1-t).toFixed(1)} ${(yOut + (outboardUp?t:-t)).toFixed(1)}`
               + ` L${(iX1-t).toFixed(1)} ${(yIn - (outboardUp?t:-t)).toFixed(1)}`
               + ` L${(iX0+t).toFixed(1)} ${(yIn - (outboardUp?t:-t)).toFixed(1)}Z`;
        };
        const headW = Math.max(3.5, w * 0.30);
        const footW = Math.max(3, w * 0.26);
        const hOut = outboardUp ? 1 : -1;
        p.push(`<g${clipIds[r.c] ? ` clip-path="url(#${clipIds[r.c]})"` : ""}>`
          // suite shell
          + `<path d="${quad()}" fill="${col}" fill-opacity="0.42"`
          + ` stroke="${col}" stroke-opacity="0.75" stroke-width="0.9" stroke-linejoin="round"/>`
          // the bed, inset inside the same parallelogram
          + `<path d="${quad(null,null,null,null, sh*0.15)}" fill="${col}" fill-opacity="0.62" stroke="none"/>`
          // headrest: a small block tucked at the aft-outboard corner, where
          // the head actually sits. Drawn square rather than sheared — a
          // full-height diagonal bar here reads as a slash across the suite
          // rather than as part of it.
          + `<rect x="${(oX1-headW-1.5).toFixed(1)}"`
          + ` y="${(outboardUp ? yOut+3 : yOut-3-sh*0.30).toFixed(1)}"`
          + ` width="${(headW).toFixed(1)}" height="${(sh*0.30).toFixed(1)}" rx="2"`
          + ` fill="${col}" fill-opacity="0.9" stroke="none"/>`
          + `</g>`);
        continue;
      }
      p.push(`<g><rect x="${rx.toFixed(1)}" y="${sy.toFixed(1)}" width="${w.toFixed(1)}"`
        + ` height="${sh.toFixed(1)}" rx="3" fill="${col}"`
        + ` fill-opacity="${r.c==="Y"?0.32:0.62}" stroke="${col}"`
        + ` stroke-opacity="0.55" stroke-width="0.7"/>`
        + `<rect x="${(rx + w - Math.max(1.6,w*0.16)).toFixed(1)}" y="${sy.toFixed(1)}"`
        + ` width="${Math.max(1.6,w*0.16).toFixed(1)}"`
        + ` height="${sh.toFixed(1)}" rx="1.5" fill="${col}" fill-opacity="0.85"/></g>`);
    }
    if(r.atExit)
      p.push(`<rect x="${rx.toFixed(1)}" y="${(fTop-3).toFixed(1)}" width="${w.toFixed(1)}"`
        + ` height="${leftBandH+aisle+rightBandH+6}" rx="3" fill="none" stroke="var(--ok)" stroke-width="0.8"`
        + ` stroke-dasharray="2 2" opacity="0.7"/>`);
    p.push(`<text x="${(rx+w/2).toFixed(1)}" y="${(cy+bodyH/2+13).toFixed(1)}" text-anchor="middle"`
      + ` font-size="7.5" fill="var(--ink-3)" opacity="${r.num%5===0||r.num===1?1:0.35}">${r.num}</text>`);
  }

  // --- cabin bands, spanning each cabin's placed rows
  for(const cb of L.cabins){
    if(!cb.rows) continue;
    const rs = L.rows.filter(r=>r.c===cb.c);
    const bx = x0 + rs[0].x*PX;
    const last = rs[rs.length-1];
    const bw = (last.x + last.pitch)*PX + x0 - bx;
    p.push(`<line x1="${bx.toFixed(1)}" y1="${yBand().toFixed(1)}" x2="${(bx+bw).toFixed(1)}"`
      + ` y2="${yBand().toFixed(1)}" stroke="${SM_CABIN_FILL[cb.c]}" stroke-width="2.5"`
      + ` stroke-linecap="round" opacity="0.8"/>`);
    // Pick the longest label that fits inside the band. A short First cabin
    // used to render its full name across the cabin behind it.
    const opts = [`${CABIN_NAME[cb.c].toUpperCase()} · ${cb.placed}`,
                  `${CABIN_ABBR[cb.c]} · ${cb.placed}`, String(cb.placed)];
    const label = opts.find(o => o.length * 6.1 < bw);
    if(label)
      p.push(`<text x="${(bx+bw/2).toFixed(1)}" y="${yName().toFixed(1)}" text-anchor="middle"`
        + ` font-size="8" letter-spacing="1" fill="${SM_CABIN_FILL[cb.c]}">${esc(label)}</text>`);
  }

  // --- exits on top
  for(const e of L.exits){
    const ex = x0 + e.x*capLen, big = e.type !== "III" && e.type !== "IV";
    const h = big ? 15 : 9;
    for(const dir of [-1, 1]){
      const ey = cy + dir*(bodyH/2) - (dir < 0 ? 1.5 : h - 1.5);
      p.push(`<rect x="${(ex-3.5).toFixed(1)}" y="${ey.toFixed(1)}" width="7" height="${h}"`
        + ` rx="2" fill="var(--ok)" stroke="var(--surface)" stroke-width="1"/>`);
    }
    p.push(`<text x="${ex.toFixed(1)}" y="${yExit().toFixed(1)}" text-anchor="middle"`
      + ` font-size="8.5" fill="var(--ok)" class="mono">${e.type}</text>`
      + `<text x="${ex.toFixed(1)}" y="${yRate().toFixed(1)}" text-anchor="middle"`
      + ` font-size="7.5" fill="var(--ink-3)" class="mono">${EXIT_RATING[e.type]}</text>`);
  }

  return `<svg viewBox="0 0 ${Math.round(W)} ${Math.round(H)}" width="100%"`
    + ` style="max-width:${Math.round(W)}px;height:auto;display:block" role="img"`
    + ` aria-label="${esc(f.t)} cabin layout, ${L.placed} seats in `
    + `${L.cabins.filter(c=>c.placed).map(c=>c.placed+" "+CABIN_NAME[c.c]).join(", ")}">${p.join("")}</svg>`;
}

function smLegend(L){
  const key = (col, label) => `<span style="display:inline-flex;align-items:center;gap:6px">`
    + `<span style="width:11px;height:11px;border-radius:2.5px;background:${col};opacity:.62"></span>`
    + `<span>${esc(label)}</span></span>`;
  const seen = L.rows.map(r=>r.c);
  return `<div class="dim" style="display:flex;gap:16px;flex-wrap:wrap;font-size:11.5px;padding:2px 0 0">`
    + CABINS.filter(c=>seen.includes(c)).map(c=>key(SM_CABIN_FILL[c], CABIN_NAME[c])).join("")
    + (Object.values(L.kinds||{}).includes("lieflat")
        ? `<span class="dim">Lie-flat suites draw in herringbone, mirrored either side of the aisle</span>` : "")
    + key("var(--ok)", "Exit")
    + `<span><b>Green band</b> = clear passageway at a floor-level door, which breaks the seating</span>`
    + `<span><b>Dashed outline</b> = the exit row at an overwing Type III. Rows are aligned to start `
    + `at the exit, so a seat is never bolted across one</span></div>`;
}

/* ---- the numbers beside it ---- */
function smReadout(L, f){
  const E = econOf(M);
  const idx = smType ? state.fleet.findIndex(x=>x.t===smType) : 0;

  // Seat-mile cost at this type's own average stage. The cost of a departure
  // does not change when seats are added, so every seat added divides the same
  // number by more — which is exactly why densification is tempting and why
  // the revenue side has to be in the picture beside it.
  let casm = null, prem = null, stage = null;
  try{
    const r = econRate(f.t), R = E && E.rev;
    stage = (r && ECON.types[r.f41] && ECON.types[r.f41].obsStage) || 600;
    const blk = (f.gnd + stage/f.kt*60)/60;
    const c = econFlightCost(f.t, blk);
    if(c && L.seats > 0) casm = c.direct/(L.seats*stage*SM)*100;
    if(R && R.cabins && R.cabins.mult){
      const m = R.cabins.mult;
      prem = (m.F*f.F + m.PE*f.PE + m.Y*f.Y)/Math.max(1, L.seats);
    }
  }catch(e){}

  const cell = (k, v, note, flag) =>
    `<div class="kpi${flag?" flag":""}" style="min-width:0"><div class="k">${esc(k)}</div>`
    + `<div class="v" style="font-size:19px">${v}</div>`
    + (note?`<div class="knote">${esc(note)}</div>`:"") + `</div>`;

  const lenPct = L.seatable > 0 ? L.used/L.seatable*100 : 0;
  const over = L.violations.some(v=>v.kind==="length");
  const past = L.seats > L.limit;

  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:8px">`
    + cell("Seats", fmt(L.placed), `${fmt(L.rows.length)} rows in ${fmt(L.spans.length)} section${L.spans.length===1?"":"s"}`, L.placed < L.seats)
    + cell("Exit limit", fmt(L.limit),
        past ? `${fmt(L.seats-L.limit)} over` : `${fmt(L.headroom)} spare`, past)
    + cell("Cabin used", lenPct.toFixed(0)+"<small>%</small>",
        `${fmt(Math.round(L.used))} of ${fmt(Math.round(L.seatable))} in seatable`, over)
    + cell("Flight attendants", fmt(L.fa), `next at ${fmt(L.faNext)} seats`, false)
    + cell("Cost per seat-mile", casm!=null ? casm.toFixed(2)+"<small>¢</small>" : "—",
        stage ? `at ${fmt(Math.round(stage))} nm stage` : "", false)
    + cell("Fare index", prem!=null ? prem.toFixed(3) : "—",
        prem!=null ? (prem>=1?"above":"below")+" fleet average" : "", false)
    + `</div>`;
}

/* ---- the controls ---- */
function smControls(L, f, idx){
  const row = c => {
    const n = +f[c]||0, cb = L.cabins.find(x=>x.c===c);
    const opts = CABIN_KINDS[c] || ["standard"];
    const kind = L.kinds[c];
    const seatCell = opts.length > 1
      ? `<select data-sk="${c}">` + opts.map(k=>
          `<option value="${k}"${k===kind?" selected":""}>${esc(SEAT_KIND[k].label)}</option>`).join("")
        + `</select>`
      : `<span class="dim">${esc(SEAT_KIND[kind].label)}</span>`;
    return `<tr><td class="code">${esc(CABIN_NAME[c])}</td>`
      + `<td class="num"><input type="number" min="0" max="400" data-f="${idx}" data-k="${c}" value="${n}"></td>`
      + `<td>${seatCell}</td>`
      + `<td class="num dim">${smSplit(L.abreast[c]).join("-")}</td>`
      + `<td class="num"><input type="number" min="26" max="90" data-sm="pitch" data-c="${c}" value="${L.pitch[c]}"></td>`
      + `<td class="num dim">${cb&&cb.rows?fmt(cb.rows):"—"}</td>`
      + `<td class="num${cb&&cb.placed<cb.requested?" bad":" dim"}">${n?fmt(cb?cb.placed:0):"—"}</td></tr>`;
  };
  return `<table><thead><tr><th>Cabin</th><th class="r">Seats</th><th>Seat</th><th class="r">Layout</th>`
    + `<th class="r">Pitch (in)</th><th class="r">Rows</th><th class="r">Fitted</th></tr></thead>`
    + `<tbody>${CABINS.map(row).join("")}</tbody></table>`;
}



/* ---- adding a fleet type ----
   Nobody is going to hand-type exit stations and monument offsets, so the form
   opens on a library of known airframes rather than on a blank sheet. Picking
   one fills in the aeroplane; the user supplies the cabin. That is the same
   split the rest of the project runs on -- the airframe is reference data, the
   cabin is a decision.

   The type lands with no aircraft in the roster. Nothing about the schedule
   changes until somebody buys one, so the eight acceptance metrics and the ten
   checks cannot move on the strength of adding a type. */

let smAdding = false, smFrame = "", smErr = "", smCostOpen = false, smSeed = "standard";

function smAddForm(){
  const fr = FRAMES.find(x=>x.id===smFrame);
  const g  = fr ? fr.geom : null;
  const num = (k, v, min, max, step) =>
    `<input type="number" data-nt="${k}" value="${v}" min="${min}" max="${max}"`
    + (step?` step="${step}"`:"") + ` style="width:78px">`;
  // A blank form is a form that tells you off for being empty. Pick an
  // airframe and it arrives with a cabin in it, fitted to that fuselage.
  const seed = SM_CABIN_PRESETS.find(x=>x.id===smSeed) || SM_CABIN_PRESETS[1];
  // A lie-flat cabin keeps the airframe's suite pitch; only chair cabins take
  // the preset's. Seeding 36 inches into a suite row would silently turn twenty
  // Flagship suites back into twenty recliners.
  const seedPitch = g ? applyPresetPitch(g, seed.pitch) : seed.pitch;
  const fitted = g ? fitCabin(g, seed.pitch, seed.shareF, seed.sharePE) : {F:0,PE:0,Y:0};
  const abAll = g ? cabinAbreast(g) : {F:4, PE:6, Y:6};
  const cabinRow = c => {
    const opts = CABIN_KINDS[c] || ["standard"];
    const kind = g ? seatKindOf(g, c) : opts[0];
    const seatCell = opts.length > 1
      ? `<select data-nt="kind${c}">` + opts.map(k=>
          `<option value="${k}"${k===kind?" selected":""}>${esc(SEAT_KIND[k].label)}</option>`).join("")
        + `</select>`
      : `<span class="dim">${esc(SEAT_KIND[kind].label)}</span>`;
    return `<tr><td class="code">${esc(CABIN_NAME[c])}</td>`
      + `<td class="num">${num("seat"+c, fitted[c], 0, 400)}</td>`
      + `<td>${seatCell}</td>`
      + `<td class="num dim">${smSplit(abAll[c]).join("-")}</td>`
      + `<td class="num">${num("pitch"+c, seedPitch[c], 26, 90)}</td></tr>`;
  };
  const econTypes = Object.keys((typeof ECON!=="undefined" && ECON.types) || {}).sort();

  return `<div class="pad">`
    + `<div class="mkt" style="gap:10px;flex-wrap:wrap;align-items:center">`
      + `<span class="dim" style="min-width:96px">Start from</span>`
      + `<select data-nt="frame" style="min-width:230px">`
        + `<option value="">Blank — I will enter the geometry</option>`
        + FRAMES.map(x=>`<option value="${esc(x.id)}"${x.id===smFrame?" selected":""}>${esc(x.name)}</option>`).join("")
      + `</select>`
      + (fr ? `<span class="dim" style="font-size:12.5px">${fmt(g.cabinLength)} in cabin · `
              + `max ${fmt(g.certifiedMax)} seats · ${g.exits.length} exit pairs</span>` : "")
    + `</div>`
    + `<div class="mkt" style="gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px">`
      + `<span class="dim" style="min-width:96px">Code</span>`
      + `<input data-nt="code" maxlength="5" placeholder="738" value="${esc(fr?fr.code:"")}" style="width:78px" class="code">`
      + `<span class="dim">Name</span>`
      + `<input data-nt="name" placeholder="737-800" value="${esc(fr?fr.name:"")}" style="min-width:200px">`
    + `</div>`
    + `<div class="scroll" style="margin-top:12px"><table><thead><tr>`
      + `<th>Performance</th><th class="r">Range (nm)</th><th class="r">Cruise (kt)</th>`
      + `<th class="r">Ground (min)</th><th class="r">Turn (min)</th><th class="r">Block hrs</th>`
      + `<th class="r">Cabin length (in)</th><th class="r">Certified max</th></tr></thead><tbody><tr><td></td>`
      + `<td class="num">${num("rng", fr?fr.rng:2500, 200, 9000)}</td>`
      + `<td class="num">${num("kt",  fr?fr.kt:450, 200, 700)}</td>`
      + `<td class="num">${num("gnd", fr?fr.gnd:35, 10, 120)}</td>`
      + `<td class="num">${num("turn",fr?fr.turn:45, 10, 180)}</td>`
      + `<td class="num">${num("util",fr?fr.util:11, 4, 16, "0.5")}</td>`
      + `<td class="num">${num("cabinLength", g?g.cabinLength:1000, 200, 3000)}</td>`
      + `<td class="num">${num("certifiedMax", g?g.certifiedMax:180, 10, 900)}</td>`
      + `</tr></tbody></table></div>`
    + `<div class="toolbar" style="flex-wrap:wrap;padding-left:0;margin-top:12px">`
      + `<span class="dim" style="font-size:12.5px">Cabin</span>`
      + SM_CABIN_PRESETS.map(x=>`<button class="btn sm${x.id===smSeed?" on":""}" data-ntseed="${x.id}"`
          + ` title="${esc(x.note)}">${esc(x.label)}</button>`).join("")
      + (g ? `<span class="dim" style="font-size:12.5px">${fmt(fitted.F+fitted.PE+fitted.Y)} seats, `
             + `fitted to this airframe. Change anything you like.</span>` : "")
    + `</div>`
    + `<div class="scroll" style="margin-top:12px"><table><thead><tr><th>Cabin</th>`
      + `<th class="r">Seats</th><th>Seat</th><th class="r">Layout</th><th class="r">Pitch (in)</th></tr></thead>`
      + `<tbody>${CABINS.map(cabinRow).join("")}</tbody></table></div>`
    + `<div class="mkt" style="gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px">`
      + `<span class="dim" style="min-width:96px">Cost basis</span>`
      + (fr && !smCostOpen
          ? `<span class="chip">${esc(fr.f41)}</span>`
            + `<span class="dim" style="font-size:12.5px">taken from the airframe</span>`
            + `<button class="btn sm" data-ntcost="1">Change</button>`
            + `<input type="hidden" data-nt="f41" value="${esc(fr.f41)}">`
          : `<select data-nt="f41" style="min-width:150px"><option value="">Leave it uncosted</option>`
            + econTypes.map(t=>`<option value="${esc(t)}"${fr&&fr.f41===t?" selected":""}>${esc(t)}</option>`).join("")
            + `</select>`
            + `<span class="dim" style="font-size:12.5px">An uncosted type flies, but never reaches the P&amp;L. `
            + `The Economics tab will say so.</span>`)
    + `</div>`
    + (smErr ? `<div class="mkt" style="margin-top:12px"><span class="chip bad">${esc(smErr)}</span></div>` : "")
    + `<div class="toolbar" style="margin-top:12px;padding-left:0">`
      + `<button class="btn" data-ntadd="1">Add type</button>`
      + `<button class="btn sm" data-ntcancel="1">Cancel</button>`
      + `<span class="dim" style="font-size:12.5px">It arrives with no aircraft in the roster, `
        + `so nothing about the schedule moves until you buy one.</span>`
    + `</div></div>`;
}

/* Read the form and build the type. Returns an error string, or null. */
function smCommitType(){
  const v = k => { const e = $(`[data-nt="${k}"]`); return e ? e.value : ""; };
  const n = (k, d) => { const x = parseFloat(v(k)); return isFinite(x) ? x : d; };
  const code = v("code").trim().toUpperCase();
  if(!code) return "A type needs a code.";
  if(!/^[A-Z0-9-]{1,5}$/.test(code)) return "A code is up to five letters, digits or hyphens.";
  if(state.fleet.some(f=>f.t===code)) return `There is already a type called ${code}.`;

  const fr = FRAMES.find(x=>x.id===smFrame);
  const geom = fr ? JSON.parse(JSON.stringify(fr.geom))
                  : {abreast:{F:4,PE:6,Y:6}, exits:[{type:"C",x:0},{type:"C",x:1}], monuments:[]};
  geom.cabinLength  = n("cabinLength", 1000);
  geom.certifiedMax = n("certifiedMax", 180);
  geom.pitch = {F:n("pitchF",36), PE:n("pitchPE",34), Y:n("pitchY",30)};

  const t = {t:code, name:v("name").trim() || code, origin:"user",
             F:n("seatF",0), PE:n("seatPE",0), Y:n("seatY",0),
             rng:n("rng",2500), kt:n("kt",450), gnd:n("gnd",35),
             turn:n("turn",45), util:n("util",11), geom};
  const f41 = v("f41"); if(f41) t.f41 = f41;
  if(t.F + t.PE + t.Y <= 0) return "A type needs at least one seat.";

  state.fleet.push(t);
  state.roster = Object.assign({}, state.roster); state.roster[code] = 0;
  smAdding = false; smFrame = ""; smErr = "";
  smType = code;
  return null;
}


/* ---- renaming a type ----
   A code is not just a label: routes carry their gauge as `mix` keyed by type
   code, and the roster is keyed the same way. Changing one without the others
   would orphan every route flying it, so the rename migrates all three
   together or does nothing at all. */
let smRenaming = false, smRenErr = "";

function smRenameRefs(oldT, newT){
  let routes = 0;
  for(const r of state.routes || []){
    if(!r.mix || r.mix[oldT] === undefined) continue;
    r.mix[newT] = r.mix[oldT]; delete r.mix[oldT]; routes++;
  }
  if(state.roster && state.roster[oldT] !== undefined){
    state.roster[newT] = state.roster[oldT]; delete state.roster[oldT];
  }
  if(state.feed && state.feed[oldT] !== undefined){
    state.feed[newT] = state.feed[oldT]; delete state.feed[oldT];
  }
  return routes;
}

function smCommitRename(f){
  const code = ($('[data-rn="code"]') || {}).value;
  const name = ($('[data-rn="name"]') || {}).value;
  const c = (code || "").trim().toUpperCase();
  if(!c) return "A type needs a code.";
  if(!/^[A-Z0-9-]{1,5}$/.test(c)) return "A code is up to five letters, digits or hyphens.";
  if(c !== f.t && state.fleet.some(x=>x.t===c)) return `There is already a type called ${c}.`;
  const moved = c !== f.t ? smRenameRefs(f.t, c) : 0;
  f.name = (name || "").trim() || c;
  f.t = c; smType = c; smRenaming = false; smRenErr = "";
  return {moved};
}

function smRenameForm(f){
  return `<div class="mkt" style="gap:10px;flex-wrap:wrap;align-items:center">`
    + `<span class="dim" style="min-width:60px">Code</span>`
    + `<input data-rn="code" maxlength="5" class="code" style="width:78px" value="${esc(f.t)}">`
    + `<span class="dim">Name</span>`
    + `<input data-rn="name" style="min-width:200px" value="${esc(f.name || f.t)}">`
    + `<button class="btn sm" data-rnsave="1">Save</button>`
    + `<button class="btn sm" data-rncancel="1">Cancel</button>`
    + (smRenErr ? `<span class="chip bad">${esc(smRenErr)}</span>`
                : `<span class="dim" style="font-size:12.5px">Routes and roster follow the code.</span>`)
    + `</div>`;
}

/* ---- assembly ---- */
function drawSeatmap(){
  const host = $("#seatmapPanel"); if(!host) return;
  if(!smType || !state.fleet.some(f=>f.t===smType)) smType = state.fleet[0] && state.fleet[0].t;
  const f = smFleet(); if(!f){ host.innerHTML = ""; return; }
  const idx = state.fleet.findIndex(x=>x.t===f.t);
  const L = seatmapLayout(f);

  const chips = state.fleet.map(x=>
    `<button class="btn sm${!smAdding&&x.t===f.t?" on":""}" data-smtype="${esc(x.t)}">${esc(x.t)}`
    + `<span class="dim" style="margin-left:6px">${fmt(x.F+x.PE+x.Y)}</span></button>`).join("")
    + `<button class="btn sm${smAdding?" on":""}" data-ntopen="1" title="Add a fleet type">+ Add type</button>`;

  if(smAdding){
    host.innerHTML = `<div class="toolbar" style="flex-wrap:wrap">${chips}</div>` + smAddForm();
    return;
  }

  const presets = SM_CABIN_PRESETS.map(p=>
    `<button class="btn sm" data-smpreset="${p.id}" title="${esc(p.note)}">${esc(p.label)}</button>`).join("");
  // Saved state carries a full copy of geom, so a change to the shipped
  // airframe cannot reach anyone who has already edited this type. Nothing is
  // wrong with that -- their edits are real work -- but they need a way back.
  const base = FLEET_BASE.find(x=>x.t===f.t);
  const drifted = base && base.geom
    && JSON.stringify(base.geom.pitch) !== JSON.stringify(f.geom.pitch);
  const usedBy = (state.routes || []).filter(r=>r.mix && r.mix[f.t]).length;
  const delBtn = state.fleet.length > 1
    ? `<button class="btn sm" data-smdel="1"${usedBy?' disabled title="'+usedBy+' route'+(usedBy===1?'':'s')
        +' fly this type. Move them to another gauge first."':' title="Remove this type from the fleet"'}>`
      + `Delete${usedBy?` · ${usedBy} route${usedBy===1?"":"s"}`:""}</button>`
    : "";
  const resetBtn = drifted
    ? `<button class="btn sm" data-smreset="1" title="Restore the shipped pitch for this airframe. `
      + `Seat counts are not touched.">Reset pitch</button>`
      + `<span class="dim" style="font-size:12.5px">Pitch differs from the shipped ${esc(f.t)}.</span>`
    : "";

  const bad = L.violations.length
    ? `<div class="pad">${L.violations.map(v=>
        `<div class="mkt"><span class="chip bad">${esc(v.kind)}</span>`
        + `<span>${esc(v.msg)}</span></div>`).join("")}</div>`
    : `<div class="pad"><p class="note">This cabin fits and is within its exits. `
      + `The most seats it could take at the current economy pitch is `
      + `<b>${fmt(seatCeiling(f))}</b>.</p></div>`;

  host.innerHTML =
      `<div class="toolbar" style="flex-wrap:wrap">${chips}</div>`
    + `<div class="pad" style="overflow-x:auto">${smSvg(L, f)}${smLegend(L)}</div>`
    + `<div class="pad">${smReadout(L, f)}</div>`
    + `<div class="toolbar" style="flex-wrap:wrap"><span class="dim" style="font-size:12.5px">Presets</span>`
      + `${presets}${resetBtn}<button class="btn sm" data-rnopen="1">Rename</button>${delBtn}</div>`
    + (smRenaming ? `<div class="pad">${smRenameForm(f)}</div>` : "")
    + `<div class="scroll">${smControls(L, f, idx)}</div>`
    + bad
    + `<div class="pad"><p class="note"><b>What constrains a cabin.</b> Length is rows times pitch `
      + `plus the monuments. The seat limit is the type's published maximum — 180 on an A320, 220 on an `
      + `A321 — rather than a sum of exit ratings, because that sum does not reproduce the published `
      + `figures and forcing it to would mean putting the exits somewhere they are not. Crew is `
      + `14 CFR 121.391, one attendant per fifty seats, which is why cost steps rather than slopes.</p>`
      + `<p class="note"><b>Exits are geometry here.</b> A floor-level door needs a clear passageway, so `
      + `the seating breaks at it. An overwing Type III sits beside a seat row instead, and rows are `
      + `aligned to start at it so a seat is never across an exit. Whatever length is left at the end of `
      + `a section is too short for a row and is lost, which is why seats do not move smoothly as pitch `
      + `changes.</p>`
    + `<p class="note">Adding economy seats always lowers cost per seat-mile, because the cost of a departure `
      + `does not change when you add a seat. The fare index beside it is the other half — it is the `
      + `seat-weighted cabin premium from the revenue model, and it falls as the cabin gets denser. Watch `
      + `both or the answer is always "more seats".</p></div>`;
}

/* ---- events ---- */
function smEvent(t){
  if(t.dataset && t.dataset.smtype){ smType = t.dataset.smtype; smAdding = false; smRenaming = false; drawSeatmap(); return true; }
  if(t.dataset && t.dataset.ntopen){ smAdding = true; smErr = ""; smCostOpen = false; drawSeatmap(); return true; }
  if(t.dataset && t.dataset.ntseed){ smSeed = t.dataset.ntseed; smErr = ""; drawSeatmap(); return true; }
  if(t.dataset && t.dataset.ntcost){ smCostOpen = true; drawSeatmap(); return true; }
  if(t.dataset && t.dataset.ntcancel){ smAdding = false; smErr = ""; drawSeatmap(); return true; }
  if(t.dataset && t.dataset.nt && /^kind(F|PE|Y)$/.test(t.dataset.nt)){
    const c = t.dataset.nt.slice(4), fr = FRAMES.find(x=>x.id===smFrame);
    if(fr){ fr.geom.seat = Object.assign({}, fr.geom.seat, {[c]: t.value});
            fr.geom.pitch = Object.assign({}, fr.geom.pitch, {[c]: defaultPitchFor(t.value, c)}); }
    drawSeatmap(); return true;
  }
  if(t.dataset && t.dataset.nt === "frame"){ smFrame = t.value; smErr = ""; smCostOpen = false; drawSeatmap(); return true; }
  if(t.dataset && t.dataset.ntadd){
    const err = smCommitType();
    if(err){ smErr = err; drawSeatmap(); return true; }
    // A new type changes what the fleet can fly, so rebuild rather than redraw.
    save(); rebuild();
    return true;
  }
  if(t.dataset && t.dataset.nt){ return true; }   // other form fields: read on submit
  if(t.dataset && t.dataset.smreset){
    const f = smFleet(), base = f && FLEET_BASE.find(x=>x.t===f.t);
    if(f && base && base.geom){ f.geom.pitch = JSON.parse(JSON.stringify(base.geom.pitch)); save(); drawSeatmap(); }
    return true;
  }
  if(t.dataset && t.dataset.smdel){
    const f = smFleet(); if(!f) return true;
    const used = (state.routes || []).filter(r=>r.mix && r.mix[f.t]).length;
    if(used){ toast(`${f.t} is flown by ${used} route${used===1?"":"s"} — move them first`); return true; }
    const i = state.fleet.findIndex(x=>x.t===f.t);
    if(i < 0 || state.fleet.length <= 1) return true;
    state.fleet.splice(i, 1);
    if(state.roster) delete state.roster[f.t];
    if(state.feed) delete state.feed[f.t];
    smType = state.fleet[Math.min(i, state.fleet.length-1)].t;
    smRenaming = false;
    save(); rebuild();
    toast(`${f.t} removed from the fleet`);
    return true;
  }
  if(t.dataset && t.dataset.rnopen){ smRenaming = true; smRenErr = ""; drawSeatmap(); return true; }
  if(t.dataset && t.dataset.rncancel){ smRenaming = false; smRenErr = ""; drawSeatmap(); return true; }
  if(t.dataset && t.dataset.rnsave){
    const f = smFleet(); if(!f) return true;
    const r = smCommitRename(f);
    if(typeof r === "string"){ smRenErr = r; drawSeatmap(); return true; }
    save(); rebuild();
    toast(r.moved ? `Renamed. ${r.moved} route${r.moved===1?"":"s"} moved with it.` : "Renamed.");
    return true;
  }
  if(t.dataset && t.dataset.rn){ return true; }
  if(t.dataset && t.dataset.smpreset){
    const p = SM_CABIN_PRESETS.find(x=>x.id===t.dataset.smpreset), f = smFleet();
    if(p && f){ f.geom = f.geom || {}; f.geom.pitch = applyPresetPitch(f.geom, p.pitch);
                save(); drawSeatmap();
                toast(`${f.t} set to ${p.pitch.F} / ${p.pitch.PE} / ${p.pitch.Y} inch pitch`); }
    return true;
  }
  if(t.dataset && t.dataset.sk){
    const f = smFleet(); if(!f) return true;
    const c = t.dataset.sk;
    f.geom = f.geom || {};
    f.geom.seat  = Object.assign({}, f.geom.seat,  {[c]: t.value});
    // The pitch that suited a recliner is wrong for a suite and vice versa, so
    // the kind carries its own. Seats across follow automatically.
    f.geom.pitch = Object.assign({}, f.geom.pitch, {[c]: defaultPitchFor(t.value, c)});
    save(); drawSeatmap();
    toast(`${f.t} ${CABIN_NAME[c].toLowerCase()} set to ${SEAT_KIND[t.value].label.toLowerCase()}`);
    return true;
  }
  if(t.dataset && t.dataset.sm){
    const f = smFleet(); if(!f) return true;
    f.geom = f.geom || {};
    // pitch only: abreast is fuselage width, not a decision, so it is shown
    // as the layout it produces and cannot be typed over.
    if(t.dataset.sm !== "pitch") return true;
    f.geom.pitch = Object.assign({}, f.geom.pitch);
    f.geom.pitch[t.dataset.c] = Math.max(1, +t.value||0);
    save(); drawSeatmap();
    return true;
  }
  return false;
}
