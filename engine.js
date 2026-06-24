// engine.js — 2004scape combat math · Melee + Ranged + Magic
// Formulas verified from LostCityRS/Content scripts/skill_combat/scripts/combat.rs2:
//   combat_effective_stat = scale(max(100, prayerbonus), 100, stat_level)
//   combat_stat           = effective * (bonus + 64)
//   combat_maxhit         = (combat_stat + 320) / 640        (integer division)
// Style bonuses and per-style XP rates also from that file.
// Magic XP is HALF of melee/ranged (2 xp/damage vs 4 xp/damage).
// Pure functions, no DOM. Attached to window.SimEngine.
//
// PROVENANCE: inline "@274" / "rev 274" notes mark the content release tag a value
// was sourced from. 274 is a PINNED SNAPSHOT, not eternal — the server advances
// (274 → 289 → …). Formulas rarely change between tags; if you re-verify against a
// newer tag, cite that ref in the comment you add. See CLAUDE.md → "Source of truth".

(function(){
  const TICK_SECONDS = 0.6;

  // ====================================================================
  // PRAYERS — verified from LostCityRS/Content@274
  //   scripts/skill_prayer/configs/prayers.dbrow
  // Only 9 combat-relevant prayers in rev 274. Protect-from prayers
  // reduce incoming damage but don't boost offensive stats — not modelled here
  // (handled in the trip's incoming-damage calc), but their drain IS costed.
  // Rapid Restore/Heal and Protect Item have no combat stat effect.
  // `drain` = OSRS drain rate (points lost when a counter reaches
  // 2×prayerBonus+60, incremented by this each tick): lvl-1 prayers 3, lvl-2 6,
  // lvl-3 12. Protection prayers also drain 12 (added in the trip).
  // ====================================================================
  const PRAYERS = {
    none:        { att:1.00, str:1.00, def:1.00, drain:0,  cat:'none', label:'None' },
    // attack (level 7 / 16 / 34)
    clarity:     { att:1.05, str:1.00, def:1.00, drain:3,  cat:'att',  label:'Clarity of Thought (+5% Att)' },
    reflexes:    { att:1.10, str:1.00, def:1.00, drain:6,  cat:'att',  label:'Improved Reflexes (+10% Att)' },
    incredible:  { att:1.15, str:1.00, def:1.00, drain:12, cat:'att',  label:'Incredible Reflexes (+15% Att)' },
    // strength (level 4 / 13 / 31)
    burst:       { att:1.00, str:1.05, def:1.00, drain:3,  cat:'str',  label:'Burst of Strength (+5% Str)' },
    superhuman:  { att:1.00, str:1.10, def:1.00, drain:6,  cat:'str',  label:'Superhuman Strength (+10% Str)' },
    ultimate:    { att:1.00, str:1.15, def:1.00, drain:12, cat:'str',  label:'Ultimate Strength (+15% Str)' },
    // defence (level 1 / 10 / 28)
    thick_skin:  { att:1.00, str:1.00, def:1.05, drain:3,  cat:'def',  label:'Thick Skin (+5% Def)' },
    rock_skin:   { att:1.00, str:1.00, def:1.10, drain:6,  cat:'def',  label:'Rock Skin (+10% Def)' },
    steel_skin:  { att:1.00, str:1.00, def:1.15, drain:12, cat:'def',  label:'Steel Skin (+15% Def)' },
  };
  // Protection prayers drain at this OSRS rate while active.
  const PROTECT_DRAIN = 12;

  // ====================================================================
  // POTIONS — revision 274 era set. One potion per stat category active.
  // Restore potion negates DBA spec stat drain (drink-after-spec pattern).
  // No super combat / bastion / imbued heart in this era.
  // ====================================================================
  const POTIONS = {
    none:        { fn:(stat,l)=>l, cat:'none', label:'None' },
    attack:      { fn:(stat,l)=> stat==='att' ? l+3+(l*0.10|0) : l, cat:'att', label:'Attack potion' },
    strength:    { fn:(stat,l)=> stat==='str' ? l+3+(l*0.10|0) : l, cat:'str', label:'Strength potion' },
    defence:     { fn:(stat,l)=> stat==='def' ? l+3+(l*0.10|0) : l, cat:'def', label:'Defence potion' },
    super_att:   { fn:(stat,l)=> stat==='att' ? l+5+(l*0.15|0) : l, cat:'att', label:'Super attack' },
    super_str:   { fn:(stat,l)=> stat==='str' ? l+5+(l*0.15|0) : l, cat:'str', label:'Super strength' },
    super_def:   { fn:(stat,l)=> stat==='def' ? l+5+(l*0.15|0) : l, cat:'def', label:'Super defence' },
    ranging:     { fn:(stat,l)=> stat==='rng' ? l+4+(l*0.10|0) : l, cat:'rng', label:'Ranging potion' },
    magic:       { fn:(stat,l)=> stat==='mag' ? l+4 : l, cat:'mag', label:'Magic potion' },
    // Chaos gauntlets — boost fire bolt / blast / wave max hit by +3.
    // Not a level boost; applied as a flat max-hit addition in simulate().
    chaos_gauntlets: { fn:(stat,l)=>l, cat:'gauntlets', special:'chaos_gauntlets', label:'Chaos gauntlets' },
    // Restore — drunk after a DBA spec to undo the drain; modelled as a
    // flag that tells simulate() to ignore the spec's negative effects.
    restore:     { fn:(stat,l)=>l, cat:'restore', special:'restore', label:'Restore potion (negates DBA drain)' },
    // DBA special — selectable in the same boost menu. Strength boost is
    // applied separately in simulate(); negatives ignored (see restore).
    dba_spec:    { fn:(stat,l)=>l, cat:'special', special:'dba', label:'DBA spec' },
  };

  // ====================================================================
  // WEAPONS — VERIFIED from scripts/skill_combat/configs/*.obj (rev 274).
  // accBonus = slash (melee) / range (bow) attack bonus.
  // dmgBonus = strengthbonus (melee). Bows get strength from AMMO, so
  //   their dmgBonus is 0 — arrow rangebonus is added at sim time.
  // alch = floor(cost × 0.6) from the obj's cost= field.
  // speed = attackrate ticks (scimitars/daggers default 4, longswords 5,
  //   battleaxes 6; bows: shortbow 4 / longbow 6).
  // Only items that existed in late-2004 rev 274 are included.
  // ====================================================================
  const WEAPONS = {
    // melee weapons — grouped best → worst (dragon, then rune→iron scimitars).
    // accBonus=slashattack, dmgBonus=strengthbonus. EXACT from *.obj @274.
    dragon_longsword: { name:'Dragon longsword',  type:'melee', wclass:'longsword', accBonus:69, dmgBonus:71, speed:5, alch:60000 },
    dragon_mace:      { name:'Dragon mace',       type:'melee', wclass:'mace',     accBonus:60, dmgBonus:55, speed:5, alch:30000 },
    dragon_halberd:   { name:'Dragon halberd',    type:'melee', wclass:'halberd',  accBonus:95, dmgBonus:89, speed:7, alch:150000, twoHand:true },
    dragon_dagger:    { name:'Dragon dagger',     type:'melee', wclass:'dagger',   accBonus:40, dmgBonus:40, speed:4, alch:18000, stab:true },
    // Dragon dagger(p) — identical combat stats plus weapon poison (severity 20).
    dragon_dagger_p:  { name:'Dragon dagger(p)',  type:'melee', wclass:'dagger',   accBonus:40, dmgBonus:40, speed:4, alch:14400, stab:true, poisonSeverity:20 },
    rune_scimitar:    { name:'Rune scimitar',     type:'melee', wclass:'scimitar', accBonus:45, dmgBonus:44, speed:4, alch:15360 },
    adamant_scimitar: { name:'Adamant scimitar',  type:'melee', wclass:'scimitar', accBonus:29, dmgBonus:28, speed:4, alch:1536 },
    mithril_scimitar: { name:'Mithril scimitar',  type:'melee', wclass:'scimitar', accBonus:21, dmgBonus:20, speed:4, alch:624 },
    black_scimitar:   { name:'Black scimitar',    type:'melee', wclass:'scimitar', accBonus:19, dmgBonus:14, speed:4, alch:460 },
    steel_scimitar:   { name:'Steel scimitar',    type:'melee', wclass:'scimitar', accBonus:15, dmgBonus:14, speed:4, alch:240 },
    iron_scimitar:    { name:'Iron scimitar',     type:'melee', wclass:'scimitar', accBonus:10, dmgBonus:9,  speed:4, alch:67 },
    // ranged — bows, best → worst. dmgBonus=0; ammo adds str. EXACT rangeattack
    // from bows.obj @274 (shortbow rate 4, longbow rate 6).
    magic_shortbow:   { name:'Magic shortbow',    type:'ranged', sub:'bow', accBonus:69, dmgBonus:0,  speed:4, alch:960, twoHand:true },
    magic_longbow:    { name:'Magic longbow',     type:'ranged', sub:'bow', accBonus:69, dmgBonus:0,  speed:6, alch:1536, twoHand:true },
    yew_shortbow:     { name:'Yew shortbow',      type:'ranged', sub:'bow', accBonus:47, dmgBonus:0,  speed:4, alch:480, twoHand:true },
    yew_longbow:      { name:'Yew longbow',       type:'ranged', sub:'bow', accBonus:47, dmgBonus:0,  speed:6, alch:768, twoHand:true },
    maple_shortbow:   { name:'Maple shortbow',    type:'ranged', sub:'bow', accBonus:29, dmgBonus:0,  speed:4, alch:240, twoHand:true },
    willow_shortbow:  { name:'Willow shortbow',   type:'ranged', sub:'bow', accBonus:20, dmgBonus:0,  speed:4, alch:120, twoHand:true },
    oak_shortbow:     { name:'Oak shortbow',      type:'ranged', sub:'bow', accBonus:14, dmgBonus:0,  speed:4, alch:60,  twoHand:true },
    shortbow:         { name:'Shortbow',          type:'ranged', sub:'bow', accBonus:8,  dmgBonus:0,  speed:4, alch:30,  twoHand:true },
    // thrown weapons (knives & darts, attackrate 3) — mainhand slot, best → worst.
    // accBonus/dmgBonus 0; the item is its own ammo (ammoKey → ARROWS entry).
    rune_knife_w:     { name:'Rune knives (thrown)',   type:'ranged', sub:'thrown', ammoKey:'rune_knife',   accBonus:0, dmgBonus:0, speed:3, alch:0 },
    addy_knife_w:     { name:'Adamant knives (thrown)',type:'ranged', sub:'thrown', ammoKey:'addy_knife',   accBonus:0, dmgBonus:0, speed:3, alch:0 },
    mith_knife_w:     { name:'Mithril knives (thrown)',type:'ranged', sub:'thrown', ammoKey:'mith_knife',   accBonus:0, dmgBonus:0, speed:3, alch:0 },
    steel_knife_w:    { name:'Steel knives (thrown)',  type:'ranged', sub:'thrown', ammoKey:'steel_knife',  accBonus:0, dmgBonus:0, speed:3, alch:0 },
    iron_knife_w:     { name:'Iron knives (thrown)',   type:'ranged', sub:'thrown', ammoKey:'iron_knife',   accBonus:0, dmgBonus:0, speed:3, alch:0 },
    bronze_knife_w:   { name:'Bronze knives (thrown)', type:'ranged', sub:'thrown', ammoKey:'bronze_knife', accBonus:0, dmgBonus:0, speed:3, alch:0 },
    rune_dart_w:      { name:'Rune darts (thrown)',    type:'ranged', sub:'thrown', ammoKey:'rune_dart',    accBonus:0, dmgBonus:0, speed:3, alch:0 },
    addy_dart_w:      { name:'Adamant darts (thrown)', type:'ranged', sub:'thrown', ammoKey:'addy_dart',    accBonus:0, dmgBonus:0, speed:3, alch:0 },
    mith_dart_w:      { name:'Mithril darts (thrown)', type:'ranged', sub:'thrown', ammoKey:'mith_dart',    accBonus:0, dmgBonus:0, speed:3, alch:0 },
    steel_dart_w:     { name:'Steel darts (thrown)',   type:'ranged', sub:'thrown', ammoKey:'steel_dart',   accBonus:0, dmgBonus:0, speed:3, alch:0 },
    iron_dart_w:      { name:'Iron darts (thrown)',    type:'ranged', sub:'thrown', ammoKey:'iron_dart',    accBonus:0, dmgBonus:0, speed:3, alch:0 },
    bronze_dart_w:    { name:'Bronze darts (thrown)',  type:'ranged', sub:'thrown', ammoKey:'bronze_dart',  accBonus:0, dmgBonus:0, speed:3, alch:0 },
    // magic — elemental staves (rate 5, +10 magic attack). Each provides its
    // element rune for free (`provides`), so e.g. a fire staff casting fire
    // spells pays no fire runes. All identical combat-wise in rev 274.
    staff_of_fire:    { name:'Staff of fire',     type:'magic', provides:'firerune',  accBonus:10, dmgBonus:0, speed:5, alch:900 },
    staff_of_air:     { name:'Staff of air',      type:'magic', provides:'airrune',   accBonus:10, dmgBonus:0, speed:5, alch:540 },
    staff_of_water:   { name:'Staff of water',    type:'magic', provides:'waterrune', accBonus:10, dmgBonus:0, speed:5, alch:540 },
    staff_of_earth:   { name:'Staff of earth',    type:'magic', provides:'earthrune', accBonus:10, dmgBonus:0, speed:5, alch:540 },
  };

  // WEAPON_STANCES — per weapon class, each stance maps to an attack TYPE
  // (stab/slash/crush) and a flavour name. The attack type selects which of
  // the monster's defence bonuses (defStab/defSlash/defCrush) is rolled
  // against.
  //
  // STANCE_TABLES — per WEAPON CATEGORY, the EXACT ordered list of attack-style
  // options, verified from combat.dbrow @ LostCityRS/Content@274
  // (weapon_*_table). Weapons do NOT all have 4 styles or the standard
  // accurate/aggressive/controlled/defensive set: a halberd (polearm) has only
  // controlled/aggressive/defensive (no accurate); a dagger (stab) has a SECOND
  // aggressive that hits slash instead of stab; warhammers (blunt) and staves
  // have just 3 crush styles. Each entry:
  //   id    — unique stance key stored in input.style (duplicate base styles
  //           get a suffixed id, e.g. 'aggressive_slash')
  //   style — base style → drives accuracy/str/def bonuses + XP routing
  //           (looked up in STYLES.melee)
  //   type  — stab/slash/crush → which monster defence bonus is rolled against
  //   name  — flavour label
  const STANCE_TABLES = {
    // weapon_slash_table — scimitar, longsword, sword
    slash: [
      { id:'accurate',   style:'accurate',   type:'slash', name:'Chop'  },
      { id:'aggressive', style:'aggressive', type:'slash', name:'Slash' },
      { id:'controlled', style:'controlled', type:'stab',  name:'Lunge' },
      { id:'defensive',  style:'defensive',  type:'slash', name:'Block' },
    ],
    // weapon_stab_table — daggers (2nd aggressive is a slash, no controlled)
    stab: [
      { id:'accurate',        style:'accurate',   type:'stab',  name:'Stab'  },
      { id:'aggressive',      style:'aggressive', type:'stab',  name:'Stab'  },
      { id:'aggressive_slash',style:'aggressive', type:'slash', name:'Slash' },
      { id:'defensive',       style:'defensive',  type:'stab',  name:'Block' },
    ],
    // weapon_polearm_table — halberds (controlled/aggressive/defensive only)
    polearm: [
      { id:'controlled', style:'controlled', type:'stab',  name:'Jab'   },
      { id:'aggressive', style:'aggressive', type:'slash', name:'Swipe' },
      { id:'defensive',  style:'defensive',  type:'stab',  name:'Fend'  },
    ],
    // weapon_2h_sword_table — 2h swords (2nd aggressive is crush)
    '2h_sword': [
      { id:'accurate',         style:'accurate',   type:'slash', name:'Chop'  },
      { id:'aggressive',       style:'aggressive', type:'slash', name:'Slash' },
      { id:'aggressive_crush', style:'aggressive', type:'crush', name:'Smash' },
      { id:'defensive',        style:'defensive',  type:'slash', name:'Block' },
    ],
    // weapon_axe_table — battleaxes (2nd aggressive is crush)
    axe: [
      { id:'accurate',         style:'accurate',   type:'slash', name:'Chop'  },
      { id:'aggressive',       style:'aggressive', type:'slash', name:'Hack'  },
      { id:'aggressive_crush', style:'aggressive', type:'crush', name:'Smash' },
      { id:'defensive',        style:'defensive',  type:'slash', name:'Block' },
    ],
    // weapon_blunt_table — warhammers, hammers (3 crush styles)
    blunt: [
      { id:'accurate',   style:'accurate',   type:'crush', name:'Pound'  },
      { id:'aggressive', style:'aggressive', type:'crush', name:'Pummel' },
      { id:'defensive',  style:'defensive',  type:'crush', name:'Block'  },
    ],
    // weapon_spiked_table — maces (controlled stab spike)
    spiked: [
      { id:'accurate',   style:'accurate',   type:'crush', name:'Pound'  },
      { id:'aggressive', style:'aggressive', type:'crush', name:'Pummel' },
      { id:'controlled', style:'controlled', type:'stab',  name:'Spike'  },
      { id:'defensive',  style:'defensive',  type:'crush', name:'Block'  },
    ],
    // weapon_spear_table — spears (3 controlled stab/slash/crush)
    spear: [
      { id:'controlled',       style:'controlled', type:'stab',  name:'Lunge' },
      { id:'controlled_slash', style:'controlled', type:'slash', name:'Swipe' },
      { id:'controlled_crush', style:'controlled', type:'crush', name:'Pound' },
      { id:'defensive',        style:'defensive',  type:'stab',  name:'Block' },
    ],
    // weapon_claws_table — claws
    claws: [
      { id:'accurate',   style:'accurate',   type:'slash', name:'Chop'  },
      { id:'aggressive', style:'aggressive', type:'slash', name:'Slash' },
      { id:'controlled', style:'controlled', type:'stab',  name:'Lunge' },
      { id:'defensive',  style:'defensive',  type:'slash', name:'Block' },
    ],
    // weapon_staff_table — staves as melee (3 crush styles)
    staff: [
      { id:'accurate',   style:'accurate',   type:'crush', name:'Bash'  },
      { id:'aggressive', style:'aggressive', type:'crush', name:'Pound' },
      { id:'defensive',  style:'defensive',  type:'crush', name:'Focus' },
    ],
    // weapon_pickaxe_table
    pickaxe: [
      { id:'accurate',         style:'accurate',   type:'stab',  name:'Spike'  },
      { id:'aggressive',       style:'aggressive', type:'stab',  name:'Impale' },
      { id:'aggressive_crush', style:'aggressive', type:'crush', name:'Smash'  },
      { id:'defensive',        style:'defensive',  type:'stab',  name:'Block'  },
    ],
    // weapon_scythe_table
    scythe: [
      { id:'accurate',         style:'accurate',   type:'slash', name:'Reap'  },
      { id:'aggressive',       style:'aggressive', type:'stab',  name:'Chop'  },
      { id:'aggressive_crush', style:'aggressive', type:'crush', name:'Jab'   },
      { id:'defensive',        style:'defensive',  type:'slash', name:'Block' },
    ],
  };
  // Map a weapon's wclass → its stance-table category.
  const WCLASS_CATEGORY = {
    scimitar:'slash', longsword:'slash', sword:'slash',
    dagger:'stab',
    halberd:'polearm', spear:'spear',
    '2h_sword':'2h_sword', '2h':'2h_sword',
    battleaxe:'axe', axe:'axe',
    mace:'spiked',
    warhammer:'blunt', hammer:'blunt',
    claws:'claws', staff:'staff', pickaxe:'pickaxe', scythe:'scythe',
  };
  function weaponCategory(weaponKey){
    const cls = WEAPONS[weaponKey]?.wclass;
    return WCLASS_CATEGORY[cls] || 'slash';
  }
  // Ordered stance list for the equipped weapon (drives the UI buttons).
  function weaponStances(weaponKey){
    return STANCE_TABLES[weaponCategory(weaponKey)] || STANCE_TABLES.slash;
  }
  // Resolve the chosen stance (by id) for a melee weapon → {id,style,type,name}.
  // Falls back to the weapon's first stance if the id isn't valid for it (e.g.
  // a saved 'accurate' on a halberd that has no accurate style).
  function meleeStance(weaponKey, stanceId){
    const list = weaponStances(weaponKey);
    return list.find(s => s.id === stanceId) || list[0];
  }
  const DEF_FIELD = { stab:'defStab', slash:'defSlash', crush:'defCrush' };

  // ARROWS — VERIFIED from ranged/arrows.obj. rangebonus = ranged strength,
  // added to the bow's accBonus and used for max-hit. cost drives alch.
  // priceKey resolves to the live scraped market price (ITEM_PRICES); the
  // `price` field is the fallback. Strength values verified vs @274 knives/
  // darts.obj (rangebonus param) — identical to ours.
  const ARROWS = {
    rune_arrow:    { name:'Rune arrow',    kind:'arrow', rangeBonus:49, alch:240, price:400, priceKey:'rune_arrow' },
    addy_arrow:    { name:'Adamant arrow', kind:'arrow', rangeBonus:31, alch:48,  price:80,  priceKey:'adamant_arrow' },
    mith_arrow:    { name:'Mithril arrow', kind:'arrow', rangeBonus:22, alch:19,  price:32,  priceKey:'mithril_arrow' },
    steel_arrow:   { name:'Steel arrow',   kind:'arrow', rangeBonus:16, alch:7,   price:12,  priceKey:'steel_arrow' },
    iron_arrow:    { name:'Iron arrow',    kind:'arrow', rangeBonus:10, alch:1,   price:3,   priceKey:'iron_arrow' },
    bronze_arrow:  { name:'Bronze arrow',  kind:'arrow', rangeBonus:7,  alch:1,   price:1,   priceKey:'bronze_arrow' },
    // Thrown weapons (knives/darts) — auto-paired with their thrown weapon.
    bronze_knife:  { name:'Bronze knife',  kind:'thrown', tier:0, fam:'knife', barKey:'bronze_bar',    rangeBonus:3,  alch:1,   price:2,   priceKey:'bronze_knife' },
    iron_knife:    { name:'Iron knife',    kind:'thrown', tier:1, fam:'knife', barKey:'iron_bar',      rangeBonus:4,  alch:1,   price:4,   priceKey:'iron_knife' },
    steel_knife:   { name:'Steel knife',   kind:'thrown', tier:2, fam:'knife', barKey:'steel_bar',     rangeBonus:7,  alch:6,   price:9,   priceKey:'steel_knife' },
    mith_knife:    { name:'Mithril knife', kind:'thrown', tier:3, fam:'knife', barKey:'mithril_bar',   rangeBonus:10, alch:16,  price:18,  priceKey:'mithril_knife' },
    addy_knife:    { name:'Adamant knife', kind:'thrown', tier:4, fam:'knife', barKey:'adamantite_bar',rangeBonus:14, alch:39,  price:42,  priceKey:'adamant_knife' },
    rune_knife:    { name:'Rune knife',    kind:'thrown', tier:5, fam:'knife', barKey:'runite_bar',    rangeBonus:24, alch:100, price:230, priceKey:'rune_knife' },
    bronze_dart:   { name:'Bronze dart',   kind:'thrown', tier:0, fam:'dart', rangeBonus:1,  alch:1,   price:1,   priceKey:'bronze_dart' },
    iron_dart:     { name:'Iron dart',     kind:'thrown', tier:1, fam:'dart', rangeBonus:3,  alch:1,   price:2,   priceKey:'iron_dart' },
    steel_dart:    { name:'Steel dart',    kind:'thrown', tier:2, fam:'dart', rangeBonus:4,  alch:6,   price:5,   priceKey:'steel_dart' },
    mith_dart:     { name:'Mithril dart',  kind:'thrown', tier:3, fam:'dart', rangeBonus:7,  alch:15,  price:11,  priceKey:'mithril_dart' },
    addy_dart:     { name:'Adamant dart',  kind:'thrown', tier:4, fam:'dart', rangeBonus:10, alch:39,  price:26,  priceKey:'adamant_dart' },
    rune_dart:     { name:'Rune dart',     kind:'thrown', tier:5, fam:'dart', rangeBonus:14, alch:210, price:130, priceKey:'rune_dart' },
  };
  // Some knife/dart tiers aren't crafted/sold, so the scrape has no price for
  // them. Approximate from the same family's KNOWN live prices: fit a
  // geometric (log-linear) curve over tier index and interpolate/extrapolate.
  function thrownApproxPrice(a){
    const P = window.GameData?.ITEM_PRICES || {};
    const anchors = [];
    for (const o of Object.values(ARROWS)){
      if (o.fam !== a.fam) continue;
      const live = P[o.priceKey];
      if (live != null && live > 0) anchors.push({ tier:o.tier, p:live });
    }
    if (anchors.length === 0) return a.price || 0;
    if (anchors.length === 1){
      // scale the single anchor by the static-price ratio to our tier
      const base = ARROWS[Object.keys(ARROWS).find(k=>ARROWS[k].fam===a.fam && ARROWS[k].tier===anchors[0].tier)];
      const ratio = base && base.price ? (a.price || 0) / base.price : 1;
      return Math.round(anchors[0].p * ratio);
    }
    anchors.sort((x,y)=>x.tier-y.tier);
    // pick the two anchors bracketing a.tier (or the nearest pair for extrap)
    let lo = anchors[0], hi = anchors[anchors.length-1];
    for (let i=0;i<anchors.length-1;i++){
      if (anchors[i].tier <= a.tier && anchors[i+1].tier >= a.tier){ lo=anchors[i]; hi=anchors[i+1]; break; }
    }
    if (lo.tier === hi.tier) return Math.round(lo.p);
    const t = (a.tier - lo.tier) / (hi.tier - lo.tier);
    const val = Math.exp(Math.log(lo.p) + t * (Math.log(hi.p) - Math.log(lo.p)));
    return Math.round(val);
  }
  // Live ammo price: scraped market price if present. For KNIVES with no live
  // price, derive from the smithing bar (5 knives per bar → bar/5) — a scraped
  // knife price always wins. Other thrown families with no live price use the
  // same-family tier approximation. Else static fallback.
  function ammoPrice(key){
    const a = ARROWS[key]; if (!a) return 0;
    const live = window.GameData?.ITEM_PRICES?.[a.priceKey];
    if (live != null && live > 0) return live;
    if (a.fam === 'knife' && a.barKey){
      const bar = window.GameData?.ITEM_PRICES?.[a.barKey];
      if (bar != null && bar > 0) return Math.round(bar / 5);   // 5 knives / bar
    }
    if (a.fam) return thrownApproxPrice(a);
    return a.price || 0;
  }
  // 2004 ammo recovery: every shot, random(^dropammo_chance=5) — 4/5 of ammo
  // lands recoverable on the ground, 1/5 is destroyed. So if you collect the
  // grounded ammo your true loss is 1/5 of shots; if not, you pay for all of it.
  const AMMO_DESTROY_FRAC = 1 / 5;

  // ====================================================================
  // COMBAT TYPES — which stats / bonuses each weapon style uses.
  // ====================================================================
  const COMBAT_TYPES = {
    melee:  { label:'Melee',  accStat:'att', dmgStat:'str',
              monAccDef:'defSlash', monDmgDef:'defSlash' /*unused*/ },
    ranged: { label:'Ranged', accStat:'rng', dmgStat:'rng',
              monAccDef:'defRange', monDmgDef:'defRange' },
    magic:  { label:'Magic',  accStat:'mag', dmgStat:'mag',
              monAccDef:'defMagic', monDmgDef:'defMagic' },
  };

  // ====================================================================
  // STYLES — per-combat-type stance options.
  // ====================================================================
  const STYLES = {
    melee: {
      accurate:   { accBonus:3, dmgBonus:0, defBonus:0, xpDist:{ att:4 },                      label:'Accurate' },
      aggressive: { accBonus:0, dmgBonus:3, defBonus:0, xpDist:{ str:4 },                      label:'Aggressive' },
      controlled: { accBonus:1, dmgBonus:1, defBonus:1, xpDist:{ att:4/3, str:4/3, def:4/3 }, label:'Controlled' },
      defensive:  { accBonus:0, dmgBonus:0, defBonus:3, xpDist:{ def:4 },                      label:'Defensive' },
    },
    ranged: {
      accurate:   { accBonus:3, dmgBonus:0, defBonus:0, xpDist:{ rng:4 },                      label:'Accurate' },
      rapid:      { accBonus:0, dmgBonus:0, defBonus:0, xpDist:{ rng:4 },                      label:'Rapid (-1 tick)', tickMod:-1 },
      longrange:  { accBonus:0, dmgBonus:0, defBonus:3, xpDist:{ rng:2, def:2 },               label:'Longrange' },
    },
    magic: {
      accurate:   { accBonus:0, dmgBonus:0, defBonus:0, xpDist:{ mag:2 },                      label:'Standard cast' },
      longrange:  { accBonus:0, dmgBonus:0, defBonus:3, xpDist:{ mag:4/3, def:1 },             label:'Longrange' },
      defensive:  { accBonus:0, dmgBonus:0, defBonus:3, xpDist:{ mag:4/3, def:1 },             label:'Defensive casting' },
    },
  };

  // ====================================================================
  // CORE MATH
  // ====================================================================
  function effective(level, prayerMult, potionFn, styleBonus, stanceConst=8){
    return Math.floor(Math.floor(potionFn(level)) * prayerMult) + styleBonus + stanceConst;
  }

  function maxHitMelee(effStr, strBonus){
    return Math.floor(0.5 + (effStr * (strBonus + 64)) / 640);
  }
  function maxHitRanged(effRngStr, rangedStrBonus){
    return Math.floor(0.5 + (effRngStr * (rangedStrBonus + 64)) / 640);
  }
  // magic: base spell damage × (1 + magicDmgBonus%)
  function maxHitMagic(spellBase, magicDmgPct){
    return Math.floor(spellBase * (1 + (magicDmgPct||0)/100));
  }

  function roll(effLevel, equipBonus){
    return effLevel * (equipBonus + 64);
  }

  function hitChance(attRoll, defRoll){
    if (attRoll > defRoll) return 1 - (defRoll + 2) / (2 * (attRoll + 1));
    return attRoll / (2 * (defRoll + 1));
  }

  // ====================================================================
  // SPECIAL ATTACKS (verified from rev274 specs/scripts/*.rs2)
  // Each entry: special-attack energy cost (% of 100), number of hits,
  // damage multiplier (scale on max hit), accuracy multiplier (scale on
  // the attack roll), the NPC defence type the spec rolls against, and
  // +ranged-levels (MSB adds 10 to the ranged level for its max hit).
  //   • Dragon dagger   (pvm_dragon_dagger.rs2):   2 hits, ×1.15 dmg & ×1.15 acc, vs slash
  //   • Dragon longsword(pvm_dragon_longsword.rs2):1 hit,  ×1.25 dmg,  ×1.00 acc, vs slash
  //   • Dragon halberd  (pvm_dragon_halberd.rs2):  ×1.10 dmg, ×1.00 acc, vs slash; hits
  //       TWICE on targets larger than 1×1 (nc_size>1: dragons, ogres, giants).
  //       We lack per-NPC size data, so the 2nd hit is applied to ALL mobs for now.
  //   • Dragon mace     (pvm_dragon_mace.rs2):     1 hit, ×1.50 dmg, ×1.25 acc, vs CRUSH
  //   • Magic shortbow  (pvm_magic_shortbow.rs2):  2 hits, ranged+10, ×10/7 acc, vs ranged
  // Energy COSTS are the exact sa_energy obj params @ rev274 (sa_energy/10 = cost%,
  // since sa_max_energy=1000): dragon dagger 250→25, dragon longsword 250→25,
  // dragon halberd 300→30, magic shortbow 350→35. (Sourced from the readable
  // skill_combat/configs/{melee,ranged}/*.obj files — NOT a guess/OSRS value;
  // OSRS MSB is 55%, but rev274 2004scape uses 35%.)
  // ====================================================================
  const SPEC_DATA = {
    dragon_dagger:    { combat:'melee',  cost:25, hits:2, dmgMult:1.15, accMult:1.15, defField:'defSlash', rngLvlBonus:0 },
    dragon_longsword: { combat:'melee',  cost:25, hits:1, dmgMult:1.25, accMult:1.00, defField:'defSlash', rngLvlBonus:0 },
    dragon_halberd:   { combat:'melee',  cost:30, hits:2, dmgMult:1.10, accMult:1.00, defField:'defSlash', rngLvlBonus:0 },
    dragon_mace:      { combat:'melee',  cost:25, hits:1, dmgMult:1.50, accMult:1.25, defField:'defCrush', rngLvlBonus:0 },
    magic_shortbow:   { combat:'ranged', cost:35, hits:2, dmgMult:1.00, accMult:10/7, defField:'defRange', rngLvlBonus:10 },
    // Magic longbow "Powershot" (pvm_magic_longbow.rs2 @274): 1 GUARANTEED hit,
    // +10 ranged levels into the max hit, no accuracy roll or damage multiplier.
    magic_longbow:    { combat:'ranged', cost:35, hits:1, dmgMult:1.00, accMult:1.00, defField:'defRange', rngLvlBonus:10, guaranteedHit:true },
  };
  // Special-attack energy regen — derived from rev274 combat.constant:
  //   sa_max_energy=1000, sa_regen_amount=100, sa_regen_interval=50 ticks.
  // ⇒ +100/1000 = 10% every 50×0.6s = 30s ⇒ 100%×(3600/30) = 1200%/hour.
  // "Spec on cooldown" steady state ⇒ specs/hour = 1200 / cost%. (Assumes no
  // energy wasted at the 100% cap, i.e. you spec whenever ≥cost — true for a
  // DPS-spec build that always specs on cooldown.)
  const SA_MAX_ENERGY      = 1000;   // combat.constant ^sa_max_energy
  const SA_REGEN_AMOUNT    = 100;    // combat.constant ^sa_regen_amount (per interval)
  const SA_REGEN_INTERVAL  = 50;     // combat.constant ^sa_regen_interval (ticks)
  const SA_REGEN_PER_HOUR  =
    (SA_REGEN_AMOUNT / SA_MAX_ENERGY) * (3600 / (SA_REGEN_INTERVAL * TICK_SECONDS)) * 100; // = 1200

  // ====================================================================
  // COMBINING MULTIPLE PRAYERS / BOOSTS
  // Players can run several prayers at once (e.g. a strength prayer +
  // an attack prayer + a defence prayer). They can't stack two prayers
  // that boost the SAME stat, so we take the max multiplier per stat and
  // sum the drain across everything active.
  // ====================================================================
  function combinePrayers(keys){
    const out = { att:1, str:1, def:1, rng:1, mag:1, drain:0, labels:[] };
    for (const k of (keys||[])){
      const p = PRAYERS[k];
      if (!p || k === 'none') continue;
      out.att = Math.max(out.att, p.att ?? 1);
      out.str = Math.max(out.str, p.str ?? 1);
      out.def = Math.max(out.def, p.def ?? 1);
      out.rng = Math.max(out.rng, p.rng ?? 1);
      out.mag = Math.max(out.mag, p.mag ?? 1);
      out.drain += p.drain;
      out.labels.push(p.label);
    }
    return out;
  }

  // Combine multiple potions/boosts into a single level function.
  // Each potion returns the un-boosted level for stats it doesn't touch,
  // so taking the max across all selected potions stacks different
  // potions (super att + super str) without double-boosting one stat.
  function combinePotionFn(keys){
    return (stat, l) => {
      let best = l;
      for (const k of (keys||[])){
        const p = POTIONS[k];
        if (!p || k === 'none') continue;
        const v = p.fn(stat, l);
        if (v > best) best = v;
      }
      return best;
    };
  }

  // Normalise input → arrays. Accepts new prayers[]/boosts[] or legacy
  // singular prayer/potion. Returns { prayerKeys, boostKeys, dba }.
  function resolveLoadout(input){
    const prayerKeys = Array.isArray(input.prayers) ? input.prayers
      : (input.prayer ? [input.prayer] : ['none']);
    const boostKeys  = Array.isArray(input.boosts) ? input.boosts
      : (input.potion ? [input.potion] : ['none']);
    const dba = (boostKeys.includes('dba_spec') || !!input.dbaSpec)
      && input.combatType === 'melee';
    return { prayerKeys, boostKeys, dba };
  }

  // ====================================================================
  // SUSTAINED LEVEL HELPERS
  // A potion cycles from peak (just potted) down to a repot threshold.
  // We model the time-averaged level for realistic hourly DPS.
  //
  //  normalSustained(base, potFn, threshold)
  //    → avg = (potFn(base) + threshold) / 2
  //
  //  dbaSustainedAtt(base, threshold)
  //    DBA spec resets attack to base each spec rotation, so:
  //    → avg = (threshold + base) / 2   (matches user's described model)
  // ====================================================================
  function normalSustained(base, potFn, threshold){
    const boosted = potFn(base);
    const lo = Math.max(base, Math.min(threshold, boosted));
    return (boosted + lo) / 2;
  }
  function dbaSustainedAtt(base, threshold){
    return (threshold + base) / 2;
  }
  // DBA strength behaves exactly like a potion boost: it peaks at
  // base + spec-boost, then decays 1/min until you re-spec at `threshold`.
  // So its session average is the same shape as a super-strength potion.
  function dbaSustainedStr(base, totalBoost, threshold){
    const peak = base + totalBoost;
    const lo = Math.max(base, Math.min(threshold, peak));
    return (peak + lo) / 2;
  }

  // DBA special attack — VERIFIED from LostCityRS/Content@274
  //   scripts/skill_combat/scripts/player/specwep.rs2 (combat_axe:specbar)
  //   drained_X     = stat(X) / 10           (X = att, def, rng, mag)
  //   sum           = drainAtt+drainDef+drainRng+drainMag
  //   strength boost = 10 + (sum / 4)        (integer division)
  // So at 99/99/99/99: sum=36, boost = 10 + 9 = 19.
  function dbaBoost(att, def, rng, mag){
    const drainAtt  = Math.floor(att  / 10);
    const drainDef  = Math.floor(def  / 10);
    const drainRng  = Math.floor(rng  / 10);
    const drainMag  = Math.floor(mag  / 10);
    const sum       = drainAtt + drainDef + drainRng + drainMag;
    return { drainAtt, drainDef, drainRng, drainMag,
             totalBoost: 10 + Math.floor(sum / 4) };
  }

  // ====================================================================
  // SIMULATE — single entry point dispatching by combatType
  // ====================================================================
  function simulate(input){
    const ct = COMBAT_TYPES[input.combatType] || COMBAT_TYPES.melee;
    const styleSet = STYLES[input.combatType] || STYLES.melee;
    // For melee the chosen stance (input.style is a stance id) determines the
    // base style; for ranged/magic input.style is the base style directly.
    let style, meleeStanceEntry = null;
    if (input.combatType === 'melee'){
      meleeStanceEntry = meleeStance(input.weapon, input.style);
      style = STYLES.melee[meleeStanceEntry.style] || STYLES.melee.aggressive;
    } else {
      style = styleSet[input.style] || Object.values(styleSet)[0];
    }

    // Resolve multi-select prayers + boosts (with legacy singular fallback)
    const { prayerKeys, boostKeys, dba: dbaSelected } = resolveLoadout(input);
    const prayer = combinePrayers(prayerKeys);
    const potion = { fn: combinePotionFn(boostKeys) };
    const m = input.monster;

    // effective accuracy / damage levels (route by combat type)
    // sustained mode: use time-averaged level instead of peak boost
    const sus = input.sustained;
    const dba = dbaSelected;
    const repot = input.repotThreshold ?? null;

    let effAcc, effDmg, mh, dbaInfo = null;
    let accBonusEff = input.accBonus;   // may be augmented by ammo (ranged)
    if (input.combatType === 'melee'){
      const attBase   = input.attack;
      const strBase   = input.strength;
      const potAtt    = l => potion.fn('att', l);
      const potStr    = l => potion.fn('str', l);

      // DBA info (always compute when melee so UI can show it)
      dbaInfo = dbaBoost(attBase, input.defence, input.ranged||1, input.magic||1);

      // DBA spec: NOT additive with str potion — use one or the other.
      // When DBA is active: str = base + dbaBoost (no str pot applied).
      // Attack cycles normally (pot + restore + repot after spec).
      let effAttBase, effStrBase;
      if (sus && repot != null){
        // Attack: the DBA spec's attack drain is fully undone by the restore
        // dose, and super-attack is maintained — so attack averages exactly
        // like a normal super-attack potion (no DBA penalty).
        const attAvg = normalSustained(attBase, potAtt, repot);
        effAttBase = attAvg;
        if (dba){
          // Strength comes from the DBA spec instead of a super-str dose,
          // treated as a potion: peak = base + boost, decaying to its repot.
          const peakStr = strBase + dbaInfo.totalBoost;
          const thrStr  = input.repotThreshold ?? (peakStr - 10);
          effStrBase = dbaSustainedStr(strBase, dbaInfo.totalBoost, thrStr);
        } else {
          effStrBase = normalSustained(strBase, potStr, repot);  // normal sustained
        }
      } else {
        effAttBase = Math.floor(potAtt(attBase));
        effStrBase = dba
          ? strBase + dbaInfo.totalBoost          // peak (no averaging)
          : Math.floor(potStr(strBase));           // normal pot
      }

      effAcc = Math.floor(effAttBase * prayer.att) + style.accBonus + 8;
      effDmg = Math.floor(effStrBase * prayer.str) + style.dmgBonus + 8;
      mh = maxHitMelee(effDmg, input.dmgBonus);

    } else if (input.combatType === 'ranged'){
      // Ranged: no offensive ranged prayers in rev 274. Ammo (arrow) range
      // bonus adds to BOTH the bow's attack bonus (accuracy) and the ranged
      // strength bonus (max hit). input.ammoRangeBonus carries the arrow's
      // rangebonus from the selected ammo (0 if none/custom).
      const rngBase = input.ranged;
      const potRng  = l => potion.fn('rng', l);
      let rngLevel  = sus && repot != null
        ? normalSustained(rngBase, potRng, repot)
        : Math.floor(potRng(rngBase));
      effAcc = rngLevel + style.accBonus + 8;
      effDmg = rngLevel + style.dmgBonus + 8;
      const ammoBonus = input.ammoRangeBonus || 0;
      // accuracy uses bow attack bonus + ammo; max hit uses ranged str (ammo)
      mh = maxHitRanged(effDmg, input.dmgBonus + ammoBonus);
      accBonusEff = input.accBonus + ammoBonus;

    } else { // magic
      // Magic uses NO prayer boost (no magic prayers in rev 274) and a fixed
      // style bonus of +1 (verified player_combat_stat.rs2). Accuracy roll
      // uses the (potion-boosted) magic level; damage is the spell's base.
      const magBase = input.magic;
      const potMag  = l => potion.fn('mag', l);
      const magLvl  = sus && repot != null
        ? normalSustained(magBase, potMag, repot)
        : Math.floor(potMag(magBase));
      effAcc = magLvl + 8 + 1;          // effective magic for accuracy
      effDmg = magBase;
      // Chaos gauntlets: +3 max hit to BOLT spells only (verified — gauntlets
      // affect bolt-tier only, not strike/blast/wave).
      const spellId = input.spell || '';
      const spellObj = SPELLS[spellId];
      const isBolt = /bolt/i.test(spellId);
      const hasChaosGauntlets = boostKeys.includes('chaos_gauntlets');
      const chaosBonus = (hasChaosGauntlets && isBolt) ? 3 : 0;
      // God spells (Saradomin Strike / Claws of Guthix / Flames of Zamorak)
      // hit 20 base; the Charge spell raises that to 30. Charge only affects
      // the three god spells.
      let effSpellBase = input.spellBase || 0;
      if (spellObj?.god && input.charge !== false) effSpellBase = 30;
      mh = maxHitMagic(effSpellBase, input.dmgBonus) + chaosBonus;
    }

    const attRoll = roll(effAcc, accBonusEff);
    // NPC magic defence uses the monster's MAGIC level, NOT its Defence level —
    // verified OSRS/rev274 mechanic: "NPC magic defence roll is calculated with
    // its magic level and magic defence bonus; the NPC's defence level doesn't
    // matter against magic." Almost every melee monster (all dragons included)
    // has magic level 1, so their high melee Defence does NOT shield them from
    // spells — only the magic-defence BONUS does. (Blue dragon: magic lvl 1,
    // magic def +60 → roll (1+9)(60+64)=1240, vs the old (95+9)(124)=12896.)
    // Default 1 when no explicit magic level is set.
    const monDefLvl = (input.combatType === 'magic')
      ? (m.magicLevel ?? 1)
      : (m.defLevel ?? 1);
    // Melee picks defStab/defSlash/defCrush from the weapon+stance attack type.
    let monDefField = ct.monAccDef;
    if (input.combatType === 'melee'){
      monDefField = DEF_FIELD[meleeStanceEntry.type] || 'defSlash';
    }
    const monDefBonus = m[monDefField] ?? 0;
    const monDefRoll = (monDefLvl + 9) * (monDefBonus + 64);
    const hc = hitChance(attRoll, monDefRoll);
    const avgHit = (mh / 2) * hc;

    // attack speed — ranged 'rapid' shaves a tick
    const baseTicks = input.attackSpeed;
    const ticks = Math.max(1, baseTicks + (style.tickMod || 0));
    const speedSec = ticks * TICK_SECONDS;
    const dps = avgHit / speedSec;

    // ---- Special attacks ------------------------------------------------
    // A second weapon brought purely to special-attack (DDS/D-long for melee,
    // MSB for ranged). You spec on cooldown; each spec swaps to the spec weapon,
    // hits, and swaps back — replacing normal attacks for its attack-speed
    // duration. Spec damage uses the spec weapon's OWN attack/str bonuses with
    // your boosted levels. Mutually exclusive with DBA str-boost mode (rule: if
    // you DBA-spec for strength, all energy goes to that — no DPS spec). Specs
    // just speed up kills (per-kill XP is unchanged; more kills/hr ⇒ more xp & gp).
    let effDps = dps, specInfo = null;
    const specKey = input.specWeapon;
    const sd = (specKey && specKey !== 'none') ? SPEC_DATA[specKey] : null;
    if (sd && !dba && sd.combat === input.combatType){
      const specW = WEAPONS[specKey] || { accBonus:0, dmgBonus:0, speed:4 };
      const mainW = WEAPONS[input.weapon] || { accBonus:0, dmgBonus:0 };
      // Spec offence bonuses. Preferred path: rebuild the ACTUAL spec loadout via
      // the gear registry — swap in the spec weapon (sumBonuses auto-drops the
      // off-hand when it's two-handed, e.g. a halberd or bow, so an equipped
      // book/shield is correctly ignored) and, for a bow spec, load the chosen
      // spec arrows (input.specAmmo) since a thrown main has no arrow slot.
      let accBonusSpec, dmgBonusSpec, specAmmoBonus = 0;
      const EQ = (typeof window !== 'undefined') ? window.Equipment : null;
      if (EQ && input.gear){
        let specAmmoKey = 'none';
        if (input.combatType === 'ranged' && specW.sub === 'bow'){
          specAmmoKey = input.specAmmo || (mainW.sub === 'bow' ? input.ammo : 'rune_arrow');
        }
        const sb = EQ.sumBonuses({ ...input.gear, weapon: specKey, ammo: specAmmoKey });
        if (input.combatType === 'ranged'){ accBonusSpec = sb.rngAtt; dmgBonusSpec = sb.rngStr; }
        else if (input.combatType === 'melee'){ accBonusSpec = sb.slashAtt; dmgBonusSpec = sb.str; }
        else { accBonusSpec = sb.magAtt; dmgBonusSpec = 0; }
        // sumBonuses already folded the arrow rangebonus into rng att + str.
      } else {
        // Fallback (no gear/registry): swap the weapon's flat bonus on the totals.
        const ammoBonus = input.combatType === 'ranged' ? (input.ammoRangeBonus || 0) : 0;
        accBonusSpec = accBonusEff - (mainW.accBonus || 0) + (specW.accBonus || 0);
        dmgBonusSpec = (input.dmgBonus || 0) - (mainW.dmgBonus || 0) + (specW.dmgBonus || 0);
        specAmmoBonus = ammoBonus;
      }
      const attRollSpec  = roll(effAcc, accBonusSpec) * sd.accMult;
      const defBonusSpec = m[sd.defField] ?? 0;
      const defRollSpec  = (monDefLvl + 9) * (defBonusSpec + 64);
      const hcSpec       = hitChance(attRollSpec, defRollSpec);
      // Powershot (magic longbow) always hits — its script has no accuracy roll.
      const hcSpecEff    = sd.guaranteedHit ? 1 : hcSpec;
      let mhSpec;
      if (input.combatType === 'ranged'){
        // +ranged levels (MSB/MLB add 10) into the max-hit only (not accuracy).
        mhSpec = maxHitRanged(effDmg + sd.rngLvlBonus, dmgBonusSpec + specAmmoBonus);
      } else {
        mhSpec = Math.floor(maxHitMelee(effDmg, dmgBonusSpec) * sd.dmgMult);
      }
      const expPerSpec    = sd.hits * hcSpecEff * (mhSpec / 2);   // expected spec damage
      const specsPerHour  = SA_REGEN_PER_HOUR / sd.cost;
      const specSecPerHr  = specsPerHour * (specW.speed || 4) * TICK_SECONDS;
      const normalDmgPerHr= dps * Math.max(0, 3600 - specSecPerHr);
      const specDmgPerHr  = specsPerHour * expPerSpec;
      effDps = (normalDmgPerHr + specDmgPerHr) / 3600;
      specInfo = {
        weapon: specW.name, key: specKey,
        specsPerHour: specsPerHour,
        expPerSpec: expPerSpec,
        maxHit: mhSpec, hits: sd.hits, hitChance: hcSpecEff,
        dpsBase: dps, dpsWithSpec: effDps,
        dpsGainPct: dps > 0 ? (effDps / dps - 1) * 100 : 0,
      };
    }

    // ---- Weapon poison --------------------------------------------------
    // A poisoned weapon (e.g. Dragon dagger(p)) inflicts poison on the target.
    // From poison.rs2 @ rev274: the poison timer fires every 30 ticks (18s) for
    // floor((severity+4)/5) damage, and each successful hit refreshes the target
    // to the weapon's severity — so in sustained combat it's a constant trickle.
    //   dd(p): severity 20 → floor(24/5) = 4 damage every 18s.
    // Poison damage helps KILL FASTER (shorter ttk → more kills/hr → more loot)
    // but grants NO combat xp. So we split the kill: direct hits still award the
    // full 4×HP routed by style, poison just trims the HP you chew through with
    // attacks. directFrac = share of the kill done by xp-bearing hits.
    // (Estimate: assumes the target stays poisoned throughout — true on sustained
    // trips; overstates slightly for sub-18s kills where poison may not tick.)
    const poisonSev = (WEAPONS[input.weapon]?.poisonSeverity) || input.poisonSeverity || 0;
    let poisonDps = 0, poisonHit = 0;
    if (poisonSev > 0){
      poisonHit = Math.floor((poisonSev + 4) / 5);     // 4 for severity 20
      poisonDps = poisonHit / (30 * TICK_SECONDS);     // 30 ticks = 18s ⇒ ~0.222 dmg/s
    }
    const killDps    = effDps + poisonDps;
    const directFrac = killDps > 0 ? effDps / killDps : 1;

    // Overkill correction: last hit exceeds remaining HP by an average of maxHit/4.
    // TTK uses HP + overkill for timing; XP is always exactly 4×HP regardless.
    const overkillEst = mh / 4;
    const ttk = (m.hp + overkillEst) / killDps;
    // Per-kill overhead = time spent NOT attacking: looting, repositioning,
    // walking between spawns. Defaults scale 2–4s with how much looting/roaming
    // a kill needs (see defaultOverhead); a per-monster override (input.overheadSec)
    // wins when set. null/undefined → use the monster default.
    const overhead = (input.overheadSec != null) ? input.overheadSec : defaultOverhead(m);
    let cycle = ttk + overhead;
    let kph = 3600 / cycle;

    // XP routing — use the style's explicit xpDist (verified from 2004scape
    // combat.rs2). Magic gives HALF the XP per damage compared to melee/ranged.
    const xpDist = style.xpDist || { att:4 };
    const xpRouting = { ...xpDist, hp:1.33 };
    const combatXpRate = Object.values(xpDist).reduce((s,v) => s+v, 0);
    const hpXpRate     = 1.33;
    // Combat (damage) xp scales with directFrac: poison damage does not train
    // your stats, so only the HP killed by real hits counts. Spell base xp (per
    // cast) is unaffected and added on top.
    let combatXpPerKill = combatXpRate * m.hp * directFrac;
    // Magic: base spell XP per cast, ON TOP of damage XP. In 2004scape
    // give_spell_xp runs in pvm_spell_cast — BEFORE the hit roll — so the spell's
    // base xp is awarded on EVERY cast, including splashes (verified @274). The
    // 2×damage component still counts hits only. So:
    //   landing casts = HP / avg-damage-per-hit (= 2·HP / maxHit)
    //   total casts   = landing casts / hitChance   (splashes give base xp too)
    let spellXpPerKill = 0;
    if (input.combatType === 'magic' && input.spellBase){
      const spell = SPELLS[input.spell];
      const baseXp = spell?.baseXp || 0;
      const avgDmgPerHit = Math.max(1, mh / 2);
      const landingCasts = m.hp / avgDmgPerHit;
      const totalCasts = landingCasts / Math.max(0.01, hc);
      spellXpPerKill = baseXp * totalCasts;
      combatXpPerKill += spellXpPerKill;
    }
    const hpXpPerKill     = hpXpRate * m.hp * directFrac;

    // NOTE: combatXph / hpXph (the per-HOUR values) are computed later, AFTER
    // any alch-time adjustment to kph (see below), so the headline xp/hr stays
    // consistent with the per-skill breakdown. Computing them here would use a
    // stale, pre-alch kph.

    // Per-skill XP breakdown (absolute xp/kill), for the detailed left-panel
    // overview. Combat skills come from the style's xpDist (att/str/def for
    // melee, rng[/def] for ranged, mag[/def] for magic); magic's spell base XP
    // all routes to Magic; HP is a flat 1.33×. Prayer (burying bones) is added
    // after the loot loop computes it. Keys map to display names in the UI.
    const skillXpPerKill = {};
    for (const [k, v] of Object.entries(xpDist)){
      skillXpPerKill[k] = (skillXpPerKill[k] || 0) + v * m.hp * directFrac;
    }
    if (spellXpPerKill) skillXpPerKill.mag = (skillXpPerKill.mag || 0) + spellXpPerKill;
    skillXpPerKill.hp = hpXpPerKill;

    // Loot EV — flatten nested gem/rare arrays + apply Ring of Wealth + per-drop loot prefs
    const lootTable = window.GameData?.adjustForRoW
      ? window.GameData.adjustForRoW(m, !!input.ringOfWealth)
      : (m.loot || []);
    const lootPrefs  = input.lootPrefs ?? {};
    // Alching requires a staff + alch runes in the pack — only possible when
    // the trip's "alching" toggle is on. With it off, an 'alch' pref (manual or
    // default) is meaningless: you have no runes, so you sell the item instead.
    const alchAllowed = !!(input.trip && input.trip.alching);
    const alchVals   = window.GameData?.ALCH_VALUES ?? {};
    const natCost    = window.GameData?.ITEM_PRICES?.naturerune ?? 265;
    const herbUnidGp = window.GameData?.ITEM_PRICES?.unidentified_guam ?? 15;
    let gpPerKill = 0;
    let prayerXpPerKill = 0;
    let alchCastsPerKill = 0;
    const lootBreakdown = [];
    for (const drop of lootTable){
      const isBone = bonePrayerXp(drop.name) > 0;
      const isHerb = drop.tag === 'herb';
      // Live price/alch: prefer the up-to-date ITEM_PRICES/ALCH_VALUES by key
      // (so a market sync flows through without rebuilding loot tables).
      const livePrice = (drop.key && window.GameData?.ITEM_PRICES?.[drop.key] != null)
        ? window.GameData.ITEM_PRICES[drop.key] : (drop.price || 0);
      // Bulk-unsellable gear (bronze→addy, low rune weapons) has a GE price but
      // can't be sold in stacks — its realistic SALE value is 0, so looting it
      // nets nothing; only the alch value is real.
      const bulkDead = window.GameData?.isBulkUnsellable
        ? window.GameData.isBulkUnsellable(drop.name) : false;
      const saleValue = bulkDead ? 0 : livePrice;
      const dropAlch = (drop.key && alchVals[drop.key] != null)
        ? alchVals[drop.key] : (drop.alchValue ?? alchVals[drop.name] ?? 0);
      // Default pref logic:
      //  1. user override (lootPrefs) always wins
      //  2. GameData.defaultLootAction (skip/bury/alch lists + tier rules)
      //  3. bones → bury
      //  4. no market price but positive alch profit → alch
      //  5. else loot
      const alchProfit = Math.max(0, dropAlch - natCost);
      const noMarketPrice = !saleValue || saleValue <= 0;
      const gdDefault = window.GameData?.defaultLootAction
        ? window.GameData.defaultLootAction({ ...drop, price:livePrice, alchValue:dropAlch }) : null;
      const isCoins = drop.key === 'coins' || /^coins$/i.test(drop.name);
      const defaultPref = lootPrefs[drop.name] !== undefined ? lootPrefs[drop.name]
        : isCoins && input.trip && input.trip.alching ? 'loot'   // alch makes coins anyway
        : gdDefault !== null && gdDefault !== undefined ? gdDefault
        : isBone && /dragon/i.test(drop.name) ? 'loot'
        : isBone ? 'bury'
        : noMarketPrice && alchProfit > 0 ? 'alch'
        : 'loot';
      const pref = defaultPref;
      // A bulk-unsellable item can't be sold, so "loot" nets nothing — collapse
      // any loot pref (stale override or otherwise) to skip. Alch/bury/unid
      // prefs are respected.
      let effPref = pref;
      // No runes carried in-trip → can't alch DURING the trip; fall back to
      // looting (for bulk-unsellable gear that means bank it and high-alch at
      // leisure, valued below).
      if (effPref === 'alch' && !alchAllowed) effPref = 'loot';
      // Alching an item worth ≤ the nature rune is pure loss (0 gp + cast time),
      // so a stale/forced 'alch' pref on a cheap drop collapses to loot (which
      // realises its sale value, or alch value for bulk gear — both better).
      if (effPref === 'alch' && (dropAlch - natCost) <= 0) effPref = 'loot';
      let unitGp;
      // 'value' = high-value-only: leave cheap sub-table rolls on the ground.
      // Herb/gem EV recomputed over just the items worth > VALUE_THRESHOLD.
      const gd = window.GameData;
      if      (effPref === 'skip') unitGp = 0;
      else if (effPref === 'bury') unitGp = 0;
      else if (effPref === 'unid') unitGp = isHerb ? herbUnidGp : saleValue;
      else if (effPref === 'value') unitGp = isHerb ? (gd?.HERB_EV_HIGH ?? saleValue)
        : drop.tag === 'gem' ? (input.ringOfWealth ? (gd?.GEM_EV_ROW_HIGH ?? saleValue) : (gd?.GEM_EV_BASE_HIGH ?? saleValue))
        : saleValue;
      else if (effPref === 'alch') unitGp = Math.max(0, dropAlch - natCost);
      // 'loot': normal items realise their market sale value. Bulk-unsellable
      // gear (rune armour/weapons) can't be sold on the market, but you can BANK
      // it and high-alch at leisure — realising alch value minus the nature rune,
      // with NO in-trip cast-time cost (that's what separates 'loot' from the
      // 'alch' pref). So e.g. a rune dagger is worth looting at green dragons even
      // when not alching, if its alch value beats leaving the slot for a hide.
      else                      unitGp = bulkDead ? Math.max(0, dropAlch - natCost) : saleValue;
      const ev = drop.chance * drop.qtyAvg * unitGp;
      gpPerKill += ev;
      // Inventory-slot fraction: under 'value' you only pick up the rolls worth
      // > threshold and leave the rest on the ground, so a sub-table roll costs
      // a slot only that fraction of the time. The trip model multiplies this in
      // (fewer slots used → more kills/trip → fewer bank runs).
      let slotFrac = 1;
      if (effPref === 'value'){
        if (isHerb) slotFrac = gd?.HERB_KEEP_FRAC ?? 1;
        else if (drop.tag === 'gem') slotFrac = input.ringOfWealth
          ? (gd?.GEM_KEEP_FRAC_ROW ?? 1) : (gd?.GEM_KEEP_FRAC_BASE ?? 1);
      }
      // Alch time: 5 ticks (3s) per cast, one cast PER item. A 75-rune stack =
      // 75 casts (huge time sink); a single rune chainbody = ~1 cast. This is
      // what makes alching cheap stackables not worth it.
      if (effPref === 'alch') alchCastsPerKill += drop.chance * drop.qtyAvg;
      // Prayer XP from burying — only when pref is 'bury' and drop is a bone.
      if (effPref === 'bury' && isBone){
        prayerXpPerKill += drop.chance * drop.qtyAvg * bonePrayerXp(drop.name);
      }
      lootBreakdown.push({ ...drop, price:livePrice, saleValue, evGp:ev, pref:effPref, isBone, isHerb, slotFrac,
        prayerXp: isBone ? bonePrayerXp(drop.name) : 0,
        alchValue: dropAlch, bulkDead });
    }
    // Fold alch-cast time into the kill cycle: each cast is 5 ticks (3s), so
    // alching many cheap stackables (e.g. a 75-rune stack) tanks kills/hr,
    // while alching one valuable non-stackable barely costs time.
    const alchTimePerKill = alchCastsPerKill * 3;   // 5 ticks × 0.6s
    if (alchTimePerKill > 0){ cycle = cycle + alchTimePerKill; kph = 3600 / cycle; }

    // Per-hour combat / HP xp — computed HERE, after the alch-time adjustment to
    // kph, so the headline effective xp/hr matches the per-skill breakdown
    // (which also uses this final kph). Previously these were computed before
    // the alch block with a higher kph, making the headline read slightly above
    // the strength row when alching was enabled.
    const combatXph = combatXpPerKill * kph;
    const hpXph     = hpXpPerKill * kph;

    // ---- Prayer drain → points per kill -------------------------------
    // Active prayers (offensive + a protection prayer) drain prayer points; the
    // trip model turns this into prayer-potion doses, gp cost, inventory slots,
    // and a possible prayer-bound trip. Drain math is OSRS-standard: a counter
    // rises by the summed drain rate each tick and sheds 1 point at
    // (2×prayerBonus + 60). Counted over the full kill cycle (fight + overhead).
    const protKey = input.trip ? input.trip.protect : 'none';
    const protectOn = protKey && protKey !== 'none';
    const drainRate = (prayer.drain || 0) + (protectOn ? PROTECT_DRAIN : 0);
    const prayerBonus = (window.Equipment && input.gear)
      ? (window.Equipment.sumBonuses({ ...input.gear, weapon: input.weapon, ammo: input.ammo }).prayer || 0)
      : 0;
    const drainResistance = 2 * prayerBonus + 60;
    const prayerPtsPerSec = drainRate > 0 ? drainRate / (drainResistance * 0.6) : 0;
    const prayerPerKill = prayerPtsPerSec * cycle;          // points drained per kill
    const prayerLevel = input.prayer || 1;

    // ---- Banking-trip / inventory model -------------------------------
    const tripCtx = {
      m, ttk, cycle, kph,
      dba, combatType: input.combatType, prayerDef: prayer.def, boostKeys,
      dbaRestore: input.trip ? input.trip.dbaRestore : undefined,
      hasSpec: !!specInfo,   // a 2nd (spec) weapon is actually in use → reserve a slot
      prayerPerKill, prayerLevel,
    };
    let trip = window.TripModel
      ? window.TripModel.computeTrip(input, { ...tripCtx, lootBreakdown }) : null;

    // ---- Eaten food drops ---------------------------------------------
    // Food you loot on a food-using trip is eaten, not banked: it occupies no
    // slot and its real worth is the brought-food cost it saves (the trip model
    // computed that). Swap the market value we counted for the food saved.
    if (trip && trip.eatenFood){
      for (const d of lootBreakdown){
        const saved = trip.eatenFood[d.name];
        if (saved != null && d.pref === 'loot'){
          gpPerKill += saved - d.evGp;
          d.evGp = saved;
          d._eaten = true;
        }
      }
    }

    // ---- Loot displacement (inventory-bound trips) --------------------
    // When the pack fills to a fixed slot count, a low-value non-stackable
    // (steel platelegs) DISPLACES a high-value one (dragonhide) — you'd leave
    // it on the ground. Keep only looted non-stackables whose unit value beats
    // the marginal slot (iteratively drop those below the kept weighted-avg).
    // Alched/stackable/bone drops are exempt (they don't compete for a hide
    // slot the same way). Re-run the trip with freed slots.
    const isStack = window.TripModel?.isStackable;
    let displacedGp = 0;
    const displacedNames = new Set();
    if (trip && trip.bound === 'loot' && isStack){
      const items = lootBreakdown.filter(d => d.pref === 'loot' && d.evGp > 0
        && !d.isBone && !d._eaten && !isStack(d.key, d.name) && !Array.isArray(d._expand))
        // Rank by REALISED unit value (evGp per slot), not market price — so
        // bulk-unsellable gear looted for its alch value is ranked correctly
        // (its saleValue is 0, but it really brings alch gp).
        .map(d => ({ d, val: (d.chance*d.qtyAvg) > 0 ? d.evGp/(d.chance*d.qtyAvg) : 0, slots: d.chance * d.qtyAvg }));
      if (items.length > 1){
        // Marginal slot value = the unit value of the DOMINANT loot (the item
        // taking the most slots/kill — the dragonhide on a dragon trip). Any
        // looted item worth LESS than that displaces a dominant-item slot, so
        // you'd leave it on the ground.
        const dominant = items.reduce((a,b) => b.slots > a.slots ? b : a, items[0]);
        // ...but only when the dominant item actually claims a slot almost every
        // kill (slots ≈ 1, e.g. a guaranteed dragonhide). When a monster's drops
        // are mutually-exclusive table rolls (the top non-stackable drops only a
        // few % of kills), no single item monopolises the pack, so nothing is
        // displaced. Without this gate, displacement fired for the wrong monsters
        // and — because it only triggers on a loot-bound trip — made per-kill
        // loot value lurch around with the food count (a loot-bound trip flips to
        // food-bound once items are dropped), which is nonsensical: how much food
        // you pack can't change what a kill is worth.
        if (dominant.slots >= 0.5){
          const marginal = dominant.val;
          for (const x of items){
            if (x !== dominant && x.val < marginal){
              displacedGp += x.d.evGp; displacedNames.add(x.d.name); x.d._displaced = true;
            }
          }
        }
      }
      if (displacedGp > 0){
        gpPerKill -= displacedGp;
        const reduced = lootBreakdown.map(d => displacedNames.has(d.name) ? {...d, pref:'skip'} : d);
        trip = window.TripModel.computeTrip(input, { ...tripCtx, lootBreakdown: reduced });
      }
    }

    const gph = gpPerKill * kph;
    const prayerXpPerHour = prayerXpPerKill * kph;

    // Supplies (food + potions from the trip model + ammo). Falls back to the
    // legacy manual fields when the trip model isn't present.
    const potionCostPerKill = trip
      ? (trip.potionCostPerKill || 0)
      : (input.potionPerKill || 0) * (input.potionPrice || 0);
    // Ammo cost (ranged only): arrows/knives/darts fired per kill × the
    // destroyed fraction (you recover grounded ammo by default) × unit price.
    let ammoCostPerKill = (input.ammoPerKill || 0) * (input.ammoPrice || 0);
    let ammoPerKill = 0, ammoKeyUsed = null, ammoUnitPrice = 0;
    if (input.combatType === 'ranged'){
      const w = WEAPONS[input.weapon];
      ammoKeyUsed = (w && w.sub === 'thrown' && w.ammoKey) ? w.ammoKey : input.ammo;
      if (ammoKeyUsed && ARROWS[ammoKeyUsed]){
        // shots per kill = attacks landed over the kill time
        const shotsPerKill = speedSec > 0 ? ttk / speedSec : 0;
        const recover = !(input.trip && input.trip.recoverAmmo === false);
        const frac = recover ? AMMO_DESTROY_FRAC : 1;
        ammoUnitPrice = ammoPrice(ammoKeyUsed);
        ammoPerKill = shotsPerKill * frac;
        ammoCostPerKill = ammoPerKill * ammoUnitPrice;
      }
    }
    // Magic: per-cast rune cost (staff-provided element is free), one cast per
    // attack over the kill time. God spells with Charge active add the
    // amortised Charge upkeep (recast every ~7 min).
    let runeCostPerKill = 0, castsPerKill = 0, runeCostPerCast = 0, chargePerCast = 0;
    if (input.combatType === 'magic' && input.spell){
      runeCostPerCast = spellRuneCost(input.spell, input.weapon);
      const spObj = SPELLS[input.spell];
      if (spObj?.god && input.charge !== false) chargePerCast = chargeCostPerCast(speedSec);
      castsPerKill = speedSec > 0 ? ttk / speedSec : 0;
      runeCostPerKill = castsPerKill * (runeCostPerCast + chargePerCast);
    }
    const foodCostPerKill = trip
      ? trip.foodCostPerKill
      : (input.foodPerKill || 0) * (input.foodPrice || 0);
    const supplyCostPerKill = foodCostPerKill + potionCostPerKill + ammoCostPerKill + runeCostPerKill;
    const netGph = gph - supplyCostPerKill * kph;

    // Effective rates fold in banking downtime (efficiency = killing ÷ trip)
    // and the loot-collected fraction (surplus food → pack fills early → some
    // drops are missed; gp is scaled, xp is not).
    const eff = trip && isFinite(trip.efficiency) ? trip.efficiency : 1;
    const lf  = trip && Number.isFinite(trip.lootFraction) ? trip.lootFraction : 1;
    const effectiveKph        = trip ? trip.effectiveKph : kph;
    const effectiveXpPerHour  = combatXph * eff;
    const effectiveGpPerHour  = gph * lf * eff;
    const effectiveNetGpPerHour = (gph * lf - supplyCostPerKill * kph) * eff;

    // Finalise the per-skill XP breakdown: add Prayer (burying bones), then
    // expand to EFFECTIVE xp/hr (× kills/hr × banking efficiency) so the rows
    // sum consistently with the headline effective combat xp/hr. Emitted as an
    // ordered list of {key, name, xpPerHour}, skipping zero-XP skills.
    if (prayerXpPerKill > 0) skillXpPerKill.prayer = (skillXpPerKill.prayer || 0) + prayerXpPerKill;
    // High Level Alchemy gives a flat 65 Magic xp per cast. When alching loot
    // mid-trip this adds up — especially relevant when maging (on top of combat
    // magic xp) but also when meleeing/ranging while alching valuable drops.
    // Tracked as a separate 'alch' row so it's clear where the xp comes from.
    const ALCH_XP_PER_CAST = 65;
    const alchXpPerKill = alchCastsPerKill * ALCH_XP_PER_CAST;
    if (alchXpPerKill > 0) skillXpPerKill.alch = (skillXpPerKill.alch || 0) + alchXpPerKill;
    const SKILL_NAMES = { att:'Attack', str:'Strength', def:'Defence',
      rng:'Ranged', mag:'Magic', hp:'Hitpoints', prayer:'Prayer', alch:'Magic (alch)' };
    const SKILL_ORDER = ['att','str','def','rng','mag','alch','hp','prayer'];
    const skillXpPerHour = {};
    let totalXpPerHour = 0;
    for (const k of Object.keys(skillXpPerKill)){
      const v = skillXpPerKill[k] * kph * eff;
      skillXpPerHour[k] = v;
      totalXpPerHour += v;
    }
    const skillXpBreakdown = SKILL_ORDER
      .filter(k => skillXpPerHour[k] > 0)
      .map(k => ({ key:k, name:SKILL_NAMES[k] || k, xpPerHour: skillXpPerHour[k] }));

    return {
      combatType: input.combatType,
      effAcc, effDmg, maxHit: mh,
      attRoll, defRoll: monDefRoll, hitChance: hc, avgHit,
      attackSpeedSec: speedSec, attackTicks: ticks,
      dps, effDps, specInfo, ttkSec: ttk, cycleSec: cycle, overheadSec: overhead, killsPerHour: kph,
      // Weapon poison (null when no poisoned weapon): per-hit damage + interval +
      // its contribution to kill DPS, and the share of the kill done by real hits.
      poison: poisonSev > 0 ? { severity:poisonSev, hit:poisonHit, intervalSec:30*TICK_SECONDS, dps:poisonDps, directFrac } : null,
      // XP — primary metric is combat skill only (not HP)
      xpPerKill: combatXpPerKill,
      xpPerHour: combatXph,
      hpXpPerHour: hpXph,
      xpRouting,
      skillXpPerHour, skillXpBreakdown, totalXpPerHour,
      gpPerKill, gpPerHour: gph, netGpPerHour: netGph,
      prayerXpPerKill, prayerXpPerHour,
      supplyCostPerKill, foodCostPerKill, potionCostPerKill, ammoCostPerKill,
      runeCostPerKill, runeCostPerCast, chargePerCast, castsPerKill,
      ammoPerKill, ammoKeyUsed, ammoUnitPrice, lootBreakdown,
      dbaInfo,
      // trip model
      trip,
      tripEfficiency: eff,
      effectiveKph,
      effectiveXpPerHour, effectiveGpPerHour, effectiveNetGpPerHour,
      prayerDrain: prayer.drain,
      prayerDrainRate: drainRate,
      prayerPerKill, prayerLevel,
      prayerPointsPerHour: prayerPtsPerSec * 3600,
      prayerLabels: prayer.labels,
      boostKeys,
      sustained: !!input.sustained,
    };
  }

  // Filter prayers/potions/styles available to a combat type.
  // Revision 274: only melee has offensive prayers; defence prayers apply
  // to everyone (they boost the Defence level). No ranged/magic damage
  // prayers existed yet, so those types see defence prayers only.
  function availablePrayers(combatType){
    // Rev 274: only melee has att/str prayers. All types get def prayers.
    const out = { none: PRAYERS.none };
    for (const [k,v] of Object.entries(PRAYERS)){
      if (k === 'none') continue;
      if (v.cat === 'def') { out[k] = v; continue; }
      if (combatType === 'melee') out[k] = v;
    }
    return out;
  }
  function availablePotions(combatType){
    const map = {
      melee:  ['none','attack','strength','defence','super_att','super_str','super_def','dba_spec'],
      ranged: ['none','ranging'],
      magic:  ['none','magic'],
    };
    return Object.fromEntries(map[combatType].map(k => [k, POTIONS[k]]));
  }

  // Bones / prayer XP for burying. Keys match drop.name.toLowerCase().
  const PRAYER_XP_PER_BONE = {
    'bones':         4.5,
    'big bones':    15.0,
    'dragon bones': 72.0,
    'babydragon bones': 30.0,
    'jogre bones':  15.0,
    'monkey bones':  5.0,
    'wolf bones':    4.5,
  };
  function bonePrayerXp(name){
    if (!name) return 0;
    return PRAYER_XP_PER_BONE[String(name).toLowerCase()] || 0;
  }

  // Default per-kill overhead (seconds spent looting/walking, not attacking).
  // Scales 2–4s with how loot-heavy / spread-out a kill is: a quick single-drop
  // mob is ~2s; a monster with a guaranteed pickup (e.g. a dragon's hide) plus a
  // busy random table trends toward 4s. A few monsters are notably spread out
  // (you roam between spawns) — forced to 4s here. Always editable per monster.
  const OVERHEAD_OVERRIDE = {
    blue_dragon: 4, green_dragon: 4, red_dragon: 4,
    // AFK / near-bones-only spots: almost no loot to grab, so overhead is tiny.
    pirate: 0.5, magicaxe: 0.5, ghoul: 0.5,
    // AFK-friendly, dense spawns — minimal walking/looting between kills.
    earth_warrior: 1, ice_warrior: 1, rock_crab: 1,
    // Spread-out / loot to grab / roam between spawns.
    hellhound: 4, thug: 2, chaos_druid: 2,
    elf_warrior_90: 3.5, elf_warrior_108: 3.5,
  };
  function defaultOverhead(m){
    if (!m) return 3;
    if (OVERHEAD_OVERRIDE[m.id] != null) return OVERHEAD_OVERRIDE[m.id];
    const loot = m.loot || [];
    let guaranteedPickups = 0;   // guaranteed non-bone drops you stop to grab
    let tableChance = 0;         // expected random-table rolls per kill
    for (const d of loot){
      if (Array.isArray(d)) { for (const e of d) tableChance += (e.chance || 0); continue; }
      const c = d.chance || 0;
      if (c >= 1){ if (bonePrayerXp(d.name) === 0) guaranteedPickups += 1; }
      else tableChance += c;
    }
    // 2s base + up to 1s for guaranteed pickups + up to 1s for a busy table.
    const v = 2 + Math.min(1, guaranteedPickups) + Math.min(1, tableChance * 0.5);
    return Math.max(2, Math.min(4, Math.round(v * 2) / 2));   // clamp 2–4, round to 0.5
  }

  // MONSTERS: live reference to GameData (loaded by gamedata.js)
  // Accessed via getter so load order doesn't matter at parse time.
  const MONSTERS_GETTER = () => window.GameData?.MONSTERS ?? [];
  void MONSTERS_GETTER;

  // Spell registry — VERIFIED from magic_combat_spells.dbrow (rev 274).
  // experience field is in 1/10ths (e.g. 345 = 34.5 xp). maxhit is exact.
  // baseXp = experience/10, awarded per successful cast on top of 2/damage.
  // `runes` = exact rune cost per cast (the staff's provided element is free).
  const SPELLS = {
    wind_strike:  { name:'Wind Strike',  base:2,  lvl:1,  baseXp:5.5,  label:'Wind Strike (max 2)',  runes:{mindrune:1, airrune:1} },
    water_strike: { name:'Water Strike', base:4,  lvl:5,  baseXp:7.5,  label:'Water Strike (max 4)', runes:{mindrune:1, waterrune:1, airrune:1} },
    earth_strike: { name:'Earth Strike', base:6,  lvl:9,  baseXp:9.5,  label:'Earth Strike (max 6)', runes:{mindrune:1, earthrune:2, airrune:1} },
    fire_strike:  { name:'Fire Strike',  base:8,  lvl:13, baseXp:11.5, label:'Fire Strike (max 8)',  runes:{mindrune:1, firerune:3, airrune:2} },
    wind_bolt:    { name:'Wind Bolt',    base:9,  lvl:17, baseXp:13.5, label:'Wind Bolt (max 9)',    runes:{chaosrune:1, airrune:2} },
    water_bolt:   { name:'Water Bolt',   base:10, lvl:23, baseXp:16.5, label:'Water Bolt (max 10)',  runes:{chaosrune:1, waterrune:2, airrune:2} },
    earth_bolt:   { name:'Earth Bolt',   base:11, lvl:29, baseXp:19.5, label:'Earth Bolt (max 11)',  runes:{chaosrune:1, earthrune:3, airrune:2} },
    fire_bolt:    { name:'Fire Bolt',    base:12, lvl:35, baseXp:22.5, label:'Fire Bolt (max 12)',   runes:{chaosrune:1, firerune:4, airrune:3} },
    wind_blast:   { name:'Wind Blast',   base:13, lvl:41, baseXp:25.5, label:'Wind Blast (max 13)',  runes:{deathrune:1, airrune:3} },
    water_blast:  { name:'Water Blast',  base:14, lvl:47, baseXp:28.5, label:'Water Blast (max 14)', runes:{deathrune:1, waterrune:3, airrune:3} },
    earth_blast:  { name:'Earth Blast',  base:15, lvl:53, baseXp:31.5, label:'Earth Blast (max 15)', runes:{deathrune:1, earthrune:4, airrune:3} },
    fire_blast:   { name:'Fire Blast',   base:16, lvl:59, baseXp:34.5, label:'Fire Blast (max 16)',  runes:{deathrune:1, firerune:5, airrune:4} },
    wind_wave:    { name:'Wind Wave',    base:17, lvl:62, baseXp:36.0, label:'Wind Wave (max 17)',   runes:{bloodrune:1, airrune:5} },
    water_wave:   { name:'Water Wave',   base:18, lvl:65, baseXp:37.5, label:'Water Wave (max 18)',  runes:{bloodrune:1, waterrune:7, airrune:5} },
    earth_wave:   { name:'Earth Wave',   base:19, lvl:70, baseXp:40.0, label:'Earth Wave (max 19)',  runes:{bloodrune:1, earthrune:7, airrune:5} },
    fire_wave:    { name:'Fire Wave',    base:20, lvl:75, baseXp:42.5, label:'Fire Wave (max 20)',   runes:{bloodrune:1, firerune:7, airrune:5} },
    // God spells — EXACT from magic_combat_spells.dbrow @274 (lvl 60, maxhit
    // 20, 35 xp). Each needs its god staff; the Charge spell raises max to 30.
    saradomin_strike:  { name:'Saradomin Strike',  base:20, lvl:60, baseXp:35.0, god:true, staff:'Staff of Saradomin', label:'Saradomin Strike (max 20)', runes:{firerune:2, bloodrune:2, airrune:4} },
    claws_of_guthix:   { name:'Claws of Guthix',    base:20, lvl:60, baseXp:35.0, god:true, staff:'Staff of Guthix',    label:'Claws of Guthix (max 20)',  runes:{firerune:1, bloodrune:2, airrune:4} },
    flames_of_zamorak: { name:'Flames of Zamorak',  base:20, lvl:60, baseXp:35.0, god:true, staff:'Staff of Zamorak',   label:'Flames of Zamorak (max 20)', runes:{firerune:4, bloodrune:2, airrune:1} },
  };
  // Per-cast rune cost: sum of rune qty × live price, EXCLUDING the rune the
  // equipped staff provides for free (e.g. fire staff → fire runes free).
  function spellRuneCost(spellKey, weaponKey){
    const sp = SPELLS[spellKey]; if (!sp || !sp.runes) return 0;
    const provided = WEAPONS[weaponKey]?.provides;
    const P = window.GameData?.ITEM_PRICES || {};
    let gp = 0;
    for (const [rune, qty] of Object.entries(sp.runes)){
      if (rune === provided) continue;
      gp += (P[rune] || 0) * qty;
    }
    return gp;
  }
  // Charge spell — boosts the three god spells' max hit 20→30. EXACT runes
  // from @274 (3 air + 3 fire + 3 blood), lvl 80 magic. It lasts ~7 min then
  // must be recast, so its cost amortises across the casts in that window:
  //   per-cast charge cost = chargeRuneCost ÷ (durationSec ÷ castInterval).
  // God staves don't autocast elements, so no rune is free for Charge.
  const CHARGE = { runes:{airrune:3, firerune:3, bloodrune:3}, durationSec:420 };
  function chargeFullCost(){
    const P = window.GameData?.ITEM_PRICES || {};
    let gp = 0; for (const [r,q] of Object.entries(CHARGE.runes)) gp += (P[r]||0)*q;
    return gp;
  }
  // Amortised charge cost per god-spell cast at the given cast interval (sec).
  function chargeCostPerCast(castIntervalSec){
    const castsPerCharge = Math.max(1, CHARGE.durationSec / (castIntervalSec || 3));
    return chargeFullCost() / castsPerCharge;
  }

  window.SimEngine = {
    TICK_SECONDS, PRAYERS, POTIONS, STYLES, COMBAT_TYPES, SPELLS, WEAPONS, ARROWS,
    WEAPON_STANCES: STANCE_TABLES, STANCE_TABLES, meleeStance, weaponStances, weaponCategory,
    get MONSTERS(){ return window.GameData?.MONSTERS ?? []; },
    effective, maxHitMelee, maxHitRanged, maxHitMagic, roll, hitChance, defaultOverhead,
    normalSustained, dbaSustainedAtt, dbaSustainedStr, dbaBoost,
    combinePrayers, combinePotionFn, resolveLoadout, spellRuneCost, chargeCostPerCast,
    simulate, availablePrayers, availablePotions,
  };
})();
