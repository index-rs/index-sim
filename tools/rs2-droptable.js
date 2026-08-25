'use strict';
// rs2-droptable.js — parse LostCityRS/Content drop-table RuneScript into
// plain {item, qty, weight} rows so gamedata.js can be checked against source.
//
// Usage:
//   node tools/rs2-droptable.js <content-scripts-dir> [npcId]
//
// <content-scripts-dir> is the "drop tables/scripts" folder of a Content
// checkout. With no npcId it lists every NPC table it resolved.
//
// Scope: the `random(N)` / `if ($random < K)` chains that make up a 2004-era
// drop table, plus the always-drop from npc_param(death_drop) and the
// ~trail_*cluedrop tertiary. Aggregate rolls (~randomherb, ~randomjewel) are
// left as markers — gamedata.js models those as its own expandable sub-tables.

const fs = require('fs');
const path = require('path');

// A file is a sequence of [kind,name] blocks.
function blocks(text) {
  const out = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const h = /^\[([a-z_0-9]+),([A-Za-z0-9_]+)\]/.exec(raw);
    if (h) { cur = { kind: h[1], name: h[2], head: raw, lines: [] }; out.push(cur); }
    else if (cur) cur.lines.push(raw);
  }
  return out;
}

// Quantities are literals or ~random_range(a,b); anything else is unmodellable.
function qtyOf(s) {
  s = s.trim();
  const rr = /^~random_range\((\d+)\s*,\s*(\d+)\)$/.exec(s);
  if (rr) return (Number(rr[1]) + Number(rr[2])) / 2;
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

function parseBody(lines) {
  const rows = [];
  let total = null, prev = 0, cur = null;
  // A `map_members` gate can carry an else branch holding the free-to-play
  // alternative for the same roll. LostCity runs as members, so those rows are
  // tagged and callers drop them — counting both sides double-counts the roll.
  let gate = null; // 'members' | 'f2p'
  const push = (item, qty, weight, note) =>
    rows.push({ item, qty, weight, members: gate === 'members',
                f2pOnly: gate === 'f2p',
                conditional: Boolean(cur && cur.conditional), note });

  for (const raw of lines) {
    const line = raw.trim();

    // random(n) rolls 0..n-1; randominc(n) is inclusive, so n+1 outcomes.
    // jogre confirms it: randominc(128) alongside ~trail_mediumcluedrop(129).
    const tot = /\$random\s*=\s*(random|randominc)\((\d+)\)/.exec(line);
    if (tot) {
      total = Number(tot[2]) + (tot[1] === 'randominc' ? 1 : 0);
      prev = 0; cur = null; continue;
    }

    // A branch may carry extra clauses, e.g.
    //   if ($random < 90 & %itgronigen >= ^itgronigen_complete)
    // which gates the drop behind quest state. It still consumes its slice of
    // the roll, so the weight counts, but the row is not unconditional loot.
    const cond = /^\}?\s*(?:else\s+)?if\s*\(\s*\$random\s*<\s*(\d+)\s*(&[^)]*)?\)/.exec(line);
    // Do NOT continue here: some tables are written brace-less with the
    // obj_add on the same line, e.g. "if ($random < 4) obj_add(...);".
    if (cond) {
      const n = Number(cond[1]);
      cur = { w: n - prev, conditional: Boolean(cond[2]) };
      prev = n;
    }

    // A members gate wraps the obj_add on the following line(s).
    if (/if\s*\(\s*map_members\s*=\s*\^true\s*\)/.test(line)) { gate = 'members'; continue; }
    if (gate && /^\}\s*else\s*\{/.test(line)) { gate = 'f2p'; continue; }
    if (gate && /^\}/.test(line) && !cond) { gate = null; }

    const clue = /~trail_(easy|medium|hard)cluedrop\((\d+)/.exec(line);
    if (clue) {
      rows.push({ item: 'clue_' + clue[1], qty: 1, weight: 1,
                  outOf: Number(clue[2]), members: false, note: 'tertiary' });
      continue;
    }

    // Quantity may be ~random_range(a,b) — its comma must not split the args.
    const oa = /obj_add\(\s*npc_coord\s*,\s*((?:[^,()]|\([^)]*\))+?)\s*,\s*((?:[^,()]|\([^)]*\))+?)\s*,\s*\^lootdrop_duration/.exec(line);
    if (oa) {
      const item = oa[1].trim();
      if (/npc_param\(death_drop\)/.test(item)) { push('__death_drop__', 1, 'always'); continue; }
      push(item, qtyOf(oa[2]), cur ? cur.w : 'always');
      continue;
    }
    // ~randomherb / ~randomjewel take no explicit quantity.
    const agg = /obj_add\(\s*npc_coord\s*,\s*(~[a-z_]+)\s*,\s*\^lootdrop_duration/.exec(line);
    if (agg) { push(agg[1], 1, cur ? cur.w : 'always'); continue; }
  }
  return { total, rows };
}

// Drop tables are not all under "drop tables/". Monsters added by a quest or
// an area keep their tables in that quest/area folder — the elves live in
// quest_regicide, the dagannoths in quest_horror — so walk the whole tree.
function rs2Files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...rs2Files(full));
    else if (entry.name.endsWith('.rs2')) out.push(full);
  }
  return out;
}

function load(dir) {
  const named = {}, direct = {}, refs = {};
  for (const full of rs2Files(dir)) {
    const f = path.relative(dir, full).replace(/\\/g, '/');
    const text = fs.readFileSync(full, 'utf8');
    for (const b of blocks(text)) {
      const parsed = parseBody(b.lines);
      parsed.file = f;
      if (b.kind === 'ai_queue3') {
        direct[b.name] = parsed;
        // "[ai_queue3,x] @tbl;" and "~tbl;" both delegate to a shared table.
        const body = b.head + '\n' + b.lines.join('\n');
        const seen = [...body.matchAll(/[@~]([A-Za-z0-9_]+)\s*;/g)]
          .map((m) => m[1])
          .filter((n) => !/^(randomherb|randomjewel|trail_|npc_death)/.test(n));
        if (seen.length) refs[b.name] = seen;
      } else named[b.name] = parsed;
    }
  }
  // Splice each delegated table into the NPC that calls it. The calling block
  // usually still owns the always-drop, so rows are merged, not replaced.
  for (const [npc, list] of Object.entries(refs)) {
    for (const t of list) {
      const tgt = named[t];
      if (!tgt) continue;
      direct[npc].rows = direct[npc].rows.concat(tgt.rows);
      if (direct[npc].total == null) direct[npc].total = tgt.total;
      direct[npc].via = (direct[npc].via || []).concat(t);
    }
  }
  return { direct, named };
}

module.exports = { load };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node tools/rs2-droptable.js <content "drop tables/scripts" dir> [npcId]'); process.exit(2); }
  const { direct, named } = load(dir);
  const want = process.argv[3];
  if (!want) { console.log(Object.keys(direct).sort().join('\n')); process.exit(0); }
  const t = direct[want] || named[want];
  if (!t) { console.error('no table for ' + want); process.exit(1); }
  console.log(`${want}  total=${t.total}  file=${t.file}${t.via ? '  via ' + t.via.join(',') : ''}`);
  for (const r of t.rows) {
    console.log(
      '  ' + String(r.weight).padStart(5) + '  ' + String(r.item).padEnd(26) +
      'x' + r.qty + (r.members ? '  [members]' : '') + (r.note ? '  ' + r.note : '')
    );
  }
}
