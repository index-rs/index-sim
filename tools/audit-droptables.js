'use strict';
// audit-droptables.js — check gamedata.js drop tables against LostCityRS/Content.
//
// Usage:
//   node tools/audit-droptables.js <content "drop tables/scripts" dir> [monsterId]
//
// Rows are aligned positionally by (weight, quantity), which holds because
// gamedata.js was authored in source order. For each aligned pair it reports
// the gamedata display name, the gamedata price key and the source item id, so
// a key that points at some *other* item's price shows up as a KEY mismatch
// even when the drop itself is correct.

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { load } = require('./rs2-droptable');

const ROOT = path.join(__dirname, '..');

// gamedata monster id -> ai_queue3 table id in the Content drop tables.
// Identity where omitted. Sourced from the table headers themselves; the
// combat-level reasoning for the ambiguous ones matches v2's runtime mapping.
const TABLE_ID = {
  man: '_citizen',
  farmer: 'farmer1',
  bear: '_bear',
  barbarian: '_barbarian',
  guard: '_guard',
  pirate: '_pirate',
  ice_warrior: '_ice_warrior',
  mountain_troll: '_mountain_troll',
  troll_general: '_troll_general',
  cow: '_cow',
  chicken: '_chicken',
  black_demon: '_black_demon',
  dwarf: 'dwarf_normal',
  chaos_dwarf: 'dwarf_chaos',
  dark_wizard: 'young_dark_wizard',
  dark_wizard_20: 'bearded_dark_wizard',
  bandit: 'brawling_bandit',
  earth_warrior: 'earthwarrior',
  // Quest-added monsters keep their tables in the quest folder.
  elf_warrior_90: '_elf_warrior',      // quest_regicide, shared by both levels
  elf_warrior_108: '_elf_warrior',
  dagannoth: '_dagganoth',             // quest_horror, shared by lvl 74 and 92
  dagannoth_92: '_dagganoth',
  water_elemental: 'elemental_water',  // quest_elemental_workshop
  rock_crab: 'horror_rockcrab'         // quest_viking, shared with the small variant
};

function loadGameData() {
  const store = new Map();
  const sandbox = {
    console,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'gamedata.js'), 'utf8'),
                  sandbox, { filename: 'gamedata.js' });
  return sandbox.GameData;
}

// Drop the rows neither side models as a plain keyed item.
const AGGREGATE = /^(~|clue_|__death_drop__)/;

// Quest-only keys have no market value and are deliberately absent from
// gamedata.js; they are not drop-table errors.
const SOURCE_SKIP = /^(troll_key_|tbwt_jogre_bones$)/;

// Source-side spellings gamedata.js deliberately normalizes. cert_* are the
// noted forms of the same item; adamnt_warhammer is a typo in Content.
const SOURCE_NORMALIZE = {
  cert_coal: 'coal',
  cert_raw_mackerel: 'raw_mackerel',
  cert_raw_tuna: 'raw_tuna',
  adamnt_warhammer: 'adamant_warhammer'
};

// Both sides may split or combine repeats of the same item+quantity: source
// rolls seaweed x2 in two separate branches and gamedata.js keeps them as two
// rows, while source rolls jug_wine twice and gamedata.js folds them into one.
// Neither is wrong — only the total weight for an item+quantity matters — so
// fold both sides the same way before comparing.
function mergeByItemQty(rows, keyOf) {
  const out = [];
  for (const r of rows) {
    const prev = out.find((x) => keyOf(x) === keyOf(r) && x.qty === r.qty);
    if (prev) { prev.weight += r.weight; prev.merged = (prev.merged || 1) + 1; }
    else out.push({ ...r });
  }
  return out;
}

function simRows(monster, total) {
  const rows = (monster.loot || [])
    .filter((r) => r.key && r.key !== 'coins' && r.chance < 1)
    .map((r) => ({
      name: r.name,
      // `src` names the real Content drop when the row is priced through a
      // stand-in (see dProxy in gamedata.js); that is what source is checked
      // against, while `key` stays the valuation key.
      key: r.src || r.key,
      priceKey: r.key,
      proxy: Boolean(r.src),
      qty: r.qtyAvg,
      weight: Math.round(r.chance * total * 1000) / 1000
    }));
  return mergeByItemQty(rows, (r) => r.key);
}
function srcRows(table) {
  const rows = table.rows
    .filter((r) => !AGGREGATE.test(String(r.item)) && r.item !== 'coins' &&
                   !SOURCE_SKIP.test(String(r.item)) && !r.f2pOnly &&
                   typeof r.weight === 'number')
    .map((r) => ({
      item: SOURCE_NORMALIZE[r.item] || r.item,
      qty: r.qty, weight: r.weight, members: r.members,
      conditional: r.conditional
    }));
  return mergeByItemQty(rows, (r) => r.item);
}

