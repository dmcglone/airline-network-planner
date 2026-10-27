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
  // Lives on the Settings tab now, so it is always drawn there; the Done button went with the header panel.
  const code = state.code || BRAND.code;
  host.innerHTML =
      `<div class="row">`
    + `<label>Airline name<input id="alName" maxlength="40" style="min-width:230px"`
    + ` value="${esc(state.brand || BRAND.name)}"></label>`
    + `<label>Code<input id="alCode" maxlength="2" class="code" style="width:64px;text-transform:uppercase"`
    + ` value="${esc(code)}"></label>`
    + `<label>Design day label<input id="alDay" maxlength="24" style="width:170px"`
    + ` value="${esc(state.designDay || BRAND.designDay || "")}"></label>`
    + `<button class="btn sm" id="btnStartOver">Start a different airline</button>`
    + `<span class="dim" style="font-size:12.5px;padding-bottom:6px">`
    + `The code prefixes every flight number. It follows the name until you change it,`
    + ` then it is yours. The design day is a caption: the schedule is one representative `
    + `day and nothing reads the date.</span>`
    + `</div>`
    + liveryPanelHTML();

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
    applyLivery();                            // a Code tail mark wears it too
    save(); draw();                           // flight numbers wear it, so redraw
  });
  $("#alDay").addEventListener("input", e=>{
    state.designDay = e.target.value.trim().slice(0,24);
    $("#designday").textContent = state.designDay ? "Design day · "+state.designDay : "";
    save();
  });
  $("#btnStartOver").addEventListener("click", ()=>{
    welcomeOpen = true; drawWelcome(); });
  wireLivery(host);
}

/* ----- livery: the colour and tail mark, on the aircraft that wears them ----- */
const MARK_NAME = {band:"Band", chevron:"Chevron", disc:"Disc", star:"Star", code:"Code", logo:"Logo"};

function liveryNote(L){
  const T = liveryTones(L.color), bits = [
    "Your colour paints the tail, the airline name, the planes on the map, the flight bars on "
    + "Rotations and the planner's accent. Colours that mean something, like red for a problem, stay as they are."];
  if(T.darkened) bits.push("This one is darkened a little in light mode so it stays readable on white.");
  const clash = liveryClash(T.light);
  if(clash) bits.push(`It is close to the ${clash}, so accents may read as warnings.`);
  return bits.join(" ");
}

function liveryPanelHTML(){
  const L = liveryOf(state);
  const f = state.fleet.find(x => x.t === "A320") || state.fleet[0];
  const custom = !LIVERY_PALETTE.some(p => p[1] === L.color);
  const sw = LIVERY_PALETTE.map(([n, c]) =>
    `<button class="lv-sw${L.color === c ? " on" : ""}" data-lvcolor="${c}" style="background:${c}"`
    + ` title="${n}" aria-label="${n}" aria-pressed="${L.color === c}"></button>`).join("");
  const marks = LIVERY_MARKS.filter(m => m !== "logo" || L.logo).map(m =>
    `<button class="btn sm lv-mk${L.mark === m ? " on" : ""}" data-lvmark="${m}" aria-pressed="${L.mark === m}">`
    + `${finInline(Object.assign({}, L, {mark: m}), state.code, 26)}<span>${MARK_NAME[m]}</span></button>`).join("");
  return `<div class="livery">`
    + `<div class="lv-view">${f ? liverySideView(f, 560) : ""}</div>`
    + `<div class="lv-ctl">`
    +   `<div class="lv-row"><span class="lv-l">Colour</span><div class="lv-sws">${sw}`
    +     `<label class="lv-custom${custom ? " on" : ""}">Any colour`
    +     `<input type="color" id="lvCustom" value="${L.color.toLowerCase()}"></label></div></div>`
    +   `<div class="lv-row"><span class="lv-l">Tail mark</span><div class="lv-mks">${marks}</div></div>`
    +   `<div class="lv-row"><span class="lv-l">Logo</span><div class="lv-logo">`
    +     `<button class="btn sm" id="lvUpload">${L.logo ? "Replace logo…" : "Upload a logo…"}</button>`
    +     (L.logo ? `<button class="btn sm" id="lvNoLogo">Remove logo</button>` : "")
    +     `<input type="file" id="lvFile" accept="image/*" hidden>`
    +     `<span class="dim" id="lvLogoMsg">Kept as a small PNG on the tail. It goes with Save to file and Share links.</span>`
    +   `</div></div>`
    +   `<p class="note" id="lvNote">${esc(liveryNote(L))}</p>`
    + `</div></div>`;
}

/* A livery change is an edit: saved, and one step on Undo. */
function setLivery(patch, label){
  const L = Object.assign({}, liveryOf(state), patch);
  for(const k of Object.keys(L)) if(L[k] === undefined) delete L[k];
  state.livery = L;
  applyLivery(); save();
  if(typeof pushUndo === "function"){ pushUndo(label); markCommitted(); }
}

function wireLivery(host){
  host.querySelectorAll("[data-lvcolor]").forEach(b => b.addEventListener("click", () => {
    setLivery({color: b.dataset.lvcolor}, "livery colour"); drawAirline(); }));
  host.querySelectorAll("[data-lvmark]").forEach(b => b.addEventListener("click", () => {
    setLivery({mark: b.dataset.lvmark}, "tail mark"); drawAirline(); }));
  const cu = $("#lvCustom");
  if(cu){
    // Dragging the picker repaints at once; letting go makes it an edit.
    cu.addEventListener("input", e => {
      state.livery = Object.assign({}, liveryOf(state), {color: e.target.value.toUpperCase()});
      applyLivery();
      const n = $("#lvNote"); if(n) n.textContent = liveryNote(state.livery);
    });
    cu.addEventListener("change", e => { setLivery({color: e.target.value.toUpperCase()}, "livery colour"); drawAirline(); });
  }
  const up = $("#lvUpload"), file = $("#lvFile");
  if(up && file){
    up.addEventListener("click", () => file.click());
    file.addEventListener("change", async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = "";
      if(!f) return;
      try { const logo = await liveryLogoFrom(f); setLivery({logo, mark: "logo"}, "logo"); drawAirline(); toast("Logo on the tail"); }
      catch(err){ const m = $("#lvLogoMsg"); if(m) m.textContent = err.message || String(err); }
    });
  }
  const nl = $("#lvNoLogo");
  if(nl) nl.addEventListener("click", () => {
    const L = liveryOf(state);
    setLivery({logo: undefined, mark: L.mark === "logo" ? "band" : L.mark}, "logo"); drawAirline(); });
}
