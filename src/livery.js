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

/* -- the tail, side on --
   An airliner's fin, nose to the left: a leading edge swept back from a curved
   fillet, a short tip, a trailing edge leaning aft and the rudder hinge. Root
   chord about 1.2 times the height, the A320's proportion. The mark sits where
   the fin is widest, scaled to its width there. */
const TAIL_PATH = "M2 24 C7 23.6 9.6 19.4 11.2 15.6 L20.6 1 L29.4 1 L27.4 24 Z";
const TAIL_MARK = "translate(20.8 12.6) scale(1.15) translate(-12.7 -13.6)";

/* -- the aircraft, side on --
   Drawn from the type's own numbers. Cabin length and seats abreast give the
   fuselage, and the exits the seatmap uses put the doors and over-wing exits
   where they are. The rest follows published drawings of the A320, E175 and
   ERJ-145, as fractions of fuselage depth: nose and tail cone length, fin
   height, wing, engine and gear positions, ground clearance. A geometry with
   engines "rear" (ERJ-145, CRJ) gets them on the rear fuselage under a T-tail;
   every other type hangs them under the wing. The airframe is white in either
   theme; the fin, tail, cheatline and engines wear the livery. */
// A user-added type's geometry can arrive in somebody else's shared link, and
// these numbers go into markup: make them numbers first. With a string, "+"
// would concatenate and carry the string into the SVG.
const lvNum = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
/* The airframe's overall size, in inches. The hangar draws types to scale with
   each other by these. */