function audit(dir, only) {
  const { direct } = load(dir);
  const G = loadGameData();
  const report = { keyMismatch: [], missing: [], extra: [], noTable: [], clean: [],
                   conditional: [], alwaysOnly: [] };

  for (const m of G.MONSTERS) {
    if (only && m.id !== only) continue;
    const tid = TABLE_ID[m.id] || m.id;
    const table = direct[tid];
    if (!table) { report.noTable.push(m.id); continue; }
    // Some monsters have no weighted roll at all — a bear just always drops
    // fur and raw meat. There is nothing to align, so say so rather than
    // implying the source table is missing.
    if (table.total == null) { report.alwaysOnly.push(m.id); continue; }

    const sim = simRows(m, table.total);
    const src = srcRows(table);

    const takenSrc = new Set();
    const takenSim = new Set();
    const pairs = [];
    // Pass 1: same item id. Prefer the one whose weight also agrees.
    sim.forEach((s2, si) => {
      const cands = src.map((x, i) => [x, i]).filter(([x, i]) => !takenSrc.has(i) && x.item === s2.key);
      if (!cands.length) return;
      const best = cands.find(([x]) => Math.abs(x.weight - s2.weight) < 0.02) || cands[0];
      takenSrc.add(best[1]); takenSim.add(si);
      pairs.push([s2, best[0]]);
    });
    // Pass 2: whatever is left, in source order — both lists are authored in it.
    const restSim = sim.filter((_, i) => !takenSim.has(i));
    const restSrc = src.filter((_, i) => !takenSrc.has(i));
    for (let i = 0; i < Math.min(restSim.length, restSrc.length); i++) pairs.push([restSim[i], restSrc[i]]);
    restSim.slice(restSrc.length).forEach((s2) => report.extra.push({ monster: m.id, ...s2 }));
    restSrc.slice(restSim.length).forEach((x) => {
      const bucket = x.conditional ? report.conditional : report.missing;
      bucket.push({ monster: m.id, ...x, outOf: table.total });
    });

    let issues = restSim.length > restSrc.length ? restSim.length - restSrc.length : 0;
    issues += restSrc.slice(restSim.length).filter((x) => !x.conditional).length;
    for (const [a, b] of pairs) {
      const keyBad = a.key !== b.item;
      const wBad = Math.abs(a.weight - b.weight) > 0.02;
      const qBad = a.qty !== b.qty;
      if (keyBad || wBad || qBad) {
        report.keyMismatch.push({
          monster: m.id, name: a.name, key: a.key, source: b.item,
          weight: a.weight, weightSource: b.weight, outOf: table.total,
          qty: a.qty, qtySource: b.qty, members: b.members,
          kind: keyBad ? 'key' : (wBad ? 'weight' : 'qty')
        });
        issues++;
      }
    }
    if (!issues) report.clean.push(m.id);
  }
  return report;
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node tools/audit-droptables.js <content "drop tables/scripts" dir> [monsterId]'); process.exit(2); }
  const r = audit(dir, process.argv[3]);
  const pct = (w, t) => `${w}/${t}`;

  const byKind = (t) => r.keyMismatch.filter((k) => k.kind === t);

  console.log(`\n### KEY POINTS AT THE WRONG ITEM (${byKind('key').length})`);
  for (const k of byKind('key'))
    console.log(`  ${k.monster.padEnd(20)} "${k.name}" ${pct(k.weight, k.outOf).padStart(9)}` +
      `  key=${k.key}  ->  ${k.source}` +
      (k.qty !== k.qtySource ? `  qty sim=${k.qty} src=${k.qtySource}` : '') +
      (k.members ? '  [members-only]' : ''));

  const wrong = byKind('weight').concat(byKind('qty'));
  console.log(`\n### WEIGHT / QUANTITY OFF (${wrong.length})`);
  for (const k of wrong)
    console.log(`  ${k.monster.padEnd(20)} ${String(k.key).padEnd(26)}` +
      ` w sim=${k.weight} src=${k.weightSource}` +
      (k.qty !== k.qtySource ? `  qty sim=${k.qty} src=${k.qtySource}` : ''));

  console.log(`\n### QUEST/STATE-GATED IN SOURCE, OMITTED (${r.conditional.length})`);
  for (const k of r.conditional)
    console.log(`  ${k.monster.padEnd(20)} ${k.item.padEnd(26)} ${pct(k.weight, k.outOf).padStart(9)} x${k.qty}`);

  console.log(`\n### IN SOURCE, NOT IN gamedata.js (${r.missing.length})`);
  for (const k of r.missing)
    console.log(`  ${k.monster.padEnd(20)} ${k.item.padEnd(26)} ${pct(k.weight, k.outOf).padStart(8)} x${k.qty}` +
      (k.members ? '  [members-only]' : ''));

  console.log(`\n### IN gamedata.js, NOT IN SOURCE (${r.extra.length})`);
  for (const k of r.extra)
    console.log(`  ${k.monster.padEnd(20)} "${k.name}" key=${k.key} w=${k.weight} x${k.qty}`);

  console.log(`\n### CLEAN (${r.clean.length}): ${r.clean.join(', ')}`);
  console.log(`\n### ALWAYS-DROPS ONLY, NO WEIGHTED ROLL (${r.alwaysOnly.length}): ${r.alwaysOnly.join(', ')}`);
  console.log(`\n### NO SOURCE TABLE IN CHECKOUT (${r.noTable.length}): ${r.noTable.join(', ')}`);
}
module.exports = { audit };
