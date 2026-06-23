// gamedata.js — Generated from LostCityRS/Content (sourced at ref 274)
// Drop tables: directly parsed from .rs2 scripts (weighted if-else chains over random(128))
// Monster stats: 2004-era documented values
// Item prices: placeholder market values — replace with scraper output
// Ring of Wealth: affects ~randomjewel table only (adds dragonstone slot), NOT ~ultrarare
//
// PROVENANCE: inline "@274" notes mark the content release tag a value came from.
// 274 is a PINNED SNAPSHOT — the server advances (274 → 289 → …). When adding a
// monster/item or re-verifying a drop table, use the LATEST release tag and cite it.
// See CLAUDE.md → "Source of truth" for how to find the current tag.

(function(){

// ---- item prices (gp) — replace with market scraper -----------------
const P = {
  // gems (uncut)
  sapphire:460, emerald:680, ruby:1050, diamond:2200, dragonstone:16000,
  // bones
  bones:35, big_bones:280, dragon_bones:2400, babydragon_bones:0, ashes:5,
  // rock crab junk drops (mostly near-worthless; rough static values)
  seaweed:5, oystershell:2, oysterempty:2, smalloysterpearls:120, opal_bolttips:30,
  spinach_roll:8, bronze_pickaxe:1, iron_pickaxe:140, copper_ore:30, tin_ore:18, fishing_bait:3,
  // runes
  airrune:8, waterrune:6, earthrune:5, firerune:6, mindrune:4, bodyrune:3,
  chaosrune:95, deathrune:195, bloodrune:320, naturerune:265, lawrune:280,
  cosmicrune:130, soulrune:400,
  // arrows/ammo
  bronze_arrow:2, iron_arrow:3, steel_arrow:18, mithril_arrow:40, rune_arrow:165,
  adamant_arrow:60, bolt:4, bronze_javelin:5, iron_javelin:8, steel_javelin:30,
  adamant_dart_p:65, rune_knife:180,
  // food
  tuna:60, lobster:185, bass:520, swordfish:220, shark:740, jug_wine:1, beer:2,
  // hides
  dragonhide_green:1550, dragonhide_blue:2200, dragonhide_black:3300,
  // green d'hide armour (elf warrior drops) — valued at high-alch (rarely traded)
  dragonhide_body:4680, dragonhide_chaps:2340,
  fur:30, raw_bear_meat:10, raw_rat_meat:5,
  // ores/bars
  tin_ore:4, copper_ore:4, iron_ore:90, gold_ore:135, mithril_ore:220, adamantite_ore:1100,
  coal:200, bronze_bar:60, iron_bar:60, gold_bar:270, steel_bar:520, mithril_bar:930, adamantite_bar:2100,
  silver_ore:120,
  // weapons/armour (priced items)
  iron_dagger:18, black_dagger:320, rune_dagger:4400, adamant_spear:3100,
  iron_sword:20, steel_longsword:140, steel_scimitar:100, mithril_sword:620,
  black_sword:500, black_axe:600, rune_longsword:18000,
  steel_axe:95, mithril_axe:680, steel_battleaxe:250, steel_2h_sword:320, rune_scimitar:15400,
  fire_battlestaff:9300, plainstaff:140, magic_staff:140, staff_of_earth:600,
  mithril_mace:760, steel_mace:80, iron_mace:20,
  // otherworldly being misc drops
  ruby_ring:1000, mackerel:60,
  bronze_scimitar:18, iron_scimitar:55,
  iron_full_helm:45, iron_kiteshield:50, iron_platelegs:220, iron_battleaxe:45,
  steel_full_helm:190, steel_med_helm:85, steel_kiteshield:175, steel_platelegs:220,
  black_kiteshield:680, mithril_sq_shield:820, mithril_kiteshield:1350, mithril_chainbody:2550,
  rune_med_helm:11100, rune_full_helm:20300, rune_chainbody:29400,
  adamant_full_helm:3200, adamant_platelegs:38400, adamant_platebody:76000, adamantite_bar:2100,
  mithril_2h_sword:1950, mithril_battleaxe:1600,
  // misc
  limpwurt_root:950, body_talisman:850, air_talisman:200, fire_talisman:250,
  mind_talisman:600, water_talisman:800, earth_talisman:500,
  brass_necklace:45, red_cape:12, black_cape:25, thread:6,
  goblin_armour:5, chefs_hat:50, grapes:10, spinach_roll:2, cabbage:5,
  bronze_sq_shield:12, bronze_axe:5, bronze_scimitar:18,
  iron_scimitar:55, iron_longsword:22, steel_sword:80, bronze_longsword:5,
  '3dose1defense':350, '2dose1strength':280, '1dose2defense':180, '3doseantipoison':380,
  cow_hide:125, raw_beef:5, raw_chicken:5, feather:3,
  // druid items
  druidrobetop:420, druidrobebottom:420, vial_water:20, vial_empty:5,
  white_berries:350, unicorn_horn_dust:480, snape_grass:600,
  // shadow warrior
  weapon_poison:1100,
  // cert items
  cert_swordfish:220,
  // dragons
  chocolate_cake:350,
  // granite shield — tradeable (sold at market, not alch); scraped key granite_shield
  granite_shield:35000,
  // average herb/gem EV (used for ~randomherb/~randomjewel)
  _randomherb_avg: 220,
};

// ---- scraped market prices (overrides the placeholders above) -------
// Keyed to LostCity item config ids. Re-scrape updates these in place.
// Food prices drive the trip model's supply cost.
Object.assign(P, {
  "_randomherb_avg":1890,"adamant_arrow":133,"adamant_full_helm":5000,"adamant_kiteshield":8400,
  "adamant_platelegs":26000,"adamantite_bar":4750,"adamantite_ore":851,"airrune":30,"ashes":206,
  "big_bones":390,"bloodrune":775,"bodyrune":14,"bronze_arrow":15,"chaosrune":133,"coal":530,
  "cosmicrune":245,"cow_hide":510,"deathrune":218,"dragon_bones":2504,"dragon_longsword":126000,
  "dragon_spear":402000,"dragonhide_black":3640,"dragonhide_blue":2960,"dragonhide_green":2700,
  "dragonstone":181400,"earthrune":11,"eye_of_newt":245,"feather":18,"fire_battlestaff":13800,
  "firerune":14,"gold_bar":390,"gold_ore":1100,"guam_leaf":350,"herb_avantoe":5180,
  "herb_cadantine":3440,"herb_dwarf_weed":9300,"herb_guam":350,"herb_harralander":2080,
  "herb_irit":3760,"herb_kwuarm":4400,"herb_lantadyme":3940,"herb_marrentill":69,
  "herb_ranarr":5460,"herb_tarromin":918,"iron_arrow":17,"iron_bar":474,"iron_ore":298,
  "lawrune":309,"limpwurt_root":2500,"lobster":224,"loop_half_key":81200,"magic_staff":553,
  "marentill":69,"mindrune":19,"mithril_arrow":69,"mithril_bar":2180,"mithril_chainbody":828,
  "mithril_kiteshield":4333,"mithril_ore":505,"mithril_sq_shield":594,"naturerune":351,
  "rune_2h":48800,"rune_arrow":301,"rune_battleaxe":24618,"rune_chainbody":38520,"rune_dagger":4458,
  "rune_full_helm":30400,"rune_kiteshield":40000,"rune_knife":2000,"rune_longsword":18858,
  "rune_med_helm":12250,"rune_platebody":44600,"rune_platelegs":40400,"rune_scimitar":17900,
  "rune_sq_shield":35880,"shark":785,"silver_ore":308,"snape_grass":1141,"steel_arrow":29,
  "steel_bar":1470,"swordfish":306,"tooth_half_key":110000,"tuna":108,"uncut_diamond":4100,
  "uncut_emerald":4140,"uncut_ruby":2800,"uncut_sapphire":1400,"unicorn_horn_dust":2260,
  "unidentified_guam":1840,"vial_water":347,"water_talisman":500,"waterrune":17,
  "weapon_poison":8800,"white_berries":1330,
  // food not yet in scraper — reasonable 2004-era market values
  "trout":35,"salmon":80,"bass":520,
  // potions — 4-dose values. Supers use fixed manual prices (×4/3 of the
  // 3-dose: att 1200, str 3500, def 1200); restore is a normal stat-restore
  // (cheap), used for the DBA spec. Scraper refreshes restore/prayer live.
  "super_attack":1600,"super_strength":4667,"super_defence":1600,"super_set":7867,
  "restore_potion":200,"prayer_potion":7000,"ranging_potion":5300,"magic_potion":4500,"antifire_potion":4200,
  // arrow placeholder (refreshed by the scraper). Knife/dart prices come from
  // the scrape (prices.json); unsold tiers are approximated in engine.js from
  // sibling tiers, so we deliberately seed NO knife/dart placeholders here —
  // a placeholder would mask the approximation.
  "adamant_arrow":80,
});
const gp = id => P[id] ?? 0;

// ---- Casket value (opened) ------------------------------------------
// The casket-open reward table isn't in the rev-274 text scripts (it's an
// opheld trigger in the binary pack), but the contents are well-established:
// coins, uncut gems (sapphire→diamond), a cosmic talisman, and — very rarely —
// the two halves of a key. We value the casket as the expected value of one
// open, computed LIVE from the price table so scraped gem/half-key prices flow
// through. Weights below are out of 128 (codebase convention): gems common→
// rare, half keys ~1/128 each (the jackpot that carries most of the EV).
const CASKET_TABLE = [
  { key:'coins',          name:'Coins ×100',      w:52, qty:100 },
  { key:'uncut_sapphire', name:'Uncut sapphire',  w:30, qty:1, fallback:1400 },
  { key:'uncut_emerald',  name:'Uncut emerald',   w:20, qty:1, fallback:4140 },
  { key:'uncut_ruby',     name:'Uncut ruby',      w:12, qty:1, fallback:2800 },
  { key:'cosmic_talisman',name:'Cosmic talisman', w:8,  qty:1, fallback:500 },
  { key:'uncut_diamond',  name:'Uncut diamond',   w:4,  qty:1, fallback:4100 },
  { key:'loop_half_key',  name:'Loop half of key',w:1,  qty:1, fallback:81200 },
  { key:'tooth_half_key', name:'Tooth half of key',w:1, qty:1, fallback:110000 },
];
function casketPrice(r){ return (P[r.key] != null) ? P[r.key] : (r.fallback ?? 0); }
function casketValue(){
  const total = CASKET_TABLE.reduce((s,r)=>s+r.w, 0);
  let ev = 0;
  for (const r of CASKET_TABLE) ev += (r.w / total) * r.qty * casketPrice(r);
  return Math.round(ev);
}
P.casket = casketValue();

// High alchemy values (gp) — high_alch = floor(cost * 0.6)
// RS2-era values; confirmed: adamant_full_helm=2112
// nature rune costs 265 gp → profit = alch - 265
const ALCH = {
  // rune
  rune_full_helm:20160, rune_med_helm:11520, rune_chainbody:29952,
  rune_scimitar:15360,  rune_longsword:19200, rune_dagger:4608, rune_2h_sword:38400,
  // adamant
  adamant_platelegs:9600, adamant_platebody:16128, adamant_full_helm:2112,
  adamant_spear:3120, adamant_kiteshield:2688,
  // mithril
  mithril_sq_shield:1170, mithril_kiteshield:1560, mithril_chainbody:2400,
  mithril_sword:780, mithril_mace:630, mithril_axe:576, mithril_2h_sword:1560,
  mithril_battleaxe:1248, mithril_spear:1200,
  // green d'hide armour (high_alch = floor(cost*0.6); body cost 7800, chaps 3900)
  dragonhide_body:4680, dragonhide_chaps:2340,
  // steel
  steel_full_helm:240, steel_med_helm:120, steel_kiteshield:168, steel_platelegs:480,
  steel_battleaxe:240, steel_longsword:192, steel_scimitar:120,
  steel_axe:96, steel_2h_sword:240, steel_sword:150,
  // troll-drop gear (approx, tier-consistent with the lists above)
  steel_warhammer:240, black_warhammer:576, adamant_warhammer:3120, adamant_med_helm:1248,
  steel_platebody:720, mithril_platebody:2340, adamant_axe:480, adamant_sq_shield:1152,
  rune_warhammer:23040,
  // black
  black_sword:576, black_axe:576, black_kiteshield:576,
  black_sq_shield:576, black_dagger:384,
  // iron
  iron_full_helm:84, iron_kiteshield:60, iron_battleaxe:96, iron_dagger:30,
  iron_sword:42, iron_longsword:60, iron_scimitar:60, iron_med_helm:72,
  // misc equipment
  fire_battlestaff:9000, magic_staff:192, staff_of_earth:900,
  plainstaff:48, druidrobetop:240, druidrobebottom:240,
  mithril_bar:720,
};

// =====================================================================
// SHARED DROP TABLES — verified from LostCityRS/Content@274
//   scripts/drop tables/scripts/shared_droptables.rs2
// Each proc rolls random(128) (unless noted) and walks an if-else chain.
// EV is computed directly from these exact weights × item prices.
// =====================================================================

// Value threshold for the 'value' loot pref (high-value-only): when a herb or
// jewel sub-table is set to 'value', any item worth <= this is left on the
// ground (not picked up). Used by ~randomherb and ~randomjewel. The filter is
// recomputed from live prices in recalcGemEV so a market sync flows through.
const VALUE_THRESHOLD = 2000;

// ---- [proc,randomherb] — random(128) --------------------------------
// Non-members get coins×10; we assume members worlds.
// 'loot' action: player identifies and sells each herb individually.
//   Price = per-herb identified market price (scraped per species).
// 'unid' action: sold as unidentified in stacks of 11.
//   Price = unidentified_guam price per herb (site normalises per item).
// 'value' action: only pick up herbs worth > VALUE_THRESHOLD each; cheap
//   species (guam/marrentill/tarromin/…) roll but are left on the ground.
const HERB_TABLE = [
  { name:'Guam',       weight:32, price: P.herb_guam        ?? P.guam_leaf       ?? P.unidentified_guam ?? 15   },
  { name:'Marrentill', weight:24, price: P.herb_marrentill  ?? P.marentill       ?? P.unidentified_guam ?? 12   },
  { name:'Tarromin',   weight:18, price: P.herb_tarromin    ?? P.unidentified_guam ?? 25   },
  { name:'Harralander',weight:14, price: P.herb_harralander ?? P.unidentified_guam ?? 45   },
  { name:'Ranarr',     weight:11, price: P.herb_ranarr      ?? P.unidentified_guam ?? 5000 },
  { name:'Irit',       weight:8,  price: P.herb_irit        ?? P.unidentified_guam ?? 80   },
  { name:'Avantoe',    weight:6,  price: P.herb_avantoe     ?? P.unidentified_guam ?? 1500 },
  { name:'Kwuarm',     weight:5,  price: P.herb_kwuarm      ?? P.unidentified_guam ?? 1200 },
  { name:'Cadantine',  weight:4,  price: P.herb_cadantine   ?? P.unidentified_guam ?? 1500 },
  { name:'Lantadyme',  weight:3,  price: P.herb_lantadyme   ?? P.unidentified_guam ?? 1800 },
  { name:'Dwarf weed', weight:3,  price: P.herb_dwarf_weed  ?? P.unidentified_guam ?? 2000 },
];
let HERB_EV = HERB_TABLE.reduce((s,h)=>s+h.weight*h.price,0) / 128;
// High-value-only EV: cheap herbs contribute 0 (left on the ground), so the
// junk weight just becomes "nothing" rather than being redistributed.
function herbEVHigh(){
  return HERB_TABLE.reduce((s,h)=> s + (h.price > VALUE_THRESHOLD ? h.weight*h.price : 0), 0) / 128;
}
let HERB_EV_HIGH = herbEVHigh();
// Count-based kept fraction: of all randomherb rolls, what share do you actually
// pick up under 'value'? Drives the inventory-slot model (junk left on the
// ground costs no slot, so fewer bank trips). NOT value-weighted — slot cost is
// per-item, not per-gp.
function herbKeepFrac(){
  return HERB_TABLE.reduce((s,h)=> s + (h.price > VALUE_THRESHOLD ? h.weight : 0), 0) / 128;
}
let HERB_KEEP_FRAC = herbKeepFrac();

// ---- [proc,megararetable] — random(128), returns NOTHING 113/128 ----
const MEGA_TABLE = [
  { name:'Rune spear',        weight:8, price: P.rune_spear     ?? 30000 },
  { name:'Dragon sq shield',  weight:4, price: P.dragonshield_a ?? 50000 },
  { name:'Dragon spear',      weight:3, price: P.dragon_spear   ?? 39000 },
];
// 113/128 nothing — EV divides by full 128.
let MEGA_EV = MEGA_TABLE.reduce((s,r)=>s+r.weight*r.price,0) / 128;

// ---- [proc,randomjewel] ---------------------------------------------
// Without RoW: random(128) — rolls 65..127 (63/128) return NOTHING.
// With RoW:    random(65)  — always lands in the valuable 0..64 band.
// keyhalf = crystal key halves. talisman slot ~ nature/chaos.
const JEWEL_TABLE = [
  { name:'Uncut sapphire', lo:0,  hi:32, price: P.uncut_sapphire ?? P.sapphire ?? 450  },
  { name:'Uncut emerald',  lo:32, hi:48, price: P.uncut_emerald  ?? P.emerald  ?? 680  },
  { name:'Uncut ruby',     lo:48, hi:56, price: P.uncut_ruby     ?? P.ruby     ?? 1050 },
  { name:'Uncut diamond',  lo:56, hi:58, price: P.uncut_diamond  ?? P.diamond  ?? 2200 },
  { name:'Rune javelin ×5',lo:58, hi:59, price: (P.rune_javelin ?? 150) * 5 },
  { name:'Half key (loop)',lo:59, hi:60, price: P.keyhalf1 ?? 12000 },
  { name:'Half key (tooth)',lo:60,hi:61, price: P.keyhalf2 ?? 12000 },
  // Source: nature talisman overground, chaos talisman underground (coordz>6400).
  // The sim can't track player plane, so assume chaos (also sub-2000, so the
  // 'value' filter leaves it on the ground either way — nobody banks these).
  { name:'Chaos talisman', lo:61, hi:65, price: P.chaos_talisman ?? 500 },
];
function jewelEV(denom){
  // each band contributes (hi-lo)/denom × price, but only bands with lo<denom count
  return JEWEL_TABLE.reduce((s,b)=> s + (Math.max(0, Math.min(b.hi,denom) - b.lo) / denom) * b.price, 0);
}
// High-value-only variant: bands worth <= VALUE_THRESHOLD (uncut sapphire,
// rune javelin, talisman) contribute 0 — they're left on the ground.
function jewelEVHigh(denom){
  return JEWEL_TABLE.reduce((s,b)=> s + (b.price > VALUE_THRESHOLD
    ? (Math.max(0, Math.min(b.hi,denom) - b.lo) / denom) * b.price : 0), 0);
}
// Count-based kept fraction of jewel rolls under 'value' (of rolls that yield
// SOMETHING — i.e. land in 0..denom). Used by the inventory-slot model.
function jewelKeepFrac(denom){
  return JEWEL_TABLE.reduce((s,b)=> s + (b.price > VALUE_THRESHOLD
    ? Math.max(0, Math.min(b.hi,denom) - b.lo) / denom : 0), 0);
}
let GEM_EV_BASE = jewelEV(128);  // 63/128 of rolls yield nothing
let GEM_EV_ROW  = jewelEV(65);   // RoW caps roll → always valuable
let GEM_EV_BASE_HIGH = jewelEVHigh(128);
let GEM_EV_ROW_HIGH  = jewelEVHigh(65);
let GEM_KEEP_FRAC_BASE = jewelKeepFrac(128);
let GEM_KEEP_FRAC_ROW  = jewelKeepFrac(65);
// expand list for the loot UI
const JEWEL_EXPAND = JEWEL_TABLE.map(b => ({ name:b.name, weight:b.hi-b.lo, price:b.price }));
// Mega-rare table is reachable from the jewel roll (rare sub-table) — show it.
JEWEL_EXPAND.push({ name:'→ Mega-rare table (rune spear · dragon sq shield · dragon spear)', weight:1, price:0 });

// Rebuild jewel-table prices from current ITEM_PRICES (after a market sync)
// and recompute the gem EVs. Keeps GameData.GEM_EV_* in sync with scraped data.
function recalcGemEV(){
  const priceFor = {
    'Uncut sapphire': P.uncut_sapphire ?? P.sapphire ?? 450,
    'Uncut emerald':  P.uncut_emerald  ?? P.emerald  ?? 680,
    'Uncut ruby':     P.uncut_ruby     ?? P.ruby     ?? 1050,
    'Uncut diamond':  P.uncut_diamond  ?? P.diamond  ?? 2200,
  };
  JEWEL_TABLE.forEach(b => { if (priceFor[b.name] != null) b.price = priceFor[b.name]; });
  JEWEL_EXPAND.forEach(e => { const t = JEWEL_TABLE.find(b=>b.name===e.name); if (t) e.price = t.price; });
  GEM_EV_BASE = jewelEV(128);
  GEM_EV_ROW  = jewelEV(65);
  GEM_EV_BASE_HIGH = jewelEVHigh(128);
  GEM_EV_ROW_HIGH  = jewelEVHigh(65);
  GEM_KEEP_FRAC_BASE = jewelKeepFrac(128);
  GEM_KEEP_FRAC_ROW  = jewelKeepFrac(65);
  // recompute herb EV from per-herb scraped prices
  const herbPrice = {
    'Guam':P.herb_guam, 'Marrentill':P.herb_marrentill, 'Tarromin':P.herb_tarromin,
    'Harralander':P.herb_harralander, 'Ranarr':P.herb_ranarr, 'Irit':P.herb_irit,
    'Avantoe':P.herb_avantoe, 'Kwuarm':P.herb_kwuarm, 'Cadantine':P.herb_cadantine,
    'Lantadyme':P.herb_lantadyme, 'Dwarf weed':P.herb_dwarf_weed,
  };
  HERB_TABLE.forEach(h => { if (herbPrice[h.name] != null) h.price = herbPrice[h.name]; });
  HERB_EV = HERB_TABLE.reduce((s,h)=>s+h.weight*h.price,0) / 128;
  HERB_EV_HIGH = herbEVHigh();
  HERB_KEEP_FRAC = herbKeepFrac();
  // Casket value depends on gem + half-key prices — refresh it too.
  P.casket = casketValue();
  return { GEM_EV_BASE, GEM_EV_ROW, GEM_EV_BASE_HIGH, GEM_EV_ROW_HIGH, HERB_EV, HERB_EV_HIGH };
}

// ---- [proc,ultrarare_getitem] — random(128) -------------------------
// Used by ~ultrarare drops. NOT affected by Ring of Wealth (separate path).
// Includes recursion into randomjewel (20/128) and megararetable (15/128).
const ULTRA_TABLE = [
  { name:'Nature rune ×67',  weight:3,  price:(P.naturerune??180)*67 },
  { name:'Adamant javelin ×20',weight:2,price:(P.adamant_javelin??50)*20 },
  { name:'Death rune ×45',   weight:2,  price:(P.deathrune??200)*45 },
  { name:'Law rune ×45',     weight:2,  price:(P.lawrune??240)*45 },
  { name:'Rune arrow ×42',   weight:2,  price:(P.rune_arrow??160)*42 },
  { name:'Steel arrow ×150', weight:2,  price:(P.steel_arrow??18)*150 },
  { name:'Rune 2h sword',    weight:3,  price: P.rune_2h ?? 38000 },
  { name:'Rune battleaxe',   weight:3,  price: P.rune_battleaxe ?? 25000 },
  { name:'Rune sq shield',   weight:2,  price: P.rune_sq_shield ?? 21000 },
  { name:'Dragon med helm',  weight:1,  price: P.dragon_med_helm ?? 60000 },
  { name:'Rune kiteshield',  weight:1,  price: P.rune_kiteshield ?? 32000 },
  { name:'Coins ×3000',      weight:21, price: 3000 },
  { name:'Half key (loop)',  weight:20, price: P.keyhalf1 ?? 12000 },
  { name:'Half key (tooth)', weight:20, price: P.keyhalf2 ?? 12000 },
  { name:'Runite bar',       weight:5,  price: P.runite_bar ?? 6500 },
  { name:'Dragonstone',      weight:2,  price: P.dragonstone ?? 16000 },
  { name:'Silver ore ×100',  weight:2,  price:(P.silver_ore??62)*100 },
  { name:'→ Random jewel',   weight:20, price: GEM_EV_BASE },
  { name:'→ Mega-rare table', weight:15, price: MEGA_EV },
];
const ULTRARARE_EV = ULTRA_TABLE.reduce((s,r)=>s+r.weight*r.price,0) / 128;
const ULTRA_EXPAND = ULTRA_TABLE.map(r => ({ name:r.name, weight:r.weight, price:r.price }));

// ---- drop helpers ---------------------------------------------------
// gemDrop: the gem roll has chance C of triggering. It then yields the
// randomjewel proc (which is itself partly nothing without RoW). We emit
// one row tagged 'gem' whose price flips between base/RoW EV.
function gemDrop(chance){
  const c = parseFloat(chance.toFixed(5));
  return [
    { name:'Random jewel (gem table)', chance:c, qtyAvg:1, price:GEM_EV_BASE,
      tag:'gem', _expand: JEWEL_EXPAND },
  ];
}
function herbDrop(chance, qty=1){
  return { name:'Random herb', chance:parseFloat(chance.toFixed(5)), qtyAvg:qty,
    price:HERB_EV, tag:'herb',
    _expand: HERB_TABLE.map(h=>({name:h.name, weight:h.weight, price:h.price})) };
}
// Casket (opened) modelled as a sub-table like the gem table: one row whose
// price is the live EV of its contents, expandable to show what's inside.
function casketDrop(chance){
  return { name:'Casket (opened)', key:'casket', chance:parseFloat(chance.toFixed(5)),
    qtyAvg:1, price:casketValue(), tag:'casket',
    _expand: CASKET_TABLE.map(r=>({ name:r.name, weight:r.w, price:casketPrice(r)*r.qty })) };
}
function ultrarareDrop(chance){
  return { name:'Ultra-rare drop table', chance:parseFloat(chance.toFixed(6)), qtyAvg:1,
    price:ULTRARARE_EV, tag:'ultrarare', _expand: ULTRA_EXPAND };
}
const w = (weight, total=128) => parseFloat((weight/total).toFixed(5));
function d(name, weight, qty, itemId){
  const id = itemId ?? name.toLowerCase().replace(/[\s×\d]+$/,'').replace(/\s/g,'_').replace(/[^a-z0-9_]/g,'');
  return { name, key:id, chance:w(weight), qtyAvg:qty, price:gp(id), alchValue:ALCH[id]??0 };
}
function coins(weight, qty){ return { name:'Coins', key:'coins', chance:w(weight), qtyAvg:qty, price:1, alchValue:0 }; }
function always(name, qty, itemId){
  const id = itemId ?? name.toLowerCase().replace(/\s/g,'_');
  return { name, key:id, chance:1, qtyAvg:qty, price:gp(id), alchValue:ALCH[id]??0 };
}

// Dagannoth shared drop table — verbatim from horror_dagannoth.rs2
// ([ai_queue3,_dagganoth], random(128)). Low-value fishing-themed table.
// death_drop = bones (guaranteed). Both lvl 74 & 92 dagannoths use this.
function DAGANNOTH_LOOT(){
  return [
    always('Bones',1,'bones'),
    d('Iron spear',6,1,'iron_spear'),
    d('Bronze spear',5,1,'bronze_spear'),
    d('Mithril spear',1,1,'mithril_spear'),
    d('Water rune ×15',4,15,'waterrune'),
    d('Steel arrow ×15',2,15,'steel_arrow'),
    d('Mithril javelin ×3',1,3,'mithril_javelin'),
    d('Lobster pot',12,1,'lobster_pot'),
    d('Raw herring ×3',4,3,'raw_herring'),
    d('Raw sardine ×5',4,5,'raw_sardine'),
    d('Harpoon',3,1,'harpoon'),
    d('Feather ×15',2,15,'feather'),
    d('Fishing bait ×50',2,50,'fishing_bait'),
    d('Raw lobster',2,1,'raw_lobster'),
    d('Raw tuna',2,1,'raw_tuna'),
    d('Seaweed ×10',2,10,'seaweed'),
    d('Oyster pearls',1,1,'bigoysterpearls'),
    d('Oyster pearl',1,1,'smalloysterpearls'),
    coins(29,56), coins(9,25), coins(8,44), coins(6,41),
    d('Opal bolt tips ×12',2,12,'opal_bolttips'),
    casketDrop(1/128),
    gemDrop(1/128),
  ];
}

// Elf warrior shared drop table — verbatim from
// quest_regicide/scripts/regicide_darkelf.rs2 ([ai_queue3,_elf_warrior],
// random(128)) @274. Both the lvl-90 (crystal bow) and lvl-108 (crystal halberd)
// Tirannwn elf warriors share this single table (category=elf_warrior).
// death_drop = bones (guaranteed). Tertiary: hard clue scroll (~trail_hardcluedrop).
function ELF_WARRIOR_LOOT(){
  return [
    always('Bones',1,'bones'),
    d('Green d\'hide body',4,1,'dragonhide_body'),
    d('Green d\'hide chaps',3,1,'dragonhide_chaps'),
    d('Mithril spear',2,1,'mithril_spear'),
    d('Mithril kiteshield',1,1,'mithril_kiteshield'),
    d('Adamant full helm',1,1,'adamant_full_helm'),
    d('Rune dagger',1,1,'rune_dagger'),
    d('Water rune ×70',8,70,'waterrune'),
    d('Nature rune ×12',5,12,'naturerune'),
    d('Law rune ×2',3,2,'lawrune'),
    d('Fire rune ×37',3,37,'firerune'),
    herbDrop(w(15)),
    coins(29,44), coins(10,180), coins(5,20),
    d('Bass',3,1,'bass'),
    d('Shark',3,1,'shark'),
    d('Adamantite ore',1,1,'adamantite_ore'),
    gemDrop(w(5)),
  ];
}

const MONSTERS = [

  // =====================================================================
  // TIER 1 — LOW LEVEL
  // =====================================================================

  { id:'chicken', name:'Chicken', level:1, hp:3, attack:1, strength:1, defLevel:1, defStab:-42, defSlash:-42, defCrush:-42, defRange:-42, defMagic:-42, attBonus:-47, strBonus:-42, attackSpeed:4,
    loot:[ always('Bones',1,'bones'), always('Feathers',5,'feather'), always('Raw chicken',1,'raw_chicken') ] },

  { id:'cow', name:'Cow', level:2, hp:8, attack:1, strength:1, defLevel:1, defStab:-21, defSlash:-21, defCrush:-21, defRange:-21, defMagic:-21, attBonus:-15, strBonus:-15, attackSpeed:4,
    loot:[ always('Cowhide',1,'cow_hide'), always('Raw beef',1,'raw_beef') ] },


  { id:'goblin', name:'Goblin', level:2, hp:5, attack:1, strength:1, defLevel:1, defStab:-15, defSlash:-15, defCrush:-15, defRange:-15, defMagic:-15, attBonus:-21, strBonus:-15, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      coins(1,1), coins(2,20), coins(3,15), coins(3,9),
      d('Bronze sq shield',3,1,'bronze_sq_shield'),
      d('Earth rune ×4',3,4,'earthrune'),
      d('Bolts ×8',3,8,'bolt'),
      d("Chef's hat",3,1,'chefs_hat'),
      d('Body rune ×7',5,7,'bodyrune'),
      d('Goblin armour',5,1,'goblin_armour'),
      d('Water rune ×6',6,6,'waterrune'),
      coins(18,5),
      d('Brass necklace',1,1,'brass_necklace'),
      d('Air talisman',1,1,'air_talisman'),
      d('Beer',2,1,'beer'),
    ] },

  { id:'man', name:'Man', level:2, hp:7, attack:1, strength:1, defLevel:1, defStab:-21, defSlash:-21, defCrush:-21, defRange:-21, defMagic:-21, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Iron dagger',1,1,'iron_dagger'),
      d('Bronze med helm',2,1,'iron_full_helm'),
      d('Bronze arrow ×7',3,7,'bronze_arrow'),
      d('Earth rune ×4',2,4,'earthrune'),
      d('Fire rune ×6',2,6,'firerune'),
      d('Mind rune ×9',2,9,'mindrune'),
      d('Chaos rune ×2',1,2,'chaosrune'),
      d('Earth talisman',2,1,'earth_talisman'),
      herbDrop(w(23)),
      coins(38,3), coins(9,5), coins(4,15), coins(1,25),
    ] },

  // NPC config @274: areas/area_alkharid/configs/alkharid.npc (verified exact).
  // Drop table: shares man_drop_table (scripts/drop tables/scripts/man.rs2).
  { id:'al_kharid_warrior', name:'Al-Kharid warrior', level:9, hp:19, attack:7, strength:5, defLevel:4, attBonus:10, strBonus:9, defStab:12, defSlash:15, defCrush:10, defRange:12, defMagic:-1, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Iron dagger',1,1,'iron_dagger'),
      d('Bronze med helm',2,1,'iron_full_helm'),
      d('Bronze arrow ×7',3,7,'bronze_arrow'),
      d('Earth rune ×4',2,4,'earthrune'),
      d('Fire rune ×6',2,6,'firerune'),
      d('Mind rune ×9',2,9,'mindrune'),
      d('Chaos rune ×2',1,2,'chaosrune'),
      d('Earth talisman',2,1,'earth_talisman'),
      herbDrop(w(23)),
      coins(38,3), coins(9,5), coins(4,15), coins(1,25),
    ] },

  { id:'farmer', name:'Farmer', level:7, hp:12, attack:3, strength:4, defLevel:8, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attBonus:5, strBonus:6, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Bronze med helm',2,1,'iron_full_helm'),
      d('Iron dagger',1,1,'iron_dagger'),
      d('Bronze arrow ×7',3,7,'bronze_arrow'),
      d('Earth rune ×4',2,4,'earthrune'),
      d('Fire rune ×6',2,6,'firerune'),
      d('Mind rune ×9',2,9,'mindrune'),
      d('Chaos rune ×2',1,2,'chaosrune'),
      herbDrop(w(11)),
      coins(38,3), coins(23,10), coins(9,5), coins(4,15), coins(1,25),
    ] },

  { id:'barbarian', name:'Barbarian', level:7, hp:14, attack:6, strength:6, defLevel:2, defStab:12, defSlash:15, defCrush:13, defRange:6, defMagic:3, attBonus:8, strBonus:7, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Bronze axe',6,1,'bronze_axe'),
      d('Staff',4,1,'plainstaff'),
      d('Iron mace',1,1,'iron_mace'),
      d('Chaos rune ×2',5,2,'chaosrune'),
      d('Bronze arrow ×15',3,15,'bronze_arrow'),
      d('Earth rune ×2',3,2,'earthrune'),
      d('Fire rune ×5',2,5,'firerune'),
      d('Mind rune ×5',2,5,'mindrune'),
      d('Law rune ×2',1,2,'lawrune'),
      coins(42,5), coins(9,8), coins(5,17), coins(3,27),
    ] },

  { id:'dark_wizard', name:'Dark Wizard (lvl 7)', level:7, hp:12, attack:5, strength:2, defLevel:5, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:3, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Staff',8,1,'plainstaff'),
      d('Black wizard hat',4,1,'chefs_hat'),
      d('Black robe',3,1,'goblin_armour'),
      d('Earth rune ×36',4,36,'earthrune'), d('Air rune ×10',3,10,'airrune'), d('Water rune ×10',3,10,'waterrune'),
      d('Earth rune ×10',3,10,'earthrune'), d('Fire rune ×10',3,10,'firerune'),
      d('Air rune ×18',2,18,'airrune'), d('Water rune ×18',2,18,'waterrune'),
      d('Earth rune ×18',2,18,'earthrune'), d('Fire rune ×18',2,18,'firerune'),
      d('Nature rune ×4',7,4,'naturerune'), d('Chaos rune ×5',6,5,'chaosrune'),
      d('Mind rune ×10',3,10,'mindrune'), d('Body rune ×10',3,10,'bodyrune'),
      d('Mind rune ×18',2,18,'mindrune'), d('Body rune ×18',2,18,'bodyrune'),
      d('Cosmic rune ×2',1,2,'cosmicrune'), d('Law rune ×3',1,3,'lawrune'),
      coins(17,1), coins(16,2), coins(7,4), coins(3,29), coins(1,30),
      d('Water talisman',2,1,'water_talisman'), d('Fire talisman',2,1,'fire_talisman'),
    ] },

  { id:'dark_wizard_20', name:'Dark Wizard (lvl 20)', level:20, hp:24, attack:17, strength:17, defLevel:14, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:3, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Black wizard hat',4,1,'chefs_hat'), d('Staff',4,1,'plainstaff'), d('Black robe',3,1,'goblin_armour'),
      d('Earth rune ×36',4,36,'earthrune'), d('Air rune ×10',3,10,'airrune'), d('Water rune ×10',3,10,'waterrune'),
      d('Earth rune ×10',3,10,'earthrune'), d('Fire rune ×10',3,10,'firerune'),
      d('Air rune ×18',2,18,'airrune'), d('Earth rune ×18',2,18,'earthrune'),
      d('Nature rune ×4',7,4,'naturerune'), d('Chaos rune ×4',6,4,'chaosrune'),
      d('Mind rune ×10',3,10,'mindrune'), d('Body rune ×10',3,10,'bodyrune'),
      d('Cosmic rune ×2',1,2,'cosmicrune'), d('Law rune ×3',1,3,'lawrune'),
      coins(17,1), coins(16,2), coins(9,4), coins(3,29), coins(1,30),
      d('Water talisman',2,1,'water_talisman'), d('Fire talisman',2,1,'fire_talisman'),
    ] },

  { id:'wizard', name:'Wizard', level:9, hp:14, attack:8, strength:8, defLevel:5, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:3, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Staff',8,1,'plainstaff'), d('Wizard robe',7,1,'goblin_armour'), d('Blue wizard hat',3,1,'chefs_hat'),
      d('Chaos rune ×2',8,2,'chaosrune'), d('Nature rune ×2',8,2,'naturerune'),
      d('Air rune ×5',3,5,'airrune'), d('Body rune ×5',3,5,'bodyrune'), d('Earth rune ×5',3,5,'earthrune'),
      d('Fire rune ×5',3,5,'firerune'), d('Mind rune ×5',3,5,'mindrune'), d('Water rune ×5',3,5,'waterrune'),
      d('Air rune ×12',2,12,'airrune'), d('Mind rune ×12',2,12,'mindrune'),
      d('Law rune ×2',1,2,'lawrune'),
      d('Mind talisman',3,1,'mind_talisman'), d('Water talisman',3,1,'water_talisman'),
      coins(23,1), coins(9,2), coins(7,18), coins(1,30),
    ] },

  { id:'highwayman', name:'Highwayman', level:5, hp:13, attack:2, strength:2, defLevel:2, defStab:0, defSlash:3, defCrush:2, defRange:2, defMagic:0, attBonus:6, strBonus:7, attackSpeed:4,
    loot:[ always('Bones',1,'bones'), always('Black cape',1,'black_cape') ] },


  { id:'bear', name:'Bear', level:19, hp:25, attack:15, strength:16, defLevel:13, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attackSpeed:4,
    loot:[ always('Bones',1,'bones'), always('Fur',1,'fur'), always('Raw bear meat',1,'raw_bear_meat') ] },

  // =====================================================================
  // TIER 2 — MID LOW
  // =====================================================================

  { id:'guard', name:'Guard', level:21, hp:22, attack:19, strength:18, defLevel:14, defStab:18, defSlash:25, defCrush:19, defRange:20, defMagic:-4, attBonus:4, strBonus:5, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Iron dagger',6,1,'iron_dagger'),
      d('Body talisman',3,1,'body_talisman'),
      d('Steel arrow ×1',14,1,'steel_arrow'), d('Bronze arrow ×1',3,1,'bronze_arrow'),
      d('Air rune ×6',2,6,'airrune'), d('Earth rune ×3',2,3,'earthrune'),
      d('Fire rune ×2',2,2,'firerune'), d('Bronze arrow ×2',2,2,'bronze_arrow'),
      d('Chaos rune ×1',1,1,'chaosrune'), d('Nature rune ×1',1,1,'naturerune'), d('Steel arrow ×5',1,5,'steel_arrow'),
      coins(19,1), coins(18,5), coins(16,7), coins(9,12), coins(8,4), coins(4,25), coins(4,17), coins(2,30),
    ] },

  // Tribesman (Tai Bwo Wannai) — drop table EXACT from tribesman.rs2 @274
  // (random(138), death_drop = bones guaranteed; medium-clue tertiary omitted).
  // Combat stats are OSRS-based 2004 approximations: level 32, 30 HP. Magic 1.
  // Chances use the /138 denominator (w(weight,138)).
  { id:'tribesman', name:'Tribesman', level:32, hp:30, attack:28, strength:28, defLevel:24, magicLevel:1,
    defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attBonus:8, strBonus:5, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Bronze spear',7,1,'bronze_spear'),
      { name:'Steel javelin ×10', key:'steel_javelin', chance:w(3,138), qtyAvg:10, price:gp('steel_javelin'), alchValue:ALCH['steel_javelin']??0 },
      { name:'Poison bolts ×4', key:'bolt', chance:w(2,138), qtyAvg:4, price:gp('bolt'), alchValue:0 },
      d('Iron spear',2,1,'iron_spear'),
      { name:'Steel arrow(p) ×5', key:'steel_arrow', chance:w(2,138), qtyAvg:5, price:gp('steel_arrow'), alchValue:ALCH['steel_arrow']??0 },
      { name:'Mithril javelin ×10', key:'mithril_javelin', chance:w(2,138), qtyAvg:10, price:gp('mithril_javelin'), alchValue:0 },
      d('Mithril spear',1,1,'mithril_spear'),
      d('Unid. rogues purse',5,1,'unidentified_rogues_purse'),
      d('Unid. snake weed',5,1,'unidentified_snake_weed'),
      { ...herbDrop(w(11,138)) },
      coins(25,15), coins(5,62),
      d('Snape grass',20,1,'snape_grass'),
      d('Limpwurt root',12,1,'limpwurt_root'),
      d('Cleaning cloth',12,1,'tbwt_cleaning_cloth'),
      d('Nature rune ×3',8,3,'naturerune'),
      d('Gold ore',5,1,'gold_ore'),
      d('Antipoison (2)',3,1,'antipoison2'),
      d('Antipoison (3)',1,1,'antipoison3'),
      d('Bread',1,1,'bread'),
      d('Tin ore',1,1,'tin_ore'),
      d('Pot of flour',1,1,'pot_flour'),
      gemDrop(w(2,138)),
    ] },

  { id:'dwarf', name:'Dwarf', level:10, hp:16, attack:8, strength:8, defLevel:6, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:5, attBonus:5, strBonus:7, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Bronze pickaxe',13,1,'bronze_axe'), d('Bronze med helm',4,1,'iron_full_helm'),
      d('Bronze battleaxe',2,1,'bronze_axe'), d('Iron battleaxe',1,1,'iron_battleaxe'),
      d('Chaos rune ×2',4,2,'chaosrune'), d('Nature rune ×2',4,2,'naturerune'),
      coins(20,4), coins(15,10), coins(2,30),
      d('Hammer',10,1,'bronze_axe'), d('Bronze bar',7,1,'bronze_bar'),
      d('Iron ore',3,1,'iron_ore'), d('Tin ore',3,1,'tin_ore'), d('Copper ore',3,1,'copper_ore'),
      d('Iron bar',2,1,'iron_bar'), d('Coal',1,1,'coal'),
      gemDrop(w(1)),
    ] },

  { id:'dark_warrior', name:'Dark Warrior', level:8, hp:17, attack:5, strength:5, defLevel:5, defStab:96, defSlash:79, defCrush:59, defRange:0, defMagic:0, attBonus:20, strBonus:16, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Bronze med helm',3,1,'iron_full_helm'), d('Iron mace',1,1,'iron_mace'),
      d('Black med helm',1,1,'iron_full_helm'), d('Black mace',1,1,'iron_mace'),
      d('Mind rune ×2',3,2,'mindrune'), d('Water rune ×3',2,3,'waterrune'), d('Earth rune ×2',1,2,'earthrune'),
      d('Bronze arrow ×8',4,8,'bronze_arrow'), d('Chaos rune ×2',1,2,'chaosrune'), d('Nature rune ×3',2,3,'naturerune'),
      herbDrop(w(3)),
      coins(31,1), coins(20,2), coins(20,6), coins(7,13), coins(6,20), coins(2,30),
      d('Iron ore',1,1,'iron_ore'),
    ] },

  { id:'pirate', name:'Pirate', level:23, hp:20, attack:20, strength:20, defLevel:20, defStab:0, defSlash:1, defCrush:0, defRange:0, defMagic:0, attBonus:10, strBonus:9, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Iron dagger',6,1,'iron_dagger'), d('Bronze scimitar',4,1,'bronze_scimitar'),
      d('Iron platebody',1,1,'iron_platebody'),
      d('Chaos rune ×2',6,2,'chaosrune'), d('Nature rune ×2',5,2,'naturerune'),
      d('Bronze arrow ×9',3,9,'bronze_arrow'), d('Bronze arrow ×12',2,12,'bronze_arrow'),
      d('Air rune ×10',2,10,'airrune'), d('Earth rune ×9',2,9,'earthrune'),
      d('Fire rune ×5',2,5,'firerune'), d('Law rune ×2',1,2,'lawrune'),
      coins(29,4), coins(13,25), coins(8,7), coins(6,12), coins(4,35), coins(1,55),
      d('Eye patch',12,1,'eye_patch'), d('Chef\'s hat',1,1,'chefs_hat'),
      d('Iron bar',1,1,'iron_bar'), gemDrop(1/128),
    ] },

  { id:'thug', name:'Thug', level:10, hp:18, attack:7, strength:5, defLevel:9, defStab:2, defSlash:3, defCrush:3, defRange:0, defMagic:0, attBonus:5, strBonus:5, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Iron med helm',4,1,'iron_full_helm'), d('Iron battleaxe',2,1,'iron_battleaxe'), d('Steel axe',1,1,'steel_axe'),
      d('Nature rune ×2',13,2,'naturerune'), d('Chaos rune ×2',4,2,'chaosrune'),
      d('Cosmic rune ×2',1,2,'cosmicrune'), d('Law rune ×2',1,2,'lawrune'), d('Death rune ×2',1,2,'deathrune'),
      herbDrop(w(24)),
      d('Iron ore',4,1,'iron_ore'), d('Iron bar',3,1,'iron_bar'), d('Coal',2,1,'coal'),
      coins(23,8), coins(12,15), coins(2,30), coins(1,20),
    ] },

  { id:'chaos_druid', name:'Chaos Druid', level:13, hp:20, attack:8, strength:8, defLevel:12, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Law rune ×2',7,2,'lawrune'), d('Air rune ×36',3,36,'airrune'),
      d('Body rune ×9',2,9,'bodyrune'), d('Earth rune ×9',2,9,'earthrune'),
      d('Mind rune ×12',2,12,'mindrune'), d('Nature rune ×3',1,3,'naturerune'),
      herbDrop(w(35)), herbDrop(w(11),2),
      coins(5,3), coins(5,8), coins(3,29), coins(1,35),
      d('Vial of water',10,1,'vial_water'),
      gemDrop(w(1)),
    ] },

  // NPC config @274: areas/area_taverly/configs/taverly.npc
  { id:'druid', name:'Druid', level:33, hp:30, attack:28, strength:28, defLevel:32, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attBonus:0, strBonus:0, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Earth rune ×27',4,27,'earthrune'), d('Water rune ×9',2,9,'waterrune'),
      d('Earth rune ×9',2,9,'earthrune'), d('Fire rune ×9',2,9,'firerune'),
      d('Chaos rune ×3',2,3,'chaosrune'), d('Law rune ×2',1,2,'lawrune'),
      herbDrop(w(26)),
      coins(10,2), coins(4,4), coins(3,1), coins(3,15), coins(1,20),
      d('Vial (empty)',10,1,'vial_empty'),
      d('Iron dagger',6,1,'iron_dagger'),
      d('Druid robe top',6,1,'druidrobetop'), d('Druid robe bottom',5,1,'druidrobebottom'),
      d('Limpwurt root',3,1,'limpwurt_root'),
    ] },

  // Otherworldly being (Zanaris / Lost City) — combat 64, melee (crush).
  // EXACT stats from LostCityRS/Content all.npc (osrs npc_2843, vislvl 1:1):
  // hp 66, att/str 56, def 46; def bonuses stab15/slash10/crush20/range15/MAGIC -5
  // (negative magic def → weak to magic, per the wiki). death_drop=null (no
  // guaranteed bones — ethereal). Drop table verbatim from
  // otherworldly_being.rs2 ([ai_queue3], random(128)). No clue. ~18/128 nothing.
  { id:'otherworldly_being', name:'Otherworldly being', level:64, hp:66, attack:56, strength:56, defLevel:46, defStab:15, defSlash:10, defCrush:20, defRange:15, defMagic:-5, attackSpeed:4,
    loot:[
      d('Nature rune ×5',9,5,'naturerune'),
      d('Chaos rune ×4',8,4,'chaosrune'),
      d('Law rune ×2',7,2,'lawrune'),
      d('Cosmic rune ×2',5,2,'cosmicrune'),
      d('Death rune ×2',4,2,'deathrune'),
      d('Blood rune ×2',1,2,'bloodrune'),
      herbDrop(w(10)),
      coins(59,15),
      d('Ruby ring',2,1,'ruby_ring'),
      d('Mithril mace',1,1,'mithril_mace'),
      d('Mackerel',1,1,'mackerel'),
      gemDrop(w(3)),
    ] },

  // =====================================================================
  // TIER 3 — MID
  // =====================================================================

  { id:'skeleton_unarmed', name:'Skeleton (unarmed)', level:21, hp:24, attack:17, strength:17, defLevel:17, defStab:5, defSlash:5, defCrush:-5, defRange:5, defMagic:0, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Bronze arrow ×2',7,2,'bronze_arrow'), d('Bronze arrow ×5',4,5,'bronze_arrow'),
      d('Iron arrow',4,1,'iron_arrow'), d('Air rune ×15',2,15,'airrune'),
      d('Earth rune ×3',2,3,'earthrune'), d('Fire rune ×2',2,2,'firerune'),
      d('Chaos rune ×3',2,3,'chaosrune'), d('Nature rune ×3',1,3,'naturerune'),
      d('Steel arrow',1,1,'steel_arrow'), herbDrop(21/128),
      coins(18,2), coins(15,12), coins(7,4), coins(4,16),
      coins(4,25), coins(4,33), coins(1,48),
      d('Iron dagger',6,1,'iron_dagger'), d('Fire talisman',2,1,'fire_talisman'),
      d('Iron ore',1,1,'iron_ore'), d('Grain',1,1,'grain'),
      gemDrop(1/128),
    ] },

  { id:'skeleton_armed', name:'Skeleton (armed)', level:22, hp:29, attack:15, strength:18, defLevel:17, defStab:9, defSlash:11, defCrush:-2, defRange:4, defMagic:1, attBonus:15, strBonus:14, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Iron med helm',6,1,'iron_med_helm'), d('Iron sword',4,1,'iron_sword'),
      d('Iron axe',2,1,'iron_axe'), d('Iron scimitar',1,1,'iron_scimitar'),
      d('Air rune ×15',3,15,'airrune'), d('Water rune ×9',3,9,'waterrune'),
      d('Chaos rune ×5',3,5,'chaosrune'), d('Iron arrow ×12',2,12,'iron_arrow'),
      d('Law rune ×2',2,2,'lawrune'), d('Cosmic rune ×2',1,2,'cosmicrune'),
      herbDrop(20/128),
      coins(24,10), coins(25,5), coins(8,25), coins(4,45),
      coins(3,65), coins(2,1),
      d('Bronze bar',5,1,'bronze_bar'), gemDrop(2/128),
    ] },

  { id:'zombie_unarmed', name:'Zombie (unarmed)', level:13, hp:22, attack:8, strength:9, defLevel:10, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Bronze med helm',4,1,'bronze_med_helm'), d('Bronze longsword',1,1,'bronze_longsword'),
      d('Iron axe',1,1,'iron_axe'), d('Iron arrow ×5',7,5,'iron_arrow'),
      d('Body rune ×6',5,6,'bodyrune'), d('Mind rune ×5',5,5,'mindrune'),
      d('Air rune ×13',4,13,'airrune'), d('Iron arrow ×8',4,8,'iron_arrow'),
      d('Steel arrow ×5',2,5,'steel_arrow'), d('Nature rune ×6',1,6,'naturerune'),
      herbDrop(25/128),
      coins(11,10), coins(4,4), coins(3,18), coins(2,13), coins(2,28),
      d('Fishing bait ×5',37,5,'fishing_bait'), d('Copper ore',2,1,'copper_ore'),
    ] },

  { id:'zombie_armed', name:'Zombie (armed)', level:24, hp:30, attack:19, strength:21, defLevel:16, defStab:9, defSlash:8, defCrush:12, defRange:11, defMagic:10, attBonus:5, strBonus:7, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Iron mace',3,1,'iron_mace'), d('Iron dagger',2,1,'iron_dagger'),
      d('Bronze kiteshield',1,1,'bronze_kiteshield'), d('Mithril arrow',3,1,'mithril_arrow'),
      d('Air rune ×3',3,3,'airrune'), d('Body rune ×3',2,3,'bodyrune'),
      d('Chaos rune ×4',1,4,'chaosrune'), d('Cosmic rune ×2',1,2,'cosmicrune'),
      d('Fire rune ×7',1,7,'firerune'), herbDrop(30/128),
      coins(10,10), coins(21,18), coins(8,26), coins(6,35), coins(2,1),
      d('Fishing bait ×7',26,7,'fishing_bait'), d('Tinderbox',2,1,'tinderbox'),
      d('Eye of newt',1,1,'eye_of_newt'), d('Tin ore',1,1,'tin_ore'),
      gemDrop(1/128),
    ] },

  // NPC config @274: areas/area_wilderness/configs/bandit_camp.npc (brawling_bandit; note: cfg vislvl 22)
  { id:'bandit', name:'Bandit', level:22, hp:27, attack:17, strength:17, defLevel:17, defStab:0, defSlash:3, defCrush:2, defRange:0, defMagic:0, attBonus:11, strBonus:12, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Iron scimitar',4,1,'iron_scimitar'), d('Steel sq shield',2,1,'mithril_sq_shield'), d('Steel axe',1,1,'steel_axe'),
      d('Chaos rune ×6',3,6,'chaosrune'), d('Water rune ×9',3,9,'waterrune'),
      d('Air rune ×10',2,10,'airrune'), d('Death rune ×2',2,2,'deathrune'),
      d('Law rune ×3',2,3,'lawrune'), d('Mind rune ×2',1,2,'mindrune'), d('Nature rune ×2',1,2,'naturerune'),
      herbDrop(w(37)),
      coins(26,35), coins(13,12), coins(10,53), coins(7,1), coins(2,80),
      d('Coal',6,1,'coal'),
      gemDrop(w(3)),
    ] },

  // NPC config @274: areas/area_yanille/configs/yanille.npc
  { id:'chaos_druid_warrior', name:'Chaos Druid Warrior', level:37, hp:40, attack:32, strength:34, defLevel:25, defStab:13, defSlash:17, defCrush:14, defRange:14, defMagic:-4, attBonus:9, strBonus:5, attackSpeed:5,
    loot:[
      always('Bones',1,'bones'),
      d('Black dagger',1,1,'black_dagger'),
      d('Fire rune ×12',5,12,'firerune'), d('Law rune ×2',4,2,'lawrune'),
      d('Earth rune ×9',2,9,'earthrune'), d('Air rune ×36',1,36,'airrune'), d('Nature rune ×3',1,3,'naturerune'),
      herbDrop(w(34)), herbDrop(w(10),2),
      d('White berries',5,1,'white_berries'), d('Unicorn horn dust',2,1,'unicorn_horn_dust'),
      d('Limpwurt root',1,1,'limpwurt_root'), d('Limpwurt root ×2',1,2,'limpwurt_root'),
      d('Snape grass',1,1,'snape_grass'), d('Vial of water',1,1,'vial_water'),
      coins(15,3), coins(3,29), coins(1,10),
      gemDrop(w(1)),
    ] },

  { id:'black_knight', name:'Black Knight', level:33, hp:42, attack:25, strength:25, defLevel:25, defStab:73, defSlash:76, defCrush:70, defRange:72, defMagic:-11, attBonus:18, strBonus:16, attackSpeed:5,
    loot:[
      always('Bones',1,'bones'),
      d('Iron sword',4,1,'iron_sword'), d('Iron full helm',2,1,'iron_full_helm'), d('Steel mace',1,1,'steel_mace'),
      d('Mithril arrow ×3',4,3,'mithril_arrow'), d('Body rune ×9',3,9,'bodyrune'),
      d('Chaos rune ×6',3,6,'chaosrune'), d('Earth rune ×10',3,10,'earthrune'),
      d('Death rune ×2',2,2,'deathrune'), d('Law rune ×3',2,3,'lawrune'),
      d('Cosmic rune ×7',1,7,'cosmicrune'), d('Mind rune ×2',1,2,'mindrune'),
      herbDrop(w(3)),
      d('Steel bar',6,1,'steel_bar'),
      coins(21,35), coins(14,1), coins(11,6), coins(10,58), coins(9,12), coins(2,80),
      gemDrop(w(3)),
    ] },

  // =====================================================================
  // TIER 4 — MID HIGH
  // =====================================================================

  { id:'giant', name:'Hill Giant', level:28, hp:35, attack:18, strength:22, defLevel:26,
    defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attBonus:18, strBonus:16, attackSpeed:6,
    loot:[
      always('Big bones',1,'big_bones'),
      d('Iron full helm',5,1,'iron_full_helm'), d('Iron dagger',4,1,'iron_dagger'),
      d('Iron kiteshield',3,1,'iron_kiteshield'), d('Steel longsword',2,1,'steel_longsword'),
      d('Iron arrow ×3',6,3,'iron_arrow'), d('Fire rune ×15',3,15,'firerune'),
      d('Water rune ×7',3,7,'waterrune'), d('Law rune ×2',3,2,'lawrune'),
      d('Steel arrow ×10',2,10,'steel_arrow'), d('Mind rune ×3',2,3,'mindrune'),
      d('Cosmic rune ×2',2,2,'cosmicrune'), d('Nature rune ×6',2,6,'naturerune'),
      d('Chaos rune ×2',1,2,'chaosrune'), d('Death rune ×2',1,2,'deathrune'),
      herbDrop(w(7)),
      coins(14,38), coins(8,15), coins(2,52), coins(4,8), coins(2,88),
      d('Limpwurt root',11,1,'limpwurt_root'), d('Beer',6,1,'beer'), d('Body talisman',2,1,'body_talisman'),
      gemDrop(w(3)),
    ] },

  { id:'hobgoblin_armed', name:'Hobgoblin (armed)', level:42, hp:49, attack:33, strength:31, defLevel:36, defStab:1, defSlash:1, defCrush:0, defRange:0, defMagic:0, attBonus:8, strBonus:10, attackSpeed:6,
    loot:[
      always('Bones',1,'bones'),
      d('Iron sword',3,1,'iron_sword'), d('Steel dagger',3,1,'steel_dagger'), d('Steel longsword',1,1,'steel_longsword'),
      d('Law rune ×2',3,2,'lawrune'), d('Water rune ×2',2,2,'waterrune'), d('Fire rune ×7',2,7,'firerune'),
      d('Body rune ×6',2,6,'bodyrune'), d('Chaos rune ×3',2,3,'chaosrune'), d('Nature rune ×4',2,4,'naturerune'),
      d('Cosmic rune ×2',1,2,'cosmicrune'), herbDrop(7/128),
      coins(16,15), coins(12,28), coins(12,5), coins(4,62), coins(3,42), coins(1,1),
      d('Limpwurt root',22,1,'limpwurt_root'), d('Goblin armour',2,1,'goblin_armour'), gemDrop(2/128),
    ] },

  { id:'hobgoblin_unarmed', name:'Hobgoblin', level:28, hp:29, attack:22, strength:24, defLevel:24, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Iron sword',3,1,'iron_sword'), d('Steel dagger',3,1,'steel_dagger'), d('Steel longsword',1,1,'steel_longsword'),
      d('Law rune ×2',3,2,'lawrune'), d('Water rune ×2',2,2,'waterrune'),
      d('Fire rune ×7',2,7,'firerune'), d('Body rune ×6',2,6,'bodyrune'),
      d('Chaos rune ×3',2,3,'chaosrune'), d('Nature rune ×4',2,4,'naturerune'), d('Cosmic rune ×2',1,2,'cosmicrune'),
      herbDrop(w(7)),
      coins(16,15), coins(12,28), coins(12,5), coins(4,62), coins(3,42), coins(1,1),
      d('Limpwurt root',22,1,'limpwurt_root'), d('Goblin armour',2,1,'goblin_armour'),
      gemDrop(w(2)),
    ] },

  { id:'earth_warrior', name:'Earth Warrior', level:51, hp:54, attack:42, strength:42, defLevel:42,
    defStab:30, defSlash:40, defCrush:20, defRange:30, defMagic:10, attackSpeed:4,
    loot:[
      d('Steel spear',3,1,'steel_axe'), d('Staff of earth',2,1,'staff_of_earth'),
      d('Earth rune ×12',13,12,'earthrune'), d('Nature rune ×3',9,3,'naturerune'),
      d('Chaos rune ×3',7,3,'chaosrune'), d('Law rune ×2',6,2,'lawrune'),
      d('Death rune ×2',4,2,'deathrune'), d('Earth rune ×60',3,60,'earthrune'),
      d('Blood rune ×2',1,2,'bloodrune'),
      herbDrop(w(14)),
      coins(18,12),
      gemDrop(w(2)),
    ] },

  // NPC config @274: areas/area_falador/configs/falador.npc (attackrate 7)
  { id:'white_knight', name:'White Knight', level:36, hp:52, attack:27, strength:29, defLevel:21, defStab:83, defSlash:76, defCrush:70, defRange:74, defMagic:-11, attBonus:30, strBonus:31, attackSpeed:7,
    loot:[
      always('Bones',1,'bones'),
      d('Iron longsword',2,1,'iron_sword'), d('Steel sword',1,1,'steel_longsword'), d('Steel med helm',1,1,'steel_med_helm'),
      d('Mind rune ×5',11,5,'mindrune'), d('Nature rune ×4',4,4,'naturerune'),
      d('Body rune ×11',3,11,'bodyrune'), d('Chaos rune ×2',3,2,'chaosrune'),
      d('Water rune ×27',3,27,'waterrune'), d('Mithril arrow ×5',2,5,'mithril_arrow'),
      d('Adamant arrow ×2',1,2,'adamant_arrow'), d('Law rune ×2',1,2,'lawrune'),
      herbDrop(w(5)),
      coins(15,5), coins(15,48), coins(15,15), coins(10,49), coins(5,1), coins(5,2), coins(1,120), coins(10,8),
      d('Iron bar ×2',6,2,'iron_bar'), d('Iron bar',2,1,'iron_bar'),
      gemDrop(w(1)),
    ] },

  { id:'ice_warrior', name:'Ice Warrior', level:57, hp:59, attack:47, strength:47, defLevel:47,
    defStab:30, defSlash:40, defCrush:20, defRange:30, defMagic:10, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Iron battleaxe',3,1,'iron_battleaxe'), d('Mithril mace',1,1,'mithril_mace'),
      d('Nature rune ×4',10,4,'naturerune'), d('Chaos rune ×3',8,3,'chaosrune'),
      d('Law rune ×2',7,2,'lawrune'), d('Cosmic rune ×2',5,2,'cosmicrune'),
      d('Mithril arrow ×3',5,3,'mithril_arrow'), d('Death rune ×2',3,2,'deathrune'),
      herbDrop(w(10)),
      coins(39,15),
      gemDrop(w(3)),
    ] },

  // NPC config @274: areas/area_ardougne_east/configs/legends_guild/legends_guild.npc
  { id:'shadow_warrior', name:'Shadow Warrior', level:48, hp:67, attack:36, strength:33, defLevel:36, defStab:43, defSlash:31, defCrush:19, defRange:38, defMagic:15, attBonus:20, strBonus:26, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      d('Cosmic rune ×3',9,3,'cosmicrune'), d('Blood rune ×2',6,2,'bloodrune'),
      d('Air rune ×45',4,45,'airrune'), d('Death rune ×2',4,2,'deathrune'),
      coins(47,8),
      d('Mithril bar',4,1,'mithril_bar'), d('Weapon poison',1,1,'weapon_poison'),
      gemDrop(w(8)),
      herbDrop(w(18)),
    ] },

  { id:'paladin', name:'Paladin', level:62, hp:57, attack:54, strength:54, defLevel:54, defStab:87, defSlash:84, defCrush:76, defRange:79, defMagic:-10, attBonus:20, strBonus:22, attackSpeed:5,
    loot:[
      always('Bones',1,'bones'),
      d('Steel sword',2,1,'steel_longsword'), d('Steel longsword',1,1,'steel_longsword'), d('Steel full helm',1,1,'steel_full_helm'),
      d('Water rune ×30',13,30,'waterrune'), d('Blood rune ×1',1,1,'bloodrune'),
      d('Iron bar',9,1,'iron_bar'), d('Mithril bar',1,1,'mithril_bar'), d('Steel bar',1,1,'steel_bar'),
      herbDrop(w(8)),
      coins(40,48), coins(19,15), coins(16,2), coins(10,8), coins(2,120),
      gemDrop(w(2)),
    ] },


  { id:'mossgiant', name:'Moss Giant', level:42, hp:60, attack:30, strength:30, defLevel:30, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attBonus:33, strBonus:31, attackSpeed:6,
    loot:[
      always('Big bones',1,'big_bones'),
      d('Black sq shield',5,1,'black_kiteshield'), d('Magic staff',2,1,'magic_staff'),
      d('Steel med helm',2,1,'steel_med_helm'), d('Mithril sword',2,1,'mithril_sword'),
      d('Steel kiteshield',1,1,'steel_kiteshield'),
      d('Law rune ×3',4,3,'lawrune'), d('Air rune ×18',3,18,'airrune'),
      d('Earth rune ×27',3,27,'earthrune'), d('Chaos rune ×7',3,7,'chaosrune'),
      d('Nature rune ×6',3,6,'naturerune'), d('Cosmic rune ×2',2,2,'cosmicrune'),
      d('Iron arrow ×15',2,15,'iron_arrow'), d('Steel arrow ×30',1,30,'steel_arrow'),
      d('Death rune ×3',1,3,'deathrune'),
      herbDrop(w(5)),
      coins(19,37), coins(8,2), coins(10,119), coins(2,300),
      d('Steel bar',6,1,'steel_bar'), d('Coal',1,1,'coal'), d('Spinach roll',1,1,'spinach_roll'),
      gemDrop(w(4)),
    ] },

  { id:'icegiant', name:'Ice Giant', level:49, hp:70, attack:40, strength:40, defLevel:40, defStab:0, defSlash:3, defCrush:2, defRange:0, defMagic:0, attBonus:29, strBonus:31, attackSpeed:5,
    loot:[
      always('Big bones',1,'big_bones'),
      d('Nature rune ×6',4,6,'naturerune'), d('Mind rune ×24',3,24,'mindrune'),
      d('Body rune ×37',3,37,'bodyrune'), d('Law rune ×3',2,3,'lawrune'),
      d('Water rune ×12',1,12,'waterrune'), d('Cosmic rune ×4',1,4,'cosmicrune'), d('Death rune ×3',1,3,'deathrune'),
      coins(32,117), coins(12,53), coins(10,196), coins(7,8), coins(6,22), coins(2,400),
      d('Jug of wine',3,1,'jug_wine'), d('Mithril ore',1,1,'mithril_ore'),
      gemDrop(w(4)),
    ] },

  { id:'jogre', name:'Jogre', level:53, hp:60, attack:43, strength:43, defLevel:43, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attBonus:22, strBonus:20, attackSpeed:6,
    loot:[
      always('Big bones',1,'big_bones'),
      d('Nature rune ×2',10,2,'naturerune'), d('Nature rune ×10',2,10,'naturerune'), d('Nature rune ×5',2,5,'naturerune'),
      herbDrop(w(6)),
      d('Big bones',3,1,'big_bones'), d('Big bones ×3',2,3,'big_bones'),
      d('Pineapple ×2',8,2,'beer'), d('Knife',5,1,'bronze_axe'),
      gemDrop(w(1)),
    ] },

  // Mountain Troll — drop table EXACT from mountain_troll.rs2 @274 (random(128),
  // death_drop = big bones, guaranteed). Combat stats are OSRS-based 2004
  // approximations (rev274 npc configs aren't in the scripts repo): level 69,
  // 80 HP, slow + inaccurate, crush-resistant. Magic level 1 (melee monster).
  { id:'mountain_troll', name:'Mountain Troll', level:69, hp:80, attack:71, strength:71, defLevel:71, magicLevel:1,
    defStab:0, defSlash:0, defCrush:15, defRange:0, defMagic:0, attBonus:20, strBonus:20, attackSpeed:5,
    loot:[
      always('Big bones',1,'big_bones'),
      d('Steel med helm',4,1,'steel_med_helm'),
      d('Black warhammer',3,1,'black_warhammer'),
      d('Steel warhammer',3,1,'steel_warhammer'),
      d('Adamant med helm',1,1,'adamant_med_helm'),
      d('Adamant warhammer',1,1,'adamant_warhammer'),
      d('Mithril sq shield',1,1,'mithril_sq_shield'),
      d('Earth rune ×60',8,60,'earthrune'),
      d('Nature rune ×7',5,7,'naturerune'),
      d('Law rune ×2',3,2,'lawrune'),
      d('Earth rune ×45',1,45,'earthrune'),
      d('Earth rune ×25',1,25,'earthrune'),
      herbDrop(w(15)),
      coins(29,35), coins(10,100), coins(7,8), coins(6,50), coins(1,250),
      d('Coal ×3',3,3,'coal'),
      d('Raw mackerel ×3',2,3,'raw_mackerel'),
    ] },

  // Troll General — drop table EXACT from troll_commander.rs2 @274 (random(128),
  // death_drop = big bones, guaranteed). Carries BOTH the herb (15/128) and the
  // jewel (5/128) sub-tables. Combat stats are OSRS-based 2004 approximations
  // (rev274 npc configs aren't in the scripts repo): level 113, 132 HP, hits
  // hard but inaccurate, crush-resistant. Magic level 1 (melee monster).
  // (The guaranteed prison-key drop is a quest item, not lootable gp — omitted.)
  // NPC config @274: quests/quest_troll/configs/quest_troll.npc (magic/range def 200)
  { id:'troll_general', name:'Troll General', level:113, hp:140, attack:70, strength:140, defLevel:40, magicLevel:1,
    defStab:35, defSlash:60, defCrush:35, defRange:200, defMagic:200, attBonus:60, strBonus:100, attackSpeed:5,
    loot:[
      always('Big bones',1,'big_bones'),
      d('Steel platebody',4,1,'steel_platebody'),
      d('Black warhammer',3,1,'black_warhammer'),
      d('Steel warhammer',3,1,'steel_warhammer'),
      d('Adamant axe',2,1,'adamant_axe'),
      d('Adamant sq shield',1,1,'adamant_sq_shield'),
      d('Granite shield',1,1,'granite_shield'),
      d('Mithril platebody',1,1,'mithril_platebody'),
      d('Rune warhammer',1,1,'rune_warhammer'),
      d('Earth rune ×80',8,80,'earthrune'),
      d('Nature rune ×16',5,16,'naturerune'),
      d('Law rune ×4',3,4,'lawrune'),
      d('Earth rune ×65',1,65,'earthrune'),
      d('Earth rune ×25',1,25,'earthrune'),
      herbDrop(w(15)),
      coins(29,40), coins(25,135), coins(10,190), coins(4,20), coins(1,420),
      d('Coal ×6',3,6,'coal'),
      d('Raw tuna ×4',2,4,'raw_tuna'),
      gemDrop(w(5)),
    ] },

  // =====================================================================
  // TIER 5 — HIGH
  // =====================================================================

  { id:'chaos_dwarf', name:'Chaos Dwarf', level:48, hp:61, attack:38, strength:42, defLevel:28, defStab:40, defSlash:34, defCrush:25, defRange:35, defMagic:10, attBonus:13, strBonus:9, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
      // Approximated drops — chaos dwarves drop runes, coins, gems
      d('Steel arrow ×5',8,5,'steel_arrow'),
      d('Mithril arrow ×3',4,3,'mithril_arrow'),
      d('Mithril bar',2,1,'mithril_bar'),
      d('Adamant kiteshield',1,1,'adamant_kiteshield'),
      d('Fire rune ×30',6,30,'firerune'), d('Chaos rune ×8',5,8,'chaosrune'),
      d('Nature rune ×6',4,6,'naturerune'), d('Law rune ×3',2,3,'lawrune'),
      coins(28, 75), coins(15, 150), coins(8, 32), coins(4, 250),
      d('Limpwurt root',5,1,'limpwurt_root'),
      gemDrop(3/128),
      ultrarareDrop(1/128),
    ] },

  { id:'hellhound', name:'Hellhound', level:122, hp:116, attack:105, strength:104, defLevel:102, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attackSpeed:4,
    loot:[ always('Bones',1,'bones') ] },

  { id:'lesser_demon', name:'Lesser Demon', level:82, hp:79, attack:68, strength:70, defLevel:71,
    defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:-10, attackSpeed:4,
    loot:[
      always('Ashes',1,'ashes'),
      gemDrop(w(4)),
      d('Rune med helm',1,1,'rune_med_helm'), d('Mithril sq shield',1,1,'mithril_sq_shield'),
      d('Mithril chainbody',1,1,'mithril_chainbody'),
      d('Steel axe',4,1,'steel_axe'), d('Steel full helm',4,1,'steel_full_helm'), d('Steel scimitar',3,1,'steel_scimitar'),
      d('Jug of wine',2,1,'jug_wine'),
      coins(1,450), coins(10,200), coins(8,120), coins(40,120), coins(1,120), coins(30,40), coins(7,10),
      d('Fire rune ×60',8,60,'firerune'), d('Fire rune ×30',1,30,'firerune'),
      herbDrop(w(1)),
      d('Gold ore',2,1,'gold_ore'), d('Death rune ×3',3,3,'deathrune'), d('Chaos rune ×12',5,12,'chaosrune'),
    ] },

  { id:'greater_demon', name:'Greater Demon', level:92, hp:87, attack:76, strength:78, defLevel:81,
    defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:-10, attackSpeed:4,
    loot:[
      always('Ashes',1,'ashes'),
      d('Steel 2h sword',4,1,'steel_2h_sword'), d('Steel axe',3,1,'steel_axe'),
      d('Steel battleaxe',3,1,'steel_battleaxe'), d('Mithril kiteshield',1,1,'mithril_kiteshield'),
      d('Adamant platelegs',1,1,'adamant_platelegs'), d('Rune full helm',1,1,'rune_full_helm'),
      d('Fire rune ×75',8,75,'firerune'), d('Chaos rune ×15',3,15,'chaosrune'),
      d('Death rune ×5',3,5,'deathrune'), d('Fire rune ×37',1,37,'firerune'),
      coins(40,132), coins(29,44), coins(10,220), coins(7,11), coins(1,460),
      d('Tuna',3,1,'tuna'), d('Gold bar',2,1,'gold_bar'), d('Thread ×10',1,10,'thread'),
      gemDrop(w(5)),
    ] },

  { id:'firegiant', name:'Fire Giant', level:86, hp:111, attack:65, strength:65, defLevel:65, defStab:0, defSlash:3, defCrush:2, defRange:0, defMagic:0, attBonus:29, strBonus:31, attackSpeed:5,
    loot:[
      always('Big bones',1,'big_bones'),
      d('Steel axe',3,1,'steel_axe'), d('Mithril sq shield',2,1,'mithril_sq_shield'),
      d('Fire battlestaff',1,1,'fire_battlestaff'), d('Rune scimitar',1,1,'rune_scimitar'),
      d('Fire rune ×150',10,150,'firerune'), d('Chaos rune ×5',7,5,'chaosrune'),
      d('Rune arrow ×12',5,12,'rune_arrow'), d('Blood rune ×5',4,5,'bloodrune'),
      d('Fire rune ×37',1,37,'firerune'), d('Law rune ×2',1,2,'lawrune'),
      herbDrop(w(19)),
      coins(40,60), coins(7,15), coins(6,25), coins(2,300), coins(1,50),
      d('Lobster',3,1,'lobster'), d('Steel bar',2,1,'steel_bar'),
      gemDrop(w(11)),
      ultrarareDrop(w(1)),
    ] },

  { id:'black_demon', name:'Black Demon', level:172, hp:157, attack:145, strength:148, defLevel:152,
    defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:-10, attackSpeed:4,
    loot:[
      always('Ashes',1,'ashes'),
      d('Black sword',4,1,'black_sword'), d('Steel battleaxe',3,1,'steel_battleaxe'),
      d('Black axe',2,1,'black_axe'), d('Mithril kiteshield',1,1,'mithril_kiteshield'),
      d('Rune med helm',1,1,'rune_med_helm'), d('Rune chainbody',1,1,'rune_chainbody'),
      d('Air rune ×50',8,50,'airrune'), d('Chaos rune ×10',7,10,'chaosrune'),
      d('Blood rune ×7',4,7,'bloodrune'), d('Fire rune ×37',1,37,'firerune'), d('Law rune ×3',1,3,'lawrune'),
      herbDrop(w(23)),
      coins(40,132), coins(7,30), coins(6,44), coins(6,220), coins(1,460),
      d('Lobster',3,1,'lobster'), d('Adamantite bar',2,1,'adamantite_bar'),
      gemDrop(w(5)),
      ultrarareDrop(w(1)),
    ] },

  // Dagannoth (Horror from the Deep, rev 274) — EXACT combat stats from
  // quest_horror.npc. lvl 74 attacks at range with spines (rolls vs ranged
  // def, max hit 8); lvl 92 is a melee variant with +50 magic defence.
  // NPC config @274: quests/quest_horror/configs/quest_horror.npc (horror_dagganoth_jr)
  { id:'dagannoth', name:'Dagannoth (lvl 74)', level:74, hp:70, attack:68, strength:70, defLevel:50,
    defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attBonus:0, strBonus:0, attackSpeed:4, atkType:'ranged',
    loot:DAGANNOTH_LOOT() },

  // NPC config @274: quests/quest_horror/configs/quest_horror.npc (horror_dagannoth_medium)
  { id:'dagannoth_92', name:'Dagannoth (lvl 92)', level:92, hp:120, attack:68, strength:70, defLevel:71,
    defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:50, attBonus:0, strBonus:0, attackSpeed:4, atkType:'melee',
    loot:DAGANNOTH_LOOT() },

  // Rock Crab (Fremennik coast) — quest_viking/horror_rockcrab.npc: vislvl 13,
  // hp 50 (the gimmick: tanky but weak), att/str/def default 1, crush attacker,
  // no def bonuses, death_drop=null. Both the normal and small variants share
  // ONE drop table (rockcrab_drops, random128) so we model one entry. Drops an
  // EASY clue (~trail_easycluedrop). Loot is low-value mining/fishing junk.
  { id:'rock_crab', name:'Rock Crab', level:13, hp:50, attack:1, strength:1, defLevel:1, defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attackSpeed:4,
    loot:[
      d('Bronze pickaxe',6,1,'bronze_pickaxe'),
      d('Iron pickaxe',5,1,'iron_pickaxe'),
      d('Seaweed',4,1,'seaweed'), d('Seaweed ×2',4,2,'seaweed'), d('Seaweed ×5',2,5,'seaweed'), d('Seaweed ×2b',2,2,'seaweed'),
      d('Oyster shell ×2',12,2,'oystershell'), d('Oyster shell',9,1,'oystershell'),
      d('Empty oyster',3,1,'oysterempty'), d('Empty oyster ×3',1,3,'oysterempty'),
      d('Small oyster pearls',1,1,'smalloysterpearls'),
      coins(29,4), coins(8,36), coins(6,8),
      d('Fishing bait ×10',2,10,'fishing_bait'),
      d('Opal bolt tips ×5',2,5,'opal_bolttips'),
      d('Spinach roll',1,1,'spinach_roll'),
      casketDrop(w(1)),
      gemDrop(w(1)),
      d('Tin ore ×3',4,3,'tin_ore'),
      d('Iron ore',2,1,'iron_ore'),
      d('Coal ×2',2,2,'coal'),
      d('Copper ore ×3',2,3,'copper_ore'),
    ] },

  // Baby blue dragon — EXACT from all.npc @rev225 (babybluedragon): vislvl 48,
  // hp 50, att/str/def 40; def bonuses stab30/slash50/crush50/range30/magic40.
  // death_drop=babydragon_bones (guaranteed dragon bones, no other table) — killed
  // purely for bones. No dragonfire (babies don't breathe). Attacks melee (slash).
  { id:'baby_blue_dragon', name:'Baby blue dragon', level:48, hp:50, attack:40, strength:40, defLevel:40, defStab:30, defSlash:50, defCrush:50, defRange:30, defMagic:40, attackSpeed:4,
    loot:[ always('Babydragon bones',1,'babydragon_bones') ] },

  { id:'green_dragon', name:'Green Dragon', level:79, hp:75, attack:68, strength:68, defLevel:68, dragonfire:true,
    defStab:20, defSlash:40, defCrush:40, defRange:20, defMagic:30, attackSpeed:4,
    loot:[
      always('Dragon bones',1,'dragon_bones'), always('Green dragonhide',1,'dragonhide_green'),
      d('Steel platelegs',4,1,'steel_platelegs'), d('Steel battleaxe',3,1,'steel_battleaxe'),
      d('Mithril axe',3,1,'mithril_axe'), d('Mithril kiteshield',1,1,'mithril_kiteshield'),
      d('Adamant full helm',1,1,'adamant_full_helm'), d('Rune dagger',1,1,'rune_dagger'),
      d('Water rune ×75',8,75,'waterrune'), d('Nature rune ×15',5,15,'naturerune'),
      d('Law rune ×3',3,3,'lawrune'), d('Fire rune ×37',1,37,'firerune'),
      herbDrop(w(15)),
      coins(29,44), coins(25,132), coins(10,200), coins(5,11), coins(1,440),
      d('Bass',3,1,'bass'), d('Adamantite ore',3,1,'adamantite_ore'),
      gemDrop(w(5)),
    ] },

  { id:'blue_dragon', name:'Blue Dragon', level:111, hp:105, attack:95, strength:95, defLevel:95, dragonfire:true,
    defStab:50, defSlash:70, defCrush:70, defRange:50, defMagic:60, attackSpeed:4,
    loot:[
      always('Dragon bones',1,'dragon_bones'), always('Blue dragonhide',1,'dragonhide_blue'),
      d('Steel platelegs',4,1,'steel_platelegs'), d('Steel battleaxe',3,1,'steel_battleaxe'),
      d('Mithril axe',3,1,'mithril_axe'), d('Mithril kiteshield',1,1,'mithril_kiteshield'),
      d('Adamant full helm',1,1,'adamant_full_helm'), d('Rune dagger',1,1,'rune_dagger'),
      d('Water rune ×75',8,75,'waterrune'), d('Nature rune ×15',5,15,'naturerune'),
      d('Law rune ×3',3,3,'lawrune'), d('Fire rune ×37',1,37,'firerune'),
      herbDrop(w(15)),
      coins(29,44), coins(25,132), coins(10,200), coins(5,11), coins(1,440),
      d('Bass',3,1,'bass'), d('Adamantite ore',3,1,'adamantite_ore'),
      gemDrop(w(5)),
    ] },

  { id:'black_dragon', name:'Black Dragon', level:227, hp:190, attack:200, strength:200, defLevel:200, dragonfire:true,
    defStab:50, defSlash:70, defCrush:70, defRange:50, defMagic:60, attackSpeed:4,
    loot:[
      always('Dragon bones',1,'dragon_bones'), always('Black dragonhide',1,'dragonhide_black'),
      d('Mithril 2h sword',4,1,'mithril_2h_sword'), d('Mithril axe',3,1,'mithril_axe'),
      d('Mithril battleaxe',3,1,'mithril_battleaxe'), d('Rune knife ×2',3,2,'rune_knife'),
      d('Mithril kiteshield',1,1,'mithril_kiteshield'), d('Adamant platebody',1,1,'adamant_platebody'),
      d('Rune longsword',1,1,'rune_longsword'),
      d('Adamant javelin ×30',20,30,'steel_javelin'), d('Fire rune ×50',8,50,'firerune'),
      d('Law rune ×10',5,10,'lawrune'), d('Blood rune ×15',3,15,'bloodrune'), d('Air rune ×75',1,75,'airrune'),
      coins(40,196), coins(10,330), coins(1,690),
      d('Adamantite bar',3,1,'adamantite_bar'),
      gemDrop(w(3)),
      ultrarareDrop(w(2)),
    ] },

  // Ghoul — area_mortmyre/configs/mortmyre.npc [ghoul] @274: lvl 42, hp 50,
  // att 30 / str 40 / def 30, crush_style, NO def bonuses, NO att/str bonuses.
  // No drop table & no config death_drop beyond bones — drops ONLY bones (100%).
  // Popular low-supply melee/ranged leveling spot, so left visible (not "pass").
  { id:'ghoul', name:'Ghoul', level:42, hp:50, attack:30, strength:40, defLevel:30,
    defStab:0, defSlash:0, defCrush:0, defRange:0, defMagic:0, attackSpeed:4,
    loot:[
      always('Bones',1,'bones'),
    ] },

  // Magic axe — _unpack/225/all.npc [magicaxe] @274: lvl 42, hp 44, att/str 38,
  // def 29; def bonuses stab10/slash5/crush15/range10/magic5; slash_style.
  // NO weighted drop table exists in content — the NPC's only drop is the config
  // death_drop=iron_battleaxe (guaranteed), and it drops NO bones (animated axe).
  { id:'magicaxe', name:'Magic axe', level:42, hp:44, attack:38, strength:38, defLevel:29,
    defStab:10, defSlash:5, defCrush:15, defRange:10, defMagic:5, attackSpeed:4,
    loot:[
      always('Iron battleaxe',1,'iron_battleaxe'),
    ] },

  // Elf warrior (lvl 90) — regicide_darkelf @274: ranged (crystal bow). hp 105,
  // att 10 / str 80 / def 10 / ranged 80. Def bonuses stab/slash/crush/magic 50,
  // range 70. Shares the elf_warrior drop table; drops a HARD clue.
  { id:'elf_warrior_90', name:'Elf warrior (90)', level:90, hp:105, attack:10, strength:80, defLevel:10, ranged:80,
    defStab:50, defSlash:50, defCrush:50, defRange:70, defMagic:50, attackSpeed:4,
    loot: ELF_WARRIOR_LOOT() },

  // Elf warrior (lvl 108) — regicide_darkelf2 @274: melee (crystal halberd). hp 105,
  // att 95 / str 95 / def 80. Def bonuses stab 50, slash/crush 70, magic 60, range 50.
  // Shares the elf_warrior drop table; drops a HARD clue.
  { id:'elf_warrior_108', name:'Elf warrior (108)', level:108, hp:105, attack:95, strength:95, defLevel:80,
    defStab:50, defSlash:70, defCrush:70, defRange:50, defMagic:60, attackSpeed:4,
    loot: ELF_WARRIOR_LOOT() },

];

