#!/usr/bin/env node
/* Python<->JS parity for the cost model.
 *
 * economics.py is the reference; src/economics.js mirrors it. This feeds both
 * the identical schedule -- lines.json, written by engine.py -- and compares
 * the totals. Run after any change to either side:
 *
 *   python3 make_legs.py && python3 engine.py && python3 economics.py
 *   node tools/econ_parity.js
 *
 * economics.js is written for the browser, so the few globals it expects are
 * stubbed here rather than the file being reshaped to suit the test.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const econ = read("src/data/economics.json");
const fleetData = read("src/data/fleet.json");
const AP = read("src/data/airports.json");
const lines = read("lines.json").lines;

const R = Math.PI / 180;
function dist(a, b) {
  const [la1, lo1] = [AP[a][2] * R, AP[a][3] * R];
  const [la2, lo2] = [AP[b][2] * R, AP[b][3] * R];
  return 3440.065 * 2 * Math.asin(Math.sqrt(
    Math.sin((la2 - la1) / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
}

// the globals src/economics.js reads from the page
const SPEC = {}, FLEET_BASE = fleetData.types.map(f => Object.assign({}, f));
for (const f of FLEET_BASE) { f.seats = f.F + f.PE + f.Y; SPEC[f.t] = f; }

const sandbox = {
  console, SPEC, FLEET_BASE, SM: 1.15078,
  state: { spare: 0.08 },
  pairKey: (a, b) => (a < b ? a + "|" + b : b + "|" + a),
  document: { getElementById: id => (
    { econ: { textContent: JSON.stringify(econ) } }[id] || null) }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "src/economics.js"), "utf8"),
                sandbox);

// the same schedule economics.py costs
const flights = [], rots = [];
for (const l of lines) {
  rots.push({ t: l.type });
  for (const [o, d, dep, arr, b] of l.flights)
    flights.push({ o, d, t: l.type, blk: b / 60, nm: dist(o, d) });
}
const out = sandbox.econModel({ flights, rots, totals: {} });

const keys = ["fuel", "crew", "maint", "landing", "handling", "own",
              "direct", "allocated"];
console.log(`${flights.length} flights, ${rots.length} tails, ` +
            `${(out.totals.asm / 1e6).toFixed(1)}m ASM`);
console.log(`CASM ${out.casm.toFixed(2)} cents\n`);
console.log("element        JS $/day   (compare against economics.py)");
for (const k of keys)
  console.log(`${k.padEnd(12)}${Math.round(out.totals[k]).toLocaleString().padStart(14)}`);
if (out.uncosted.length)
  console.log(`\nUNCOSTED TYPES: ${out.uncosted.join(", ")}`);
// compare against the Python reference, and fail loudly if they diverge
const refPath = path.join(ROOT, "econ_py.json");
if (!fs.existsSync(refPath)) {
  console.log("\nno econ_py.json — run: python3 economics.py --json");
  process.exit(2);
}
const ref = read("econ_py.json");
let bad = 0;
console.log("\nelement        JS $/day      Python $/day     diff");
for (const k of keys.concat(["asm", "deps"])) {
  const a = out.totals[k], b = ref.totals[k];
  const rel = Math.abs(b) > 1e-9 ? Math.abs(a - b) / Math.abs(b) : Math.abs(a - b);
  if (rel > 1e-9) bad++;
  console.log(`${k.padEnd(12)}${Math.round(a).toLocaleString().padStart(14)}` +
              `${Math.round(b).toLocaleString().padStart(18)}` +
              `${(a - b).toExponential(1).padStart(10)}`);
}
console.log(bad ? `\nPARITY FAIL — ${bad} element(s) disagree`
                : "\nPARITY OK — economics.js matches economics.py exactly");
process.exit(bad ? 1 : 0);
