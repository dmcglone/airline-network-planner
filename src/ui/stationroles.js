/* ----- stations and their roles -----
   A station's role decides how its day is built: a hub runs banked complexes so
   connections work, a focus city runs fewer banks, a point-to-point base runs a
   rolling schedule with no connecting intent at all. Changing one changes the
   whole schedule, which is why this rebuilds rather than redraws.

   Bank times are keyed by role rather than by station, so promoting a station to
   a hub gives it the hub bank structure without anyone having to define one. */

/* Routes BASED at a station, which is what removing it would orphan. A station
   that only appears as a destination is a spoke: drop it from the base list and
   those routes carry on being flown from the other end. Counting both was the
   bug that made a station unremovable the moment it was added. */
function stationRoutes(code){
  return (state.routes || []).filter(r => r.o === code).length;
}
const stationSpokeRoutes = code =>
  (state.routes || []).filter(r => r.d === code).length;

/* Every airport the network touches that is not already a station — these are
   the candidates for promotion, because a spoke you serve heavily is the thing
   you would think about basing aircraft at. */
function stationCandidates(){
  const seen = new Map();
  for(const r of state.routes || []){
    for(const c of [r.o, r.d]){
      if(STA.includes(c) || !AP[c]) continue;
      seen.set(c, (seen.get(c) || 0) + 1);
    }
  }
  return [...seen.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 40);
}

function drawStationRoles(){
  const host = $("#stnRoles"); if(!host) return;
  const rows = STA.map(code => {
    const n = stationRoutes(code), banks = (BANKS[ROLE[code]] || []).length;
    return `<tr><td><span class="code">${esc(code)}</span></td>`
      + `<td class="dim">${esc(AP[code] ? AP[code][0] : code)}</td>`
      + `<td><select data-strole="${esc(code)}">`
      + ["Hub","Focus","P2P"].map(r=>
          `<option value="${r}"${ROLE[code]===r?" selected":""}>${esc(ROLE_LABEL[r])}</option>`).join("")
      + `</select></td>`
      + `<td class="num dim">${banks ? fmt(banks)+" banks/day" : "rolling"}</td>`
      + `<td class="num dim">${fmt(n)}${(()=>{const sp=stationSpokeRoutes(code);
          return sp?` <span style="opacity:.6" title="Routes based elsewhere that fly in here">+${fmt(sp)} flown in</span>`:"";})()}</td>`
      + `<td><button class="btn sm" data-strdel="${esc(code)}"`
      + (n ? ` disabled title="${fmt(n)} route${n===1?"":"s"} are based at ${esc(code)}. Remove them first."`
           : ` title="Stop basing aircraft here. Routes flown INTO it are unaffected."`)
      + `>Remove</button></td></tr>`
      + (() => {
          const line = (typeof connectivityLine === "function") ? connectivityLine(code) : "";
          return line ? `<tr class="connrow"><td></td><td colspan="5">${line}</td></tr>` : "";
        })();
  }).join("");

  const cands = stationCandidates();
  // rebuilt on every draw, so the typeahead has to be re-attached each time
  host.innerHTML =
      `<div class="scroll"><table><thead><tr><th>Code</th><th>Airport</th><th>Role</th>`
    + `<th class="r">Schedule</th><th class="r">Routes based here</th><th></th></tr></thead>`
    + `<tbody>${rows}</tbody></table></div>`
    + `<div class="toolbar" style="flex-wrap:wrap">`
      + `<span class="dim" style="font-size:12.5px">Add a station</span>`
      + `<span class="ac"><input id="stnAdd" placeholder="Type a code or city" autocomplete="off"`
      + ` maxlength="28" style="min-width:210px"></span>`
      + `<button class="btn sm" data-stradd="1">Add</button>`
      + (cands.length
          ? `<span class="dim" style="font-size:12.5px">Most-served airports you do not base at:</span>`
            + cands.slice(0,6).map(([c,n])=>
                `<button class="btn sm" data-stradd="${esc(c)}" title="${fmt(n)} routes">${esc(c)}</button>`).join("")
          : "")
    + `</div>`
    + `<div class="pad"><p class="note"><b>What a role changes.</b> A hub builds banked complexes so `
      + `arrivals and departures cluster and connections work. A focus city runs fewer banks. A `
      + `point-to-point base runs a rolling schedule with no connecting intent. Bank times come from the `
      + `role, so a new hub picks up the hub structure without you defining one.</p>`
    + `<p class="note">Changing a role rebuilds the whole schedule, so the aircraft count, the gate `
      + `requirement and the ten checks will all move. That is the point: it is the cheapest way to ask `
      + `whether a station is earning its bank structure.</p></div>`;
}

/* Wire the typeahead after each render, skipping airports that are already
   bases: offering one would only produce "already a station". */
function wireStationAC(){
  const input = $("#stnAdd"); if(!input) return;
  attachAirportAC(input, (code, el2) => {
    el2.value = code + " — " + AP[code][0];
    el2.dataset.code = code;
  }, c => STA.includes(c));
  input.addEventListener("input", () => { delete input.dataset.code; });
}

function stationEvent(t){
  if(!t || !t.dataset) return false;
  if(t.dataset.strole){
    const code = t.dataset.strole;
    ROLE[code] = t.value;
    state.roles = Object.assign({}, ROLE);
    save(); rebuild(`${code} role change`);
    toast(`${code} is now a ${ROLE_LABEL[t.value].toLowerCase()}`);
    return true;
  }
  if(t.dataset.stradd){
    // either a suggestion button, a picked airport, or something typed by hand
    const box = $("#stnAdd");
    const typed = t.dataset.stradd === "1"
      ? ((box && box.dataset.code) || (box && box.value) || "")
      : t.dataset.stradd;
    const code = typed.trim().toUpperCase().split(/[\s—]/)[0];
    if(!code) return true;
    if(!AP[code]){ toast(`${code} is not an airport this planner knows`); return true; }
    if(STA.includes(code)){ toast(`${code} is already a station`); return true; }
    STA = STA.concat([code]); ROLE[code] = "P2P";
    state.stations = STA.slice(); state.roles = Object.assign({}, ROLE);
    save(); rebuild(`adding ${code}`);
    toast(`${code} added as a point-to-point base`);
    return true;
  }
  if(t.dataset.strdel){
    const code = t.dataset.strdel, n = stationRoutes(code);
    if(n){ toast(`${n} route${n===1?"":"s"} are based at ${code}`); return true; }
    if(STA.length <= 1){ toast("An airline needs at least one station"); return true; }
    STA = STA.filter(x=>x!==code); delete ROLE[code];
    state.stations = STA.slice(); state.roles = Object.assign({}, ROLE);
    if(state.feed) delete state.feed[code];
    save(); rebuild(`removing ${code}`);
    toast(`${code} removed`);
    return true;
  }
  return false;
}
