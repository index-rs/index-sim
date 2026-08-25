# NPC stat audit

Monster combat stats in `gamedata.js` are checked against the LostCityRS/Content
`all.npc` dumps. These stats drive accuracy, incoming damage, food per kill and
kills/hr, so a wrong `hitpoints` or defence bonus moves every number the app
shows for that monster.

Companion to [droptable-audit.md](droptable-audit.md), which covers the loot
tables.

## Running it

Point it at a Content checkout root and it finds every `.npc` file itself:

```bash
node tools/audit-npcstats.js "<content-checkout>/scripts"
```

Ordering matters and is handled for you. `_unpack/<rev>/all.npc` dumps are read
first in numeric revision order, because a revision folder holds only the
entries that revision *added* and later ones must overlay earlier ones — `225`
is the full base, `244`/`254`/`274` are small deltas. Area and quest configs are
read after; where they overlap a dump they are the maintained copy.

Individual files still work, oldest first:

```bash
node tools/audit-npcstats.js ".../_unpack/225/all.npc" ".../_unpack/274/all.npc"
```

Add a monster id to check one. To dump a single NPC's parsed config:

```bash
node tools/npc-config.js "<content-checkout>/scripts" poisonspider
```

## Field mapping

| gamedata | all.npc |
| --- | --- |
| `level` | `vislevel` |
| `hp` | `hitpoints` |
| `attack` / `strength` / `defLevel` | `attack` / `strength` / `defence` |
| `defStab` … `defMagic` | `param=stabdefence` … `param=magicdefence` |
| `attBonus` / `strBonus` | `param=attackbonus` / `param=strengthbonus` |
| `attackSpeed` | `param=attackrate`, default 4 |
| `damageType` | `param=damagetype` |
| `rangeLevel` / `rangeAttBonus` / `rangeBonus` | `ranged` / `param=rangeattack` / `param=rangebonus` |

Only 32 NPCs declare `attackrate`; everything else swings every 4 ticks. The
tool applies that default, so a monster whose config is silent must be 4 in
`gamedata.js`.

## Absent is not zero

For the **bonus params**, no param means no bonus, so absent really is 0.

For the **combat levels** it is different. Goblin, cow, chicken and man have no
`attack=`, `strength=` or `defence=` line at all. `gamedata.js` floors those at
1 so the accuracy formulas stay well-behaved, which is a deliberate choice, not
a defect. Those are reported under `LEVEL NOT DECLARED IN SOURCE` rather than
counted as mismatches.

## Resolving ids

A gamedata monster id is matched to an `all.npc` id by, in order: the explicit
`NPC_ID` map in the tool, an exact id match, then display name plus combat
level. If name+level is ambiguous the tool refuses to guess and lists the
monster as unresolved — better an honest gap than a wrong pairing.

## Death-drop check

A monster with no weighted drop table is not covered by the drop-table audit,
so its loot is checked here instead against the config's `param=death_drop`:

- `death_drop=null` means it drops nothing — `gamedata.js` should have no loot
  rows, which is the case for all three spiders.
- A named `death_drop` should be the monster's only loot row (baby blue dragon
  drops babydragon bones, magic axe drops an iron battleaxe).
- **No `death_drop` line** is reported `n/a`, not as a mismatch. Those monsters
  get their always-drops from `obj_add` lines in their own drop script — a bear
  drops fur and raw beef that way — and the drop-table audit sees those.

## damageType: which of *your* defences is rolled against

`param=damagetype` is the most easily misread field in the config. It is not the
monster's own defence — it selects which of the **player's** defence bonuses the
monster's attack is checked against. Both attack procs use it:

```
npc_meleeattack  / npc_rangeattack
    $defence_roll = ~player_defence_roll_specific(npc_param(damagetype))
```

Across the 63 monsters that resolve, it is 24 slash, 21 crush and 18 stab.
`trip.js` assumed slash for every one of them until 2026-08-25, so 39 were
reading the wrong bonus off the player's gear — and in rune, stab, slash and
crush defence differ enough to move food per kill. The three metal dragons have
no config to check against and keep the old slash assumption.

It is also independent of how the attack *looks*. Elf warrior (90) fires a bow,
so Protect from Missiles blocks it, but its `damagetype` is `^stab_style` and
the shot is rolled against stab defence. That is why `damageType` and `atkType`
are separate fields rather than one.

## Ranged attackers

A monster whose `ranged` level exceeds its melee `attack` fires rather than
swings, and `npc_combat_ranged.rs2` rolls both accuracy and max hit off that one
level — where melee splits accuracy (attack) from damage (strength):

```
attack_roll = (ranged + 9) × (rangeattack + 64)
maxhit      = ((ranged + 9) × (rangebonus + 64) + 320) / 640
```

Exactly one monster here qualifies: **elf warrior (90)**, with `ranged=80`
against `attack=10`. Reading its accuracy off `attack` had it rolling 1216
instead of 5696 — a hit chance of 2.5% where source gives 12.1%, and a max hit
of 9 where source gives 10. Incoming damage per kill was 1.72 against a true
9.08, food per kill 0.05 against 0.42, and the app reported 73.4k gp/hr where
the corrected model gives 47.8k. Fixed 2026-08-25; `tools/run-golden.js` covers
it with `melee_elf_warrior_90_ranged_attacker`.

Water elemental carries `ranged=30` alongside `attack=30`. The stat is inert —
its `damagetype` is stab and it attacks in melee — so the audit deliberately
does not require a `rangeLevel` where ranged does not exceed attack, rather than
inventing a distinction source does not make.

### Still not modelled

A ranged monster attacks from range, so a safespot does not stop it the way it
stops a melee one — the same exemption `dragonfireRanged` already carries for
metal dragon breath. Elf warrior (90) has `attackrange=8` in source. `trip.js`
still treats any ranged or magic method as a full safespot against it, which
understates incoming damage for anyone safespotting that monster specifically.

## Coverage

`all.npc` holds the base-world NPCs; monsters added by a quest or an area keep
their config in that folder, which is why the tool wants the checkout root
rather than the dumps alone.

Against a full checkout, 63 of 66 monsters verify — stats, `damageType`, and
the ranged trio where source declares one. The exceptions are
`bronze_dragon`, `iron_dragon` and `steel_dragon`, which have no config and no
drop script anywhere in the tree — they postdate this content revision and are
hand-authored, so nothing checks them.

## Explicit max-hit overrides

`gamedata.js` can pin a monster's max hit with `maxHit`, overriding the standard
NPC formula `floor(((str + 9) * (strBonus + 64) + 320) / 640)`. Before adding
one, check that the formula does not already produce the source value with
correct stats — `poison_spider` carried `maxHit:5` only because its `strength`
was wrong. With `strength` corrected to 58 the formula gives 7, which is what
source resolves to, so the override was removed.
