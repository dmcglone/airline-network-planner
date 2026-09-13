/* ----- getting started -----
   Three things to do, not a tour. A step-through overlay teaches the chrome,
   and the chrome is not what is hard here — the domain is. Each action below
   names a real button and says what it will teach, so somebody can do it, see
   something change, and understand why.

   The order is deliberate. Change something first, because the thing that makes
   this tool make sense is that the entire day rebuilds from one edit. Only then
   is it worth looking at what was built. */

const GETTING_STARTED = [
 ["Add a flight and watch the whole day change",
  "On the Network tab, find a route and type a number into one of the aircraft columns \u2014 "
  + "say a second daily A320. Then look up at the metrics along the top. Aircraft, block hours, "
  + "gates and routes all move, because the planner does not patch the old schedule: it rebuilds "
  + "every rotation from scratch, every time. That is slower and it is the reason the answer "
  + "stays consistent instead of drifting as you work."],
 ["Follow one aircraft through its day",
  "Open Rotations. Each line is one aircraft: where it starts, every leg it flies, and where it "
  + "spends the night. Aircraft routinely finish somewhere other than where they began and turn "
  + "back the next morning \u2014 that is normal airline practice, not a mistake. This is what the "
  + "schedule actually is; everything else on these pages is a summary of it."],
 ["Ask what to do next",
  "Open Suggestions. It proposes routes that fix a problem, fill an idle aircraft, or open a "
  + "market you do not serve \u2014 and it verifies the fixes by rebuilding the schedule before "
  + "offering them. It will not plan your airline for you. Deciding is the interesting part and "
  + "it is left to you."]
];

function gettingStartedHTML(){
  return `<div class="panel"><h2>Getting started `
    + `<span class="sub">Three things to try, in this order</span></h2>`
    + `<div class="pad"><p class="note">You are planning an airline. You choose which markets to `
    + `serve, how often, and with what aircraft; the planner works out every flight, which `
    + `aircraft flies it, when it goes, and where each one spends the night \u2014 then checks its own `
    + `work against ten rules.</p></div>`
    + GETTING_STARTED.map(([h, d], i) =>
        `<div class="pad" style="border-top:1px solid var(--line-2);display:grid;`
        + `grid-template-columns:30px 1fr;gap:13px;align-items:start">`
        + `<div class="mono" style="font-size:19px;color:var(--accent);line-height:1.2">${i+1}</div>`
        + `<div><div style="font-family:var(--disp);font-size:15.5px;font-weight:600;`
        + `margin-bottom:4px">${esc(h)}</div>`
        + `<p class="note" style="margin:0">${esc(d)}</p></div></div>`).join("")
    + `<div class="pad" style="border-top:1px solid var(--line-2)">`
    + `<p class="note"><b>When a number turns red.</b> The metric marked Checks failing is the `
    + `planner disagreeing with itself: a leg nobody flies, an aircraft in two places, a departure `
    + `inside a curfew, a route beyond an aircraft's range. Click it to see which rule broke. `
    + `Zero is the normal state, and you should be suspicious of a schedule that is not at zero.</p>`
    + `<p class="note"><b>Keeping your airline.</b> Your work is saved in this browser, which is `
    + `not permanent \u2014 Safari in particular discards it after about a week away. Share puts the `
    + `whole airline in a link you can keep or send to somebody. Export saves it as a file. `
    + `Undo goes back twenty-five steps.</p>`
    + `<p class="note"><b>Words you do not recognise</b> are dotted in the notes on every page. `
    + `Click one for its definition, or read the Glossary here.</p></div></div>`;
}

/* ----- the Model tab -----
   What this thing is, what it is not, and every place it is knowingly wrong.

   This page exists because the planner reports precise-looking numbers built on
   a mix of measured data and frank guesses, and a reader has no way to tell
   which is which from the numbers alone. Anything on this list that gets fixed
   should come off it; anything new that gets assumed should go on it. If the
   list ever reads as short and reassuring, it has stopped being true. */

