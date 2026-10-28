# Roadmap

Possible enhancements. Nothing here is committed work — it is a list of things
the model could do next, with enough detail to start one without re-deriving the
reasoning.

**The constraint that governs all of it.** `economics.js` and `revenue.js` read
the finished schedule and never write back into it, which is why the eight
acceptance metrics and the ten checks cannot move because of anything in the
financial layer. Items 2, 3, 4 and 7 below stay inside that layer and inherit
the guarantee. Items 1, 5 and 6 touch the engine or add a check, so each one
needs `verify.py` green and Python↔JS parity re-confirmed before it ships.

**What this is not going to become.** No solver that returns the network. The
suggestion engine proposing candidates a human accepts or rejects is the right
level; an optimizer that hands back the answer deletes the reason to use the
tool. No crew pairing and no MIP. A crew-base reachability check would be worth
having; duty-rule modelling would not.

---

## 1. Reliability mode

Monte Carlo delay propagation over the finished rotations. Sample a departure
delay per flight, propagate it down the tail through the turn times, and report
on-time performance, misconnected passengers, and which rotations are fragile.

**Why.** Late-arriving aircraft is roughly 39% of all delay minutes for US
reporting carriers, precisely because schedules built to maximise asset
utilisation carry no buffer to absorb fluctuation. The model currently treats
11.0 utilisation hours as free. This is the item that makes packing the day
harder cost something, which is the tension the tool is missing.

**Where.** New `src/reliability.js` reading `M.rots` and `M.flights`, mirrored by
`reliability.py`. The rotation chains and exact turn times already exist; nothing
new needs to be derived from the network.

**Watch for.** Minimum turn time and planned buffer are different quantities. The
engine schedules to the minimum; this layer measures what that costs. Do not let
it start editing turn times.

**Also closes.** The parked "wiring irregular-ops delays into the live map" item.

## 2. Per-market competition

`REV_COMPETITION = 1.0` gives every market exactly one equally attractive rival,
whether it is SJC–LAX or a 400 nm spoke nobody else flies. Replace the scalar
with an optional per-market competitor frequency, keeping the current constant as
the default, and let our own share respond to our own frequency through an
exponent (α ≈ 1.5 is the usual range).

**Why.** This is the S-curve: with equal fares, the carrier holding a
frequency-share advantage takes a more than proportional market share, at both
route and airport level. Today a second daily frequency buys seats and nothing
else, so the model cannot express the reason airlines actually add frequency.

**Where.** `revenue.js` / `revenue.py` `allocateDemand`, plus a competition field
in the demand data with the same provenance discipline as everything else — a
guessed competitor count must not be reportable as a measured one.

**Knock-on.** The "unopposed demand ceiling below 65%" finding is partly an
artefact of the constant, not purely a property of the schedule. Expect that
number to move, and expect the Grow rankings to reorder once contested markets
stop looking as winnable as empty ones.

## 3. Time-of-day desirability in QSI

Itinerary QSI is `(best/elapsed)² × connect penalty` and carries no time-of-day
term. Multiply in a departure-time preference curve — morning and evening peaks,
a red-eye discount.

**Why.** The competing academic framing to the S-curve is the schedule delay
model, which prices the gap between when travellers want to fly and when flights
are available, and which predicts observed carrier behaviour more plausibly
(numerically the two converge in realistic settings). More to the point: the bank
structure is what the entire engine is built around, and right now it earns no
revenue credit at all. Bank times in `config.json` should be a decision with a
payoff.

**Where.** `revenue.js` / `revenue.py`, inside the QSI loop. Small change.

## 4. Recapture

Spilled passengers currently vanish into `st.spilled`. After the spill passes,
redistribute a fraction of spilled demand onto remaining uncapped itineraries in
the same market and let the rest leave the airline.

**Why.** Recapture is standard in itinerary-based planning models, and the
recapture proportions are deliberately allowed to sum to less than 100% to
represent passengers who go to another carrier or another mode. The model is
currently pinned at the pessimistic end.

**Where.** `allocateDemand` in `revenue.js` / `revenue.py`. On the order of ten
lines each side, plus a parity re-run.

**Knock-on.** Makes gauge selection meaningfully harder. An A319 that spills into
a same-day A321 is a different route from one that spills into nothing.

## 5. Season switch