function sideDims(f){
  const g = (f && f.geom) || {};
  const ab = lvNum(g.abreast && g.abreast.Y, 1, 10, 6);
  const D = ab >= 5 ? 156 : ab >= 4 ? 118 : 92;          // fuselage depth
  const rear = g.engines === "rear", regional = D < 140;
  const cab = lvNum(g.cabinLength, 200, 3000, 1000);
  const Ln = D * (rear ? 1.7 : regional ? 1.2 : 1.05);   // nose ahead of the cabin
  const Lt = D * (rear ? 3.9 : regional ? 2.4 : 1.5);    // tail cone behind it
  return {g, D, rear, regional, cab, Ln, Lt, L: Ln + cab + Lt};
}
function liverySideView(f, px){
  const {g, D, rear, regional, cab, Ln, Lt, L} = sideDims(f), num = lvNum;
  const r1 = v => +v.toFixed(1);
  const finH = D * (rear ? 1.55 : regional ? 1.9 : 1.5);
  const ground = D * (rear ? 1.36 : regional ? 1.42 : 1.5);
  const tt = D * 0.32;                                   // the tail tip's height on the body

  // fuselage: crown, tail cone tapering to a small rounded tip, belly sweeping
  // up, chin, and a radome that falls away from the windscreen (more pointed on
  // the regional jets)
  const xb = L - Lt - D * 1.1, pt = rear || regional, ny = D * (pt ? 0.56 : 0.6);
  const body = `M${r1(Ln)} 0 L${r1(L - Lt * 0.55)} 0 C${r1(L - Lt * 0.25)} 0 ${r1(L - Lt * 0.05)} ${r1(tt - D * 0.12)} ${r1(L - D * 0.05)} ${r1(tt - D * 0.05)}`
    + ` Q${r1(L)} ${r1(tt)} ${r1(L - D * 0.05)} ${r1(tt + D * 0.05)}`
    + ` C${r1(L - (L - xb) * 0.18)} ${r1(tt + D * 0.3)} ${r1(xb + (L - xb) * 0.45)} ${r1(D)} ${r1(xb)} ${r1(D)}`
    + ` L${r1(Ln * 0.75)} ${r1(D)} C${r1(Ln * (pt ? 0.42 : 0.3))} ${r1(D)} ${r1(Ln * (pt ? 0.07 : 0))} ${r1(D * (pt ? 0.84 : 0.9))} 0 ${r1(ny)}`
    + ` C${r1(Ln * (pt ? 0.12 : 0))} ${r1(D * (pt ? 0.32 : 0.36))} ${r1(Ln * (pt ? 0.5 : 0.3))} ${r1(D * (pt ? 0.02 : 0.05))} ${r1(Ln)} 0 Z`;

  // the fin, placed by its trailing edge root; s is inches per tail-frame unit
  const s = finH / 23, xr = L - D * (rear ? 0.45 : 0.5);
  const fx = xr - 27.4 * s, fy = D * 0.05 - 24 * s;
  const tailFrom = fx + 2 * s + D * 0.2;                  // where the livery sweeps onto the body

  // doors and over-wing exits where the geometry has them; windows between
  const wy = D * 0.36, cut = [], det = [];
  for(const e of (Array.isArray(g.exits) ? g.exits : [])){
    const over = e.type === "III" || e.type === "IV";
    const w = over ? 20 : e.type === "I" ? 26 : 32, h = over ? 34 : Math.min(72, D * 0.7);
    const x = Math.min(Ln + cab - w / 2 - 6, Math.max(Ln + w / 2 + 6, Ln + num(e.x, 0, 1, 0) * cab));
    cut.push([x - w / 2 - 8, x + w / 2 + 8]);
    det.push(`<rect x="${r1(x - w / 2)}" y="${r1(over ? wy - h / 2 : D * 0.14)}" width="${w}" height="${r1(h)}" rx="${over ? 4 : 6}" class="pl-detail"/>`);
  }
  const win = [];
  for(let x = Ln + 30; x < Ln + cab - 24; x += 21)
    if(!cut.some(([a, b]) => x + 9 > a && x < b)) win.push(`<rect x="${r1(x)}" y="${r1(wy - 6)}" width="8.5" height="12.5" rx="4"/>`);

  // wing, belly fairing and gear. The near wing runs aft and up from its root
  // low on the body (sweep and dihedral), with two flap-track fairings under it.
  const xw = L * (rear ? 0.42 : 0.3), c = D * (rear ? 1.3 : 1.45);
  const wy0 = D * 0.7, wy1 = D * 0.84;                   // root leading and trailing edge heights
  const wing = `M${r1(xw)} ${r1(wy0)} L${r1(xw + c + D * 0.7)} ${r1(D * 0.5)} L${r1(xw + c + D * 1.05)} ${r1(D * 0.52)}`
    + ` L${r1(xw + c)} ${r1(wy1)} Z`
    + [0.35, 0.68].map(k => { const x = xw + c + D * 1.05 * k, y = wy1 - (wy1 - D * 0.52) * k;
        return ` M${r1(x - D * 0.32)} ${r1(y + D * 0.01)} Q${r1(x)} ${r1(y + D * 0.09)} ${r1(x + D * 0.2)} ${r1(y - D * 0.01)} Z`; }).join("");
  const underWing = x => wy0 + (x - xw) / c * (wy1 - wy0);
  const fairing = `M${r1(xw - D * 0.25)} ${r1(D * 0.96)} Q${r1(xw + c * 0.5)} ${r1(D * (rear ? 1.06 : 1.12))} ${r1(xw + c + D * 0.35)} ${r1(D * 0.96)} Z`;
  const gear = (x, r, top) => `<rect x="${r1(x - D * 0.025)}" y="${r1(top)}" width="${r1(D * 0.05)}" height="${r1(ground - r - top)}" class="pl-metal"/>`
    + `<circle cx="${r1(x)}" cy="${r1(ground - r)}" r="${r1(r)}" class="pl-tyre"/><circle cx="${r1(x)}" cy="${r1(ground - r)}" r="${r1(r * 0.45)}" class="pl-metal"/>`;
  const xm = L * (rear ? 0.55 : 0.47);

  // engines: a nacelle in the livery, fattest just behind the intake and
  // tapering to the nozzle, with a metal lip, a dark intake and an exhaust cone
  const nacelle = (x0, cy, len, d) => `<path d="M${r1(x0 + d * 0.06)} ${r1(cy - d * 0.42)}`
    + ` C${r1(x0 + len * 0.25)} ${r1(cy - d * 0.53)} ${r1(x0 + len * 0.55)} ${r1(cy - d * 0.52)} ${r1(x0 + len * 0.84)} ${r1(cy - d * 0.34)}`
    + ` L${r1(x0 + len)} ${r1(cy - d * 0.25)} L${r1(x0 + len)} ${r1(cy + d * 0.25)} L${r1(x0 + len * 0.84)} ${r1(cy + d * 0.34)}`
    + ` C${r1(x0 + len * 0.55)} ${r1(cy + d * 0.52)} ${r1(x0 + len * 0.25)} ${r1(cy + d * 0.53)} ${r1(x0 + d * 0.06)} ${r1(cy + d * 0.42)}`
    + ` Q${r1(x0 - d * 0.03)} ${r1(cy)} ${r1(x0 + d * 0.06)} ${r1(cy - d * 0.42)} Z" class="pl-livery pl-edge"/>`
    + `<path d="M${r1(x0 + d * 0.06)} ${r1(cy - d * 0.42)} Q${r1(x0 - d * 0.03)} ${r1(cy)} ${r1(x0 + d * 0.06)} ${r1(cy + d * 0.42)}`
    + ` L${r1(x0 + d * 0.24)} ${r1(cy + d * 0.48)} L${r1(x0 + d * 0.24)} ${r1(cy - d * 0.48)} Z" class="pl-metal pl-edge"/>`
    + `<ellipse cx="${r1(x0 + d * 0.04)}" cy="${r1(cy)}" rx="${r1(d * 0.05)}" ry="${r1(d * 0.34)}" class="pl-glass"/>`
    + `<path d="M${r1(x0 + len)} ${r1(cy - d * 0.2)} L${r1(x0 + len + d * 0.36)} ${r1(cy)} L${r1(x0 + len)} ${r1(cy + d * 0.2)} Z" class="pl-metal pl-edge"/>`;
  let engines;
  if(rear){
    const len = D * 1.25, d = D * 0.5, x0 = L - Lt * 0.78;
    engines = `<path d="M${r1(x0 + len * 0.3)} ${r1(D * 0.3)} L${r1(x0 + len * 0.8)} ${r1(D * 0.3)} L${r1(x0 + len * 0.9)} ${r1(D * 0.46)} L${r1(x0 + len * 0.25)} ${r1(D * 0.46)} Z" class="pl-belly pl-edge"/>`
      + nacelle(x0, D * 0.28, len, d);
  } else {
    // hung forward of the wing on a pylon that meets the wing's underside
    const len = D * 1.1, d = D * (regional ? 0.55 : 0.52), x0 = xw - D * 0.2, cy = D * 1.12;
    const pa = x0 + len * 0.3, pb = x0 + len * 0.92;
    engines = `<path d="M${r1(pa)} ${r1(cy - d * 0.45)} L${r1(pa + D * 0.15)} ${r1(underWing(pa + D * 0.15))}`
      + ` L${r1(pb + D * 0.25)} ${r1(underWing(pb + D * 0.25))} L${r1(pb)} ${r1(cy - d * 0.38)} Z" class="pl-belly pl-edge"/>`
      + nacelle(x0, cy, len, d);
  }
  // tail planes: swept back under the fin and short of the tail tip, or across
  // the top of the fin for a T-tail
  const stab = rear
    ? `M${r1(fx + 16 * s)} ${r1(fy + 1.6 * s)} L${r1(fx + 31 * s)} ${r1(fy + 0.2 * s)} L${r1(fx + 32.5 * s)} ${r1(fy + 1.4 * s)} L${r1(fx + 19 * s)} ${r1(fy + 3 * s)} Z`
    : `M${r1(L - Lt * 0.92)} ${r1(tt + D * 0.12)} L${r1(L - D * 0.42)} ${r1(tt - D * 0.03)} L${r1(L - D * 0.32)} ${r1(tt + D * 0.03)} L${r1(L - Lt * 0.5)} ${r1(tt + D * 0.17)} Z`;

  const id = "lvBody" + (++lvClipN);
  const top = fy - D * 0.12, vb = `${r1(-D * 0.06)} ${r1(top)} ${r1(L + D * 0.1)} ${r1(ground + D * 0.08 - top)}`;
  return `<svg class="sideview" viewBox="${vb}" width="${px}" role="img" aria-label="${esc((f && f.t) || "Aircraft")} in your livery">`
    + `<defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs>`
    + `<ellipse cx="${r1(L * 0.5)}" cy="${r1(ground)}" rx="${r1(L * 0.47)}" ry="${r1(D * 0.07)}" class="pl-shadow"/>`
    + gear(Ln * 1.1, D * 0.1, D * 0.9) + gear(xm, D * 0.15, D * 0.95)
    + `<path d="${fairing}" class="pl-belly pl-edge"/>`          // under the body, so only its bulge shows
    + `<use href="#liveryTail" x="${r1(fx)}" y="${r1(fy)}" width="${r1(32 * s)}" height="${r1(24 * s)}"/>`
    + `<path d="${body}" class="pl-body"/>`
    + `<g clip-path="url(#${id})">`
    +   `<rect x="0" y="${r1(D * 0.64)}" width="${r1(L)}" height="${r1(D * 0.4)}" class="pl-belly"/>`
    +   `<rect x="${r1(Ln * 0.55)}" y="${r1(D * 0.48)}" width="${r1(tailFrom - Ln * 0.55)}" height="${r1(D * 0.04)}" class="pl-livery"/>`
    +   `<path d="M${r1(tailFrom)} -2 L${r1(L + 2)} -2 L${r1(L + 2)} ${r1(D)} L${r1(tailFrom + D * 1.5)} ${r1(D)} Z" class="pl-livery"/>`
    + `</g>`
    + `<path d="${body}" class="pl-edge" style="fill:none"/>`
    + `<g class="pl-glass">${win.join("")}</g>${det.join("")}`
    + `<path d="M${r1(Ln * 0.33)} ${r1(D * 0.3)} L${r1(Ln * 0.47)} ${r1(D * 0.15)} L${r1(Ln * 0.75)} ${r1(D * 0.09)} L${r1(Ln * 0.77)} ${r1(D * 0.21)} L${r1(Ln * 0.48)} ${r1(D * 0.25)} Z" class="pl-glass"/>`
    + `<path d="${stab}" class="pl-body pl-edge"/>`
    + `<path d="${wing}" class="pl-belly pl-edge"/>`
    + engines
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
    + `<g clip-path="url(#liveryFinClip)">${finMark(L, state.code)}</g></symbol>`
    + `<clipPath id="liveryTailClip"><path d="${TAIL_PATH}"/></clipPath>`
    + `<symbol id="liveryTail" viewBox="0 0 32 24"><path d="${TAIL_PATH}" class="pl-livery"/>`
    + `<g clip-path="url(#liveryTailClip)"><g transform="${TAIL_MARK}">${finMark(L, state.code)}</g>`
    + `<path d="M26.2 1 L21.6 24" class="pl-hinge"/></g>`
    + `<path d="${TAIL_PATH}" class="pl-edge" style="fill:none"/></symbol></defs>`;
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
