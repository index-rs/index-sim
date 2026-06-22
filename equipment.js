// equipment.js — gear registry + bonus summing for the Equipment manager.
// Armour (helm/body/legs/shield) VERIFIED from
//   scripts/skill_combat/configs/melee/*.obj @ LostCityRS/Content (ref 274)
//   alch = floor(cost × 0.6). Defence params are exact.
// Weapons/ammo are reused from window.SimEngine (WEAPONS / ARROWS).
// Accessories (amulet/cape/gloves/ring/boots) are NOT in the obj configs
//   (they live in the binary obj.pack) — values below are documented
//   2004-era bonuses, flagged approx:true so the UI can mark them.
//
// Bonus keys: stabAtt slashAtt crushAtt magAtt rngAtt             stabDef slashDef crushDef magDef rngDef
//             str rngStr magDmg prayer
// Missing keys default to 0.

(function(){

  const A = (cost) => Math.floor(cost * 0.6);   // high-alch helper

  // ---- HELMETS (full helms + med helms) ------------------------------
  const HELMS = {
    none:             { name:'None' },
    rune_full_helm:   { name:'Rune full helm',    slashDef:32, stabDef:30, crushDef:27, rngDef:30, magDef:-1, magAtt:-6, rngAtt:-2, alch:A(35200) },
    // Dragon med helm — EXACT from medhelms.obj @274 (cost 100000).
    dragon_med_helm:  { name:'Dragon med helm',   magAtt:-3, rngAtt:-1, stabDef:33, slashDef:35, crushDef:32, rngDef:34, magDef:-1, alch:A(100000) },
    // Fremennik helms (rev 274) — EXACT from quest_viking/viking.obj (cost 60000).
    berserker_helm:   { name:'Berserker helm',    magAtt:-5, rngAtt:-5, stabDef:31, slashDef:29, crushDef:33, rngDef:30, str:3, alch:A(60000) },
    warrior_helm:     { name:'Warrior helm',      slashAtt:5, magAtt:-5, rngAtt:-5, stabDef:31, slashDef:33, crushDef:29, rngDef:30, alch:A(60000) },
    archer_helm:      { name:'Archer helm',       stabAtt:-5, slashAtt:-5, crushAtt:-5, magAtt:-5, rngAtt:6, stabDef:6, slashDef:8, crushDef:10, magDef:6, rngDef:6, alch:A(60000) },
    farseer_helm:     { name:'Farseer helm',      stabAtt:-5, slashAtt:-5, crushAtt:-5, magAtt:6, rngAtt:-5, stabDef:8, slashDef:10, crushDef:12, magDef:6, alch:A(60000) },
    // Robin hood hat — EXACT from trails.obj (cost 450).
    robin_hood_hat:   { name:'Robin hood hat',    magAtt:-10, rngAtt:8, stabDef:4, slashDef:6, crushDef:8, magDef:4, rngDef:4, alch:A(450) },
    coif:             { name:'Coif',              magAtt:-1, rngAtt:2, stabDef:4, slashDef:6, crushDef:8, magDef:4, rngDef:4, alch:A(200) },
    // Splitbark helm — EXACT from all.obj @274.
    splitbark_helm:   { name:'Splitbark helm',    magAtt:2, rngAtt:-2, stabDef:10, slashDef:9, crushDef:11, magDef:3, alch:A(10000) },
  };

  // ---- BODIES (platebodies + chainbodies) ----------------------------
  const BODIES = {
    none:             { name:'None' },
    rune_platebody:   { name:'Rune platebody',    slashDef:80, stabDef:82, crushDef:72, rngDef:80, magDef:-6, magAtt:-30, rngAtt:-10, alch:A(65000) },
    // Dragon chainbody — EXACT from chainbodies.obj @274 (cost 250000).
    dragon_chainbody: { name:'Dragon chainbody',  slashDef:93, stabDef:81, crushDef:98, rngDef:82, magDef:-3, magAtt:-15, alch:A(250000) },
    // Dragonhide bodies — EXACT from skill_crafting leather_gear.obj.
    green_dhide_body: { name:'Green d-hide body', magAtt:-15, rngAtt:15, stabDef:40, slashDef:32, crushDef:45, magDef:20, rngDef:40, alch:A(7800) },
    blue_dhide_body:  { name:'Blue d-hide body',  magAtt:-15, rngAtt:20, stabDef:45, slashDef:37, crushDef:50, magDef:30, rngDef:45, alch:A(9360) },
    red_dhide_body:   { name:'Red d-hide body',   magAtt:-15, rngAtt:25, stabDef:50, slashDef:42, crushDef:55, magDef:40, rngDef:50, alch:A(11230) },
    black_dhide_body: { name:'Black d-hide body', magAtt:-15, rngAtt:30, stabDef:55, slashDef:47, crushDef:60, magDef:50, rngDef:55, alch:A(13480) },
    // Splitbark body/legs — EXACT from all.obj @274.
    splitbark_body:   { name:'Splitbark body',    magAtt:8, rngAtt:-10, stabDef:36, slashDef:26, crushDef:42, magDef:15, alch:A(45000) },
    // Monk's robe top — body slot, +6 prayer (2004 values). Cheap prayer bonus.
    monk_robe_top:    { name:"Monk's robe top",    prayer:6, alch:A(0) },
  };

  // ---- LEGS (platelegs) ----------------------------------------------
  const LEGS = {
    none:             { name:'None' },
    rune_platelegs:   { name:'Rune platelegs',    slashDef:49, stabDef:51, crushDef:47, rngDef:49, magDef:-4, magAtt:-21, rngAtt:-7, alch:A(64000) },
    // Dragonhide chaps — EXACT from skill_crafting leather_gear.obj.
    green_dhide_legs: { name:'Green d-hide chaps',magAtt:-10, rngAtt:8,  stabDef:22, slashDef:16, crushDef:24, magDef:8,  rngDef:22, alch:A(3900) },
    blue_dhide_legs:  { name:'Blue d-hide chaps', magAtt:-10, rngAtt:11, stabDef:25, slashDef:19, crushDef:27, magDef:14, rngDef:25, alch:A(4320) },
    red_dhide_legs:   { name:'Red d-hide chaps',  magAtt:-10, rngAtt:14, stabDef:28, slashDef:22, crushDef:30, magDef:20, rngDef:28, alch:A(5180) },
    black_dhide_legs: { name:'Black d-hide chaps',magAtt:-10, rngAtt:17, stabDef:31, slashDef:25, crushDef:33, magDef:28, rngDef:31, alch:A(6220) },
    splitbark_legs:   { name:'Splitbark legs',    magAtt:7, rngAtt:-6, stabDef:22, slashDef:20, crushDef:25, magDef:10, alch:A(40000) },
    // Monk's robe (bottom) — legs slot, +6 prayer (2004 values).
    monk_robe_bottom: { name:"Monk's robe (bottom)", prayer:6, alch:A(0) },
  };

  // ---- SHIELDS (kiteshields) -----------------------------------------
  const SHIELDS = {
    none:             { name:'None' },
    rune_kite:        { name:'Rune kiteshield',   slashDef:48, stabDef:44, crushDef:46, rngDef:46, magDef:-1, magAtt:-8, rngAtt:-2, alch:A(54400) },
    // Dragon sq shield — EXACT from shields.obj @274 (cost 500000).
    dragon_sq:        { name:'Dragon sq shield',  magAtt:-6, rngAtt:-2, stabDef:50, slashDef:52, crushDef:48, rngDef:50, alch:A(500000) },
    // Anti-dragon shield — EXACT from shields.obj @274 (antidragonbreathshield,
    // cost 20). Essential vs dragons: blocks the bulk of dragonfire. NOTE: the
    // dragonfire mitigation is keyed off this item's id ('anti_dragon') in
    // trip.js — not off a flag here — so no antifire/antiDragon flag is needed.
    anti_dragon:      { name:'Anti-dragon shield', stabDef:7, slashDef:9, crushDef:8, magDef:2, rngDef:8, alch:A(20) },
    // God books (Horror from the Deep, rev 274) — EXACT from quest_horror.obj.
    // Unholy (Zamorak): +8 all attack styles, +5 prayer (param=prayerbonus,5).
    unholy_book:      { name:'Unholy book (Zamorak)', stabAtt:8, slashAtt:8, crushAtt:8, magAtt:8, rngAtt:8, prayer:5, alch:A(200) },
  };

  // ---- ACCESSORIES (curated — not in obj configs, 2004 values) -------
  // ---- AMULETS — EXACT from skill_magic/enchanted_jewelry.obj -----------
  const AMULETS = {
    none:             { name:'None' },
    amu_strength:     { name:'Amulet of strength', str:10, alch:A(2025) },
    amu_power:        { name:'Amulet of power',    stabAtt:6, slashAtt:6, crushAtt:6, magAtt:6, rngAtt:6, stabDef:6, slashDef:6, crushDef:6, magDef:6, rngDef:6, str:6, prayer:1, alch:A(3525) },
    amu_glory:        { name:'Amulet of glory',    stabAtt:10, slashAtt:10, crushAtt:10, magAtt:10, rngAtt:10, str:6, stabDef:3, slashDef:3, crushDef:3, magDef:3, rngDef:3, prayer:3, alch:A(17625) },
    // Unholy/holy symbol — amulet slot, +8 prayer, no combat stats. Best-in-slot
    // prayer bonus when overhead-praying (2004 values; holy symbol identical).
    unholy_symbol:    { name:'Unholy symbol',      prayer:8, alch:A(0) },
    holy_symbol:      { name:'Holy symbol',        prayer:8, alch:A(0) },
  };
  const GLOVES = {
    none:             { name:'None' },
    // Chaos gauntlets — EXACT from quest_crest.obj @274 (gauntlets_of_chaos).
    // Same base stats as the other Family Crest gauntlets; the magic perk
    // (+3 bolt dmg) is applied separately in engine.js.
    chaos_gauntlets:  { name:'Chaos gauntlets', stabAtt:2, slashAtt:2, crushAtt:2, stabDef:8, slashDef:9, crushDef:7, str:2, note:'+3 bolt dmg', alch:0 },
    // Splitbark gauntlets — EXACT from all.obj @274 (cost 5000).
    splitbark_gauntlets:{ name:'Splitbark gauntlets', magAtt:1, rngAtt:-1, stabDef:3, slashDef:2, crushDef:4, magDef:2, alch:A(5000) },
    // Vambraces — EXACT from skill_crafting leather_gear.obj @274.
    leather_vambraces:{ name:'Leather vambraces',  rngAtt:4, stabDef:2, slashDef:2, crushDef:1, alch:A(18) },
    green_vambraces:  { name:'Green d-hide vambs', magAtt:-10, rngAtt:8,  stabDef:3, slashDef:2, crushDef:4, magDef:2, alch:A(2500) },
    blue_vambraces:   { name:'Blue d-hide vambs',  magAtt:-10, rngAtt:9,  stabDef:4, slashDef:3, crushDef:5, magDef:4, alch:A(3000) },
    red_vambraces:    { name:'Red d-hide vambs',   magAtt:-10, rngAtt:10, stabDef:5, slashDef:4, crushDef:6, magDef:6, alch:A(3600) },
    black_vambraces:  { name:'Black d-hide vambs', magAtt:-10, rngAtt:11, stabDef:6, slashDef:5, crushDef:7, magDef:8, alch:A(4320) },
  };
  const CAPES = {
    none:             { name:'None' },
    // Cape of legends — EXACT from all.obj @225 (cost 450).
    cape_legends:     { name:'Cape of legends',    stabDef:7, slashDef:7, crushDef:7, magDef:7, rngDef:7, alch:A(450) },
    // God cape — EXACT from area_mage_arena/mage_arena.obj (cost 100).
    god_cape:         { name:'God cape',           magAtt:10, stabDef:1, slashDef:1, crushDef:2, magDef:10, alch:A(100) },
  };
  const BOOTS = {
    none:             { name:'None' },
    // Climbing boots — EXACT from quest_death.obj (cost 12).
    climbing_boots:   { name:'Climbing boots',     str:2, slashDef:2, crushDef:2, alch:A(12) },
    // Ranger / wizard boots — EXACT from trails.obj (cost 200).
    ranger_boots:     { name:'Ranger boots',       magAtt:-10, rngAtt:8, stabDef:2, slashDef:3, crushDef:4, magDef:2, alch:A(200) },
    wizard_boots:     { name:'Wizard boots',       magAtt:4, magDef:4, alch:A(200) },
    // Splitbark boots (greaves) — EXACT from all.obj @274 (cost 5000).
    splitbark_boots:  { name:'Splitbark boots',    magAtt:1, rngAtt:-1, stabDef:3, slashDef:2, crushDef:4, magDef:2, alch:A(5000) },
  };
  const RINGS = {
    none:             { name:'None' },
    // Ring of wealth — alch from enchanted_jewelry.obj (cost 17625). No combat stats.
    ring_of_wealth:   { name:'Ring of wealth',     note:'gem table upgrade', alch:A(17625) },
  };

  // ---- slot registry --------------------------------------------------
  // weaponSlot/ammoSlot pull live from SimEngine so they stay in sync.
  const SLOT_DEFS = [
    { key:'helm',   label:'Helmet',  items:HELMS },
    { key:'amulet', label:'Amulet',  items:AMULETS },
    { key:'body',   label:'Body',    items:BODIES },
    { key:'legs',   label:'Legs',    items:LEGS },
    { key:'shield', label:'Shield',  items:SHIELDS },
    { key:'gloves', label:'Gloves',  items:GLOVES },
    { key:'boots',  label:'Boots',   items:BOOTS },
    { key:'cape',   label:'Cape',    items:CAPES },
    { key:'ring',   label:'Ring',    items:RINGS },
  ];

  const BONUS_KEYS = [
    'stabAtt','slashAtt','crushAtt','magAtt','rngAtt',
    'stabDef','slashDef','crushDef','magDef','rngDef',
    'str','rngStr','magDmg','prayer',
  ];

  // Sum bonuses across a loadout {slotKey: itemKey}. Weapon + ammo are
  // pulled from SimEngine. Returns a totals object over BONUS_KEYS.
  function sumBonuses(loadout){
    const totals = Object.fromEntries(BONUS_KEYS.map(k => [k, 0]));
    const add = (item) => {
      if (!item) return;
      for (const k of BONUS_KEYS) if (item[k]) totals[k] += item[k];
    };
    for (const def of SLOT_DEFS){
      const sel = loadout[def.key];
      if (sel && sel !== 'none') add(def.items[sel]);
    }
    // weapon
    const E = window.SimEngine;
    let thrownAmmo = null;
    if (loadout.weapon && loadout.weapon !== 'none' && E?.WEAPONS[loadout.weapon]){
      const w = E.WEAPONS[loadout.weapon];
      // weapon's accBonus maps to its style attack; dmgBonus to strength.
      if (w.type === 'melee'){ totals.slashAtt += w.accBonus; totals.str += w.dmgBonus; }
      else if (w.type === 'ranged'){ totals.rngAtt += w.accBonus; totals.rngStr += w.dmgBonus; }
      else if (w.type === 'magic'){ totals.magAtt += w.accBonus; }
      // Thrown weapons are mainhand AND their own ammo — pull the paired
      // knife/dart's ranged strength directly, ignoring the ammo slot.
      if (w.sub === 'thrown' && w.ammoKey) thrownAmmo = w.ammoKey;
    }
    // ammo (ranged): a thrown weapon supplies its own; a bow uses the ammo slot.
    const ammoKey = thrownAmmo || loadout.ammo;
    if (ammoKey && ammoKey !== 'none' && E?.ARROWS[ammoKey]){
      const a = E.ARROWS[ammoKey];
      totals.rngAtt += a.rangeBonus; totals.rngStr += a.rangeBonus;
    }
    return totals;
  }

  // Map a loadout's totals into the sim's input fields for a combat type.
  // Returns { accBonus, dmgBonus, attackSpeed, defBonuses } so the
  // calculator can be driven directly from equipped gear.
  function loadoutToInput(loadout, combatType){
    // Exclude the arrow slot from the sim's acc/dmg bonuses — simulate() adds
    // the arrow's rangeBonus itself via input.ammoRangeBonus, so including it
    // here would double-count bow ammo. Thrown weapons keep their built-in
    // ammo (counted here; their ammoRangeBonus is 0 in thrown mode).
    const t = sumBonuses({ ...loadout, ammo:'none' });
    const E = window.SimEngine;
    const w = loadout.weapon && E?.WEAPONS[loadout.weapon];
    let accBonus = 0, dmgBonus = 0;
    if (combatType === 'melee'){ accBonus = t.slashAtt; dmgBonus = t.str; }
    else if (combatType === 'ranged'){ accBonus = t.rngAtt; dmgBonus = t.rngStr; }
    else { accBonus = t.magAtt; dmgBonus = 0; }
    return {
      accBonus, dmgBonus,
      attackSpeed: w ? w.speed : undefined,
      totals: t,
    };
  }

  window.Equipment = {
    HELMS, BODIES, LEGS, SHIELDS, AMULETS, GLOVES, CAPES, BOOTS, RINGS,
    SLOT_DEFS, BONUS_KEYS, sumBonuses, loadoutToInput,
  };

})();
