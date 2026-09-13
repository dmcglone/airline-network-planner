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

**Why.** Every edit already triggers a full rebuild, so both states are directly
comparable by construction — this is nearly free. It is also what turns the tool
from "here is my network" into "here are two networks and here is what changed,"
which is the difference between a report and a planner.

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

Let a user add a fleet type rather than edit the six that ship, constrain the
cabin to what the airframe can physically hold, and give them a seatmap to do it
on.

**Prerequisite: cabin mix must reach revenue first.** `cabinMultipliers()` in
`revenue.js` computes F/PE/Y fare multipliers, normalises them so the
seat-weighted mean is 1.0, returns them as `cabins` — and nothing multiplies by
them. Revenue is `flown × m.fare` at the DB1C market average regardless of which
cabin anyone sat in. So the three cabin columns currently affect total seats and
nothing else.

Build a seatmap on that and every session ends identically: strip out First,
cram economy, watch CASM fall, ship it. Densification would be free money
because the model has no way to price what was given up. Fix the revenue side
first, using the same normalisation already written but applied per flight —
split each itinerary's allocated passengers across cabins by availability, price
at the multipliers, keep the seat-weighted mean pinned to the observed DB1C
fare. The measured number still constrains the answer; only its distribution
across cabins is assumed.

**The constraints, in order of how often they will bind.**

*Cabin length.* `Σ(rows × pitch) ≤ usable cabin length`. This is the one that
actually stops people. Needs two new per-type fields: `cabinLength` in inches
and `abreast` (6 for the A320 family, 4 for the E175, 3 for the E145). Rows are
`ceil(seats / abreast)`, and a premium cabin at 4-abreast consumes floor twice
as fast per seat.

*Exit limits.* 14 CFR 25.807(g) caps passenger seats by the type and number of
exits installed in each side of the fuselage: Type A 110, Type B 75, Type C 55,
Type I 45, Type II 40, Type III 35, Type IV 9. Two further rules are worth
encoding because they are the ones that catch people out — all Type III exits
combined are capped at 70 seats, and two Type IIIs per side separated by fewer
than three seat rows are capped at 65. A type therefore needs an `exits` array,
and total seats may not exceed the sum.

This would bind on nothing in the current roster: the A319 sits at 126 against a
real-world 156, the A321 at 190 against roughly 220. That is correct behaviour.
A ceiling should be silent until somebody reaches for it.

*Flight attendants.* 14 CFR 121.391 is one FA per 50 seats, so crew cost steps
at 51, 101, 151 and 201. The A319 at 126 needs three; densified to 156 it buys a
fourth. This makes seat count lumpy rather than smooth, which is the more
interesting decision and which the cost model can already express.

*Payload-range.* The Assumptions tooltip already says range is a conservative
full-payload figure. A linear giveback — so many nm per additional seat at MTOW
— makes densification cost something, and it feeds the existing range check.
Cram the A319 and watch a transcon go red.

**What creating a type requires.** The eight existing columns plus `abreast`,
`cabinLength` and `exits` — and a cost basis, `f41` with `f41Peers`, which after
item 9 is a first-class field rather than an afterthought.

Do not block creation of an uncosted type. `econRate()` returns null and the
Economics tab already names the types it cannot cost, which is the honest
failure mode; a silent zero would not be. Make the field prominent in the form
instead, so nobody builds a type and then wonders why it never reaches the P&L.

Adding a type is safe for the invariants. The range check reads `SPEC.rng`,
gauge matching keys on type identity, and the acceptance metrics move only if
the pinned roster changes. A new type at zero tails changes nothing.

**The seatmap.** Fuselage as a horizontal strip, exits at fixed stations, cabin
dividers draggable, abreast and pitch set per cabin. Live down the side: seats
by cabin and total; cabin length used against available as a fill bar;
exit-limit headroom per the 25.807 sum; FA count with the next threshold
visible so the cliff is seen coming; and CASM against RASM, which is the entire
point of the exercise.

Report violations inline rather than refusing the edit — the same philosophy as
`validate.js`, which reports what it finds instead of preventing it. Let someone
build a 260-seat A321 and tell them plainly that it is forty seats past its
exits and nine hundred inches past its cabin.

Two details that are cheap and carry most of the feel: rows adjacent to a Type
III exit need extra pitch, and a few presets — ultra-dense all-economy at 28
inches, two-class at 32/31, comfort at 34 — so the trade is one click rather
than twenty drags.

Output is F/PE/Y written back into the Assumptions table. The builder is pure UI
over state that already exists; nothing in the engine changes.

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

**10** is really two items. The cabin-revenue half is small, belongs with 2, 3
and 4 in the revenue layer, and is worth doing on its own merits. The seatmap
half is the largest piece of UI on this list and should not start until the
first half is in, or it will be a tool for discovering that seats are free.

## Carried forward

Still open from before this list:

- The public multi-user website. The explicit end game, deliberately deferred.
- Non-US demand data. The Kaggle international dataset and the live DOT portal
  were both evaluated and set aside.
- Editable curfews. `CURFEW` is a per-station map in the config with no UI, so a
  station the user adds cannot be given a night restriction and SJC's cannot be
  changed. Curfew is one of the ten checks, which means the model currently
  cannot represent a real airport with a curfew unless it shipped with one. The
  check label now reads the times from the table rather than naming SJC outright,
  so the reporting side is already ready for this.
- Grow ranks on estimated contribution without a `trialBuild()`, by design — it
  is too slow for several hundred candidates per base. A "verify top 3" button
  would keep the fast ranking and give a real rebuild on the ones that matter.
- Per-flight turn times: base by gauge plus an international surcharge.
- HNL–AUS and HNL–RDU as red-eye candidates if those routes are ever added.
