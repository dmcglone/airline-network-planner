/* ---------- seatmap ----------
   Cabin geometry and the rules that constrain it. Given a fleet type's seat
   counts and its airframe geometry, this works out how the cabin lays out and
   whether it is legal. It reads state.fleet and returns a description; it does
   not draw anything and it does not touch the engine, so the eight acceptance
   metrics and the ten checks cannot move because of this file.

   Three things bind a cabin, and which one binds first differs by type:

     LENGTH   rows x pitch, plus the galley and lavatory monuments at each end,
              must fit the cabin. This is what stops the E145.
     EXITS    14 CFR 25.807(g) caps seats by the type and number of exits
              installed in each side of the fuselage. This is what stops the
              E175.
     CREW     14 CFR 121.391 is one flight attendant per 50 seats. It does not
              stop anything; it makes cost step at 51, 101, 151 and 201.

   THE EXIT ARRANGEMENTS IN fleet.json ARE APPROXIMATIONS. The ratings and the
   arithmetic below are the regulation; the arrangement attributed to each
   airframe is a reasonable reading, not a type certificate. Where it can be
   checked it lands close: the A319 arrangement here computes to 145, which is
   the real 145-seat A319 configuration, and the A321's four Type C pairs
   compute to 220, which is the real maximum. The E175 computes to 90 against a
   real 88. Treat a wrong ceiling as data to fix, not as a defect in the rule. */

// Exit types, for labelling the drawing. The seat ratings in 25.807(g) are
// carried for reference; they are not what limits the cabin. See below.
const EXIT_RATING = {A:110, B:75, C:55, I:45, II:40, III:35, IV:9};

const FA_PER_SEATS = 50;          // 14 CFR 121.391
const EXIT_ROW_PITCH = 34;        // a row at a Type III needs the extra inches
const CABINS = ["F", "PE", "Y"];
const CABIN_NAME = {F:"First", PE:"Premium economy", Y:"Economy"};
const CABIN_ABBR = {F:"FIRST", PE:"PREM", Y:"ECON"};

/* What kind of seat a cabin holds. Until now every seat was a chair that got
   wider when fewer fitted across; a lie-flat suite is a different object. It
   occupies a long cell rather than a slot in a row, it is staggered so that one
   suite's footwell tucks alongside its neighbour, and on a narrowbody it goes
   in at 1-1. The layout maths does not change -- a suite row is still a row at
   a pitch -- but the drawing and the width behaviour do.

   `grow` caps how much wider than a standard seat this kind may draw. A chair
   is capped because the spare width in a real cabin becomes armrest and aisle;
   a suite genuinely does fill its half of the fuselage. */
const SEAT_KIND = {
  standard: {grow:1.6, label:"Standard",       defPitch:{PE:34, Y:30}},
  recliner: {grow:1.6, label:"Recliner",       defPitch:{F:36, PE:38}},
  // `runout` is the length a herringbone cabin needs beyond its last row. The
  // suites are sheared, so the aft-most one reaches past its own pitch and the
  // cabin behind cannot start there. Real cabins leave the same gap.
  lieflat:  {grow:4.0, label:"Lie-flat suite", defPitch:{F:44}, footwell:true, runout:14}
};

/* What each cabin may be. The front cabin is a lie-flat suite or a recliner;
   premium economy is a recliner or an extra-legroom standard seat; economy is
   a standard seat and nothing else. These are the real choices an airline has,
   and they are what makes a cabin a decision rather than a number. */
const CABIN_KINDS = {F:["lieflat","recliner"], PE:["recliner","standard"], Y:["standard"]};
/* What a cabin is when the data does not say. Falling back to the first
   allowed option made every aircraft without an explicit seat kind a lie-flat
   aeroplane, which is not a sensible default for anything. */
const DEFAULT_KIND = {F:"recliner", PE:"standard", Y:"standard"};

/* Seats across, derived rather than stored. The fuselage fixes how many
   economy seats fit abreast; the seat kind then fixes the rest. Choosing a
   lie-flat suite IS choosing 1-1, so holding abreast as separate data only
   creates a way for the two to disagree. */
function abreastFor(kind, yAbreast){
  const y = Math.max(2, yAbreast || 6);
  if(kind === "lieflat") return 2;                 // 1-1 on any narrowbody
  if(kind === "recliner") return y >= 5 ? 4 : 3;   // 2-2 on a single aisle, 1-2 on a regional
  return y;
}