Scale every market's demand by its own monthly value from the seasonality spark
and rebuild. Peak and trough should look like two different airlines.

**Why.** The eleven-month spark is already computed for all 12,241 markets and
currently only ever appears as decoration in the Grow tab. With three
Florida-and-Caribbean-weighted stations, seasonality is the largest unused asset
in `src/data/`.

**Where.** `demand.js` lookup plus a control in the UI. Note that this one does
move the acceptance metrics, because the schedule genuinely changes — so the
design day stays the reference case and the metrics stay pinned to it. A season
other than the design day is a scenario, not a new baseline.

**A date picker belongs with this item, not before it.** The Airline panel has a
design day field and the obvious suggestion is to make it a calendar picker. It
should not become one until this lands. Nothing reads the date today: it is a
caption on a schedule that represents one generic day. A picker sitting beside a
Season column full of real monthly data would imply it drives that data, and
somebody would choose a January date, see identical demand and conclude the
seasonality is fabricated. Once demand scales by month, the picker is the right
control and the caption becomes a real input.

## 6. Gate caps as a constraint

Peak gates are computed by interval-graph colouring and then reported. Nothing
stops the answer being 79. Add a per-station gate limit to `config.json`, make it
an eleventh check, and let Fix propose retimes when a station busts its cap.

**Why.** It is the most realistic constraint currently missing, and it is how
bank structure actually gets decided. It also gives the SJC 52-aircraft-push
history a permanent guard rather than a remembered fix.

**Where.** `config.json`, `validate.js` and `validate.py` together (they must stay
independent re-derivations, not one calling the other), `suggest.js`, and the
Checks tab.

**Watch for.** Adding a check changes what "all ten pass" means. Update
`verify.py`, the README, and the count in both validators in the same commit.

## 7. Pricing lever

One fare multiplier per route, with demand responding through a constant
elasticity around −1.2.

**Why.** It will not be accurate, and it should be labelled as such. But it lets
the model answer "discount into a contested market, or hold fare and fly a
smaller gauge," which is the question the Economics tab is one input short of
being able to ask. Best built after item 2, since pricing against a fixed
competitor is not much of a decision.

**Where.** `network.json` route records, `revenue.js` / `revenue.py`.

## 8. Scenario A/B

Snapshot two network states and diff the eight metrics plus the P&L side by side.

**Why.** It is what turns the tool from "here is my network" into "here are two
networks and here is what changed," which is the difference between a report
and a planner.

**Caution.** Two full rebuilds are *not* directly comparable, which an earlier
version of this note claimed. A rebuild re-times flights across the whole day,
and that reshuffle alone moves network revenue by a median of $18k a day (see
"Known limitation: the schedule reshuffles" below). A diff of the P&L between
two states therefore mixes the change with the reshuffle. Compare the way the
network check does: revenue on one schedule with the changed markets swapped
in, aircraft counted for the types that changed, gates at the airports that
changed.

**Where.** `state.js` (export/import already round-trips the whole thing) plus a
new UI surface.

## 9. Regional flying as a wholly-owned subsidiary

Decide, and then record, that the E175 and E145 fleets are operated by a
wholly-owned regional subsidiary rather than on the mainline seniority list.
Cost both types from the wholly-owned carriers only, all four elements together.

**Why this is not the item it used to be.** The previous note here said the
E175/E145 ownership rates were placeholders distorted by SkyWest's capacity
purchase agreement reporting. That is wrong, and the data says so. `blend()`
already drops `no-ownership` and `flat-ownership` rows before averaging
ownership, and for these two types that filter leaves exactly one carrier each:

| Type | Ownership comes from | ownDay | Dropped |
|---|---|---|---|
| E175 | QX, Horizon (Alaska-owned), 96,582 deps | $3,405 | OO $101, YV $479, YX and MQ flagged out |
| E145 | PT, Piedmont (American-owned), 144,968 deps | $2,206 | C5 $0 |

Both are wholly-owned subsidiaries holding their own metal, so the ownership
figures are already exactly what an in-house assumption would produce. They are
measured, not placeholder, and they sit sensibly against the A319's $4,444.

**The actual inconsistency.** Ownership comes from one carrier; fuel, crew and
maintenance are departure-weighted across four, and SkyWest's 446,346 E175
departures dominate that weighting. So the ownership basis and the operating
basis currently describe different companies.