const MODEL_SECTIONS = [
  {
    h: "What it does",
    p: [`Given a set of routes and a fleet, it builds a full day of flying: every
         leg, which aircraft flies it, when, and where each tail spends the night.
         Then it checks its own work against ten rules — legs flown against legs
         required, spatial continuity, turn times, rotation closure, overnight
         ground, the 24-hour span, station balance, curfews, range and gauge
         match — and tells you when it has broken one.`,
        `Every edit rebuilds the whole schedule rather than patching the previous
         one. That is slower, and it is the reason the model stays provably
         consistent instead of drifting as changes accumulate.`]
  },
  {
    h: "What it is not",
    p: [`It is not an optimiser. It will not hand you the best network. The
         suggestion engine proposes candidates and you accept or reject them,
         which is the interesting part of the job and the part worth keeping.`,
        `It is not a revenue management system, a crew planning system, or a
         maintenance planning system. There is no fare mix, no crew pairing, no
         check schedule.`,
        `It is not a forecast of any real airline's performance, including the
         ones whose aircraft and cost data it borrows.`]
  },
  {
    h: "Where the demand numbers come from",
    p: [`United States markets use DOT DB1C Market data — the origin and
         destination product that replaced DB1B in July 2025, built from a 40%
         ticket sample. Eleven months, July 2025 to May 2026, processed into
         12,241 markets with passengers per day, average fare and a monthly
         seasonality profile.`,
        `Everywhere else uses a gravity model: size times size over distance,
         with a term for whether people would drive instead.`]
  },
  {
    h: "Where it is wrong",
    honest: true,
    items: [
      [`The gravity model is weak`,
       `Scored against real DB1C, it gets r² = 0.52, ranks market pairs correctly
        74.6% of the time, and is typically off by about seven times. It is fine
        for ordering candidates and useless for sizing them. An early AUC of
        0.966 was oversold — market size alone scored 0.939, so most of it was
        circular.`],
      [`Competition is a single constant`,
       `Every market is modelled as having one equally attractive rival,
        regardless of whether anyone else actually flies it. Frequency buys seats
        but not share, so the model cannot express the main reason airlines add
        frequency.`],
      [`Cabin fare multipliers are judgement`,
       `A lie-flat suite is priced at 5.5 times economy, a recliner at 3, an
        extra-legroom seat at 1.6, with the lie-flat figure tapering down on
        short sectors. Those ratios are reasoned, not measured: the DB1C sample
        carries an average fare per market with no cabin split, so nothing in the
        data can separate a first-class fare from an economy one. They are
        normalised so the fleet mean is 1.0, which means a wrong multiplier never
        shows up as an implausible total — it shows up as the wrong aircraft
        looking good on the wrong route.`],
      [`Cabin mix is priced, occupancy is not`,
       `Passengers are spread across cabins in proportion to seats, so a premium
        cabin earns its fare multiplier whether or not anyone would have bought
        it. That is generous to premium-heavy aircraft.`],
      [`Spilled passengers vanish`,
       `When a flight fills, the overflow is counted and dropped. Real models
        recapture some of it onto other itineraries. This is the pessimistic end
        of the range.`],
      [`Airframe geometry is approximate`,
       `Cabin lengths, exit positions and monument placement are a careful
        reading rather than type certificate data. Where they can be checked they
        land close — the A319 arrangement computes to a real 145-seat
        configuration and the A321's to a real 220 — but an exit sitting a few
        inches off will move a seat count.`],
      [`Regional costs come from one carrier each`,
       `The E175 is costed from Horizon and the E145 from Piedmont, both
        wholly-owned subsidiaries that hold their own aircraft. That makes the
        numbers real rather than distorted by capacity purchase agreements, and
        it also makes one carrier's accounting the entire basis for a type.`],
      [`Seasonality is collected and unused`,
       `A monthly profile exists for every market and nothing consumes it. The
        whole model is a single design day, so a February network and a July one
        are the same network.`],
      [`There is no reliability`,
       `Turn times are minimums, not planned buffers, and nothing models delay
        propagating down a tail. Utilisation is therefore free: packing the day
        harder costs nothing here and costs a great deal in reality.`]
    ]
  },
  {
    h: "How to read a number",
    p: [`Anything drawn from DB1C or Form 41 is measured. Anything else is
         estimated, and the planner marks it where it can — the Economics tab
         names the aircraft types it cannot cost, and route-level findings
         separate the measured ones from the estimate-dependent ones.`,
        `When a figure looks too precise for its inputs, it probably is. The
         schedule is exact because it is arithmetic. The money is not.`]
  },
  {
    h: "Sources",
    p: [`Passenger and fare data: US DOT Bureau of Transportation Statistics,
         DB1C Market. Operating cost data: US DOT Form 41, schedules P-5.2, P-6
         and T-2. Both are United States government publications.`,
        `Aircraft type names are used descriptively and the manufacturers have no
         involvement in this. Cabin regulations cited are 14 CFR 25.807, 25.813
         and 121.391.`]
  }
];

