/* ---------- livery ----------
   The airline's colour and tail mark. It is part of the airline, so it lives in
   state and travels wherever the airline does: undo, Save to file, Share links.
   Defaults are configuration (config.json brand.livery, and each starter's own).

   One colour drives everything: the fin, the airline name, the planes on the
   map, the flight bars on the timeline, and the app's accent. The semantic
   colours (ok, warn, bad) never change, because they mean something.

   Any colour can be picked, so each is turned into tones that stay readable:
   a light-mode tone at least as readable on white as the planner's original
   orange (3.8:1), a dark-mode tone at 4.5:1 on the dark surface, an ink for
   text and marks on it, and a soft tint. Only lightness moves; the hue is the
   player's. */

const LIVERY_PALETTE = [
  // name, light tone, dark tone. Amber is the planner's original accent, kept
  // exact so an airline that never touches its livery looks as it always did.
  ["Amber",   "#C56A12", "#E8971F"], ["Navy",  "#1F4E8C", "#7FA7E0"],
  ["Teal",    "#0F766E", "#4FC1B5"], ["Crimson", "#B3261E", "#F07A70"],
  ["Pine",    "#2F6B3A", "#7CC48A"], ["Plum",  "#6B3F8C", "#B58CD9"],
  ["Steel",   "#4A5A6A", "#9FB0BF"], ["Sky",   "#0B7BC0", "#5BB6EE"]
];
const LIVERY_MARKS = ["band", "chevron", "disc", "star", "code", "logo"];
const LIVERY_DEFAULT = {color: "#C56A12", mark: "band"};
const LOGO_MAX = 24000;                           // characters of data URL, about 17 KB of PNG
const LOGO_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

/* -- colour arithmetic -- */
const lvRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lvHex = c => "#" + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"))
  .join("").toUpperCase();