**The decision.** Frontier's regional flying is a wholly-owned subsidiary on
separate pay scales. That is a structural choice, not a data-cleaning step, and
it should be visible as one. Under it, the CPA margin is intercompany and washes
out on consolidation, so nothing is added on top; the sub's own costs are the
right costs. The alternative — regional aircraft flown by mainline crews at
roughly $1,575 a block hour against the regionals' $716 to $846 — would add on
the order of $580k/day and is a different airline.

**Where.** A per-type peer override in `fleet.json`, so all four elements come
from one basis rather than a hand multiplier on one of them:

```json
{ "t": "E175", "f41": "E175", "f41Peers": ["QX"] },
{ "t": "E145", "f41": "E145", "f41Peers": ["PT"] }
```

Effect on direct cost per departure, fuel plus crew plus maintenance:

| | 1.0 h | 1.6 h | 3.0 h |
|---|---|---|---|
| E175 blended | $2,482 | $3,661 | $6,411 |
| E175 QX only | $2,789 | $4,117 | $7,217 |
| E145 blended | $2,300 | $3,412 | $6,008 |
| E145 PT only | $2,294 | $3,412 | $6,021 |

The E175 gets about 12% dearer and the E145 does not move. Both samples clear
the `thin` threshold comfortably.

**Also fix, separately.** Type-level `flags` is a union across every row in the
blend, but `ownDay` is computed from a subset. E175 therefore wears a
`no-ownership` chip in the Economics tab because SkyWest and Mesa contribute to
its fuel and crew rates, even though neither touched the ownership number. One
line in `blend()`: assemble the ownership flag from `orws`, not `rs`. Narrowing
to QX and PT hides the symptom, since those rows carry no flags at all, so fix
the flag logic first or the bug survives unnoticed.

**Record it in two places.** A `note` on the fleet entries, and one line in the
Economics tab's "where the numbers come from" panel. A reader should not have to
infer the operating structure from a rate.

**Watch for.** This flatters regional gauge. Grow ranks on estimated
contribution, so cheaper crew pushes E175 candidates up the list on thin
markets. That is a true consequence of the structure rather than a bug, but it
follows from the assumption, and the assumption should be legible when the
ranking is read. Narrowing to one carrier also makes Horizon's idiosyncrasies —
its 473 nm stage length, its maintenance accounting — the whole E175 basis.

---

## 10. Fleet type creation, cabin constraints, and a seatmap builder

**Built**, 12 and 13 September 2026: fccf0ea (seatmap designer, fleet types,
cabin revenue, airline identity) and eedbb6c (fare multipliers by seat kind).
The rules are in `src/seatmap.js`, the designer in `src/ui/seatmap.js`.

- **Cabin mix reaches revenue.** This was the prerequisite. `cabinMultipliers()`
  computed F/PE/Y multipliers that nothing used, so densifying was free money.
  Revenue now prices each flight by cabin and seat kind (`SEAT_MULT`, with a
  stage taper for lie-flat), normalised so the seat-weighted fleet mean is 1.0.
  Item 12 covers where those ratios came from.
- **Constraints.** Cabin length (rows × pitch plus the galley and lavatory
  monuments), the seat limit, and one flight attendant per 50 seats (14 CFR
  121.391), with the next step shown. A row at an overwing Type III gets 34
  inches. Violations are reported in the designer rather than refused.
- **The seat limit is the airframe's published `certifiedMax`, not a sum of
  25.807(g) exit ratings.** The sum does not reproduce published figures: the
  A320's two Type IIIs at consecutive rows cap at 65 under 25.807(g)(7), which
  gives 175 against a certificated 180, because its doors exceed the book Type
  C credit. Making the sum reach 180 meant moving the overwing exits in the
  data. So the published maximum is the input, and the exits are geometry that
  places the passageways and exit rows.
- **Seat kinds.** Lie-flat suite, recliner or standard per cabin. Abreast is
  derived from the kind rather than stored, so the two cannot disagree.
- **Fleet types.** An 18-airframe library (`src/data/airframes.json`), with
  add, rename and delete. The cost basis is one `f41` type. A type can be left
  uncosted: it flies but never reaches the P&L, and the form says so.