// =====================================================================
// CLUE SCROLL TAGS — which tier(s) each monster can drop.
// Values: 'easy' | 'medium' | 'hard'. Used for UI filtering only;
// clue EV is NOT simulated (leaving a trip mid-way is too complex).
// Sourced from LostCityRS/Content@274 drop table comments.
// =====================================================================
// =====================================================================
// CLUE SCROLL TAGS — which tier(s) each monster drops.
// VERIFIED against ~trail_*cluedrop tertiary calls in the actual drop scripts.
// Most monsters do NOT drop clues — only those with an explicit tertiary here.
// Used for UI filtering only; clue EV is NOT simulated.
//
// Drop-table source paths (LostCityRS/Content@274):
//   Standard monsters : scripts/drop tables/scripts/<monster>.rs2
//   mountain_troll    : scripts/drop tables/scripts/mountain_troll.rs2   (no clue)
//   troll_general     : scripts/drop tables/scripts/troll_commander.rs2  (no clue)
//   dagannoth (both)  : scripts/quests/quest_horror/scripts/horror_dagannoth.rs2
//                       (NPC id _dagganoth — shares one table for both lvl 74 & 92)
//   tribesman         : scripts/drop tables/scripts/tribesman.rs2
//                       (medium clue tertiary confirmed present at rev 274)
//
// NOTE: some monsters live in quest or area subfolders, not the main drop
// tables folder — always check LostCityRS/Content@274 if a file is missing
// from the standard path before assuming a monster has no drop table.
// =====================================================================
const MONSTER_CLUES = {
  // Easy  (~trail_easycluedrop)
  goblin:             ['easy'],
  thug:               ['easy'],
  rock_crab:          ['easy'],
  man:                ['easy'],
  al_kharid_warrior:  ['easy'],   // shares man_drop_table; easy clue confirmed
  barbarian:          ['easy'],
  // Medium (~trail_mediumcluedrop)
  guard:               ['medium'],
  ice_warrior:         ['medium'],
  jogre:               ['medium'],
  paladin:             ['medium'],
  tribesman:           ['medium'],
  dagannoth:           ['medium'],   // horror_dagannoth.rs2 (quest folder)
  dagannoth_92:        ['medium'],   // same script as above
  // Hard  (~trail_hardcluedrop)
  hellhound:     ['hard'],
  greater_demon: ['hard'],
  green_dragon:  ['hard'],
  blue_dragon:   ['hard'],
  black_dragon:  ['hard'],
  elf_warrior_90:  ['hard'],   // ~trail_hardcluedrop in regicide_darkelf.rs2
  elf_warrior_108: ['hard'],   // shares the elf_warrior table
};
for (const m of MONSTERS) {
  const c = MONSTER_CLUES[m.id];
  if (c) m.clues = c;
}