function seatKindOf(geom, c){
  const k = geom && geom.seat && geom.seat[c];
  return (CABIN_KINDS[c] || ["standard"]).includes(k) ? k : (DEFAULT_KIND[c] || "standard");
}
/* The pitch a cabin should take when its seat kind changes. */
const defaultPitchFor = (kind, c) =>
  ((SEAT_KIND[kind] && SEAT_KIND[kind].defPitch) || {})[c]
  || (c === "F" ? 36 : c === "PE" ? 34 : 30);

/* The seat limit is `certifiedMax` on the airframe, not a sum of exit ratings.

   The earlier version added up 25.807(g) and it was a mistake in two ways.
   First, the arithmetic does not actually reproduce the published figures: the
   A320's two Type III exits sit at consecutive rows, which by 25.807(g)(7)
   caps them at 65 and gives 175, yet the type is certificated at 180. Its
   forward and aft doors comfortably exceed Type C requirements, so the book
   Type C credit understates them. Second, and worse, making the sum come out
   at 180 meant spacing the overwing exits four rows apart in the data, which
   is not where they are. Geometry was being bent to reach a number.

   So the published maximum is the input, and the exits are geometry: they say
   where the passageways and the exit rows fall. Nothing has to be reverse
   engineered, and the drawing can be right about the aeroplane. */
function exitLimit(geom){
  const ex = (geom && geom.exits) || [];
  return {limit: geom && geom.certifiedMax || 0, exits: ex};
}

/* A floor-level exit needs a clear passageway from the aisle, so seating has
   to break at it. An overwing Type III does not: it sits at a seat row, which
   is why that row needs the extra pitch instead. 14 CFR 25.813 puts the
   passageway at 20 inches minimum; 24 is what a real cabin gives it. */
const PASSAGE_IN = 24;
const isFloorExit = t => t !== "III" && t !== "IV";

/* Everything that occupies cabin length and is not a seat: monuments, and the
   passageway at each floor-level exit. Overlapping blockers merge, which is
   how a lavatory bank placed at a door reads as one break rather than two. */
function smBlockers(g){
  const L = g.cabinLength || 0, out = [];
  for(const m of (g.monuments || [])){
    const at = (m.x || 0) * L;
    out.push({a: at, b: at + (m.len || 0), kind: m.kind || "galley"});
  }
  for(const e of (g.exits || [])){
    if(!isFloorExit(e.type)) continue;
    const at = e.x * L;
    out.push({a: at - PASSAGE_IN/2, b: at + PASSAGE_IN/2, kind: "door"});
  }
  out.sort((x, y) => x.a - y.a);
  const merged = [];
  for(const b of out){
    const last = merged[merged.length-1];
    if(last && b.a <= last.b + 0.5){
      last.b = Math.max(last.b, b.b);
      if(last.kind === "door" && b.kind !== "door") last.kind = b.kind;
    } else merged.push(Object.assign({}, b));
  }
  // Clamp to the cabin: a door at x=0 or x=1 is half outside it.
  for(const b of merged){ b.a = Math.max(0, b.a); b.b = Math.min(L, b.b); }
  return merged.filter(b => b.b > b.a);
}

/* The seatable spans left between the blockers.

   Every exit is a span boundary, not only the floor-level ones. An overwing
   Type III occupies no length -- it sits beside a seat row rather than in a
   passageway -- but the row still has to START at it. Rows cannot simply march
   from the front of the cabin and land wherever the pitch puts them, because
   that bolts a seat across an emergency exit. Real cabins are laid out so a row
   boundary falls on the exit, which is why exit rows have odd pitch and why a
   cabin has gaps that look arbitrary until you see what they are aligned to.

   The consequence is fragmentation, and it is the honest one: whatever is left
   over at the end of a span is too short for a row and is lost. Change the
   economy pitch and the number of rows that fit before the overwing changes,
   so seats appear and disappear in ways that are not proportional to the pitch.
   That is how it behaves in reality. */
function smSpans(g){
  const L = g.cabinLength || 0;
  const cuts = [];
  for(const b of smBlockers(g)) cuts.push({a: b.a, b: b.b});
  for(const e of (g.exits || [])){
    if(isFloorExit(e.type)) continue;          // already a blocker, with width
    const at = e.x * L;
    if(at > 0.5 && at < L - 0.5) cuts.push({a: at, b: at, exit: true});
  }
  cuts.sort((x, y) => x.a - y.a);
  const out = [];
  let x = 0, fromExit = false, gap = false;
  for(const c of cuts){
    if(c.a > x + 0.5) out.push({a: x, b: c.a, exitRow: fromExit, afterGap: gap});
    x = Math.max(x, c.b);
    fromExit = !!c.exit;                       // next span opens at the exit
    // Row numbers skip across a monument or a passageway, which is real cabin
    // convention. They do NOT skip across an overwing exit: that cut has no
    // width, the seating is continuous through it, and the two exit rows are
    // consecutive — 15 and 16 on a Delta A320, not 17 and 20.
    gap = c.b > c.a + 0.5;
  }
  if(L > x + 0.5) out.push({a: x, b: L, exitRow: fromExit, afterGap: gap});
  return out;
}