- **The designer** shows seats, exit-limit headroom, cabin length used, flight
  attendants, cost per seat-mile at the type's own stage, and a fare index
  against the fleet average. Three presets (ultra-dense, standard, comfort) set
  the cabin in one click.

**Still open.**

*Payload-range.* Adding seats does not yet cost range. The Assumptions tooltip
says range is a conservative full-payload figure. A linear giveback, so many nm
per additional seat at MTOW, would make densification cost something, and it
would feed the existing range check. Cram the A319 and watch a transcon go red.

*`f41Peers`.* A type is costed from one `f41` type, blended across every carrier
that reports it. Costing from named carriers is item 9's `f41Peers` field, and
it waits on item 9.

---

## 11. Editable exit arrangements

Let a user add, remove, retype and reposition exit pairs, and override the seat
credit an exit is given.

**Why it is parked rather than built.** It was built and then removed. It is a
correct idea that lands past the point where the tool stops being fun: a table
of exit pairs with 25.807 types and per-exit credit overrides is certification
paperwork, not network planning, and it appeared in a panel whose job is to let
someone decide how dense their cabin should be.

**Why it will be worth having.** Real airframes carry more than one exit
arrangement, and the interesting configurations depend on it. easyJet's
186-seat A320 gets there partly by relocating the rear lavatory into a combined
galley-lavatory module and partly through an equivalent safety finding that
raises the credit on the forward and aft doors above the book Type C rating.
None of that is expressible while `certifiedMax` is a single number per type.

**What it should look like when it returns.** Not a certification form. Probably
a small set of named airframe variants per type — "A320, 180-seat standard" and
"A320, 186-seat SpaceFlex" — each carrying its own `certifiedMax`, monuments and
exits, picked from a dropdown. The user chooses an aeroplane, not a row of
regulatory arithmetic. The per-exit editor can sit behind that for anyone who
wants it.

**Do not bring back the rating sum.** See item 10 for why the seat limit is a
published figure rather than a total of exit ratings.

---

## 12. Calibrate the cabin fare multipliers

`SEAT_MULT` currently prices a seat against economy by cabin and seat kind:
lie-flat 5.5, recliner 3.0, premium-economy recliner 2.0, extra-legroom standard
1.6. A stage taper pulls the lie-flat figure down below about 1,800 nm, so a
suite is worth less than a recliner on a short hop.

**Where those numbers came from.** Judgement. Domestic first runs roughly two and
a half to three and a half times economy, transcon lie-flat business somewhere
between four and eight depending on route and season, and the extra-legroom
figure was argued from the fare table in Daniel's own spreadsheet — Premium
Economy there is two inches of pitch plus a free bag, no change fee, free
same-day changes, Group 2 boarding and a drink, which is an unbundled-fee
product rather than a legroom product. Every one of those is defensible and none
is measured.

**Why it matters more than it looks.** The multipliers are normalised so the
seat-weighted fleet mean is 1.0, which means they never change total revenue —
only its distribution. So a wrong multiplier does not show up as an implausible
total. It shows up as the wrong aircraft looking good on the wrong route, which
is exactly the judgement the planner exists to inform and exactly the error
nobody notices.

**What would actually calibrate them.**

*DB1C carries a fare, not a cabin.* The 40% ticket sample gives an average fare
per market with no cabin split, so the data already loaded cannot separate a
first-class fare from an economy one. That is the honest blocker and the reason
this has not been done.

*T-100 plus DB1C would bound it.* Seats flown by carrier and market against
passengers and revenue would give a revenue-per-seat by aircraft, and types with
known cabin layouts would let the premium be inferred rather than assumed.

*Published fares are the direct route and the least reproducible.* Scraping walk-up
fares by cabin on a sample of markets would give real ratios, would date quickly,
and would need a licence check before anything went into a public repository.

*The taper shape is a separate question.* It is linear in stage between a floor
of 0.30 and full value at 1,800 nm. The real curve is almost certainly not
linear — the value of a bed jumps once a flight crosses into overnight or
red-eye territory rather than rising smoothly with distance. Tying the taper to
whether the itinerary actually spans a normal sleeping window, which the engine
already knows because it schedules red-eyes, would be both more honest and
cheaper than calibrating a curve.

**Until then.** The figures stay in one constant block in `src/revenue.js`,
mirrored in `revenue.py`, and the Model tab says they are assumed. Do not let
them spread into the suggestion engine or the Economics tab as though they were
measured.

