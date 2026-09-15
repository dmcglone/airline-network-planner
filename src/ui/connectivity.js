/* ----- what a hub is actually connecting -----
   A hub costs money. Banked complexes put every aircraft on the ground at once,
   which is why a hub needs more gates than its flying alone would suggest, and
   the feed drags outstation departures to dawn whether that suits them or not.
   You pay all of that for connections.

   The revenue model has always counted them. Nothing in the planning surfaces
   ever said so, so it was possible to run a hub that connected nobody and have
   the tool stay silent about it. A Denver hub with four spokes all east of
   Denver carries zero connecting passengers, because routing east-to-east
   through Colorado is a detour the itinerary builder rejects: correctly, and
   invisibly.

   This uses the SAME rules the revenue model uses to accept a connection, so
   the planning advice and the money cannot disagree:

     - the connecting path may be at most REV_CIRCUITY times the great circle
     - the wait must be between MCT and REV_MAX_CONNECT
     - markets under 50 nm do not count

   The distinction that matters is WHY a hub is not connecting, because the three
   causes have different fixes and look identical from a single number:

     GEOMETRY  no pair of spokes can route through here without a detour.
               Adding frequency or moving banks will not help. Add a spoke on
               the other side.
     TIMING    pairs are geometrically fine but the arrivals and departures do
               not line up inside the connect window. Bank times or the feed.
     SCALE     too few spokes to make many pairs. Nothing is wrong yet.
*/

function hubSpokes(hub){
  const spokes = new Set();
  for(const r of state.routes || []){
    if(r.o === hub) spokes.add(r.d);
    else if(r.d === hub) spokes.add(r.o);
  }
  return spokes;
}

/* Every pair of spokes that COULD route through this station, ignoring timing.
   This is the ceiling: no schedule can beat it. */
function connectableViaPairs(hub){
  const list = [...hubSpokes(hub)].filter(s => AP[s]);
  const pairs = [];
  for(let i = 0; i < list.length; i++)
    for(let j = i + 1; j < list.length; j++){
      const a = list[i], b = list[j];
      const gc = dist(a, b), via = dist(a, hub) + dist(hub, b);
      if(gc < 50) continue;
      if(via > REV_CIRCUITY * gc) continue;          // the detour the model rejects
      const dem = demandOf(a, b);
      pairs.push({a, b, gc, via, detour: via / gc, pax: dem.v || 0, real: dem.real});
    }
  return {spokes: list, pairs};
}

/* Connections the schedule actually realises through this station. */
function realisedVia(hub){
  const E = econOf(M);
  if(!E || !E.rev || !E.rev.itins) return null;
  let pax = 0, markets = 0;
  for(const opts of E.rev.itins.values())
    for(const i of opts){
      if(!i.stops || !i.legs || i.legs.length !== 2) continue;
      if(i.legs[0].d !== hub) continue;
      if(i.flown > 0){ pax += i.flown; markets++; }
    }
  return {pax, markets};
}

function hubConnectivity(hub){
  if(ROLE[hub] !== "Hub" && ROLE[hub] !== "Focus") return null;
  const {spokes, pairs} = connectableViaPairs(hub);
  const viable = pairs.filter(p => p.pax > 0);
  const got = realisedVia(hub);
  const potential = viable.reduce((a, p) => a + p.pax, 0);

  let cause = "ok";
  if(spokes.length < 3) cause = "scale";
  else if(!pairs.length) cause = "geometry";
  else if(got && got.pax < 1 && viable.length) cause = "timing";
  else if(!viable.length) cause = "geometry";

  return {hub, spokes: spokes.length, pairs: pairs.length,
          viable: viable.length, potential, got, cause,
          best: viable.sort((x, y) => y.pax - x.pax).slice(0, 3)};
}

/* One line for the Bases panel, in plain terms. */
function connectivityLine(hub){
  const c = hubConnectivity(hub);
  if(!c) return "";
  const carried = c.got ? Math.round(c.got.pax) : 0;
  const share = (M.totals && M.totals.pax) ? carried / M.totals.pax : 0;

  if(carried >= 1)
    return `<span class="chip ok">connecting</span> carries <b>${fmt(carried)}</b> `
      + `connecting passengers a day across ${fmt(c.got.markets)} market`
      + `${c.got.markets === 1 ? "" : "s"}`
      + (share ? `, ${(share * 100).toFixed(0)}% of everyone you fly` : "");

  if(c.cause === "scale")
    return `<span class="chip">too few spokes</span> ${fmt(c.spokes)} spoke`
      + `${c.spokes === 1 ? "" : "s"} makes almost no pairs to connect. `
      + `Nothing is wrong yet.`;

  if(c.cause === "geometry")
    return `<span class="chip bad">connects nobody</span> no pair of your spokes can `
      + `route through ${esc(hub)} without a detour the model rejects. They are all on `
      + `the same side of it. A hub connects when its spokes sit on different sides, so `
      + `you are paying for banks and gates and getting nothing back.`;

  if(c.cause === "timing")
    return `<span class="chip warn">nothing connects</span> ${fmt(c.viable)} pair`
      + `${c.viable === 1 ? "" : "s"} of spokes could route through ${esc(hub)}, worth about `
      + `${fmt(Math.round(c.potential))} passengers a day, but no arrival reaches a departure `
      + `inside the connect window. Bank times or the feed, not the map.`;

  return "";
}

/* What adding a spoke would open up.

   The Grow tab ranks an unserved market on its own passengers and fare, and the
   Add route verdict did the same. For a hub that is the smaller half of the
   answer: a spoke's value is its own traffic PLUS everyone who can now reach the
   rest of your network through it. Adding a west-coast city to an all-eastern
   hub opens a connection to every eastern spoke at once, and neither surface
   said so.

   Uses the revenue model's own circuity rule, so a connection counted here is
   one the model would actually build. Timing is ignored on purpose: this is the
   opportunity a route creates, not a promise the schedule will realise it. */
function connectionsOpened(hub, dest){
  if(!AP[hub] || !AP[dest]) return null;
  if(ROLE[hub] !== "Hub" && ROLE[hub] !== "Focus") return null;
  const spokes = hubSpokes(hub);
  spokes.delete(dest);
  // pax is the two-way market total. rev is what those passengers would pay THIS
  // leg: their O&D fare prorated by mileage, the same way the revenue model
  // splits a connecting fare across its legs.
  let pax = 0, markets = 0, measured = 0, rev = 0;
  const top = [];
  const legNm = dist(hub, dest);
  for(const s of spokes){
    if(!AP[s]) continue;
    const gc = dist(dest, s), via = dist(dest, hub) + dist(hub, s);
    if(gc < 50 || via > REV_CIRCUITY * gc) continue;
    const dem = demandOf(dest, s);
    if(!dem.v) continue;
    pax += dem.v; markets++; if(dem.real) measured++;
    const fare = dem.fare || (typeof FARE_FIT !== "undefined" ? FARE_FIT.a * Math.pow(gc, FARE_FIT.b) : 0);
    rev += dem.v * fare * (legNm / via);
    top.push({s, pax: dem.v});
  }
  top.sort((a, b) => b.pax - a.pax);
  return {pax, each: pax / 2, rev, markets, measured, top: top.slice(0, 3)};
}
