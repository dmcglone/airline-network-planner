#!/usr/bin/env node
/* Python<->JS parity for the revenue model.
 *
 * revenue.py is the reference, src/revenue.js mirrors it. Both are fed the
 * identical schedule from lines.json and the identical data files, and the
 * summary numbers must match. Run:
 *
 *   python3 make_legs.py && python3 engine.py && python3 revenue.py
 *   node tools/rev_parity.js
 *
 * revenue.js is written for the browser, so the globals it reads from the page
 * are stubbed here rather than the file being reshaped to suit the test.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const AP = read("src/data/airports.json");
const DEMFILE = read("src/data/dot_db1c.json");
const INTL = read("src/data/intl_demand.json");
const CFG = read("src/data/config.json");
const fleetData = read("src/data/fleet.json");
const STA = read("src/data/stations.json");
const lines = read("lines.json").lines;

const R = Math.PI / 180, DCACHE = new Map();
function dist(a, b) {
  const k = a < b ? a + b : b + a;
  if (!DCACHE.has(k)) {
    const [la1, lo1] = [AP[a][2] * R, AP[a][3] * R];
    const [la2, lo2] = [AP[b][2] * R, AP[b][3] * R];
    DCACHE.set(k, 3440.065 * 2 * Math.asin(Math.sqrt(
      Math.sin((la2 - la1) / 2) ** 2 +
      Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2)));
  }
  return DCACHE.get(k);
}

const SPEC = {};
for (const f of fleetData.types) { f.seats = f.F + f.PE + f.Y; SPEC[f.t] = f; }

const sandbox = {
  console, AP, SPEC, STA, dist, SM: 1.15078, MCT: CFG.mct != null ? CFG.mct : 40,
  DEM: DEMFILE, DOT: DEMFILE.dot,
  document: { getElementById: id => (
    { intl: { textContent: JSON.stringify(INTL) } }[id] || null) }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "src/revenue.js"), "utf8"),
                sandbox);

// the same schedule revenue.py works from
const flights = [];
lines.forEach((l, li) => l.flights.forEach(([o, d, dep, arr, b], gi) => {
  flights.push({ id: li * 100 + gi, o, d, t: l.type, nm: dist(o, d),
                 depU: Math.round(dep), depX: dep, blkMin: b });
}));

const out = sandbox.revenueModel({ flights });
const js = {
  pax: out.stats.pax, rev: out.stats.rev, conn: out.stats.conn,
  spilled: out.stats.spilled, estRev: out.stats.estRev,
  estPax: out.stats.estPax, markets: out.stats.markets,
  real: out.stats.real, estMarkets: out.stats.estMarkets,
  seats: out.seats, asm: out.asm, rpm: out.rpm, ceiling: out.ceiling,
  nonstop: out.itineraries.nonstop, onestop: out.itineraries.onestop,
  lf: out.lf
};

const refPath = path.join(ROOT, "rev_py.json");
if (!fs.existsSync(refPath)) {
  console.log("no rev_py.json — run: python3 revenue.py");
  process.exit(2);
}
const ref = read("rev_py.json");
let bad = 0;
console.log(`${"metric".padEnd(12)}${"JS".padStart(16)}${"Python".padStart(18)}` +
            `${"rel diff".padStart(12)}`);
for (const k of Object.keys(js)) {
  const a = js[k], b = ref[k];
  const rel = Math.abs(b) > 1e-9 ? Math.abs(a - b) / Math.abs(b) : Math.abs(a - b);
  // 1e-9 is float-noise tolerance, not a fudge: these are the same arithmetic
  // in two languages, so anything larger is a real divergence.
  if (rel > 1e-9) bad++;
  const fmt = v => (Math.abs(v) > 1000 ? Math.round(v).toLocaleString()
                                       : v.toFixed(4));
  console.log(`${k.padEnd(12)}${fmt(a).padStart(16)}${fmt(b).padStart(18)}` +
              `${rel.toExponential(1).padStart(12)}`);
}
console.log(bad ? `\nPARITY FAIL — ${bad} metric(s) disagree`
                : "\nPARITY OK — revenue.js matches revenue.py");
process.exit(bad ? 1 : 0);