let helpSection = "start";

const HELP_SECTIONS = [
  ["start",    "Getting started"],
  ["glossary", "Glossary"],
  ["model",    "How the model works"],
  ["wrong",    "Where it is wrong"],
  ["sources",  "Sources"]
];

function drawModel(){
  const host = $("#modelPanel"); if(!host) return;
  const nav = `<div class="toolbar" style="flex-wrap:wrap">`
    + HELP_SECTIONS.map(([id,label]) =>
        `<button class="btn sm${helpSection===id?" on":""}" data-help="${id}">${esc(label)}</button>`
      ).join("") + `</div>`;
  if(helpSection === "start"){ host.innerHTML = nav + gettingStartedHTML(); return; }
  if(helpSection === "glossary"){
    host.innerHTML = nav + `<div class="panel"><h2>Glossary `
      + `<span class="sub">What the words on these pages mean</span></h2>`
      + glossaryHTML() + `</div>`;
    const f = $("#glossFind");
    if(f) f.addEventListener("input", e => {
      glossQuery = e.target.value;
      const box = f.closest(".panel");
      box.innerHTML = `<h2>Glossary <span class="sub">What the words on these pages mean</span></h2>`
        + glossaryHTML();
      const nf = $("#glossFind");
      if(nf){ nf.focus(); nf.setSelectionRange(nf.value.length, nf.value.length);
              nf.addEventListener("input", ev => { glossQuery = ev.target.value; drawModel();
                                                   const x=$("#glossFind"); if(x) x.focus(); }); }
    });
    return;
  }
  drawModelSections(nav);
}

function drawModelSections(nav){
  const host = $("#modelPanel"); if(!host) return;
  const sec = s => {
    if(s.items)
      return `<div class="panel"><h2>${esc(s.h)}</h2><div class="pad">`
        + s.items.map(([t, d]) =>
            `<div class="mkt" style="align-items:flex-start;gap:12px;padding:9px 0;`
            + `border-top:1px solid var(--line-2)">`
            + `<span class="chip" style="flex:none;margin-top:1px">${esc(t)}</span>`
            + `<span style="font-size:13px;line-height:1.55">${esc(d.replace(/\s+/g," ").trim())}</span>`
            + `</div>`).join("")
        + `</div></div>`;
    return `<div class="panel"><h2>${esc(s.h)}</h2><div class="pad">`
      + s.p.map(x=>`<p class="note">${esc(x.replace(/\s+/g," ").trim())}</p>`).join("")
      + `</div></div>`;
  };
  const want = helpSection === "wrong"   ? s => !!s.items
             : helpSection === "sources" ? s => s.h === "Sources"
             : s => !s.items && s.h !== "Sources";
  host.innerHTML = nav + MODEL_SECTIONS.filter(want).map(sec).join("");
}