---

## 13. Game loop: the edit readout and missions

**Built**, October 2026, the small version.

- **Edit readout** (`src/ui/readout.js`). After a route edit, a card says what it
  did: network result, connections, aircraft for the types edited, gates at the
  edited airports, checks. Measured like the network check, with the rest of the
  schedule held still, and it names how many other flights the rebuild re-timed
  without counting them. Only route edits get one; settings, fleet, starters and
  imports change too much at once.
- **Missions** (`src/ui/missions.js`, `mission` blocks in `starters.json`). Both
  starters carry a brief, three objectives and a reference solution. One star per
  objective, none while a check fails. Objectives use connections at a station,
  aircraft, departures, routes, and profit on measured demand only. `verify.py`
  plays each solution and requires all the stars.
- **Livery** (`src/livery.js`, Settings, October 2026). A colour from eight
  swatches or any colour, and a tail mark (band, chevron, disc, star, the
  airline code, or an uploaded logo kept as a small PNG). It paints the header,
  the map's planes, a fin beside every flight on the Board and Schedule, the
  Rotations flight bars, a side view and the seatmap, and it becomes the app's
  accent. Semantic colours and first class stay fixed. Any colour is given
  tones that stay readable in light and dark mode. Shared links and opened files
  are untrusted, so a livery that is not ours is dropped.
- **Watch the day** (`src/ui/missions.js`, October 2026). A network holding
  every star offers it on the mission card and on the readout that says
  Mission complete. It plays one day on the map from 03:00 at the base at
  1,440 times, narrowed to the station a mission is about, then gives a
  one-line summary. It moves the map's clock and filter only, and Done puts
  them back.

**Still open.** A logbook of planning firsts; a readout for non-route edits;
more missions; leaderboards, which need the public site. One
honest caveat: mission objectives score the network as rebuilt, so a lucky
reshuffle counts toward a star even though the readout never credits it to an
edit. The schedule is real either way, but a player can feel it as noise.

---

## Sequencing

**Before a public v1**, in order: the two starter networks with a `verify.py`
harness underneath them, first-run onboarding, splitting the demand and airport
data out of the initial payload, and mobile triage. Everything in that list is
about whether a stranger can use the thing. Nothing in it changes a number.

**After launch**, and expect to re-read conclusions when they land: item 9 (the
regional cost basis), item 12 (calibrating the cabin multipliers), and items 2,
3 and 4 in the revenue layer. These are model-accuracy work, and model accuracy
is what a second version is for.


**1, 5 and 8** are the three that most change what the tool feels like to use,
and none of them depends on the others. **2 → 3 → 7** is a chain: competition
first, because time-of-day preference and pricing both work against it. **4** can
land any time. **6** is independent and small, but it is the one that touches the
check count, so it wants a quiet commit of its own.

**9 is deliberately not prioritised.** The earlier argument for doing it first was
that every route-level number is computed on top of the cost basis, so changing
it late means re-reading conclusions. That argument is sound and it is outweighed
by what v1 is for: a public launch is judged on whether a stranger can understand
the tool and build something with it, not on whether the E175 is costed from
Horizon or from a four-carrier blend. The current basis is already measured data
rather than a placeholder — the note that called it a placeholder was wrong, and
item 9 explains why. Do it after launch, and expect to re-read the regional
route-level findings when it lands.

**10** is built, both halves, with cabin revenue first as planned. What is left
of it is small: payload-range, and `f41Peers` once item 9 lands.

## Known limitation: the schedule reshuffles

Investigated September 2026, on the shipped network. Decision: **accepted, not
fixed.**

**What happens.** A small edit re-plans much of the day. Across 72 edits (every
Grow pick plus 40 random extra frequencies) the median edit re-timed 52 of
1,650 flights and the worst 516, many by more than two hours; only 10 left the
schedule untouched. Adding PIT-ABE re-timed 444.

**Why.** `build()` is greedy and sequential:
- a line's starting bank and stagger come from its position in the list
  (`startbank = banks[(li-1)%3]`, `stag = (li%8)*6`), so one added turn
  renumbers every line after it;
- base|type pools are processed largest first, so adding a turn can reorder
  them;
- market spacing, RON caps, feed assignment and red-eye use carry from one pool
  to the next, so a change at one base ripples into others.

