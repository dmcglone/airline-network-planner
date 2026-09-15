/* ----- bank view -----
   The flat schedule sorts flights by time, which is the right shape for looking
   one up and the wrong shape for asking whether a hub works. Four departures at
   08:12, 08:18, 08:24 and 10:06 read as four unrelated rows; as a wave, the fact
   that one aircraft missed the bank by minutes and waited two hours is the first
   thing you see.

   This is a MODE, not a replacement. A point-to-point base has no banks at all:
   it runs a rolling schedule, and the list is exactly how that should look. Draw
   waves there and you are inventing structure that is not in the aeroplane.

   A connection is counted with the revenue model's own rules, so this view and
   the money agree: the wait must be at least MCT and no more than
   REV_MAX_CONNECT, and the routing may not exceed REV_CIRCUITY times the direct
   great circle. */

let bankStation = "";

/* Does this arrival reach that departure? */
function connects(a, d){
  if(a.f.o === d.f.d) return null;                 // going back where it came from
  let wait = d.at - a.at; if(wait < 0) wait += 1440;
  if(wait < MCT || wait > REV_MAX_CONNECT) return null;
  const gc = dist(a.f.o, d.f.d);
  if(gc < 50) return null;
  if(a.f.nm + d.f.nm > REV_CIRCUITY * gc) return null;
  return wait;
}

/* Group a station's day around its DEPARTURE waves.

   Filing every movement into its nearest bank and looking for connections inside
   each one splits a single arrival wave across two banks (06:53, 06:55 and 06:57
   into the six o'clock, 07:22 into the eight) and then reports "no connections"
   for both, which is false: a passenger arriving at 06:57 reaches an 08:12
   departure whatever label the view put on either flight.

   So connections are worked out across the whole day and only the PRESENTATION
   is grouped. A bank is its departures plus every arrival that feeds one of
   them, which is also how a planner says it: "the eight o'clock bank" means
   those departures and the arrivals that made them possible. */
function banksAt(hub){
  const times = (BANKS[ROLE[hub]] || []).slice();
  if(!times.length) return null;

  const arr = [], dep = [];
  for(const f of M.flights){
    if(f.d === hub) arr.push({f, at: loc(hub, f.depU + f.blkMin)});
    if(f.o === hub) dep.push({f, at: loc(hub, f.depU)});
  }
  arr.sort((x, y) => x.at - y.at);
  dep.sort((x, y) => x.at - y.at);

  const links = new Map();                         // departure -> [{a, wait}]
  for(const d of dep) links.set(d, []);
  for(const a of arr) for(const d of dep){
    const w = connects(a, d);
    if(w !== null) links.get(d).push({a, wait: w});
  }

  const nearest = m => {
    let best = 0, bd = 1e9;
    for(let i = 0; i < times.length; i++){
      const raw = Math.abs(m - times[i]);
      const dd = Math.min(raw, 1440 - raw);
      if(dd < bd){ bd = dd; best = i; }
    }
    return best;
  };

  const out = times.map((t, i) => ({at: t, i, dep: [], feeders: []}));
  for(const d of dep) out[nearest(d.at)].dep.push(d);
  for(const b of out){
    const seen = new Set();
    for(const d of b.dep)
      for(const l of links.get(d))
        if(!seen.has(l.a)){ seen.add(l.a); b.feeders.push(l.a); }
    b.feeders.sort((x, y) => x.at - y.at);
  }
  return {banks: out.filter(b => b.dep.length), links};
}

const bankHHMM = m => {
  const v = ((m % 1440) + 1440) % 1440;
  return String(Math.floor(v / 60)).padStart(2, "0") + ":"
       + String(Math.round(v) % 60).padStart(2, "0");
};

