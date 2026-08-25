'use strict';
// npc-config.js — parse LostCityRS/Content `all.npc` dumps.
//
// Blocks look like:
//   [poisonspider]
//   name=Poison spider
//   vislevel=64
//   hitpoints=64
//   attack=50
//   param=stabdefence,20
//
// A revision folder may hold only the entries that revision added, so later
// revisions are overlaid on earlier ones rather than replacing them.

const fs = require('fs');

// Combat fields index-sim cares about. Everything else (models, anims, sounds)
// is ignored.
const SCALARS = ['vislevel', 'hitpoints', 'attack', 'strength', 'defence',
                 'magic', 'ranged', 'size', 'respawnrate'];
const PARAMS = [
  'stabdefence', 'slashdefence', 'crushdefence', 'magicdefence', 'rangedefence',
  'attackbonus', 'strengthbonus', 'attackrate', 'poison_severity', 'death_drop',
  // `damagetype` is the style the NPC's attack is checked against — it selects
  // the PLAYER's defence bonus in npc_meleeattack and npc_rangeattack alike
  // (`~player_defence_roll_specific(npc_param(damagetype))`). It is not the
  // monster's own defence. `rangeattack`/`rangebonus` are the ranged pair of
  // attackbonus/strengthbonus, used when the npc attacks with ~npc_rangeattack.
  'damagetype', 'rangeattack', 'rangebonus'
];

function parseFile(text, into) {
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const head = /^\[([A-Za-z0-9_]+)\]$/.exec(line);
    if (head) { cur = into[head[1]] || (into[head[1]] = { id: head[1] }); continue; }
    if (!cur) continue;
    const kv = /^([a-z0-9_]+)=(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv;
    if (key === 'name') { cur.name = value; continue; }
    if (SCALARS.includes(key)) { cur[key] = Number(value); continue; }
    if (key === 'param') {
      const [pName, pValue] = value.split(',');
      if (PARAMS.includes(pName)) {
        cur[pName] = /^-?\d+$/.test(pValue) ? Number(pValue) : pValue;
      }
    }
  }
  return into;
}

// Collect .npc files under a directory. `_unpack/<rev>/all.npc` dumps are
// returned first in numeric revision order, because each revision folder holds
// only what that revision added and later ones must overlay earlier ones.
// Area and quest configs come after: they define their own NPCs, and where they
// overlap a dump they are the maintained copy.
function npcFiles(dir) {
  const path_ = require('path');
  const found = [];
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path_.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.npc')) found.push(full);
    }
  })(dir);
  const rev = (p) => {
    const m = /_unpack[\\/](\d+)[\\/]/.exec(p);
    return m ? Number(m[1]) : null;
  };
  const dumps = found.filter((p) => rev(p) !== null).sort((a, b) => rev(a) - rev(b));
  const configs = found.filter((p) => rev(p) === null).sort();
  return [...dumps, ...configs];
}

// Paths are applied in order, so pass the oldest revision first. A directory is
// expanded via npcFiles().
function load(paths) {
  const out = {};
  const expanded = [];
  for (const p of paths) {
    if (fs.statSync(p).isDirectory()) expanded.push(...npcFiles(p));
    else expanded.push(p);
  }
  for (const p of expanded) parseFile(fs.readFileSync(p, 'utf8'), out);
  return out;
}

module.exports = { load };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('usage: node tools/npc-config.js <all.npc>... [npcId]'); process.exit(2); }
  // Trailing arg is an id if it is not a readable file.
  let id = null;
  if (args.length > 1 && !fs.existsSync(args[args.length - 1])) id = args.pop();
  const npcs = load(args);
  if (!id) { console.log(Object.keys(npcs).sort().join('\n')); process.exit(0); }
  const n = npcs[id];
  if (!n) { console.error('no npc ' + id); process.exit(1); }
  for (const [k, v] of Object.entries(n)) console.log(String(k).padEnd(16), v);
}
