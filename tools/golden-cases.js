'use strict';
// golden-cases.js — the scenarios tools/run-golden.js locks down.
//
// Each case is a compact description of a UI configuration: levels, gear,
// prayers, boosts and trip settings. tools/golden-lib.js expands it into the
// full input object SimEngine.simulate() expects, filling the same defaults the
// app does, so a case only has to state what makes it interesting.
//
// The set is chosen for coverage of the code paths that carry state between
// engine.js and trip.js — sustained potion averaging, cannon overlay, ammo
// recovery, in-trip alching, safespotting, poison, recoil, specials — not for
// realism. Add a case when you add a mechanic; the point is that a refactor
// that silently changes any of these numbers fails loudly.
//
// Ported from index-sim-v2's src/tests/fixtures/legacy-case-definitions.ts.

const RUNE_MELEE_GEAR = {
  helm: 'rune_full_helm',
  amulet: 'amu_power',
  body: 'rune_platebody',
  legs: 'rune_platelegs',
  shield: 'rune_kite',
  gloves: 'none',
  boots: 'climbing_boots',
  cape: 'cape_legends',
  ring: 'none'
};

const DRAGON_MELEE_GEAR = {
  ...RUNE_MELEE_GEAR,
  helm: 'dragon_med_helm',
  amulet: 'amu_glory',
  shield: 'dragon_sq'
};

const RANGED_GEAR = {
  helm: 'archer_helm',
  amulet: 'amu_power',
  body: 'black_dhide_body',
  legs: 'black_dhide_legs',
  shield: 'none',
  gloves: 'black_vambraces',
  boots: 'ranger_boots',
  cape: 'cape_legends',
  ring: 'none'
};

const MAGIC_GEAR = {
  helm: 'farseer_helm',
  amulet: 'amu_power',
  body: 'splitbark_body',
  legs: 'splitbark_legs',
  shield: 'unholy_book',
  gloves: 'splitbark_gauntlets',
  boots: 'wizard_boots',
  cape: 'god_cape',
  ring: 'none'
};

