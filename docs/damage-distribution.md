# Damage distribution

Every other number the app shows is an average. `avgHit`, `dps`, `expPerSpec` —
all correct, all silent about shape. The Damage distribution section under
**Stats** computes the shape exactly, so questions the mean cannot answer ("can
this still kill me from 12 hp", "how often does a dagger spec actually land
nothing") get a number instead of a shrug.

`dist.js` holds the model; `DamageDistribution` in [views.jsx](../views.jsx) is
the chart. Ported from index-sim-v2's `src/domain/combat/index.ts`
(`createHitDistribution` / `createHitDistributionMixture` /
`createIndependentHitDistribution`).

Nothing samples. This is exact arithmetic over the same probabilities the engine
already computed, which is why its check is held to floating-point precision
rather than the 5% the [risk model](risk.md) needs.

## The shape of one attack

```
miss        probability 1 - hitChance,  damage 0
hit         probability hitChance,      damage uniform over 0..maxHit
```

Two composition rules sit on top of that:

| | |
| --- | --- |
| **mixture** | equally-weighted alternative rolls — the decaying-boost case |
| **independent** | n rolls of the same attack, summed — a multi-hit special |

## What the old chart got wrong

The section this replaced drew a flat uniform `0..maxHit` with the miss folded
into the zero bar. Three separate errors, each fixed:

### Miss and a landed zero are different events

A hit that rolls 0 is a landed hit. The splat is different in game, poison and
recoil care about the difference, and folding them together hides how much of a
low-accuracy setup's zero column is actually connecting. They get separate bars
and separate rows in the table.

The gap is not small. The rune scimitar / hill giant scenario runs **11.1%
miss, 5.1% landed zero**. The old chart drew one 16% bar and called it a miss.

### A decaying boost is not one uniform

`engine.js` models a sustained potion as a series of decay samples, each with
its own integer max hit — and then averages them into a single `maxHit` for
display. A black dragon setup spans max hits of 25 through 29 across its
samples. The true distribution is the **average of uniforms of different
widths**, which is peaked; a uniform at the mean width is flat and reaches the
wrong maximum.

So `engine.js` now exposes `hitRolls` — the per-sample `{hitChance, maxHit}`
pairs, before they are averaged into `hc`/`avgHit`. `mixture()` consumes them.
Nothing else in the engine reads the field, and `summarize()` in
[tools/golden-lib.js](../tools/golden-lib.js) is a whitelist, so adding it did
not move the golden baseline.

### A multi-hit special is a convolution

A dragon dagger spec is two independent accuracy rolls and two independent
damage rolls. Its total is not a doubled uniform — it is triangular, peaked in
the middle, and it counts as a miss only when **both** hits miss. That is why a
2-hit spec's miss column is so much shorter than its per-hit miss chance
suggests: the dragon dagger scenario rolls 77% per hit, and the whole spec
comes up empty only 5.2% of the time.

The spec gets its own patterned series on the same axes. The y axis is shared on
purpose — a spec spreads its mass over twice the range, so its bars **are**
shorter, and rescaling it to fill the chart would hide exactly that.

## Reading the chart

- **✕** is the miss column; **0** next to it is a landed hit for zero.
- The dashed line is expected damage, drawn at its true fractional position
  rather than snapped to a bar. A second line appears for the spec.
- Hovering or tab-focusing a column reports its exact chance and the cumulative
  "at least this much" for both series.
- The line under the chart says whether a single attack can finish the target
  from full health, and when it cannot, how far each series actually reaches.
- **table** shows the same numbers as selectable, screen-readable text.
- Long domains (a halberd spec reaches 52) scroll inside the chart; the page
  does not.

## Checking it

```bash
node tools/run-dist.js            # all 20 scenarios
node tools/run-dist.js --verbose  # print each distribution
```

It reuses the scenarios from [golden-tests.md](golden-tests.md). Per case:

| | |
| --- | --- |
| total probability | is 1 |
| normal mean | equals `result.avgHit` |
| normal max | equals `result.peakMaxHit` |
| spec mean | equals `specInfo.expPerSpec` |
| spec miss | equals `(1 - hitChance) ^ hits` |
| cumulative | monotone, starts at 1, agrees with `koChance` |

The two mean assertions are the load-bearing ones. Both sides compute
`hitChance × maxHit / 2` by different routes — the engine averages the product
over its decay samples, the model sums `d × P(d)` over their uniforms — so they
must agree to floating point. **If they ever disagree, `dist.js` is the one that
is wrong.** It is layered on top of the engine, never a second opinion about it.

On top of the cases, a set of identities is checked once: that a one-element
mixture equals a single roll, that summed hits are peaked rather than flat, that
a mixture does not collapse to its mean-width uniform, that a guaranteed hit
(Powershot) has no miss bucket, and that NaN inputs degenerate cleanly instead
of leaking through.

## Limits

- `maxHit` is rounded to an integer, because a bar chart cannot have a bar at
  7.4. The engine's fluid path produces fractional means; the components it
  averages are already integers, so the mixture path is unaffected.
- The convolution is capped at 8 hits. Every entry in `SPEC_DATA` is 1 or 2.
- Damage within a hit is uniform, which is the 2004 formula. Nothing here
  models a damage cap, a minimum hit, or a target's remaining HP truncating the
  roll — the distribution is of the attack, not of the damage dealt.
- Poison, recoil, cannon and dragonfire are not in it. They are separate damage
  sources with their own timing, not part of an attack's roll.