function lvLum(c){
  const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const lvContrast = (a, b) => { const x = lvLum(a), y = lvLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function lvHsl([r, g, b]){
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if(mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function lvFromHsl(h, s, l){
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
/* Move lightness one step at a time until the colour reads on `bg`. */
function lvTone(hex, bg, min, dir){
  const B = lvRgb(bg); let c = lvRgb(hex);
  const [h, s] = lvHsl(c); let l = lvHsl(c)[2], n = 0;
  while(lvContrast(c, B) < min && n < 100){ l = Math.max(0, Math.min(1, l + dir * 0.01)); c = lvFromHsl(h, s, l); n++; }
  return {hex: lvHex(c), moved: n > 0};
}
const lvMix = (a, b, t) => lvHex(lvRgb(a).map((v, i) => v * t + lvRgb(b)[i] * (1 - t)));
const lvInk = hex => lvContrast(lvRgb(hex), [255, 255, 255]) >= lvContrast(lvRgb(hex), [26, 18, 6]) ? "#FFFFFF" : "#1A1206";

function liveryTones(hex){
  const pal = LIVERY_PALETTE.find(p => p[1] === hex);
  if(pal && pal[0] === "Amber")
    return {light: "#C56A12", dark: "#E8971F", lightInk: "#FFFFFF", darkInk: "#1A1206",
            lightSoft: "#FBEEDF", darkSoft: "#2A2113", darkened: false};
  const L = lvTone(hex, "#FFFFFF", 3.8, -1);
  const D = pal ? {hex: pal[2]} : lvTone(hex, "#131C25", 4.5, +1);
  return {light: L.hex, dark: D.hex, lightInk: lvInk(L.hex), darkInk: lvInk(D.hex),
          lightSoft: lvMix(L.hex, "#FFFFFF", 0.12), darkSoft: lvMix(D.hex, "#131C25", 0.18),
          darkened: L.moved};
}
/* A hue close to the planner's red for problems or amber for warnings. */
function liveryClash(hex){
  const [h, s] = lvHsl(lvRgb(hex));
  if(s < 0.35) return "";
  const near = t => Math.min(Math.abs(h - t), 360 - Math.abs(h - t)) < 16;
  return near(4) ? "red the planner uses for problems" : near(38) ? "amber the planner uses for warnings" : "";
}

/* The livery as stored, made safe. A shared link or an opened file is somebody
   else's data, so anything that is not one of ours is dropped: a colour must be
   #RRGGBB, a mark must be known, a logo must be a PNG data URL under the cap. */
function liveryOf(st){
  const raw = (st && st.livery && typeof st.livery === "object") ? st.livery : {};
  const L = {color: LIVERY_DEFAULT.color, mark: LIVERY_DEFAULT.mark};
  if(typeof raw.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw.color)) L.color = raw.color.toUpperCase();
  if(LIVERY_MARKS.includes(raw.mark)) L.mark = raw.mark;
  if(typeof raw.logo === "string" && raw.logo.length <= LOGO_MAX && LOGO_RE.test(raw.logo)) L.logo = raw.logo;
  if(L.mark === "logo" && !L.logo) L.mark = LIVERY_DEFAULT.mark;
  return L;
}

/* -- the fin --
   A swept trapezoid. Marks are centred on its centroid (12.7, 13.6) and sized
   to its width there, about 12 units. Centring on the bounding box put them
   high and to the right. */
const FIN_PATH = "M4 22 L10 2 L16 2 L21 22 Z";
function finMark(L, code){
  const ink = "fill:var(--livery-ink)";
  switch(L.mark){
    case "band":    return `<rect x="0" y="12" width="24" height="3.2" style="${ink}"/>`;
    case "chevron": return `<path d="M9.3 16.4 L12.7 11.2 L16.1 16.4" style="fill:none;stroke:var(--livery-ink);`
                         + `stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round"/>`;
    case "disc":    return `<circle cx="12.7" cy="13.6" r="3.3" style="${ink}"/>`;
    case "star":    return `<path d="M12.7 9.4 L13.7 12.2 L16.7 12.3 L14.3 14.1 L15.2 17 L12.7 15.3 L10.2 17 `
                         + `L11.1 14.1 L8.7 12.3 L11.7 12.2 Z" style="${ink}"/>`;
    case "code":    return `<text x="12.7" y="16.1" text-anchor="middle" style="${ink};font:700 7px var(--disp)">`
                         + `${esc(code || "")}</text>`;
    case "logo":    return L.logo ? `<image href="${L.logo}" x="5" y="4.5" width="15.5" height="17" `
                         + `preserveAspectRatio="xMidYMid meet"/>` : "";
  }
  return "";
}
/* One fin per livery, defined once; everything else points at it. */
const finUse = (px, title) => `<svg class="fin" width="${px}" height="${px}" viewBox="0 0 24 24"`
  + (title ? ` role="img" aria-label="${esc(title)}"` : ` aria-hidden="true"`) + `><use href="#liveryFin"/></svg>`;
/* A fin drawn whole, for showing marks other than the current one. */
let lvClipN = 0;
function finInline(L, code, px){
  const id = "lvc" + (++lvClipN);
  return `<svg class="fin" width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true">`
    + `<defs><clipPath id="${id}"><path d="${FIN_PATH}"/></clipPath></defs>`
    + `<path d="${FIN_PATH}" style="fill:var(--livery)"/><g clip-path="url(#${id})">${finMark(L, code)}</g></svg>`;
}

/* -- the aircraft, side on --
   A plain airliner scaled to the type: cabin length sets the fuselage, seats
   abreast set its depth. Cheatline, tail cone and fin wear the livery. */
function liverySideView(f, px){
  const g = (f && f.geom) || {};
  // A user-added type's geometry can arrive in somebody else's shared link, and
  // these numbers go into markup: make them numbers first. With a string, "+"
  // would concatenate and carry the string into the SVG.
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const ab = num(g.abreast && g.abreast.Y, 1, 10, 6);
  const D = ab >= 5 ? 156 : ab >= 4 ? 118 : 92;           // fuselage depth, inches
  const L = num(g.cabinLength, 200, 3000, 1000) + D * 2.6; // nose and tail cones beyond the cabin
  const Ln = D * 1.05, Lt = D * 1.9;
  const body = `M0 ${D * 0.62} C0 ${D * 0.22} ${Ln * 0.45} 0 ${Ln} 0 L${L - Lt * 0.35} 0 L${L} ${D * 0.1} `
    + `L${L} ${D * 0.3} C${L - Lt * 0.3} ${D * 0.42} ${L - Lt * 0.75} ${D} ${L - Lt} ${D} L${Ln * 0.85} ${D} `
    + `C${Ln * 0.35} ${D} 0 ${D * 0.86} 0 ${D * 0.62} Z`;
  const win = [];
  for(let x = Ln * 1.05; x < L - Lt * 1.05; x += 21) win.push(`<rect x="${x.toFixed(1)}" y="${(D * 0.28).toFixed(1)}" width="8" height="11" rx="3"/>`);
  const fw = D * 1.45, fx = L - Lt * 0.62 - fw * 0.26, fy = -fw * 0.88;
  const id = "lvBody" + (++lvClipN);
  const vb = `-12 ${(fy - 6).toFixed(0)} ${(L + 24).toFixed(0)} ${(D * 1.32 - fy + 8).toFixed(0)}`;
  return `<svg class="sideview" viewBox="${vb}" width="${px}" role="img" aria-label="${esc((f && f.t) || "Aircraft")} in your livery">`
    + `<defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs>`
    + `<path d="M${L * 0.36} ${D * 0.78} L${L * 0.58} ${D * 0.82} L${L * 0.6} ${D * 0.9} L${L * 0.4} ${D * 0.9} Z" style="fill:var(--ink-3);opacity:.55"/>`
    + `<use href="#liveryFin" x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fw.toFixed(1)}"/>`
    + `<path d="${body}" style="fill:var(--surface);stroke:var(--ink-3);stroke-width:2.5"/>`
    + `<g clip-path="url(#${id})">`
    +   `<rect x="0" y="${(D * 0.47).toFixed(1)}" width="${L}" height="${(D * 0.09).toFixed(1)}" style="fill:var(--livery)"/>`
    +   `<rect x="${(L - Lt * 0.9).toFixed(1)}" y="0" width="${(Lt).toFixed(1)}" height="${D}" style="fill:var(--livery)"/>`
    +   `<rect x="0" y="${(D * 0.86).toFixed(1)}" width="${L}" height="${(D * 0.14).toFixed(1)}" style="fill:var(--line-2)"/>`
    + `</g>`
    + `<g style="fill:var(--ink-2);opacity:.75">${win.join("")}</g>`
    + `<path d="M${Ln * 0.22} ${D * 0.3} L${Ln * 0.5} ${D * 0.2} L${Ln * 0.56} ${D * 0.36} L${Ln * 0.2} ${D * 0.42} Z" style="fill:var(--ink-2);opacity:.75"/>`
    + `<ellipse cx="${L * 0.43}" cy="${D * 1.07}" rx="${D * 0.42}" ry="${D * 0.2}" style="fill:var(--surface-2);stroke:var(--ink-3);stroke-width:2.5"/>`
    + `<path d="M${L - Lt * 0.55} ${D * 0.2} L${L - Lt * 0.05} ${D * 0.12} L${L - Lt * 0.02} ${D * 0.2} L${L - Lt * 0.5} ${D * 0.3} Z" style="fill:var(--livery)"/>`
    + `</svg>`;
}

/* Put the livery on the page: the tokens, the fin, the header. Called from
   applyBrand(), so boot, undo, opening a file and starters all get it. */
function applyLivery(){
  if(typeof state === "undefined" || !state) return;
  state.livery = liveryOf(state);
  const L = state.livery, T = liveryTones(L.color);
  const light = `--livery:${T.light};--livery-ink:${T.lightInk};--accent:${T.light};--accent-ink:${T.lightInk};--accent-soft:${T.lightSoft}`;
  const dark  = `--livery:${T.dark};--livery-ink:${T.darkInk};--accent:${T.dark};--accent-ink:${T.darkInk};--accent-soft:${T.darkSoft}`;
  // html:root outranks the stylesheet's own :root rules wherever this lands.
  const css = `html:root{${light};--livery-dark:${T.dark};--livery-dark-ink:${T.darkInk}}`
    + `@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){${dark}}}`
    + `html:root[data-theme="dark"]{${dark}}`;
  let st = document.getElementById("liveryCss");
  if(!st){ st = document.createElement("style"); st.id = "liveryCss"; document.head.appendChild(st); }
  st.textContent = css;
  const sp = document.getElementById("liverySprite");
  if(sp) sp.innerHTML = `<defs><clipPath id="liveryFinClip"><path d="${FIN_PATH}"/></clipPath>`
    + `<symbol id="liveryFin" viewBox="0 0 24 24"><path d="${FIN_PATH}" style="fill:var(--livery)"/>`
    + `<g clip-path="url(#liveryFinClip)">${finMark(L, state.code)}</g></symbol></defs>`;
  const hf = document.getElementById("brandFin");
  if(hf) hf.innerHTML = finUse(22);
}

/* A logo, from whatever image the player picks. It is drawn into a canvas and
   kept as a small PNG. An uploaded SVG is never put into the page as markup,
   because SVG can carry script; drawn through an image it cannot run. */
async function liveryLogoFrom(file){
  if(!file) throw new Error("No file chosen.");
  if(file.size > 4e6) throw new Error("That image is over 4 MB. Pick a smaller one.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error("That file isn't an image this browser can read.")); img.src = url; });
    const w0 = img.naturalWidth || 64, h0 = img.naturalHeight || 64;
    for(const px of [64, 48, 36]){
      const c = document.createElement("canvas"); c.width = c.height = px;
      const k = Math.min(px / w0, px / h0), w = w0 * k, h = h0 * k;
      c.getContext("2d").drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
      const d = c.toDataURL("image/png");
      if(d.length <= LOGO_MAX && LOGO_RE.test(d)) return d;
    }
    throw new Error("That image is too detailed to keep small. Try a simpler logo.");
  } finally { URL.revokeObjectURL(url); }
}