/* Lay a type's cabin out and check it.

   Rows are placed by walking the spans front to back and filling each with the
   current cabin's rows. A row that will not fit in what is left of a span does
   not straddle the blocker — it starts the next span, and the remainder of the
   old one is lost. That fragmentation is real: it is why moving a lavatory
   two inches can cost a whole row.

   Row numbers advance by one per row and skip two across a blocker, which is
   the convention every airline uses — the AA A321 runs First 1 to 5 and Main
   from 8 for exactly this reason. */
/* Seats across for all three cabins: economy from the fuselage, the other two
   from their seat kind. */
function cabinAbreast(geom){
  const y = ((geom && geom.abreast) || {}).Y || 6;
  return {F: abreastFor(seatKindOf(geom,"F"), y),
          PE: abreastFor(seatKindOf(geom,"PE"), y),
          Y: y};
}

function seatmapLayout(f){
  const g = f.geom || {};
  const pitch = Object.assign({F:36, PE:34, Y:30}, g.pitch || {});
  const abreast = cabinAbreast(g);
  const L = g.cabinLength || 0;
  const blockers = smBlockers(g), spans = smSpans(g);

  const rows = [], cabins = [];
  let si = 0, cursor = spans.length ? spans[0].a : 0;
  let rowNo = 1, lastSpan = 0;

  for(const c of CABINS){
    const want = +f[c] || 0, ab = Math.max(1, abreast[c]);
    const need = Math.ceil(want / ab);
    let placedRows = 0, placedSeats = 0;
    while(placedRows < need && si < spans.length){
      // The first row of a span that opens at a Type III IS the exit row, and
      // cannot go below EXIT_ROW_PITCH. Alignment is guaranteed by the span
      // boundary rather than tested for after the fact.
      const atExit = spans[si].exitRow && Math.abs(cursor - spans[si].a) < 0.5;
      const p = atExit ? Math.max(pitch[c], EXIT_ROW_PITCH) : pitch[c];
      if(cursor + p > spans[si].b + 0.5){
        si++;                                  // this span is finished
        if(si < spans.length){
          cursor = spans[si].a;
          if(spans[si].afterGap) rowNo += 2;    // numbering skips a monument only
          lastSpan = si;
        }
        continue;
      }
      const n = Math.min(ab, want - placedSeats);
      rows.push({c, x: cursor, pitch: p, abreast: ab, seats: n, num: rowNo, atExit,
                 kind: seatKindOf(g, c)});
      cursor += p; placedRows++; placedSeats += n; rowNo++;
    }
    cabins.push({c, requested: want, placed: placedSeats, rows: placedRows});
    // reserve the shear run-out so the next cabin does not start inside it
    const ro = (SEAT_KIND[seatKindOf(g, c)] || {}).runout || 0;
    if(ro && placedRows && si < spans.length)
      cursor = Math.min(cursor + ro, spans[si].b);
  }

  const seatTotal = CABINS.reduce((a, c) => a + (+f[c] || 0), 0);
  const placed = cabins.reduce((a, x) => a + x.placed, 0);
  const seatable = spans.reduce((a, s) => a + (s.b - s.a), 0);
  const used = rows.reduce((a, r) => a + r.pitch, 0)
    + CABINS.reduce((a, c) => a + (cabins.find(x=>x.c===c && x.rows)
        ? ((SEAT_KIND[seatKindOf(g, c)] || {}).runout || 0) : 0), 0);

  const lim = exitLimit(g);
  const fa = Math.ceil(seatTotal / FA_PER_SEATS);

  const violations = [];
  if(placed < seatTotal){
    const missed = cabins.filter(c => c.placed < c.requested);
    violations.push({kind:"length",
      msg:`${seatTotal - placed} seats do not fit — `
        + missed.map(c => `${CABIN_NAME[c.c]} places ${c.placed} of ${c.requested}`).join(", ")
        + `. ${Math.round(seatable - used)} inches are left over, but in pieces too short for a row.`});
  }
  if(seatTotal > lim.limit)
    violations.push({kind:"exits",
      msg:`${seatTotal - lim.limit} seats past the exit limit of ${lim.limit}`
        });
  for(const c of CABINS)
    if((+f[c] || 0) > 0 && pitch[c] < 28)
      violations.push({kind:"pitch",
        msg:`${CABIN_NAME[c]} at ${pitch[c]} inches is below anything an airline actually sells`});

  return {type:f.t, rows, cabins, blockers, spans, cabinLength:L,
          seats:seatTotal, placed, seatable, used,
          limit:lim.limit, exits:lim.exits,
          abreast, pitch, fa, faNext:(fa*FA_PER_SEATS)+1,
          kinds: {F:seatKindOf(g,"F"), PE:seatKindOf(g,"PE"), Y:seatKindOf(g,"Y")},
          headroom:lim.limit - seatTotal, violations};
}

