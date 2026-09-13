/* ----- choosing an airline to start from -----
   The planner used to open on a 404-route network with no explanation. A
   stranger saw nine tabs, 1,650 daily flights and a Checks tab, with no idea
   what any of it was or what they were allowed to change.

   Starting from nothing is not the answer either, at least not for this tool.
   Nothing it is good at exists until there is scale: no rotations to read, no
   gates contending, no banks, nothing for the suggestion engine to say. An
   empty network teaches only that the planner does nothing.

   So the opening choice is a small complete airline you can take in at a glance
   and immediately change. The full example is there for anyone who wants to see
   what it looks like at size, and an empty network for anyone who would rather
   start cold. */

let welcomeOpen = false;

function welcomeCards(){
  const cards = (typeof STARTERS !== "undefined" ? STARTERS : []).map(s => ({
    id: s.id, name: s.name, blurb: s.blurb,
    facts: s.expect ? `${fmt(s.expect.routes)} routes · ${fmt(s.expect.tails)} aircraft `
                    + `· ${fmt((s.state.fleet||[]).length)} type`
                    + `${(s.state.fleet||[]).length===1?"":"s"} · ${fmt(s.expect.gates)} gates` : ""
  }));
  cards.push({
    id: "__example", name: "The full example network",
    blurb: "The airline this planner was built around: three hubs, two focus cities, "
         + "three point-to-point bases. Far too big to take in at once, which is why it "
         + "is not the default. It is, though, what the tool looks like at scale.",
    facts: "404 routes · 366 aircraft · 213 gates"
  });
  cards.push({
    id: "__empty", name: "Nothing at all",
    blurb: "One base, one aircraft type, no routes. Everything on screen will be yours, and "
         + "most of the planner will have nothing to show until you have built enough of a "
         + "network for it to reason about.",
    facts: "0 routes · 1 type"
  });
  return cards;
}

function drawWelcome(){
  const host = $("#welcome"); if(!host) return;
  host.hidden = !welcomeOpen;
  if(!welcomeOpen){ host.innerHTML = ""; return; }
  host.innerHTML =
      `<div class="welcome-inner" role="dialog" aria-modal="true" aria-labelledby="welcomeH">`
    + `<h2 id="welcomeH">${esc(SITE.name)}</h2>`
    + `<p class="note">Build and schedule an airline network. Pick one to start from. Give it your own name and code, add and `
    + `cut routes, move the gauges around, and the planner rebuilds the whole day every time `
    + `It then checks its own work against ten rules and tells you when it has broken one. `
    + `Nothing here is a forecast of any real airline.</p>`
    + `<div class="welcome-grid">`
    + welcomeCards().map(c =>
        `<button class="welcome-card" data-starter="${esc(c.id)}">`
        + `<span class="wc-name">${esc(c.name)}</span>`
        + (c.facts ? `<span class="wc-facts">${esc(c.facts)}</span>` : "")
        + `<span class="wc-blurb">${esc(c.blurb)}</span></button>`).join("")
    + `</div>`
    + `<div class="toolbar" style="padding-left:0">`
    + `<button class="btn sm" data-welclose="1">Keep what I have</button>`
    + `<span class="dim" style="font-size:12.5px">You can start over from the Airline panel. `
    + `Switching replaces the whole airline: routes, bases and aircraft types. Undo `
    + `brings the old one back.</span>`
    + `</div></div>`;
  const first = host.querySelector(".welcome-card"); if(first) first.focus();
}

function welcomeEvent(t){
  if(!t || !t.dataset) return false;
  if(t.dataset.welclose){ welcomeOpen = false; drawWelcome(); return true; }
  if(!t.dataset.starter) return false;
  const id = t.dataset.starter;
  if(id === "__example"){
    state = baseline();
  } else if(id === "__empty"){
    state = baseline();
    state.routes = [];
    state.stations = [STA[0]]; state.roles = {[STA[0]]: "P2P"};
    state.roster = {}; state.feed = {}; state.pinned = {};
    // One aircraft type to begin with, not the six this planner happens to ship
    // with. Starting from nothing should mean nothing, and the airframe library
    // makes adding more a few clicks.
    state.fleet = state.fleet.filter(f => f.t === "A320");
    state.brand = "My Airline"; state.code = "XX"; state.codeSetByUser = false;
  } else if(!loadStarter(id)){
    return true;
  }
  applyStationConfig(state); syncFeedModes(); applyBrand();
  welcomeOpen = false; drawWelcome();
  // AFTER the swap, not before. pushUndo stores `committed` — the state as of
  // the last finished build — and skips when nothing has changed yet, so
  // calling it ahead of the mutation records nothing at all.
  pushUndo("starting over");
  save(); M = build();
  if(typeof fillSelects === "function") fillSelects();
  draw(); markCommitted(); paintUndo();
  const s = (typeof STARTERS !== "undefined" ? STARTERS : []).find(x => x.id === id);
  toast(s ? `Started from ${s.name.toLowerCase()}. Rename it in the Airline panel`
          : "Network loaded");
  if(typeof drawHint === "function") drawHint();
  return true;
}