**What it costs.** Every rebuilt schedule is valid (all ten checks) and no less
efficient, and its own totals are right. The damage is only in *comparing* two
rebuilds:

| Across 72 edits | |
|---|---|
| Median revenue effect of the edit itself | $21k/day |
| Median distortion from the reshuffle | $18k/day (p90 $72k, max $170k) |
| Reshuffle larger than the edit | 39 of 72 |
| Reshuffle flipped gain vs loss | 13 of 72 |

The same reshuffle moves aircraft requirements between types an edit never
touches (adding AUS-DAL on an E175 asked for one more A319 and two more A320s)
and gate counts at stations it never visits.

**Where it is handled.** The network check (Add route, Grow) measures around
it: revenue on the current schedule with only the changed market swapped in,
aircraft for the added type, gates at the route's own airports. The Economics
tab's before/after totals and the Board and Schedule tabs are still exposed.

**What was tried and rejected.**
- *A soft connection window* (weight ramping in over 20-30 min above MCT and
  out before 240). Cut market-level churn only 7-16% and moved baseline
  revenue $200-550k a day, so it would need recalibration. The revenue model
  is not the problem: jittering every flight by up to a minute moves the total
  under 0.1%, and one flight moved one minute changes it by a median of $11.
- *Stable line identity plus a fixed pool order.* Looked like a 72% cut on the
  8 edits it was tuned on; on 72 unseen edits it was 29%, and the hub starter
  needed 3 more gates. Overfitted.

**Why the real fix was not built.** An anchored rebuild, preferring each line's
previous times where still valid, would work, but the schedule would stop being
a function of the network alone. Shared and imported networks would rebuild
differently for different people; `verify.py`, `engine.py` parity, undo,
starters and the three copies of the state would all need the previous schedule
as input; anchored schedules drift from what a fresh build would give, which
brings back a "re-plan" button and the reshuffle with it; and the history is
invisible to the user. For a planning tool rather than an operating airline,
the reshuffle is forgivable as long as nothing presents it as the effect of an
edit.

**If it is revisited.** A small "what changed" readout after an edit ("your
change +$79k/day; the rebuild also re-timed 64 flights, worth +$170k") would
make the Economics tab honest without touching the engine. It reuses the
network check's measurement. Built in October 2026 as the edit readout (item 13),
which counts the re-timed flights but does not price them.

## Carried forward

Still open from before this list:

- The public multi-user website. The explicit end game, deliberately deferred.
- Non-US demand data. The Kaggle international dataset and the live DOT portal
  were both evaluated and set aside. International pairs now come from the
  published OAG/MIDT sheet PAX_DATA_2025-26 (`tools/intl_pax.py`, October 2026).
  Grow proposes the international pairs it lists, with a destination switch
  (All, US, International). Europe was added in October 2026: 517 European
  airports the sheet lists (`tools/airports.py`, including current ones the old
  OpenFlights list lacks, such as BER), Europe's coastline on the map
  (`tools/geo_europe.py`), and 16,130 more sheet pairs. A European route appears
  in Grow only once the fleet has a type that can reach it. Still open: Asia,
  Africa, the Middle East and Oceania (about two thirds of the sheet), European
  night restrictions (a Heathrow departure can be scheduled at 05:30), airports
  the old list lacks in the Americas too (Tulum, TQO), its licence is
  unverified, pairs it does not list fall back to the gravity estimate and are
  never proposed, and the planner does not know which stations can clear
  international arrivals.
- Editable curfews. `CURFEW` is a per-station map in the config with no UI, so a
  station the user adds cannot be given a night restriction and SJC's cannot be
  changed. Curfew is one of the ten checks, which means the model currently
  cannot represent a real airport with a curfew unless it shipped with one. The
  check label now reads the times from the table rather than naming SJC outright,
  so the reporting side is already ready for this.
- Grow still ranks its candidates on estimated contribution, by design: a
  network check for several hundred per base is too slow. The four it shows per
  base are now checked against the network and re-ranked (done September
  2026), but a candidate ranked lower by the estimate is never checked, so a
  route that is weak alone and strong for the network can be missed. Checking
  deeper costs proportionally more time.
- Per-flight turn times: base by gauge plus an international surcharge.
- HNL–AUS and HNL–RDU as red-eye candidates if those routes are ever added.
