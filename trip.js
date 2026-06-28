// trip.js — banking-trip / inventory model for the combat sim.
// Exposes window.TripModel. Loaded after engine.js; all functions are pure
// and read live registries at call time, so load order beyond engine is fine.
//
// The core idea: a real training trip ends when EITHER the inventory fills
// with loot OR you run out of food — whichever comes first. Banking is the
// big periodic time cost, and how fast the inventory fills is driven by how
// many *non-stackable* loot slots each kill consumes. Eaten food/potion slots
// free up over the trip and convert into loot space, which couples the two.

(function(){

  // ---- FOOD (heal amounts are 2004-era; price keys match the scraper) ----
  const FOOD = {
    none:      { name:'No food',    heal:0,  priceKey:null },
    trout:     { name:'Trout',      heal:7,  priceKey:'trout' },
    salmon:    { name:'Salmon',     heal:9,  priceKey:'salmon' },
    tuna:      { name:'Tuna',       heal:10, priceKey:'tuna' },
    lobster:   { name:'Lobster',    heal:12, priceKey:'lobster' },
    bass:      { name:'Bass',       heal:13, priceKey:'bass' },
    swordfish: { name:'Swordfish',  heal:14, priceKey:'swordfish' },
    shark:     { name:'Shark',      heal:20, priceKey:'shark' },
  };

  // ---- BANK PRESETS — seconds for a full bank trip (run to bank, deposit,
  // return). Banking time isn't in the source; it's emergent from spawn↔bank
  // distance, teleports and obstacles. Per-monster so the Compare table and
  // each trip reflect the real travel cost. Override per-run in the Trip panel.
  const BANK_PRESETS = {
    green_dragon:240, blue_dragon:270, red_dragon:300, black_dragon:300,
    ice_warrior:150, firegiant:210, giant:90, mossgiant:110, icegiant:120,
    hellhound:150, greater_demon:130, lesser_demon:120, black_demon:160,
    hobgoblin_armed:120, hobgoblin_unarmed:120, bandit:180, ankou:140,
    chaos_druid:90, dagannoth:150, dagannoth_92:150,
    elf_warrior_90:360, elf_warrior_108:360, rock_crab:240, thug:90, tribesman:240,
  };
  function bankSecondsFor(id){ return BANK_PRESETS[id] ?? 150; }

  // ---- POTIONS — counted as 4-dose vials in the sim. priceKey resolves to a
  // 4-dose price (scraper stores 3-dose super prices and scales ×4/3; supers
  // use fixed manual prices because super-SET listings pollute the market
  // average). Fallbacks match gamedata's placeholders. ----
  const POTIONS = {
    super_set:      { name:'Super set (att/str/def)', vials:3, priceKey:'super_set',      fallback:7867 },
    super_attack:   { name:'Super attack',   vials:1, priceKey:'super_attack',   fallback:1600 },
    super_strength: { name:'Super strength', vials:1, priceKey:'super_strength', fallback:4667 },
    super_defence:  { name:'Super defence',  vials:1, priceKey:'super_defence',  fallback:1600 },
    ranging:        { name:'Ranging potion', vials:1, priceKey:'ranging_potion', fallback:5300 },
    magic:          { name:'Magic potion',   vials:1, priceKey:'magic_potion',   fallback:4500 },
    restore:        { name:'Restore (for DBA spec)', vials:1, priceKey:'restore_potion', fallback:200 },
    prayer:         { name:'Prayer potion',  vials:1, priceKey:'prayer_potion',  fallback:7000 },
    antifire:       { name:'Antifire potion', vials:1, priceKey:'antifire_potion', fallback:4200 },
    antipoison:     { name:'Super antipoison', vials:1, priceKey:'super_antipoison', fallback:760 },
  };

  // Stackable loot occupies ONE slot per item type for the whole trip; a
  // non-stackable drop costs a slot per item. Runes, coins, and all thrown /
  // fired ammo stack; everything else (hides, bones, gear, herbs, gems) does not.
  function isStackable(key, name){
    const k = String(key || '').toLowerCase();
    const n = String(name || '').toLowerCase();
    if (/rune$/.test(k) || k === 'coins') return true;
    if (/(arrow|bolt|dart|javelin|knife|feather|bait|ashes|token)/.test(k)) return true;
    if (/\b(coins|arrow|bolt|dart|javelin)\b/.test(n)) return true;
    // A real RUNE drop is named "<type> rune ×N" (e.g. "Nature rune", "Law
    // rune") — the word "rune" follows a type word. Rune GEAR is named "Rune
    // <item>" ("Rune dagger", "Rune platebody"), where "rune" is the leading
    // material word and the item does NOT stack. Require a word before "rune"
    // so gear isn't misclassified (which would wrongly reserve it a stack slot).
    if (/\w+\s+runes?\b/.test(n)) return true;
    return false;
  }

  function hitChanceLocal(attRoll, defRoll){
    if (attRoll > defRoll) return 1 - (defRoll + 2) / (2 * (attRoll + 1));
    return attRoll / (2 * (defRoll + 1));
  }

  // Incoming damage → food needed per kill. Derived from the monster's max hit
  // and how often it lands against the player's defence (gear + level + a
  // protection prayer if matching). Dragons add a dragonfire chip that the
  // anti-dragon shield largely neutralises.
  function computeIncoming(input, ctx){
    const m = ctx.m;
    const atkType = m.atkType || 'melee';
    const mStr = m.strength ?? m.attack ?? 1;
    // Monster max hit. The strength->maxhit formula below assumes a ZERO strength
    // bonus, so it under-hits monsters that have a strength bonus (giants, etc.):
    // e.g. fire giant computes 7 but really maxes 11. When the real value is known
    // (from the fansite NPC DB / OSRS), set m.maxHit on the monster to override.
    const monMax = m.maxHit ?? Math.floor(((mStr + 9) * ((m.strBonus ?? 0) + 64) + 320) / 640);
    // ^ combat_maxhit @274 (npc_combat_melee.rs2): effective_strength = strength + 9
    //   (no prayer, +8 base +1 'style'); maxhit = (eff_str × (strengthbonus+64) + 320)/640.
    //   strBonus defaults 0 when unknown (under-hits monsters with a str bonus).
    //   m.maxHit stays as an explicit override for non-formula cases (e.g. the
    //   ranged dagannoth's fixed spine max hit).
    const mAttBonus = m.attBonus ?? 0;
    // NPC attack roll @274 (npc_combat_melee.rs2): effective_attack = attack + 9;
    //   attack_roll = effective_attack × (attackbonus + 64). attBonus defaults 0.
    const monAttRoll = ((m.attack ?? 1) + 9) * (mAttBonus + 64);

    // Safespotting: ranged, magic, and halberds attack from behind an
    // obstacle, so the monster never gets a hit in (and 2004 dragonfire is
    // melee-range breath — a safespotted dragon can't breathe on you).
    // Auto-on for those methods; override with trip.safespot = true/false.
    const wclass = window.SimEngine?.WEAPONS?.[input.weapon]?.wclass;
    const safespotAuto = ctx.combatType === 'ranged' || ctx.combatType === 'magic'
      || wclass === 'halberd';
    const safespot = (input.trip && input.trip.safespot != null)
      ? !!input.trip.safespot : safespotAuto;
    const regenPerKill = (ctx.cycle || 0) / 60;
    if (safespot){
      return { hpPerKill:0, netHpPerKill:0, regenPerKill, monMax,
               hitChance:0, dragonfire:0, protected:false, safespot:true, safespotAuto };
    }

    const EQ = window.Equipment;
    const totals = (EQ && input.gear)
      ? EQ.sumBonuses({ ...input.gear, weapon: input.weapon, ammo: input.ammo })
      : {};
    const defKey = atkType === 'magic' ? 'magDef' : atkType === 'ranged' ? 'rngDef' : 'slashDef';
    const pDefBonus = totals[defKey] || 0;
    const defLvl = input.defence || 1;
    const prayerDefMult = ctx.prayerDef || 1;
    const pDefRoll = Math.floor((defLvl * prayerDefMult) + 9) * (pDefBonus + 64);

    const prot = (input.trip && input.trip.protect) || 'none';
    const isProt = (prot === 'melee' && atkType === 'melee')
      || (prot === 'missiles' && atkType === 'ranged')
      || (prot === 'magic' && atkType === 'magic');
    let hc = hitChanceLocal(monAttRoll, pDefRoll);
    if (isProt) hc = 0;   // 2004 NPC protection prayers fully block that style

    const atkInterval = (m.attackSpeed || 4) * 0.6;
    const attacks = (ctx.ttk || 0) / atkInterval;
    let hpPerKill = attacks * hc * (monMax / 2);

    let dragonfire = 0;
    if (m.dragonfire){
      const hasAnti = (input.gear && input.gear.shield === 'anti_dragon');
      const antifire = !!(input.trip && input.trip.antifire);
      // 2004 dragonfire mitigation: shield ~85% off, antifire potion big cut,
      // and shield + antifire = full immunity (0). Neither = full ~20 hit.
      if (hasAnti && antifire) dragonfire = 0;
      else if (hasAnti)        dragonfire = 3;
      else if (antifire)       dragonfire = 4;
      else                     dragonfire = 20;
      hpPerKill += dragonfire;
    }
    // Poison — some monsters (poison spiders, tribesmen) inflict poison while
    // you fight them unprotected. It's a damage-over-time, not blocked by
    // protection prayers; we model ~one poison cycle's worth of chip per kill
    // (it starts at poisonMax and ticks down). Super-antipoison gives immunity
    // → 0; at monsters that DROP antipoison (tribesmen) you sustain immunity
    // from their drops, so it's free. Only relevant when NOT safespotting
    // (safespot returns 0 above before reaching here).
    let poison = 0;
    if (m.poisons){
      const onAnti = !!m.antipoisonFromDrops || !!(input.trip && input.trip.antipoison);
      poison = onAnti ? 0 : (m.poisonMax ?? 5);
      hpPerKill += poison;
    }
    // HP regenerates ~1 hp/min. Over a full kill cycle (kill + overhead +
    // re-engage) you heal some of the damage back — on slow, low-damage
    // targets (e.g. chaos druids) regen out-paces incoming, so net food = 0.
    const netHpPerKill = Math.max(0, hpPerKill - regenPerKill);
    return { hpPerKill, netHpPerKill, regenPerKill, monMax, hitChance: hc,
             dragonfire, poison, protected: isProt, safespot:false, safespotAuto };
  }

  // Full trip computation. ctx = { m, ttk, cycle, kph, lootBreakdown, dba,
  // combatType, prayerDef }.
  function computeTrip(input, ctx){
    const INV = 28;
    const t = input.trip || {};
    const food = FOOD[t.foodKey] || FOOD.lobster;

    // ---- potions: which categories you drink, how you carry them ----------
    // Each distinct combat potion is one item slot. By DEFAULT you bring full
    // (4)-dose vials; "vials per type" is how many refills. Alternatively, tick
    // single-dose mode to bring exactly N 1-dose potions per type and drop the
    // vial after each sip — fewer doses, slots freed sooner, lower supply cost
    // (good for short trips where a (3)-dose vial would just waste a bank slot).
    // DBA-spec'ing frees the strength potion (spec = free super-str) but costs
    // one restore dose per trip.
    const POTION_CAT = {
      attack:'att', strength:'str', defence:'def',
      super_att:'att', super_str:'str', super_def:'def',
      ranging:'rng', magic:'mag',
    };
    // category → priced potion key (4-dose price in the table; ÷4 per dose).
    const CAT_POTION = { att:'super_attack', str:'super_strength', def:'super_defence',
                        rng:'ranging', mag:'magic' };
    const boostKeys = ctx.boostKeys || [];
    let potionCats = boostKeys.filter(k => POTION_CAT[k]).map(k => POTION_CAT[k]);
    potionCats = [...new Set(potionCats)];
    if (ctx.dba) potionCats = potionCats.filter(c => c !== 'str');
    const potionTypes = potionCats.length;

    const singleDose = !!t.singleDose;
    const dosesPerVial = singleDose ? 1 : 4;
    // qty per type: vials (full mode) or doses (single-dose mode).
    const potionSets = Math.max(0, t.potionSets ?? 1);          // vials per type
    const potionDoses = Math.max(0, t.potionDoses ?? 4);        // doses per type
    const qtyPerType = singleDose ? potionDoses : potionSets;
    const dosesPerType = singleDose ? potionDoses : potionSets * dosesPerVial;

    let potionSlots = potionTypes * qtyPerType;
    // DBA spec gives free super-strength. The restore dose (undoes att/def
    // drain) is OPTIONAL — on low-defence/low-damage monsters players skip it
    // and just keep the strength boost, saving a slot and the restore cost.
    // In full-vial mode you drink 1 dose and carry the 3-dose vial back, so it
    // costs a LOCKED slot all trip; as a single dose it's drunk and dropped.
    const dbaRestore = ctx.dba && (ctx.dbaRestore !== false);
    let restoreDoses = 0, restoreLocked = 0;
    if (dbaRestore){
      restoreDoses = 1;
      if (singleDose) potionSlots += 1;   // 1-dose: transient (drunk & dropped)
      else restoreLocked = 1;             // 4-dose vial: carried back, locked
    }
    const potionParts = [];
    if (potionTypes) potionParts.push(singleDose
      ? `${potionTypes}×${potionDoses} dose`
      : `${potionTypes}×${potionSets} vial`);
    if (dbaRestore) potionParts.push('1 restore');

    // Antifire potion — only meaningful vs a dragonfire monster. Carried like
    // any combat potion (respects vial/single-dose mode); with the anti-dragon
    // shield it grants full dragonfire immunity. Adds slots + supply cost.
    const antifireOn = !!t.antifire && !!(ctx.m && ctx.m.dragonfire);
    let antifireSlots = 0, antifireDoses = 0;
    if (antifireOn){
      antifireSlots = qtyPerType;
      antifireDoses = dosesPerType;
      potionSlots += antifireSlots;
      potionParts.push(singleDose ? `${potionDoses} antifire` : `${potionSets} antifire`);
    }

    // Super antipoison — only meaningful vs a poisonous monster you're NOT
    // safespotting. Carried like any combat potion (vial/single-dose). At
    // monsters that DROP antipoison (tribesmen) you sustain immunity from the
    // drops, so we carry NONE — no slots, no cost (antipoisonFromDrops).
    const antipoisonOn = !!t.antipoison && !!(ctx.m && ctx.m.poisons)
      && !(ctx.m && ctx.m.antipoisonFromDrops);
    let antipoisonSlots = 0, antipoisonDoses = 0;
    if (antipoisonOn){
      antipoisonSlots = qtyPerType;
      antipoisonDoses = dosesPerType;
      potionSlots += antipoisonSlots;
      potionParts.push(singleDose ? `${potionDoses} antipoison` : `${potionSets} antipoison`);
    }

    // Prayer potions — needed whenever active prayers drain points (offensive
    // prayers and/or a protection prayer). Carried like any combat potion
    // (vial/single-dose mode). Each dose restores floor(prayerLevel/4)+7 points;
    // the engine passes prayerPerKill (points drained per kill). They add slots
    // + supply cost, and can make the trip PRAYER-BOUND (you bank when prayer
    // runs out before food/loot). Disable via trip.prayerRestore = false (e.g.
    // you flick prayers off, or recharge at an altar).
    const prayerPerKill = ctx.prayerPerKill || 0;
    const prayerActive = prayerPerKill > 0 && (t.prayerRestore !== false);
    let prayerSlots = 0, prayerPointsCarried = 0, maxKillsPrayer = Infinity, prayerPointsPerDose = 0;
    if (prayerActive){
      const lvl = ctx.prayerLevel || 1;
      prayerPointsPerDose = Math.floor(lvl / 4) + 7;
      prayerSlots = qtyPerType;                       // vials (or doses) like other pots
      potionSlots += prayerSlots;
      prayerPointsCarried = dosesPerType * prayerPointsPerDose;
      maxKillsPrayer = prayerPerKill > 0 ? prayerPointsCarried / prayerPerKill : Infinity;
      potionParts.push(singleDose ? `${potionDoses} prayer` : `${potionSets} prayer`);
    }

    // potion supply cost (per trip): doses carried × per-dose price.
    const ITEM0 = window.GameData?.ITEM_PRICES || {};
    const perDose = (key) => {
      const p = POTIONS[key];
      const price = (ITEM0[p?.priceKey] != null) ? ITEM0[p.priceKey] : (p?.fallback ?? 0);
      return price / 4;   // table prices are 4-dose
    };
    let potionCostPerTrip = 0;
    for (const c of potionCats) potionCostPerTrip += dosesPerType * perDose(CAT_POTION[c]);
    if (dbaRestore) potionCostPerTrip += restoreDoses * perDose('restore');
    if (antifireOn) potionCostPerTrip += antifireDoses * perDose('antifire');
    if (antipoisonOn) potionCostPerTrip += antipoisonDoses * perDose('antipoison');

    // --- fixed reserve (locked the whole trip) ---
    let reserve = 0;
    const reserveParts = [];
    if (t.teleport !== false){ reserve += 1; reserveParts.push('teleport'); }
    if (ctx.dba){ reserve += 1; reserveParts.push('DBA switch'); }
    // A 2nd weapon brought only to special-attack occupies one slot the whole
    // trip — but only when the spec is actually in use (engine sets hasSpec;
    // false for magic or a leftover spec key that doesn't match the combat type)
    // AND it's a different weapon than the mainhand (speccing with your own
    // main weapon, e.g. MSB+MSB, carries nothing extra). DBA reserves its own
    // switch slot and is mutually exclusive.
    if (!ctx.dba && ctx.hasSpec && input.specWeapon !== input.weapon){
      reserve += 1; reserveParts.push('spec weapon');
    }
    if (restoreLocked){ reserve += 1; reserveParts.push('restore vial'); }
    if (t.alching){ reserve += 2; reserveParts.push('alch runes'); }
    if (ctx.combatType === 'magic'){
      const rs = t.runeSlots ?? 2;
      reserve += rs; if (rs) reserveParts.push(`${rs} combat-rune`);
    }
    // Dwarf cannon: 4 parts + 1 (stackable) cannonball slot stay locked the
    // whole trip — they never convert to loot space. (Balls stack, so a big
    // reload pile is still just one slot; the gp cost is handled in the engine.)
    if (ctx.cannonOn){ reserve += 5; reserveParts.push('cannon (4 parts)', 'cannonballs'); }

    // --- ring of recoil: spare rings lock slots, rings shatter at 40 dmg ---
    // The 1st ring is equipped (free); each spare you carry (count-1) locks one
    // inv slot the whole trip. Every ring absorbs 40 reflected dmg before it
    // shatters, so rings used/kill = recoilDmg/40 (a per-kill supply cost). We
    // assume every ring carried starts FULL — in 2004 you can't check a worn
    // ring's remaining charges — so total capacity = count × 40 dmg, which can
    // make the trip RECOIL-BOUND (you bank when the rings run out).
    const recoilDmgPerKill = ctx.recoilDmgPerKill || 0;
    const recoilOn = !!ctx.ringRecoil && recoilDmgPerKill > 0;
    let recoilRings = 0, recoilSpares = 0, recoilRingsPerKill = 0,
        recoilCostPerKill = 0, maxKillsRecoil = Infinity;
    if (recoilOn){
      recoilRings = Math.max(1, Math.floor(t.recoilRings ?? 1));
      recoilSpares = recoilRings - 1;
      // Spares are NOT permanently reserved: each ring shatters after 40
      // reflected dmg and frees its slot, so they convert to loot space over
      // the trip (folded into `transientSlots` below, like potion vials).
      recoilRingsPerKill = recoilDmgPerKill / 40;
      const ringPrice = (window.GameData?.ITEM_PRICES?.ring_of_recoil) ?? 1500;
      recoilCostPerKill = recoilRingsPerKill * ringPrice;
      maxKillsRecoil = recoilDmgPerKill > 0 ? (recoilRings * 40) / recoilDmgPerKill : Infinity;
    }

    // Spare recoil rings shatter and free their slots over the trip, so they
    // share the potion-vial transient treatment instead of a fixed reserve.
    const transientSlots = potionSlots + recoilSpares;

    // --- incoming damage → food/kill ---
    const inc = computeIncoming(input, ctx);
    const foodPerKill = (t.foodPerKillOverride != null && t.foodPerKillOverride !== '')
      ? Math.max(0, +t.foodPerKillOverride)
      : (food.heal > 0 ? inc.netHpPerKill / food.heal : 0);

    // --- loot slot consumption ---
    // Non-stackables (hides, unburied bones, gear) cost a slot PER drop, so
    // they fill the pack at nonStack/kill. A stackable (coins, runes) you
    // choose to loot costs exactly ONE slot for the whole trip — every drop of
    // that type piles into the same slot — REGARDLESS of how often it drops.
    // (Earlier this was probability-weighted, which wrongly made a rarely-
    // dropping low-value stack "cheaper" to loot than a common valuable one.)
    //
    // Food drops (bass on green dragons, etc.) are a special case: if you're
    // eating on this trip you EAT them instead of banking — they take no slot
    // and their value is the brought-food cost they save (1 dropped bass spares
    // ~bassHeal/lobsterHeal lobsters). `eatenFood` carries that per-drop gp back
    // to the engine, which swaps it in for the market value.
    const FOOD_KEY_HEAL = {};
    for (const f of Object.values(FOOD)) if (f.priceKey) FOOD_KEY_HEAL[f.priceKey] = f.heal;
    const ITEM_P = window.GameData?.ITEM_PRICES || {};
    const broughtFoodPrice = food.priceKey ? (ITEM_P[food.priceKey] ?? 0) : 0;
    const eatenFood = {};
    let nonStackPerKill = 0;
    const stackKeys = new Set();
    for (const d of (ctx.lootBreakdown || [])){
      if (d.pref === 'skip' || d.pref === 'bury' || d.pref === 'alch') continue; // not banked as loot
      if (!(d.evGp > 0)) continue;
      const dropHeal = FOOD_KEY_HEAL[d.key];
      if (dropHeal && foodPerKill > 0 && d.pref === 'loot'){
        // Eaten, not banked: no slot, and it offsets brought food. (Food drops
        // are tiny next to damage taken, so all of it is eaten — no overheal cap
        // needed in practice.)
        const savedPerItem = food.heal > 0 ? (dropHeal / food.heal) * broughtFoodPrice : 0;
        eatenFood[d.name] = d.chance * d.qtyAvg * savedPerItem;
        continue;
      }
      if (isStackable(d.key, d.name)){
        // When alching, you already carry a coin slot (alch produces coins),
        // so looting coin drops costs NO extra slot — don't reserve one.
        if (t.alching && (d.key === 'coins' || /^coins$/i.test(d.name))) continue;
        stackKeys.add(d.key || d.name);
      } else {
        // slotFrac < 1 for 'value' sub-tables: junk rolls are left on the
        // ground, so they don't consume an inventory slot.
        nonStackPerKill += d.chance * d.qtyAvg * (d.slotFrac ?? 1);
      }
    }
    const stackReserve = stackKeys.size;

    // --- loot / food slot model ----------------------------------------
    // GOAL: end the trip with a FULL pack of loot (glory/teleport being the
    // last occupied slot when you bank). Food AND potion vials are transient —
    // both are consumed during the trip and their slots convert to loot — so
    // loot capacity is the pack minus only the genuinely locked slots:
    // teleport, DBA switch, runes, and the expected stackable-loot slots.
    const lootCapacity = Math.max(0, INV - reserve - stackReserve);

    // Inventory-bound kills at the OPTIMUM (all consumables eaten by the time
    // the pack fills): non-stackables fill at nonStack/kill. Burying bones
    // removes them from this count → roughly doubles kills/trip.
    const kInv = nonStackPerKill > 0 ? lootCapacity / nonStackPerKill : Infinity;

    // Auto food: bring exactly enough to last an inventory-bound trip, so the
    // last lobster is eaten as the last loot slot fills → you bank with a full
    // pack of loot. Cap = slots open at the START. Stackable slots are EMPTY
    // at the start (they only fill once a drop occurs, by which time food has
    // been eaten and freed slots), so they do NOT reduce starting food — only
    // teleport/DBA/runes + potion vials do. (Subtracting stackReserve here was
    // a bug: it made a stackable cost MORE food/kills than a non-stackable.)
    //
    // This is also what makes 'looting less' pay off when food-bound: dropping
    // a drop's slot cost (e.g. herb 'value'/'skip') lowers nonStackPerKill,
    // which raises kInv, which raises the food brought — more food = more kills
    // before the pack would fill = more kills/trip = fewer bank runs. The food
    // target sits exactly where collected loot reaches the pack cap as the last
    // food is eaten, which is the net-gp optimum (more food would clip loot;
    // less would bank early with a half-full pack).
    const startSpace = Math.max(0, Math.floor(INV - reserve - transientSlots));
    const potRate = (isFinite(kInv) && kInv > 0) ? transientSlots / kInv : 0;
    // Loot grows faster than eating/drinking frees slots only if this is > 0.
    const netFill = nonStackPerKill - foodPerKill - potRate;
    const cycle = ctx.cycle || 0;
    const bankSeconds = (t.bankSeconds != null && t.bankSeconds !== '')
      ? t.bankSeconds
      : bankSecondsFor(ctx.m && ctx.m.id);

    // Outcome of a trip carrying `fc` food, as a PURE function of fc (every
    // other input is fixed above): kills/trip, the loot fraction you actually
    // bank (surplus food fills the pack early → some drops missed), and the
    // banking efficiency. Being pure, we can SEARCH fc rather than guess it.
    function evalFood(fc){
      const kFood = foodPerKill > 0 ? fc / foodPerKill : Infinity;
      // Honest fill constraint: loot grows only into slots free now or freed by
      // eating/drinking — nonStack·k ≤ freeAtStart + (foodPerKill + potRate)·k.
      const freeAtStart = Math.max(0, lootCapacity - transientSlots - fc);
      const kFill = netFill > 0 ? freeAtStart / netFill : Infinity;
      let killsPerTrip, bound;
      if (foodPerKill > 0){
        const foodLeftAtFull = isFinite(kFill) ? fc - foodPerKill * kFill : Infinity;
        const slack = Math.max(1.5, 0.1 * fc);
        if (isFinite(kFill) && kFood >= kFill && foodLeftAtFull <= slack){
          killsPerTrip = kFill; bound = 'loot';      // bank with a full pack
        } else if (!isFinite(kFill) || kFood < kFill){
          killsPerTrip = kFood; bound = 'food';      // food runs out first
        } else {
          killsPerTrip = kFood; bound = 'overfull';  // surplus food → pack fills, drops missed
        }
      } else {
        killsPerTrip = kInv;
        bound = isFinite(kInv) ? 'loot' : 'none';
      }
      // Loot collected vs dropped (overflow lost once the pack is full).
      const finiteKills = isFinite(killsPerTrip) ? killsPerTrip : kInv;
      const dropped = isFinite(finiteKills) ? nonStackPerKill * finiteKills : lootCapacity;
      const collected = isFinite(finiteKills)
        ? Math.min(lootCapacity, dropped, freeAtStart + (foodPerKill + potRate) * finiteKills)
        : lootCapacity;
      const lootFraction = dropped > 0 ? Math.min(1, collected / dropped) : 1;
      const foodLeftAtEnd = isFinite(killsPerTrip) ? Math.max(0, fc - foodPerKill * killsPerTrip) : 0;
      let efficiency, effectiveKph, tripMinutes;
      if (!isFinite(killsPerTrip) || bankSeconds <= 0){
        efficiency = 1; effectiveKph = ctx.kph; tripMinutes = Infinity;
      } else {
        killsPerTrip = Math.max(1, killsPerTrip);
        const killTripTime = killsPerTrip * cycle;     // seconds killing per trip
        const tripTotal = killTripTime + bankSeconds;  // + banking
        efficiency = killTripTime / tripTotal;
        effectiveKph = ctx.kph * efficiency;
        tripMinutes = tripTotal / 60;
      }
      return { killsPerTrip, bound, freeAtStart, lootFraction,
        lootSlotsAtEnd: collected, foodLeftAtEnd, efficiency, effectiveKph, tripMinutes };
    }

    // Choose food. Manual override wins. Otherwise SEARCH for the count that
    // maximises gp throughput — effectiveGpPerHour ∝ lootFraction × efficiency
    // (per-kill loot value is fixed) — over a small window around the analytic
    // estimate (food to last until the pack fills). This lands on the food/loot
    // knee instead of overshooting into 'overfull' (clipping loot) or under-
    // shooting (banking half-full), and it rises automatically when you loot
    // less: lower nonStackPerKill → higher kInv → more food → more kills/trip.
    let autoFoodCount;
    if (foodPerKill <= 0 || startSpace < 1){
      autoFoodCount = 0;
    } else {
      const est = foodPerKill * (isFinite(kInv) ? kInv : 28);
      const hi = Math.min(startSpace, Math.ceil(est) + 1);
      const lo = Math.min(hi, Math.max(1, Math.floor(est) - 1));
      let best = lo, bestScore = -Infinity;
      for (let fc = lo; fc <= hi; fc++){
        const r = evalFood(fc);
        const score = r.lootFraction * r.efficiency;
        if (score > bestScore + 1e-9){ bestScore = score; best = fc; }
      }
      autoFoodCount = best;
    }
    const foodCount = (t.foodCount != null && t.foodCount !== '')
      ? Math.max(0, t.foodCount)
      : autoFoodCount;

    const R = evalFood(foodCount);
    let { killsPerTrip, bound, freeAtStart, lootFraction,
          lootSlotsAtEnd, foodLeftAtEnd, efficiency, effectiveKph, tripMinutes } = R;

    // Prayer-bound cap: if the prayer doses you carry run out before food/loot
    // ends the trip, prayer is the binding constraint — recompute the (shorter)
    // trip's loot fraction and banking efficiency for the capped kill count.
    if (prayerActive && isFinite(maxKillsPrayer) && maxKillsPrayer < killsPerTrip){
      killsPerTrip = Math.max(1, maxKillsPrayer);
      bound = 'prayer';
      const dropped = nonStackPerKill * killsPerTrip;
      const collected = Math.min(lootCapacity, dropped, freeAtStart + (foodPerKill + potRate) * killsPerTrip);
      lootFraction = dropped > 0 ? Math.min(1, collected / dropped) : 1;
      lootSlotsAtEnd = collected;
      foodLeftAtEnd = Math.max(0, foodCount - foodPerKill * killsPerTrip);
      if (bankSeconds > 0){
        const killTripTime = killsPerTrip * cycle;
        efficiency = killTripTime / (killTripTime + bankSeconds);
        effectiveKph = ctx.kph * efficiency;
        tripMinutes = (killTripTime + bankSeconds) / 60;
      }
    }

    // Recoil-bound cap: if your rings' total charges (count × 40 dmg) run out
    // before food/loot/prayer end the trip, the rings are the binding constraint
    // — recompute the (shorter) trip's loot fraction and banking efficiency.
    if (recoilOn && isFinite(maxKillsRecoil) && maxKillsRecoil < killsPerTrip){
      killsPerTrip = Math.max(1, maxKillsRecoil);
      bound = 'recoil';
      const dropped = nonStackPerKill * killsPerTrip;
      const collected = Math.min(lootCapacity, dropped, freeAtStart + (foodPerKill + potRate) * killsPerTrip);
      lootFraction = dropped > 0 ? Math.min(1, collected / dropped) : 1;
      lootSlotsAtEnd = collected;
      foodLeftAtEnd = Math.max(0, foodCount - foodPerKill * killsPerTrip);
      if (bankSeconds > 0){
        const killTripTime = killsPerTrip * cycle;
        efficiency = killTripTime / (killTripTime + bankSeconds);
        effectiveKph = ctx.kph * efficiency;
        tripMinutes = (killTripTime + bankSeconds) / 60;
      }
    }

    // supplies cost per kill (food eaten + potions consumed). Prayer potions are
    // consumed at the drain rate, so they're costed per kill (like food), not as
    // a flat per-trip vial count.
    const ITEM = window.GameData?.ITEM_PRICES || {};
    const foodPrice = food.priceKey ? (ITEM[food.priceKey] ?? 0) : 0;
    const foodCostPerKill = foodPerKill * foodPrice;
    const prayerCostPerKill = (prayerActive && prayerPointsPerDose > 0)
      ? (prayerPerKill / prayerPointsPerDose) * perDose('prayer') : 0;
    const potionCostPerKill = (isFinite(killsPerTrip) && killsPerTrip > 0
      ? potionCostPerTrip / killsPerTrip : 0) + prayerCostPerKill;

    return {
      killsPerTrip, bound, efficiency, effectiveKph, tripMinutes, lootFraction,
      foodPerKill, foodHeal: food.heal, foodPrice, foodCostPerKill, foodName: food.name,
      potionCostPerKill, potionCostPerTrip, singleDose, dosesPerType,
      prayerActive, prayerPerKill, prayerCostPerKill, prayerSlots,
      prayerPointsPerDose, maxKillsPrayer,
      recoilOn, recoilRings, recoilSpares, recoilRingsPerKill,
      recoilCostPerKill, maxKillsRecoil, recoilDmgPerKill,
      incoming: inc, eatenFood,
      slots: {
        inv: INV, reserve, reserveParts, stackReserve, foodCount, potionSlots,
        potionTypes, potionSets, potionDoses, singleDose, potionParts,
        freeAtStart, lootCapacity, nonStackPerKill,
        lootSlotsAtEnd, foodLeftAtEnd, autoFoodCount, prayerSlots,
      },
      bankSeconds,
    };
  }

  window.TripModel = { FOOD, POTIONS, BANK_PRESETS, bankSecondsFor, isStackable, computeIncoming, computeTrip };

})();