// =====================================================================
// STATIC PRICES — items excluded from scraping with fixed values.
// =====================================================================
const STATIC_PRICES = {
  rune_javelin:   100,   // no one buys these
  mind_talisman:  500, earth_talisman: 500, air_talisman: 500,
  chaos_talisman: 500, fire_talisman:  500, body_talisman: 500,
  cosmic_talisman:500,   // nature talisman is the only one worth real value
};
Object.assign(P, STATIC_PRICES);

// =====================================================================
// DEFAULT LOOT ACTIONS — sensible per-item defaults so the user doesn't
// have to set loot/alch/skip/bury for every drop manually.
// Keyed by normalised drop name (lowercase, no "×N" qty, no apostrophes).
// =====================================================================
function normLoot(name){
  return String(name)
    .toLowerCase()
    .replace(/\s*[×x]\s*\d+/g, '')   // strip "×5" qty suffix
    .replace(/['’]/g, '')             // strip apostrophes
    .replace(/\(noted\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Explicit skip-by-default (worthless / not worth banking)
const SKIP_DEFAULTS = new Set([
  'jug of wine','spinach roll','knife','ashes','pineapple','thread','staff',
  'tin ore','copper ore','tinderbox','fishing bait','goblin armour',
  'vial (empty)','vial','druid robe top','druid robe bottom','black robe',
  'black wizard hat','blue wizard hat','grain','fur','raw bear meat',
  'chefs hat','eye patch','bronze bar','wizard robe','raw beef','raw chicken',
  'brass necklace','beer',
  // capes
  'black cape','red cape','blue cape','yellow cape','green cape',
  'purple cape','orange cape','pink cape','white cape',
  // javelins
  'bronze javelin','iron javelin','black javelin','steel javelin',
  'mithril javelin','adamant javelin',
  // bolts (generic)
  'bolt','bolts','bronze bolts','iron bolts','steel bolts',
  // fishing-themed junk (dagannoth table) — not worth banking
  'lobster pot','raw herring','raw sardine','harpoon','raw tuna','raw lobster',
  'oyster pearls','oyster pearl','opal bolt tips','seaweed',
]);

// Bury-by-default (bones — give prayer xp, never worth banking here)
const BURY_DEFAULTS = new Set([
  'big bones','jogre bones','ogre bones','bones','burnt bones','wolf bones','babydragon bones',
]);

// Alch-by-default (normal elemental staves — low value but worth alching)
const ALCH_DEFAULTS = new Set([
  'staff of earth','staff of fire','staff of air','staff of water',
]);

// Food drops — eaten during the trip (or trivial value), so they don't count
// as banked profit. Default to skip. (Override per-item if you actually bank
// a valuable cooked fish.)
const FOOD_DEFAULTS = new Set([
  'trout','salmon','tuna','bass','lobster','swordfish','shark','herring',
  'sardine','mackerel','cod','pike','anchovies','shrimps','cooked meat',
  'cooked chicken','bread','cake','stew','raw bass','raw tuna','raw lobster',
  'raw swordfish','raw shark','raw herring','raw sardine','raw salmon','raw trout',
]);

// Tiered metal equipment → alch by default, but skip if alch value < 350.
// Rune weapons in this list also default to alch.
const TIER_PREFIXES = ['bronze','iron','black','steel','mithril','adamant'];
const RUNE_ALCH_WEAPONS = new Set([
  'rune dagger','rune warhammer','rune mace','rune spear',
  'rune battleaxe','rune longsword','rune sword',
]);
const EQUIP_SUFFIXES = [
  'dagger','sword','longsword','scimitar','2h sword','battleaxe','axe','mace',
  'warhammer','hammer','spear','halberd','claws','hatchet','pickaxe',
  'full helm','med helm','helm','platebody','platelegs','plateskirt',
  'chainbody','chainmail','sq shield','square shield','kiteshield','boots',
  'gauntlets','gloves',
];
function isTierEquipment(norm){
  if (!TIER_PREFIXES.some(p => norm.startsWith(p + ' '))) return false;
  return EQUIP_SUFFIXES.some(s => norm.endsWith(s));
}

// Items with a GE/market price that NO ONE buys in bulk — bronze→adamant gear
// & weapons, plus the low-value rune weapons (dagger, mace, etc). You can't
// realistically sell stacks of these, so their market price shouldn't count
// as loot value: only the alch value is real. The engine zeroes their sale
// price, so the choice is alch (if profitable) or leave-on-ground.
function isBulkUnsellable(name){
  const norm = normLoot(name);
  return isTierEquipment(norm) || RUNE_ALCH_WEAPONS.has(norm);
}

// Resolve the alch value for a drop by name (uses ALCH map keys).
function alchForName(name){
  const norm = normLoot(name);
  // direct keyed lookup against ALCH map: try underscore form
  const key = norm.replace(/ /g, '_');
  if (ALCH[key] != null) return ALCH[key];
  // try a few common aliases
  return ALCH[key.replace('2h_sword','2h_sword')] ?? 0;
}

// Stackable items occupy one slot regardless of qty (runes, coins, ammo,
// feathers…) — they're cheap to grab even in bulk, so the <350gp skip rule
// does NOT apply to them. Mirrors TripModel.isStackable.
function isStackableLoot(name){
  const n = normLoot(name);
  if (/\brune\b/.test(n) || n === 'coins') return true;
  if (/(arrow|bolt|dart|javelin|knife|feather|bait|ashes|token)/.test(n)) return true;
  return false;
}

// Returns 'skip' | 'bury' | 'alch' | 'loot' | null (null = let engine decide)
function defaultLootAction(drop){
  const norm = normLoot(drop.name);
  if (BURY_DEFAULTS.has(norm)) return 'bury';
  if (SKIP_DEFAULTS.has(norm)) return 'skip';
  if (FOOD_DEFAULTS.has(norm)) return 'skip';
  if (ALCH_DEFAULTS.has(norm)) return 'alch';
  if (RUNE_ALCH_WEAPONS.has(norm)){
    const a = alchForName(drop.name) || drop.alchValue || 0;
    return a >= 350 ? 'alch' : 'skip';
  }
  if (isTierEquipment(norm)){
    const a = alchForName(drop.name) || drop.alchValue || 0;
    return a >= 350 ? 'alch' : 'skip';
  }
  // General rule: a non-stackable drop worth < 350 gp isn't worth banking.
  // Stackables (runes/ammo/coins) are exempt — cheap to grab in bulk. Tagged
  // sub-tables (gem/herb/casket/…) and bones are handled elsewhere.
  if (!Array.isArray(drop) && !drop.tag && drop.price != null && !isStackableLoot(drop.name)){
    if (drop.price < 350) return 'skip';
  }
  return null;
}

// ---- RoW adjustment -------------------------------------------------
function adjustForRoW(monster, rowEnabled){
  // Replace each gem drop with its RoW-boosted EV.
  // Rare drop table EV is NOT affected by RoW (separate proc path).
  const out = [];
  for (const drop of monster.loot){
    if (Array.isArray(drop)){
      for (const d of drop) out.push(d);
    } else {
      out.push(drop);
    }
  }
  return out.map(drop => {
    if (drop.tag === 'gem'){
      return { ...drop, price: rowEnabled ? GEM_EV_ROW : GEM_EV_BASE };
    }
    if (drop.tag === 'herb'){
      return { ...drop, price: HERB_EV };
    }
    if (drop.tag === 'ultrarare'){
      return { ...drop, price: ULTRARARE_EV };
    }
    if (drop.tag === 'mega'){
      return { ...drop, price: MEGA_EV };
    }
    return drop;
  });
}

window.GameData = {
  MONSTERS,
  ITEM_PRICES: P,
  ALCH_VALUES: ALCH,
  scrapedAt: P._scraped_at || null,  // unix timestamp written by scrape_prices.py
  get GEM_EV_BASE(){ return GEM_EV_BASE; },
  get GEM_EV_ROW(){ return GEM_EV_ROW; },
  get GEM_EV_BASE_HIGH(){ return GEM_EV_BASE_HIGH; },
  get GEM_EV_ROW_HIGH(){ return GEM_EV_ROW_HIGH; },
  get GEM_KEEP_FRAC_BASE(){ return GEM_KEEP_FRAC_BASE; },
  get GEM_KEEP_FRAC_ROW(){ return GEM_KEEP_FRAC_ROW; },
  get HERB_EV(){ return HERB_EV; },
  get HERB_EV_HIGH(){ return HERB_EV_HIGH; },
  get HERB_KEEP_FRAC(){ return HERB_KEEP_FRAC; },
  VALUE_THRESHOLD,
  get MEGA_EV(){ return MEGA_EV; },
  ULTRARARE_EV,
  recalcGemEV,
  adjustForRoW,
  defaultLootAction,
  isBulkUnsellable,
  casketValue,
  STATIC_PRICES,
};

})();
