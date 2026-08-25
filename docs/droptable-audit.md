# Drop-table audit

`gamedata.js` drop tables are hand-authored. This checks them against the
RuneScript they came from, so drift shows up as a diff instead of a wrong
gp/hr number.

## Running it

You need a LostCityRS/Content checkout. Point the tool at its **root** — the
tree is walked recursively, because drop tables are not all under
`drop tables/`. A monster added by a quest or an area keeps its table in that
folder: the elves are in `quests/quest_regicide`, the dagannoths in
`quests/quest_horror`, the water elemental in `quests/quest_elemental_workshop`.

```bash
node tools/audit-droptables.js "F:/projects/scripts"
```

Add a monster id to look at one table:

```bash
node tools/audit-droptables.js "F:/projects/scripts" green_dragon
```

To read a source table directly, without comparing:

```bash
node tools/rs2-droptable.js "F:/projects/scripts" thug
```

No install step — the tools load `gamedata.js` in a plain Node `vm` context,
the same way the browser does.

## What it reports

- **KEY POINTS AT THE WRONG ITEM** — the row's weight and display name match
  source, but its price key names a different item. This is the failure mode
  that silently misprices loot, because the name looks right in the UI.
- **WEIGHT / QUANTITY OFF** — the right item at the wrong rate. A whole table
  off by a constant ratio means the roll denominator is wrong (see below).
- **QUEST/STATE-GATED IN SOURCE, OMITTED** — source only drops the row after
  some quest or world state. Being listed here is normal, not a defect.
- **IN SOURCE, NOT IN gamedata.js** / **IN gamedata.js, NOT IN SOURCE** — real
  row gaps.
- **ALWAYS-DROPS ONLY, NO WEIGHTED ROLL** — the source table has no `random()`
  at all; a bear just always drops fur and raw meat. Nothing to align.
- **NO SOURCE TABLE IN CHECKOUT** — the monster has no drop-table script in the
  checkout you pointed at, so nothing was verified here. Partial checkouts are
  fine; they just narrow coverage. Some of these are not gaps at all: a monster
  whose whole loot is a `param=death_drop` has no table to find, and
  [npc-stat-audit.md](npc-stat-audit.md) checks those instead.

## Roll denominators

Most tables are `random(128)`, which is why `d()` defaults to `total=128`. Some
are not — tribesman rolls `random(138)`. Pass the real denominator as `d()`'s
fifth argument, or every rate in that table is silently inflated:

```js
d('Snape grass',20,1,'snape_grass',138),
```

Watch for `randominc(n)`, which is **inclusive** and so has `n+1` outcomes, not
`n`. jogre rolls `randominc(128)` — 129 outcomes, which its
`~trail_mediumcluedrop(129, ...)` confirms. gamedata.js already passes 129 for
jogre; the parser applies the same correction so the two line up.

## Repeated rows

A table can roll the same item and quantity in two separate branches. Rock crab
rolls `seaweed x2` at weight 4 and again at weight 2; `gamedata.js` keeps those
as two rows (`Seaweed x2` and `Seaweed x2b`). Lesser demon rolls `jug_wine`
twice and `gamedata.js` folds them into one row of weight 3. Neither is wrong —
only the total weight per item+quantity matters — so the audit folds both sides
the same way before comparing.

## Checkout revisions differ

Two checkouts of the same repo can sit at different revisions and disagree. At
time of writing, tribesman's `$random < 109` row is `tbwt_cleaning_cloth` in one
and `coins, 28` in another; `gamedata.js` matches the former. If a row shows up
as **IN gamedata.js, NOT IN SOURCE** and looks deliberate, check the other
checkout before changing anything.

## Price proxies

Some items that Content drops have no market or alch entry in this repo. Those
rows are valued through a stand-in item, declared with `dProxy` so the
substitution is visible and the audit can still verify the table:

```js
dProxy('Bronze med helm',2,1,'iron_full_helm','bronze_med_helm'),
//      display name          price key        what actually drops
```

`key` is what gets priced; `src` is what source drops. The audit checks `src`,
so a proxy reads as correct while a genuine mistake still fails.

Prefer a real key whenever the correct item has its own price or alch value —
`dProxy` is for items with no data at all. When a price for the real item
appears upstream, the `src` field is the list of rows worth revisiting.

## Members and free-to-play branches

A source branch can look like this:

```
} else if ($random < 60) {
    if (map_members = ^true) {
        obj_add(npc_coord, bloodrune, 2, ^lootdrop_duration);
    } else {
        obj_add(npc_coord, blackwizhat, 1, ^lootdrop_duration);
    }
}
```

That is one roll with two outcomes, not two drops. LostCity runs as members, so
the parser tags the `else` side `f2pOnly` and the audit ignores it. Counting
both would double the weight of the slot.

## Known deviations

- `white_knight` water rune quantity is 27; source rolls `~random_range(25,30)`,
  mean 27.5.
- `chaos_druid` omits `unholy_symbol_mould` (1/128), which source gates behind
  Observatory Quest completion.