const CASES = [
  {
    id: 'melee_rune_scimitar_hill_giant_super_prayers',
    description:
      'Melee training with rune scimitar, sustained super potions, offensive prayers, bones and trip costs.',
    combatType: 'melee',
    monsterId: 'giant',
    weapon: 'rune_scimitar',
    style: 'aggressive',
    levels: { attack: 60, strength: 60, defence: 50, ranged: 50, magic: 50, prayer: 43 },
    gear: RUNE_MELEE_GEAR,
    prayers: ['ultimate', 'incredible'],
    boosts: ['super_att', 'super_str'],
    sustained: true,
    repotThreshold: 65,
    trip: {
      foodKey: 'lobster',
      teleport: true,
      bankSeconds: 90,
      prayerMode: 'potions',
      prayerPotionSets: 1
    }
  },
  {
    id: 'melee_green_dragon_antifire_ring_of_wealth',
    description:
      'Valuable dragon loot, antifire trip settings, anti-dragon shield and Ring of Wealth jewel table.',
    combatType: 'melee',
    monsterId: 'green_dragon',
    weapon: 'dragon_longsword',
    style: 'aggressive',
    levels: { attack: 75, strength: 75, defence: 70, ranged: 60, magic: 60, prayer: 52 },
    gear: { ...DRAGON_MELEE_GEAR, shield: 'anti_dragon', ring: 'ring_of_wealth' },
    prayers: ['ultimate', 'incredible'],
    boosts: ['super_att', 'super_str', 'super_def'],
    sustained: true,
    repotThreshold: 78,
    trip: {
      foodKey: 'lobster',
      teleport: true,
      bankSeconds: 240,
      antifire: true,
      prayerMode: 'none'
    },
    ringOfWealth: true,
    jewelSpot: 'overground'
  },
  {
    id: 'melee_dragon_dagger_poison_lesser_demon_spec',
    description: 'Poisoned dragon dagger mainhand with its own DPS special against a demon.',
    combatType: 'melee',
    monsterId: 'lesser_demon',
    weapon: 'dragon_dagger_p',
    style: 'aggressive',
    specWeapon: 'dragon_dagger_p',
    levels: { attack: 70, strength: 70, defence: 60, ranged: 50, magic: 50, prayer: 43 },
    gear: DRAGON_MELEE_GEAR,
    prayers: ['ultimate', 'incredible'],
    boosts: ['super_att', 'super_str'],
    sustained: true,
    repotThreshold: 72,
    trip: { foodKey: 'swordfish', teleport: true, bankSeconds: 120, prayerMode: 'none' }
  },
  {
    id: 'melee_dba_sustained_moss_giant',
    description: 'Dragon battleaxe boost mode with restore handling and sustained-level averaging.',
    combatType: 'melee',
    monsterId: 'mossgiant',
    weapon: 'rune_scimitar',
    style: 'controlled',
    levels: { attack: 65, strength: 68, defence: 55, ranged: 45, magic: 45, prayer: 43 },
    gear: RUNE_MELEE_GEAR,
    prayers: ['ultimate', 'incredible'],
    boosts: ['dba_spec', 'super_att'],
    sustained: true,
    repotThreshold: 70,
    trip: {
      foodKey: 'lobster',
      teleport: true,
      bankSeconds: 110,
      dbaRestore: true,
      prayerMode: 'none'
    }
  },
  {
    id: 'melee_dragon_halberd_rock_crab_small_target_spec',
    description:
      'Dragon halberd safespot and special-attack behavior on a small target; intentionally preserves legacy double-hit model.',
    combatType: 'melee',
    monsterId: 'rock_crab',
    weapon: 'dragon_halberd',
    style: 'aggressive',
    specWeapon: 'dragon_halberd',
    levels: { attack: 70, strength: 70, defence: 60, ranged: 50, magic: 50, prayer: 43 },
    gear: { ...DRAGON_MELEE_GEAR, shield: 'none' },
    prayers: ['none'],
    boosts: ['super_att', 'super_str'],
    sustained: false,
    trip: { foodKey: 'none', teleport: false, bankSeconds: 0 }
  },
  {
    id: 'melee_ring_recoil_fire_giant_food_trip',
    description:
      'No-safespot melee trip with incoming damage, food use and ring-of-recoil supply cost.',
    combatType: 'melee',
    monsterId: 'firegiant',
    weapon: 'rune_scimitar',
    style: 'aggressive',
    levels: { attack: 72, strength: 72, defence: 60, ranged: 50, magic: 50, prayer: 43 },
    gear: { ...RUNE_MELEE_GEAR, ring: 'ring_of_recoil' },
    prayers: ['ultimate', 'incredible'],
    boosts: ['super_att', 'super_str', 'super_def'],
    sustained: true,
    repotThreshold: 74,
    trip: {
      foodKey: 'lobster',
      teleport: true,
      bankSeconds: 210,
      recoilRings: 3,
      prayerMode: 'none'
    }
  },
  {
    id: 'ranged_magic_shortbow_dagannoth_cannon',
    description:
      'Ranged bow training with cannon overlay, prayer-free trip reserve and cannonball supply accounting.',
    combatType: 'ranged',
    monsterId: 'dagannoth',
    weapon: 'magic_shortbow',
    ammo: 'rune_arrow',
    style: 'rapid',
    levels: { attack: 60, strength: 60, defence: 60, ranged: 78, magic: 55, prayer: 43 },
    gear: RANGED_GEAR,
    boosts: ['ranging'],
    sustained: true,
    repotThreshold: 80,
    cannon: { enabled: true, targets: 6, respawnSec: 30 },
    trip: { foodKey: 'lobster', teleport: true, bankSeconds: 150, recoverAmmo: true }
  },
  {
    id: 'ranged_magic_shortbow_rock_crab_safespot',
    description: 'Ranged safespot baseline with low-value loot and automatic zero incoming damage.',
    combatType: 'ranged',
    monsterId: 'rock_crab',
    weapon: 'magic_shortbow',
    ammo: 'mith_arrow',
    style: 'rapid',
    levels: { attack: 40, strength: 40, defence: 40, ranged: 60, magic: 40, prayer: 31 },
    gear: RANGED_GEAR,
    boosts: ['none'],
    trip: { foodKey: 'none', teleport: false, bankSeconds: 0, recoverAmmo: true }
  },
  {
    id: 'ranged_steel_knives_chaos_druid_inventory',
    description: 'Thrown-weapon ranged case over herb drops and non-stackable inventory pressure.',
    combatType: 'ranged',
    monsterId: 'chaos_druid',
    weapon: 'steel_knife_w',
    ammo: 'none',
    style: 'rapid',
    levels: { attack: 30, strength: 30, defence: 40, ranged: 50, magic: 35, prayer: 31 },
    gear: { ...RANGED_GEAR, shield: 'unholy_book' },
    boosts: ['none'],
    lootPrefs: { Herb: 'value' },
    trip: { foodKey: 'trout', teleport: true, bankSeconds: 90, recoverAmmo: false }
  },
  {
    id: 'ranged_yew_longbow_black_demon_no_recovery',
    description: 'Slow bow, high-defence target and explicit no-ammo-recovery cost path.',
    combatType: 'ranged',
    monsterId: 'black_demon',
    weapon: 'yew_longbow',
    ammo: 'addy_arrow',
    style: 'longrange',
    levels: { attack: 60, strength: 60, defence: 70, ranged: 75, magic: 50, prayer: 43 },
    gear: RANGED_GEAR,
    boosts: ['ranging'],
    sustained: true,
    repotThreshold: 78,
    trip: { foodKey: 'none', teleport: true, bankSeconds: 160, recoverAmmo: false }
  },
  {
    id: 'ranged_magic_shortbow_greater_demon_spec',
    description: 'Magic shortbow special attack with bow ammo and demon loot.',
    combatType: 'ranged',
    monsterId: 'greater_demon',
    weapon: 'magic_shortbow',
    ammo: 'rune_arrow',
    style: 'rapid',
    specWeapon: 'magic_shortbow',
    specAmmo: 'rune_arrow',
    levels: { attack: 60, strength: 60, defence: 65, ranged: 82, magic: 55, prayer: 43 },
    gear: RANGED_GEAR,
    boosts: ['ranging'],
    sustained: true,
    repotThreshold: 84,
    trip: { foodKey: 'none', teleport: true, bankSeconds: 130, recoverAmmo: true }
  },
  {
    id: 'magic_fire_bolt_chaos_druid_alch',
    description:
      'Magic bolt spell, chaos gauntlet max-hit bonus, in-trip high-alch reserve and herb loot.',
    combatType: 'magic',
    monsterId: 'chaos_druid',
    weapon: 'staff_of_fire',
    spell: 'fire_bolt',
    style: 'accurate',
    levels: { attack: 30, strength: 30, defence: 45, ranged: 30, magic: 59, prayer: 43 },
    gear: { ...MAGIC_GEAR, gloves: 'chaos_gauntlets' },
    boosts: ['magic', 'chaos_gauntlets'],
    sustained: true,
    repotThreshold: 60,
    trip: { foodKey: 'none', teleport: true, bankSeconds: 90, alching: true, runeSlots: 2 }
  },
  {
    id: 'magic_fire_wave_blue_dragon_safespot',
    description: 'High spell tier against dragon loot with magic safespot auto-enabled.',
    combatType: 'magic',
    monsterId: 'blue_dragon',
    weapon: 'staff_of_fire',
    spell: 'fire_wave',
    style: 'accurate',
    levels: { attack: 40, strength: 40, defence: 60, ranged: 50, magic: 80, prayer: 52 },
    gear: MAGIC_GEAR,
    boosts: ['magic'],
    sustained: true,
    repotThreshold: 82,
    trip: { foodKey: 'none', teleport: true, bankSeconds: 270, runeSlots: 2 }
  },
  {
    id: 'magic_saradomin_strike_charged_greater_demon',
    description: 'Charged god spell, charge upkeep cost and magic-defence roll against a demon.',
    combatType: 'magic',
    monsterId: 'greater_demon',
    weapon: 'staff_of_air',
    spell: 'saradomin_strike',
    charge: true,
    style: 'accurate',
    levels: { attack: 40, strength: 40, defence: 60, ranged: 50, magic: 80, prayer: 52 },
    gear: MAGIC_GEAR,
    boosts: ['magic'],
    sustained: false,
    trip: { foodKey: 'none', teleport: true, bankSeconds: 130, runeSlots: 3 }
  },
  {
    id: 'magic_water_bolt_tribesman_poison_safespot',
    description:
      'Magic safespot against poisonous monster; baseline keeps auto-safespot incoming poison at zero.',
    combatType: 'magic',
    monsterId: 'tribesman',
    weapon: 'staff_of_water',
    spell: 'water_bolt',
    style: 'defensive',
    levels: { attack: 30, strength: 30, defence: 45, ranged: 30, magic: 55, prayer: 37 },
    gear: MAGIC_GEAR,
    boosts: ['magic'],
    trip: { foodKey: 'salmon', teleport: true, bankSeconds: 240, runeSlots: 2, antipoison: true }
  },
  {
    id: 'melee_chaos_dwarf_alch_rune_drop',
    description: 'Melee plus in-trip alching for rune/metal drops and nature-rune cost accounting.',
    combatType: 'melee',
    monsterId: 'chaos_dwarf',
    weapon: 'rune_scimitar',
    style: 'aggressive',
    levels: { attack: 70, strength: 72, defence: 60, ranged: 50, magic: 55, prayer: 43 },
    gear: RUNE_MELEE_GEAR,
    prayers: ['ultimate', 'incredible'],
    boosts: ['super_att', 'super_str'],
    sustained: true,
    repotThreshold: 74,
    trip: {
      foodKey: 'lobster',
      teleport: true,
      bankSeconds: 120,
      alching: true,
      prayerMode: 'none'
    }
  },
  {
    id: 'melee_black_dragon_food_limited_trip',
    description: 'High incoming-damage dragon trip with anti-dragon shield and antifire potion.',
    combatType: 'melee',
    monsterId: 'black_dragon',
    weapon: 'dragon_longsword',
    style: 'aggressive',
    levels: { attack: 85, strength: 85, defence: 80, ranged: 60, magic: 60, prayer: 60 },
    gear: { ...DRAGON_MELEE_GEAR, shield: 'anti_dragon' },
    prayers: ['ultimate', 'incredible', 'steel_skin'],
    boosts: ['super_att', 'super_str', 'super_def'],
    sustained: true,
    repotThreshold: 88,
    trip: { foodKey: 'shark', teleport: true, bankSeconds: 300, antifire: true, prayerMode: 'none' }
  },
  {
    id: 'melee_elf_warrior_90_ranged_attacker',
    description:
      'The only monster that shoots rather than swings: accuracy and max hit come off its ranged level, while its shot is checked against stab defence.',
    combatType: 'melee',
    monsterId: 'elf_warrior_90',
    weapon: 'dragon_longsword',
    style: 'aggressive',
    levels: { attack: 80, strength: 80, defence: 75, ranged: 60, magic: 60, prayer: 50 },
    gear: DRAGON_MELEE_GEAR,
    prayers: ['ultimate', 'incredible'],
    boosts: ['super_att', 'super_str'],
    sustained: true,
    repotThreshold: 82,
    trip: { foodKey: 'shark', teleport: true, bankSeconds: 180, prayerMode: 'none' }
  },
  {
    id: 'melee_bandit_stab_damagetype',
    description:
      'A stab-damagetype monster taking live hits, so the player stab defence path is covered rather than inferred.',
    combatType: 'melee',
    monsterId: 'bandit',
    weapon: 'rune_scimitar',
    style: 'aggressive',
    levels: { attack: 55, strength: 55, defence: 45, ranged: 40, magic: 40, prayer: 31 },
    gear: RUNE_MELEE_GEAR,
    prayers: ['none'],
    boosts: ['none'],
    trip: { foodKey: 'lobster', teleport: true, bankSeconds: 100, prayerMode: 'none' }
  },
  {
    id: 'melee_low_level_chicken_low_value_loot',
    description: 'Low-level melee case with near-worthless drops and no supply stack.',
    combatType: 'melee',
    monsterId: 'chicken',
    weapon: 'iron_scimitar',
    style: 'accurate',
    levels: { attack: 10, strength: 10, defence: 10, ranged: 1, magic: 1, prayer: 1 },
    gear: { amulet: 'none', body: 'none', legs: 'none', shield: 'none', boots: 'none' },
    prayers: ['none'],
    boosts: ['none'],
    trip: { foodKey: 'none', teleport: false, bankSeconds: 0 }
  }
];

module.exports = { CASES, RUNE_MELEE_GEAR, DRAGON_MELEE_GEAR, RANGED_GEAR, MAGIC_GEAR };
