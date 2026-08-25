'use strict';
// audit-npcstats.js — check gamedata.js monster combat stats against the
// LostCityRS/Content `all.npc` dumps.
//
// Usage:
//   node tools/audit-npcstats.js <all.npc>...
//
// Pass revisions oldest-first; later files overlay earlier ones:
//   node tools/audit-npcstats.js .../_unpack/225/all.npc .../_unpack/274/all.npc
//
// These stats drive accuracy, incoming damage, food per kill and kills/hr, so a
// wrong hitpoints or defence bonus moves every number the app shows for that
// monster.

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { load } = require('./npc-config');

const ROOT = path.join(__dirname, '..');

// gamedata monster id -> all.npc id, where they differ. Identity otherwise.
// The ambiguous ones are resolved by display name plus combat level.
const NPC_ID = {
  man: 'man',
  farmer: 'farmer1',
  guard: 'guard1',
  pirate: 'pirate1',
  ice_warrior: 'icewarrior',
  dwarf: 'dwarf_normal',
  chaos_dwarf: 'dwarf_chaos',
  dark_wizard: 'young_dark_wizard',
  dark_wizard_20: 'bearded_dark_wizard',
  earth_warrior: 'earthwarrior',
  poison_spider: 'poisonspider',
  baby_blue_dragon: 'babybluedragon',
  bear: 'darkbear',
  mossgiant: 'mossgiant',
  icegiant: 'icegiant',
  firegiant: 'firegiant',
  // Quest-added monsters. Their configs live in the quest's own configs folder,
  // and the display name alone is ambiguous (two "Dagannoth", two "Elf warrior"),
  // so these are pinned by combat level.
  mountain_troll: 'death_troll_melee1',    // Mountain Troll, level 69
  dagannoth: 'horror_dagganoth_jr',        // Dagannoth, level 74
  dagannoth_92: 'horror_dagannoth_medium', // Dagannoth, level 92
  rock_crab: 'horror_rockcrab',            // Rock Crab, level 13
  elf_warrior_90: 'regicide_darkelf',      // Elf warrior, level 90
  elf_warrior_108: 'regicide_darkelf2'     // Elf warrior, level 108
};

// gamedata field <- all.npc field.
//
// `zeroWhenAbsent` marks the equipment-bonus params: no param means no bonus,
// so absent really is 0. The combat *levels* are different — a config with no
// `attack=` line has not declared one, and gamedata.js floors those at 1 so the
// accuracy formulas stay well-behaved. Comparing that against 0 would report a
// deliberate choice as a defect, so those are listed separately instead.
const FIELDS = [
  ['level', 'vislevel', false],
  ['hp', 'hitpoints', false],
  ['attack', 'attack', false],
  ['strength', 'strength', false],
  ['defLevel', 'defence', false],
  ['magicLevel', 'magic', false],
  ['defStab', 'stabdefence', true],
  ['defSlash', 'slashdefence', true],
  ['defCrush', 'crushdefence', true],
  ['defRange', 'rangedefence', true],
  ['defMagic', 'magicdefence', true],
  ['attBonus', 'attackbonus', true],
  ['strBonus', 'strengthbonus', true]
];

// NPCs without an explicit attackrate swing every 4 ticks.
const DEFAULT_ATTACK_RATE = 4;

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

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function resolve(monster, npcs, byName) {
  const explicit = NPC_ID[monster.id];
  if (explicit) return npcs[explicit] ? { npc: npcs[explicit], how: 'mapped' } : null;
  if (npcs[monster.id]) return { npc: npcs[monster.id], how: 'id' };
  // Fall back to display name plus combat level, which is unambiguous for the
  // remaining cases and refuses to guess when it is not.
  const cands = (byName.get(norm(monster.name)) || [])
    .filter((n) => n.vislevel === monster.level);
  if (cands.length === 1) return { npc: cands[0], how: 'name+level' };
  return null;
}