/* The most seats this cabin holds at its current economy pitch — every span
   filled with economy rows, then capped by the exits. Fragmentation is
   included, because it is part of the answer. */
function seatCeiling(f){
  const g = f.geom || {};
  const pitch = Object.assign({F:36, PE:34, Y:30}, g.pitch || {}).Y;
  const ab = ((g.abreast) || {}).Y || 6;
  let n = 0;
  for(const s of smSpans(g)){
    let len = s.b - s.a, rows = 0;
    // the first row of an exit-aligned span pays the exit-row pitch
    if(s.exitRow && len >= EXIT_ROW_PITCH){ len -= Math.max(pitch, EXIT_ROW_PITCH); rows++; }
    rows += Math.floor(len / pitch);
    n += rows * ab;
  }
  return Math.min(n, exitLimit(g).limit);
}


/* Applying a preset must not flatten a lie-flat cabin to 34 inches. A suite's
   pitch is a property of the suite, not a comfort setting. */
function applyPresetPitch(geom, presetPitch){
  const out = Object.assign({}, geom.pitch);
  for(const c of CABINS)
    if(SEAT_KIND[seatKindOf(geom, c)] && !SEAT_KIND[seatKindOf(geom, c)].footwell)
      out[c] = presetPitch[c];
  return out;
}

/* Fit a cabin to an airframe.

   Given geometry, a pitch and the share of seats wanted in the two forward
   cabins, return the largest layout that actually fits. There is no formula for
   this: premium rows eat more length per seat and every exit fragments the
   cabin, so the only honest way is to lay it out and step down until it fits.
   Twenty-odd iterations, once, when someone picks an airframe.

   This exists so that adding a type gives you an aeroplane with seats in it
   rather than a form full of zeroes and an error message. */
function fitCabin(geom, pitch, shareF, sharePE){
  const ab = Object.assign({F:4, PE:6, Y:6}, geom.abreast || {});
  // A preset must not flatten a lie-flat cabin to a chair pitch.
  const g = Object.assign({}, geom, {pitch: applyPresetPitch(geom, pitch)});
  const ceil = seatCeiling({t:"?", F:0, PE:0, Y:0, geom:g});
  const round = (n, m) => Math.max(0, Math.round(n/m)*m);
  for(let total = Math.min(ceil, geom.certifiedMax || ceil); total > 0; total -= 2){
    const F  = round(total*shareF,  ab.F);
    const PE = round(total*sharePE, ab.PE);
    const Y  = total - F - PE;
    if(Y <= 0) continue;
    const L = seatmapLayout({t:"?", F, PE, Y, geom:g});
    if(L.placed === L.seats && L.seats <= L.limit) return {F, PE, Y};
  }
  return {F:0, PE:0, Y:0};
}

/* The three starting points offered when a type is created, and by the presets
   on the seatmap. Pitch and cabin mix move together: a dense cabin is not just
   tighter rows, it is also the one that stops selling a premium cabin. */
const SM_CABIN_PRESETS = [
  {id:"dense",    label:"Ultra-dense", pitch:{F:34, PE:32, Y:28}, shareF:0,    sharePE:0,
   note:"all economy, filled to the certified limit"},
  {id:"standard", label:"Standard",    pitch:{F:36, PE:34, Y:30}, shareF:0.09, sharePE:0.15,
   note:"the fleet baseline: 36 / 34 / 30 with three cabins"},
  {id:"comfort",  label:"Comfort",     pitch:{F:38, PE:36, Y:34}, shareF:0.12, sharePE:0.20,
   note:"space as the product"}
];
