# Risk pane

Every other number in this app is an expectation. That is the right default and
it is silent about the thing that actually costs people trips: a green dragon
hour is worth a lot on average, and nearly all of that is variance. The Risk
pane re-rolls the same fight thousands of times and reports the spread.

`risk.js` holds the model; `RiskPane` in [views.jsx](../views.jsx) is the UI.
Ported from index-sim-v2's `src/domain/risk/index.ts`, with the loot model
rewritten — see [Loot is one roll, not many](#loot-is-one-roll-not-many).

## What it samples, and what it does not

| | |
| --- | --- |
| Player damage | **sampled** — hit or miss at `hitChance`, then uniform `0..peakMaxHit` |
| Incoming damage | **sampled** — the monster's own attacks, same roll shape |
| Loot | **sampled** — which row the kill's drop-table roll lands on |
| Loot quantity | mean — a coins row worth 15–62 pays a flat 38.5 |
| Specials, cannon, poison | mean — folded into a flat damage-per-second |
| Dragonfire | mean — it is already an expectation over a breath rate |

The pane prints that table as **Model coverage** on every run, and lists what is
riding on its mean underneath. A spread that is narrower than reality should say
so on screen rather than in a doc nobody opens.

## Running it

Open the **Risk** tab. It runs once automatically, then on demand.

It deliberately does **not** recompute as you type. A run is 1–3 seconds of
blocking arithmetic — 5,000 trials is about a second in Chrome — so the pane
keeps showing the last answer and marks it stale when the setup moves under it.
Recomputing on every keystroke would freeze the tab on every level change.

Controls: trial count, horizon in minutes, a target kill count, a GP target, and
a target drop. The last two drive the odds section.

## Checking it

```bash
node tools/run-risk.js            # all 20 scenarios
node tools/run-risk.js --verbose  # print the distributions
```

It reuses the scenarios from [golden-tests.md](golden-tests.md), and asserts the
**means**, not the spread. That split is the whole design: what the spread
should be is exactly what nothing else can tell us, but what the centre should
be is known exactly — `engine.js` and `trip.js` already computed it. So the tool
checks that sampled kill time lands on `ttkSec`, sampled GP per kill lands on
`gpPerKill`, and sampled kills per hour lands on `effectiveKph`, all within 5%.
A plausible-looking p10 around a wrong mean is worse than no p10 at all.

It also asserts that percentiles are ordered, that probabilities are in `[0,1]`,
and that two runs of identical input agree exactly.

`risk.js` is evaluated in the host realm there rather than in the `vm` the
simulator scripts need. Code inside a `vm` context runs roughly fifty times
slower — 350ns per RNG call against 13ns outside — and timing the Monte Carlo
loop through that would measure the harness, not the model.

## Calibration

Two quantities are pinned to the simulator's own figures rather than trusted to
come out right on their own. Both are documented here because a calibration you
cannot see is indistinguishable from a fudge.

**Kill time** is scaled so the sampled mean equals `ttkSec`. Two biases pull
against each other and neither is negligible: attacks are discrete, so the
killing blow overshoots and drags the mean up, while `peakMaxHit` is the boosted
peak against a `ttkSec` computed from the sustained average, which drags it
down. Measured across the test cases before calibration, kill time came out 12%
high on a dagannoth and 6% low on a black dragon. A single scale factor fixes
the centre and leaves the shape — every duration moves by the same ratio, so the
relative spread survives untouched.

**Loot slots per kill** is scaled to `trip.slots.nonStackPerKill`. Re-deriving
it from `result.lootBreakdown` does not reproduce it, because `engine.js` decides
which low-value non-stackables are worth a slot and re-runs the trip: the
breakdown `risk.js` can see is the post-decision one, while `nonStackPerKill`
came from the pass before. On a blue dragon that is 2.27 against 2.16 — small,
but it compounds into a pack that fills a kill early.

## Loot is one roll, not many

v2 rolled every drop row as an independent Bernoulli trial. That is wrong for
this data and the port does not carry it over.

`gamedata.js` rows come from a single RuneScript `random(128)` per kill. The
weighted rows are **one exclusive choice** — their chances sum to at most 1, and
the remainder is the empty outcome, which is most kills on most monsters.
Checked across the whole table: no monster's weighted rows sum above 1. Rolling
them independently would let two rare drops land on the same kill, inflating
both the GP variance and the rate the pack fills.

`always()` rows are the exception: chance ≥ 1, dropped every kill, genuinely
independent of the roll.

## Where the model and trip.js legitimately disagree

`trip.js` ends a loot-bound trip at `lootCapacity / slotsPerKill` — 9.24 kills
on a blue dragon. A sampled trip ends on a whole drop, because that is what
happens: the last slot is taken by an item, not by 84% of one. No discrete
process has a mean of 9.24.

So `tools/run-risk.js` checks loot-bound trips differently, against the overshoot
the discretization can actually produce, which renewal theory bounds by the
largest slot increment one kill can deliver. That bound has to be computed per
monster: a rock crab fills 0.047 slots per kill and its biggest single drop is 2
slots, so it can overshoot by 42 kills' worth; a blue dragon hands over bones and
a hide every kill, so its lump is one kill and no more. A flat tolerance in
either kills or slots is the wrong shape for both.

One thing here **was** a plain bug rather than a legitimate difference, and is
fixed: the trip used to end when the pack *overflowed* rather than when it was
*full*. On a rock crab that meant waiting for a 28th drop into 27 slots, and one
slot there is 21 kills.

## Determinism

The seed is a fingerprint of the inputs, so an unchanged setup always produces
identical numbers, and the fingerprint is shown in the pane header. Two runs
that disagree mean something non-deterministic reached the model —
`tools/run-risk.js` asserts against it.

To deliberately vary the outcome, pass an explicit `seed` to `RiskModel.analyze`.

## Sampling error

Reported in the pane on every run. At `n` trials a probability near 50% carries
about `2 × sqrt(0.25/n)` of standard error — ±1.4 points at 5,000 trials, ±1.0
at 10,000. Rare-drop probabilities are computed in closed form rather than
counted, so they do not carry it.