function audit(paths, only) {
  const npcs = load(paths);
  const byName = new Map();
  for (const n of Object.values(npcs)) {
    const k = norm(n.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(n);
  }
  const G = loadGameData();
  const report = { diffs: [], unresolved: [], clean: [], undeclared: [], deathDrop: [], notModelled: [], resolvedBy: {} };

  for (const m of G.MONSTERS) {
    if (only && m.id !== only) continue;
    const hit = resolve(m, npcs, byName);
    if (!hit) { report.unresolved.push(m.id); continue; }
    report.resolvedBy[m.id] = { npc: hit.npc.id, how: hit.how };

    const rows = [];
    for (const [ours, theirs, zeroWhenAbsent] of FIELDS) {
      const a = m[ours] ?? 0;
      const declared = hit.npc[theirs] !== undefined;
      if (!declared && !zeroWhenAbsent) {
        if (a > 1) report.undeclared.push({ monster: m.id, field: ours, sim: a });
        continue;
      }
      const b = hit.npc[theirs] ?? 0;
      if (a !== b) rows.push({ field: ours, sim: a, src: b });
    }
    // `damagetype` selects which of the PLAYER's defence bonuses the monster's
    // attack is rolled against — npc_meleeattack and npc_rangeattack both call
    // ~player_defence_roll_specific(npc_param(damagetype)). It is not the
    // monster's own defence, and it is independent of whether the attack is a
    // swing or a shot. trip.js reads m.damageType for this.
    const srcDamage = typeof hit.npc.damagetype === 'string'
      ? hit.npc.damagetype.replace('^', '').replace('_style', '')
      : null;
    if (srcDamage && m.damageType !== srcDamage) {
      report.diffs.push({
        monster: m.id, npc: hit.npc.id,
        rows: [{ field: 'damageType', sim: m.damageType ?? '(none)', src: srcDamage }]
      });
    }

    // A monster whose source `ranged` level exceeds its melee `attack` fires
    // rather than swings, and rolls accuracy and max hit off that level. Those
    // are real gamedata fields now, so they are checked rather than excused.
    // Where ranged and attack are equal the stat is inert — the water elemental
    // carries ranged=30 alongside attack=30 but attacks with stab — so requiring
    // a rangeLevel there would be inventing a distinction source does not make.
    const srcRanged = hit.npc.ranged ?? 0;
    const srcAttack = hit.npc.attack ?? 0;
    if (srcRanged > 0 && srcRanged > srcAttack) {
      const want = {
        rangeLevel: srcRanged,
        rangeAttBonus: hit.npc.rangeattack ?? 0,
        rangeBonus: hit.npc.rangebonus ?? 0
      };
      const rows = [];
      for (const [field, src] of Object.entries(want)) {
        const sim = m[field];
        if (sim !== src) rows.push({ field, sim: sim ?? '(absent)', src });
      }
      if (m.atkType !== 'ranged') {
        rows.push({ field: 'atkType', sim: m.atkType ?? '(absent)', src: 'ranged',
                    note: 'decides which protection prayer blocks it' });
      }
      if (rows.length) report.diffs.push({ monster: m.id, npc: hit.npc.id, rows });
    } else if (srcRanged > 0 && m.rangeLevel != null) {
      report.diffs.push({
        monster: m.id, npc: hit.npc.id,
        rows: [{ field: 'rangeLevel', sim: m.rangeLevel, src: '(none)',
                 note: `source ranged=${srcRanged} does not exceed attack=${srcAttack}` }]
      });
    }

    // Monsters with no weighted drop table are not covered by the drop-table
    // audit, but their whole loot is the config's death_drop, so check it here.
    const loot = m.loot || [];
    if (!loot.some((r) => r.chance != null && r.chance < 1)) {
      const have = loot.filter((r) => r.key).map((r) => r.key).sort();
      const declared = hit.npc.death_drop !== undefined;
      const want = declared && hit.npc.death_drop !== 'null' ? [hit.npc.death_drop] : [];
      // Only a declared death_drop is checkable. Where the config is silent the
      // always-drops come from obj_add lines in the monster's own drop script
      // (bear drops fur and raw meat that way), which the drop-table audit sees.
      report.deathDrop.push({
        monster: m.id, npc: hit.npc.id,
        status: !declared ? 'n/a'
          : (have.length === want.length && have.every((k, i) => k === want[i]) ? 'ok' : 'BAD'),
        have: have.length ? have.join(', ') : '(none)',
        want: !declared ? 'not declared — see drop script'
          : (want.length ? want.join(', ') : 'null (drops nothing)')
      });
    }

    const srcRate = hit.npc.attackrate ?? DEFAULT_ATTACK_RATE;
    if ((m.attackSpeed ?? 0) !== srcRate) {
      rows.push({ field: 'attackSpeed', sim: m.attackSpeed ?? 0, src: srcRate,
                  note: hit.npc.attackrate == null ? '(source has no attackrate; default 4)' : '' });
    }
    if (rows.length) report.diffs.push({ monster: m.id, npc: hit.npc.id, rows });
    else report.clean.push(m.id);
  }
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let only = null;
  if (args.length && !fs.existsSync(args[args.length - 1])) only = args.pop();
  if (!args.length) { console.error('usage: node tools/audit-npcstats.js <all.npc>... [monsterId]'); process.exit(2); }
  const r = audit(args, only);

  let fields = 0;
  console.log(`\n### STAT MISMATCHES (${r.diffs.length} monsters)`);
  for (const d of r.diffs) {
    console.log(`\n  ${d.monster}  (source: ${d.npc})`);
    for (const row of d.rows) {
      fields++;
      console.log(`     ${row.field.padEnd(12)} sim=${String(row.sim).padStart(5)}` +
        `   src=${String(row.src).padStart(5)}` + (row.note ? '  ' + row.note : ''));
    }
  }
  console.log(`\n  ${fields} field(s) differ across ${r.diffs.length} monster(s)`);
  if (r.undeclared.length) {
    console.log(`\n### LEVEL NOT DECLARED IN SOURCE (${r.undeclared.length})`);
    for (const u of r.undeclared)
      console.log(`  ${u.monster.padEnd(20)} ${u.field.padEnd(12)} gamedata=${u.sim}, source has no line`);
  }

  if (r.deathDrop.length) {
    const bad = r.deathDrop.filter((d) => d.status === 'BAD');
    console.log(`\n### DEATH-DROP ONLY, NO WEIGHTED TABLE (${r.deathDrop.length}` +
      `, ${bad.length} mismatched)`);
    for (const d of r.deathDrop)
      console.log(`  ${d.status.padEnd(3)} ${d.monster.padEnd(20)}` +
        ` gamedata=[${d.have}]  source death_drop=${d.want}`);
  }

  console.log(`\n### CLEAN (${r.clean.length}): ${r.clean.join(', ')}`);
  console.log(`\n### NO NPC CONFIG FOUND (${r.unresolved.length}): ${r.unresolved.join(', ')}`);
}
module.exports = { audit };
