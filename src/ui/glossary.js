/* ----- glossary -----
   The real barrier for a newcomer is not the interface, it is the vocabulary.
   Across the panels, "feed" appears two dozen times, "gauge" thirteen,
   "rotation" ten, "spoke" nine — and every note is written assuming the reader
   knows them. They are ordinary words to anyone who has planned an airline and
   opaque to everybody else.

   Definitions are one or two sentences and say what the word means HERE. Where
   this planner takes a position, or where a term is routinely misused, the
   entry says so rather than pretending the usage is universal.

   Terms are grouped, because someone reading to learn wants related ideas
   together, and someone looking one up uses the filter. */

const GLOSSARY = [
 {group:"The network", terms:[
  ["Route", "A market you have decided to serve, stored once as a pair of airports with the "
          + "aircraft and frequency you intend. A route is an intention; the legs are what "
          + "actually gets flown."],
  ["Leg", "One flight between two airports. A route flown twice a day in each direction is "
        + "four legs."],
  ["Station", "An airport you base aircraft at. Everywhere else you fly is a spoke."],
  ["Spoke", "An airport you serve but do not base aircraft at. Aircraft reach it from a "
          + "station and come back, or overnight there and return the next morning."],
  ["Hub", "A station whose day is built in banks so that connections work. Costs more gates, "
        + "because everything is on the ground at once."],
  ["Focus city", "A station with fewer banks than a hub. Some connecting intent, less of the "
               + "gate cost."],
  ["Point-to-point base", "A station with no connecting intent at all. Aircraft come and go "
                        + "on a rolling schedule, and nobody is expected to change planes."],
  ["Gauge", "Which aircraft type flies something. “Up-gauging” a route means moving it to a "
          + "bigger type rather than adding a flight."],
  ["Stage length", "The distance of a flight. Short stages spread a departure's fixed costs "
                 + "over fewer miles, which is why regional flying looks expensive per mile."]
 ]},
 {group:"The schedule", terms:[
  ["Bank", "A deliberate cluster of arrivals followed by departures, so passengers can change "
         + "planes. The reason a hub needs more gates than its flying alone would suggest."],
  ["Feed", "Arranging outstation departures so aircraft arrive INTO a hub's bank rather than "
         + "whenever suits the aircraft. Without it a hub has the gate cost of connections "
         + "and few of the connections."],
  ["Rotation", "One aircraft's whole day: every leg it flies, in order, ending where it can "
              + "start again tomorrow. Also called a line of flying."],
  ["Tail", "One physical aircraft. The planner counts tails because that is what you buy and "
         + "crew, as distinct from rotations, which is what the schedule asks for."],
  ["Turn time", "The minimum ground time between an arrival and the next departure of the same "
              + "aircraft. A planning minimum, not a target."],
  ["Block time", "Gate to gate, including taxi — not time in the air. What crews are paid "
                + "for and what utilisation is measured in."],
  ["Utilisation", "Block hours per aircraft per day. Raise it and you need fewer aircraft; "
                + "raise it too far and a single delay has nowhere to go."],
  ["RON", "Remain overnight. An aircraft that finishes its day away from a station and starts "
        + "the next one there."],
  ["Red-eye", "An overnight flight that arrives early the following morning. Earns a second "
            + "day out of one aircraft, at the cost of a cabin nobody enjoys."],
  ["Curfew", "A time window in which an airport will not accept departures or arrivals. One "
           + "of the ten checks."],
  ["Gate", "A parking position. The planner counts the most it ever needs at once, which is a "
         + "bank problem rather than a flying problem."]
 ]},
 {group:"Demand and money", terms:[
  ["O&D", "Origin and destination: where a passenger actually starts and ends, not which legs "
        + "they sit on. A New York to Los Angeles passenger connecting through Denver is one "
        + "O&D and two legs."],
  ["ASM", "Available seat mile. One seat flown one mile. The standard measure of how much "
        + "airline you are operating."],
  ["CASM", "Cost per available seat mile. What it costs to fly one seat one mile, whether or "
         + "not anyone is in it."],
  ["RASM", "Revenue per available seat mile. Compare it with CASM and the difference is the "
         + "whole business."],
  ["Load factor", "The share of seats filled. High load factor is not the same as profit: you "
                + "can fill an aircraft at fares that do not cover it."],
  ["Spill", "Passengers who wanted a flight that was full. This planner counts them and drops "
          + "them; a fuller model would recapture some onto other flights."],
  ["QSI", "Quality of service index. A score for how attractive an itinerary is — here, "
        + "mostly how much longer it takes than the best possible way of making the journey."],
  ["Gravity model", "Estimating demand between two places from their sizes and the distance "
                  + "between them. Used where real data does not reach. It is weak: see "
                  + "Where it is wrong."],
  ["DB1C", "The US Department of Transportation's origin-and-destination ticket sample, which "
         + "replaced DB1B in 2025. Real measured demand for US markets."],
  ["Form 41", "US DOT financial and operating filings by airline. Where this planner's fuel, "
            + "crew, maintenance and ownership costs come from."]
 ]},
 {group:"The cabin", terms:[
  ["Pitch", "The distance between one seat row and the next, front to front. Not legroom, "
          + "though it mostly determines it."],
  ["Abreast", "Seats across a row. Set by the fuselage and the kind of seat, not chosen "
            + "directly — picking a lie-flat suite IS picking 1-1."],
  ["Exit limit", "The most passengers a type may carry, set by its exits. Published per type "
                + "rather than computed here; see Where it is wrong."],
  ["Monument", "A galley, lavatory or closet. It occupies cabin length that seats cannot."],
  ["Lie-flat", "A seat that becomes a bed. Worth a large fare premium on a long flight and "
             + "very little on a short one, which the model reflects."]
 ]}
];

let glossQuery = "";

function glossaryHTML(){
  const q = glossQuery.trim().toLowerCase();
  const match = (t, d) => !q || t.toLowerCase().includes(q) || d.toLowerCase().includes(q);
  const groups = GLOSSARY
    .map(g => ({g, terms: g.terms.filter(([t, d]) => match(t, d))}))
    .filter(x => x.terms.length);
  const n = groups.reduce((a, x) => a + x.terms.length, 0);
  return `<div class="pad">`
    + `<div class="mkt" style="gap:10px;align-items:center;flex-wrap:wrap">`
    + `<input id="glossFind" placeholder="Find a term\u2026" value="${esc(glossQuery)}"`
    + ` style="min-width:220px" aria-label="Search the glossary">`
    + `<span class="dim" style="font-size:12.5px">${fmt(n)} term${n===1?"":"s"}</span></div></div>`
    + (groups.length ? groups.map(({g, terms}) =>
        `<div class="pad" style="border-top:1px solid var(--line-2)">`
        + `<div class="k mono" style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;`
        + `color:var(--ink-3);margin-bottom:7px">${esc(g.group)}</div>`
        + terms.map(([t, d]) =>
            `<div class="gloss-row" id="gloss-${esc(t.toLowerCase().replace(/[^a-z0-9]+/g,"-"))}">`
            + `<b>${esc(t)}</b><span>${esc(d)}</span></div>`).join("")
        + `</div>`).join("")
      : `<div class="pad"><p class="note">Nothing matches \u201c${esc(glossQuery)}\u201d.</p></div>`);
}
