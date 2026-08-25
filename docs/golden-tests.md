# Golden tests

20 scenarios run through `SimEngine.simulate()` and compared, field by field,
against a recorded baseline. The point is that a refactor of `engine.js` or
`trip.js`, or a `gamedata.js` edit with wider reach than intended, fails loudly
instead of quietly moving every gp/hr number the app shows.

This is a **regression net, not a correctness check**. The baseline is whatever
the simulator produced when it was last recorded; nothing here claims those
numbers are right. Correctness against the game is what
[droptable-audit.md](droptable-audit.md) and [npc-stat-audit.md](npc-stat-audit.md)
cover.

Ported from index-sim-v2's `legacy-golden.json` and `legacy-sim.ts`.

## Running it

```bash
node tools/run-golden.js
```

No install step. `gamedata.js`, `engine.js`, `trip.js` and `equipment.js` hang
their exports off `window`, so they load unmodified in a plain Node `vm` context
with a stub `window` and `localStorage` — the same trick
[droptable-audit.md](droptable-audit.md)'s tools use. Nothing in the app changes
to make it testable.

Exit code is 1 on any mismatch, so it works as a pre-commit or CI gate.

| | |
| --- | --- |
| `node tools/run-golden.js` | compare all cases |
| `node tools/run-golden.js <case-id>...` | compare some cases |
| `node tools/run-golden.js --list` | list case ids and what each covers |
| `node tools/run-golden.js --verbose` | show every differing field, not the first 12 |
| `node tools/run-golden.js --update` | re-record the baseline |

## What a failure looks like

Differences are reported as dotted paths into the result, so a failure names the
field rather than dumping two large objects side by side:

```
FAIL melee_dba_sustained_moss_giant
    potionCostPerKill                  baseline=26.033772  now=24.129584
    trip.bound                         baseline=loot  now=food
    trip.killsPerTrip                  baseline=63.379213  now=68.380788
    topLoot.1.evGp                     baseline=214.85  now=180.0
```

A sub-object that is `null` in one side and populated in the other means the
mechanic itself appeared or vanished — `cannon baseline=null now={...}` is a
cannon overlay switching on where there was none.

A block headed **case definition changed since the baseline was recorded**
means `tools/golden-cases.js` was edited without re-recording. That is not
simulator drift; it is the case asking a different question than the baseline
answers.

## Re-recording

When a change is deliberate:

```bash
node tools/run-golden.js --update
```

Re-record in its own commit, or at least its own hunk, and say in the message
what moved and why. A baseline updated in the same breath as the change it was
supposed to catch is a baseline nobody can audit later.

Passing case ids re-records only those, keeping the rest of the file as it was:

```bash
node tools/run-golden.js --update magic_fire_bolt_chaos_druid_alch
```

That matters after a single-monster fix — a blanket `--update` would bless drift
in every other case at the same time.

## Adding a case

Append to `CASES` in `tools/golden-cases.js`, then `--update`. A case only has
to state what makes it interesting; `tools/golden-lib.js` fills the same
defaults the UI does — level 70s, empty gear, `['none']` prayers and boosts, no
teleport, no food.

The set is chosen for coverage of the paths that carry state between `engine.js`
and `trip.js`, not for realism: sustained potion averaging, DBA restore, cannon
overlay, ammo recovery, in-trip alching, safespotting, poison, ring of recoil,
special attacks, jewel-table spot and Ring of Wealth, `lootPrefs`. Add a case
when you add a mechanic.

## What is compared

A run is reduced to a summary before comparison — the top-level rate and cost
fields, plus `trip`, `cannon`, `scarce`, `spec`, `poison` and `recoil`, the top
five loot rows by value, and the skill XP breakdown. Numbers are rounded to 6
decimals, and the comparison tolerance (`1e-6`) exists only to absorb
floating-point noise between platforms — it is not slack for behaviour changes.

Non-finite values become `null`, which still compares. A field that starts
producing `NaN` is a real failure, not a skipped one.

Only the top five loot rows are kept. The full breakdown is dozens of rows of
mostly zeroes; the top five move whenever pricing, drop rates or keep
preferences change, which is the part worth catching.

## Why market.js is not loaded

`market.js`, `planner-core.js` and the `.jsx` views are deliberately excluded.
They pull in live prices and UI state, and a baseline that moves with the market
catches nothing. Loading only the four simulator scripts is what makes a run
deterministic — re-recording twice in a row produces a byte-identical file — so
a case only ever moves when the simulator moves.

The consequence is that these tests price loot off `gamedata.js`'s embedded
`ITEM_PRICES` and `ALCH_VALUES`, not `prices.json`. A price sync will move
`gpPerKill` on many cases at once; that is expected, and the right response is
to re-record.

## Drift from the v2 capture

The fixtures came over from a baseline v2 captured on 2026-07-05. Against the
current simulator, 16 of the 18 imported cases differ, so the file in `tools/` is a fresh
recording rather than the imported one. The differences were checked back to
their causes and none of them is a port defect — for example
`magic_fire_bolt_chaos_druid_alch` drops from `hitChance` 0.963 to 0.930 because
`9f75686` gave chaos druid a `magicLevel`, which the magic accuracy roll now
uses. The two cases that still match unchanged are what confirm the harness
itself was ported faithfully.