function drawBanks(){
  const host = $("#bankView"); if(!host) return;
  const hubs = STA.filter(s => ROLE[s] === "Hub" || ROLE[s] === "Focus");
  if(!hubs.length){
    host.innerHTML = `<div class="pad"><p class="note">No station is a hub or a focus city, so `
      + `there are no banks to show. A point-to-point base runs a rolling schedule with no `
      + `connecting intent, which the list shows exactly as it is. Roles are set on the `
      + `Stations tab.</p></div>`;
    return;
  }
  if(!hubs.includes(bankStation)) bankStation = hubs[0];
  const hub = bankStation;

  const picker = `<div class="toolbar" style="flex-wrap:wrap">`
    + `<span class="dim" style="font-size:12.5px">Banks at</span>`
    + hubs.map(s => `<button class="btn sm${s === hub ? " on" : ""}" data-bank="${esc(s)}">`
        + `${esc(s)} <span class="dim">${esc(ROLE[s])}</span></button>`).join("")
    + `<span class="dim" style="font-size:12.5px">Minimum connection ${fmt(MCT)} minutes, `
    + `nothing over ${fmt(Math.round(REV_MAX_CONNECT / 60))} hours counts.</span></div>`;

  const res = banksAt(hub);
  if(!res || !res.banks.length){
    host.innerHTML = picker + `<div class="pad"><p class="note">${esc(hub)} has no departures `
      + `to group into banks.</p></div>`;
    return;
  }
  const {banks, links} = res;

  // The first bank with departures is the morning origination wave: aircraft that
  // slept here pushing out before anything has landed. Flagging all of them as
  // "nothing feeds it" makes a normal bank look broken, so that bank is labelled
  // for what it is and the warnings are held back.
  const firstIdx = banks.reduce((m, b, i) => (banks[m].at <= b.at ? m : i), 0);

  const body = banks.map((b, bi) => {
    const origination = bi === firstIdx && !b.feeders.length;
    const depSpan = `${bankHHMM(b.dep[0].at)}–${bankHHMM(b.dep[b.dep.length - 1].at)}`;
    const feedSpan = b.feeders.length
      ? `${bankHHMM(b.feeders[0].at)}–${bankHHMM(b.feeders[b.feeders.length - 1].at)}` : "none";
    let pairs = 0;
    for(const d of b.dep) pairs += links.get(d).length;

    const feeders = origination
      ? `<div class="mv dim">Nothing yet: this is the first bank of the day, flown by `
        + `aircraft that spent the night here.</div>`
      : b.feeders.length
      ? b.feeders.map(a => {
          const n = b.dep.filter(d => links.get(d).some(l => l.a === a)).length;
          return `<div class="mv"><span class="mono">${bankHHMM(a.at)}</span> `
            + `<b>${esc(a.f.o)}</b> <span class="dim">${esc(a.f.t)}</span> `
            + `<span class="dim">reaches ${fmt(n)} of ${fmt(b.dep.length)}</span></div>`;
        }).join("")
      : `<div class="mv"><span class="chip warn">nothing feeds this bank</span></div>`;

    const departures = b.dep.map(d => {
      const ls = links.get(d);
      const best = ls.length ? Math.min.apply(null, ls.map(l => l.wait)) : null;
      return `<div class="mv"><span class="mono">${bankHHMM(d.at)}</span> `
        + `<b>${esc(d.f.d)}</b> <span class="dim">${esc(d.f.t)}</span> `
        + (ls.length
            ? `<span class="dim">${fmt(ls.length)} feeding, tightest ${fmt(best)} min</span>`
            : origination ? `<span class="dim">originates here</span>`
                          : `<span class="chip warn">nothing feeds it</span>`)
        + `</div>`;
    }).join("");

    return `<div class="bank">`
      + `<div class="bank-head"><b>${bankHHMM(b.at)}</b> bank `
      + `<span class="dim">${fmt(b.dep.length)} departure${b.dep.length === 1 ? "" : "s"} `
      + `${depSpan} · fed by ${fmt(b.feeders.length)} arrival`
      + `${b.feeders.length === 1 ? "" : "s"} ${feedSpan} · `
      + `${origination ? "originating wave"
            : pairs ? fmt(pairs) + " usable connection" + (pairs === 1 ? "" : "s")
                    : "no connections"}`
      + `</span></div>`
      + `<div class="bank-cols">`
      + `<div><div class="bank-col-h">Arrivals that feed it</div>${feeders}</div>`
      + `<div><div class="bank-col-h">Departures</div>${departures}</div>`
      + `</div></div>`;
  }).join("");

  host.innerHTML = picker + `<div class="pad">${body}</div>`
    + `<div class="pad"><p class="note">A departure sits in the bank it is nearest to, which is `
    + `how a timetable reads: an 08:12 departure belongs to the eight o'clock bank even though `
    + `it is twelve minutes late to it. Connections are worked out across the whole day rather `
    + `than within a bank, because a passenger does not care what this view calls their flights. `
    + `A departure nothing feeds is taking the gate cost of a bank without the reason for `
    + `one.</p></div>`;
}
