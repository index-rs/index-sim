# 2004scape Combat Simulator
Revision 274

Work out what a [Lost City](https://lostcity.rs) (2004scape) combat setup is
actually worth — DPS, xp/hr and gp/hr on any monster in the game, with banking
trips, supplies and drop-table value all priced in.

### ▶ [Open the simulator](https://index-rs.github.io/index-sim/)

## Usage

1. [Open the simulator](https://index-rs.github.io/index-sim/) — nothing to
   install, no account to make.
2. Set your **levels** in the left rail, pick a **target** in the right rail,
   and equip yourself in the **Melee** / **Ranged** / **Magic** tabs.
3. Read the numbers off **Stats**, then use the other tabs to answer the
   specific question you came with.

Your setup is saved in your browser as you go, so closing the tab doesn't lose
it. Nothing is uploaded anywhere — the site is static files and the whole
simulator runs client-side. Prices on the live site are the ones from the last
daily refresh; the site redeploys from `main` on every push, so that commit is
live within a minute of landing.

### Running it locally

Clone the repo and open `index.html` — that's the whole install, no build step
and no dependencies. Everything works except one feature: typing an **RSN** in
the left rail to pull your real levels off the hiscores. The hiscores API
refuses cross-origin reads, so that box only works when the page is served by
the bundled proxy:

```bash
python hiscores_proxy.py
```

That serves the app on http://localhost:8000/ and forwards the lookups. Stdlib
only. See [docs/hiscores.md](docs/hiscores.md).

### The layout

Three columns, and they never change:

- **Left rail** — combat type, levels, stance, prayer and potion, plus a live
  readout of the trip rates as you fiddle.
- **Right rail** — the target monster. Search it by name, or filter the list by
  what it drops ("clue", "dragon bones") to find who drops the thing you want.
- **Setup bar**, under the tabs — whether the loadout you're editing is the
  **default** (applies to every monster) or a **custom** one for this target
  only. Most gear questions are per-monster; this is where you fork.

### The tabs

| Tab | What it does |
| --- | --- |
| **Stats** | The headline numbers: DPS, effective xp/hr and net gp/hr, hit chance, max hit, TTK, kills/hr, the banking-trip breakdown, and the exact damage distribution of one attack. |
| **Melee / Ranged / Magic** | Gear for that style — weapon, ammo or spell, amulet, prayers, potions, specs, Ring of Wealth. Opening one also switches your combat type to it. |
| **Compare** | Every monster in the game as one sortable table — hit %, DPS, TTK, xp/hr, gp/hr — against your current setup. This is the "where should I go" tab. |
| **Loot** | The target's drop table, priced. Mark each drop **loot / alch / skip**, or hit optimise to have it pick the split that maximises net gp/hr. |
| **Trip** | The banking model: food, inventory space, what actually ends your trip, and how much the run back to a bank costs you. |
| **Risk** | Everything else is an average. This re-rolls the fight thousands of times and shows the spread — a tenth-percentile hour, the odds of running dry before your kill target, the chance of a specific drop. |
| **Cannon** | A Dwarf multicannon laid over the current spot, as a second attacker sharing your hit roll. |
| **Duel** | Two or more saved setups judged side by side on the same monster. |
| **Planner** | A training order: which monsters in which sequence, with gear unlocks on a timeline and a DPS-vs-XP chart. |
| **Economy** | What moved in the market since the last price refresh, and by how much. |
| **Settings** | Import a local `prices.json` / `alch.json`, and hide gear tiers you'll never own so the pickers stay short. |

## Prices

Prices refresh automatically every day at 05:15 UTC from
[LC-bankvalue](https://github.com/index-rs/LC-bankvalue), which scrapes
markets.lostcity.rs and publishes the result. The in-app timestamp is the
authority on how fresh the data is — see `_scraped_at` in `prices.json`.

See [docs/price-sync-spec.md](docs/price-sync-spec.md) for how the sync works.

## Checking gamedata against source

`gamedata.js` is hand-authored. Two tools check it against the LostCityRS/Content
data it was transcribed from, so drift shows up as a diff instead of a wrong
gp/hr number.

Drop tables, against the RuneScript drop tables — point at the checkout root,
the tree is walked recursively:

```bash
node tools/audit-droptables.js "<content-checkout>"
```

Monster combat stats, against the `all.npc` dumps and the area/quest configs:

```bash
node tools/audit-npcstats.js "<content-checkout>"
```

Neither needs an install step; both load `gamedata.js` in a plain Node `vm`
context, the same way the browser does.

See [docs/droptable-audit.md](docs/droptable-audit.md) and
[docs/npc-stat-audit.md](docs/npc-stat-audit.md).

## Golden tests

20 scenarios run through the simulator and compared against a recorded
baseline, so a refactor that moves gp/hr or kills/hr numbers fails loudly:

```bash
node tools/run-golden.js
```

Exit code is 1 on any mismatch. When a change is deliberate, re-record with
`--update`. See [docs/golden-tests.md](docs/golden-tests.md).

## Risk model

The **Risk** tab's Monte Carlo model has its own check:

```bash
node tools/run-risk.js
```

That asserts its averages still land on the simulator's own numbers. See [docs/risk.md](docs/risk.md).

## Damage distribution

The chart at the bottom of **Stats** is the exact distribution of one attack,
not a uniform sketch of it: miss and a landed zero are separate bars, a decaying
potion is drawn as the mixture of different-width uniforms it really is, and a
multi-hit special appears as its own convolved series.

```bash
node tools/run-dist.js
```

That asserts the model's mean equals the engine's own `avgHit` and
`expPerSpec` to floating point — it is layered on the simulator, never a second
opinion about it. See [docs/damage-distribution.md](docs/damage-distribution.md).
