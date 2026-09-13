/* ----- airline settings -----
   Name, designator and design day. These are the airline's identity rather than
   its network, so they sit beside the wordmark instead of taking a tab.

   The designator is suggested from the name and then left alone. Keeping the
   two permanently in step would produce codes that feel wrong -- Southwest is
   WN, JetBlue B6 -- and would silently overwrite a deliberate choice the next
   time somebody renamed the airline. So the suggestion applies only while the
   code is still the one we guessed. */

let airlineOpen = false;

function codeIsUntouched(){
  return !state.codeSetByUser;
}

function drawAirline(){
  const host = $("#airlinePanel"); if(!host) return;
  host.hidden = !airlineOpen;
  if(!airlineOpen){ host.innerHTML = ""; return; }
  const code = state.code || BRAND.code;
  host.innerHTML =
      `<div class="row">`
    + `<label>Airline name<input id="alName" maxlength="40" style="min-width:230px"`
    + ` value="${esc(state.brand || BRAND.name)}"></label>`
    + `<label>Code<input id="alCode" maxlength="2" class="code" style="width:64px;text-transform:uppercase"`
    + ` value="${esc(code)}"></label>`
    + `<label>Design day label<input id="alDay" maxlength="24" style="width:170px"`
    + ` value="${esc(state.designDay || BRAND.designDay || "")}"></label>`
    + `<button class="btn" id="alDone">Done</button>`
    + `<button class="btn sm" id="btnStartOver">Start a different airline</button>`
    + `<span class="dim" style="font-size:12.5px;padding-bottom:6px">`
    + `The code prefixes every flight number. It follows the name until you change it,`
    + ` then it is yours. The design day is a caption: the schedule is one representative `
    + `day and nothing reads the date.</span>`
    + `</div>`;

  $("#alName").addEventListener("input", e=>{
    const n = e.target.value.trim().slice(0,40) || BRAND.name;
    state.brand = n;
    if(codeIsUntouched()){
      state.code = suggestCode(n);
      const f = $("#alCode"); if(f) f.value = state.code;
    }
    applyBrand(); save();
  });
  $("#alCode").addEventListener("input", e=>{
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,2);
    e.target.value = v;
    if(!validCode(v)) return;                 // half-typed: wait for the second character
    state.code = v; state.codeSetByUser = true;
    save(); draw();                           // flight numbers wear it, so redraw
  });
  $("#alDay").addEventListener("input", e=>{
    state.designDay = e.target.value.trim().slice(0,24);
    $("#designday").textContent = state.designDay ? "Design day · "+state.designDay : "";
    save();
  });
  $("#alDone").addEventListener("click", ()=>{ airlineOpen = false; drawAirline(); });
  $("#btnStartOver").addEventListener("click", ()=>{
    airlineOpen = false; drawAirline(); welcomeOpen = true; drawWelcome(); });
}
