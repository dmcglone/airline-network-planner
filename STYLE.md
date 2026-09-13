# Writing for this planner

Technical and human. The reader is planning an airline and wants to know what a
number means and whether to trust it. Assume intelligence, do not assume the
vocabulary.

## Avoid

**Em dashes in prose.** A full stop, a colon or a comma almost always does the
job better. They are fine as typography: the `—` in an empty table cell, or the
`SJC — San Jose` separator in an autocomplete.

**"Not X, but Y" and "it is not A, it is B".** The balanced contrast reads as
padding. Say the thing.

> ~~The planner does not patch the old schedule: it rebuilds every rotation~~
> The planner rebuilds every rotation from scratch rather than patching the old one

A short corrective contrast is different and fine, when it stops a real
misreading: *"a planning minimum, not a target"* earns its place.

**Throat-clearing.** "It's worth noting", "essentially", "fundamentally",
"in essence", "simply put". Delete and start at the verb.

**Marketing verbs.** Leverage, empower, unlock, elevate, seamless, robust,
comprehensive, cutting-edge.

## Prefer

**Say what is wrong with the thing.** The model is full of estimates and the
copy should keep saying so. *"Those ratios are judgement. Nothing in the data
measures them."*

**Concrete over abstract.** Name the button, the number, the tab.

**Short sentences carrying one fact.** Two plain sentences beat one with a
subordinate clause hanging off it.

**Ordinary words.** Gauge, bank and rotation are the airline's words and stay.
Everything around them should be the plainest available English.

## Check before shipping

    grep -n '—' src/body.html src/ui/*.js     # prose hits, not table placeholders
    grep -niE '(worth noting|essentially|leverage|seamless|robust)' src/ui/*.js
