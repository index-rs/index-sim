'use strict';
// run-golden.js — run every scenario in tools/golden-cases.js through the
// simulator and compare the result against tools/golden-baseline.json.
//
// This is a regression net, not a correctness check. The baseline is whatever
// the simulator produced when it was last recorded; nothing here asserts those
// numbers are *right*. What it catches is a change that moves them without
// anyone meaning to — a refactor of engine.js, an edit to a shared helper in
// trip.js, a gamedata.js price or drop-rate change with wider reach than
// expected. Correctness against the game is what tools/audit-droptables.js and
// tools/audit-npcstats.js are for.
//
// Usage:
//   node tools/run-golden.js                 compare all cases
//   node tools/run-golden.js <case-id>...    compare some cases
//   node tools/run-golden.js --update        re-record the baseline
//   node tools/run-golden.js --list          list case ids
//   node tools/run-golden.js --verbose       show every differing field
//
// Exit code is 1 on any mismatch, so it works as a pre-commit or CI gate.

const fs = require('fs');
const path = require('path');
const { CASES } = require('./golden-cases');
const { createRuntime, buildInput, summarize, SCRIPT_FILES, ROOT } = require('./golden-lib');

const BASELINE_PATH = path.join(__dirname, 'golden-baseline.json');
const SCHEMA_VERSION = 1;

// How far a number may drift and still pass. Summaries are already rounded to
// 6 decimals, so this only absorbs floating-point noise between platforms — it
// is not a slack allowance for behaviour changes.
const TOLERANCE = 1e-6;

// Walk two summaries in parallel and collect every leaf that differs. Paths are
// dotted (`trip.slots.foodCount`, `topLoot.0.evGp`) so a failure names the exact
// field rather than dumping two large objects side by side.
function diff(expected, actual, at = '', out = []) {
  if (expected === actual) return out;

  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Math.abs(expected - actual) > TOLERANCE) out.push({ at, expected, actual });
    return out;
  }

  const isObj = (v) => v !== null && typeof v === 'object';
  if (!isObj(expected) || !isObj(actual)) {
    out.push({ at, expected, actual });
    return out;
  }

  if (Array.isArray(expected) !== Array.isArray(actual)) {
    out.push({ at, expected, actual });
    return out;
  }

  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) {
      out.push({ at: at + '.length', expected: expected.length, actual: actual.length });
    }
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
      diff(expected[i], actual[i], `${at}.${i}`, out);
    }
    return out;
  }

  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    diff(expected[key], actual[key], at ? `${at}.${key}` : key, out);
  }
  return out;
}

function show(value) {
  if (value === undefined) return '(absent)';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// A case's stored input is a redundant copy of what golden-cases.js already
// says, kept so a baseline file is readable on its own and so a case edited
// without re-recording shows up as an input diff rather than a silent pass.
function recordInput(def) {
  return {
    combatType: def.combatType,
    monsterId: def.monsterId,
    weapon: def.weapon ?? null,
    ammo: def.ammo ?? null,
    spell: def.spell ?? null,
    style: def.style ?? null,
    levels: def.levels ?? null,
    // Resolved, not verbatim: a case that says nothing about prayers is
    // simulated with ['none'], and that is what the record should show.
    prayers: def.prayers ?? ['none'],
    boosts: def.boosts ?? ['none'],
    sustained: def.sustained ?? false,
    repotThreshold: def.repotThreshold ?? null,
    trip: def.trip ?? null,
    ringOfWealth: def.ringOfWealth ?? false,
    specWeapon: def.specWeapon ?? 'none',
    cannon: def.cannon ?? null,
    lootPrefs: def.lootPrefs ?? null
  };
}

function runAll(selected) {
  // One runtime for the whole pass. simulate() is handed a deep copy of its
  // monster and the case inputs are built fresh each time, so cases do not
  // bleed into each other; reloading four scripts per case would only be slower.
  const runtime = createRuntime();
  return selected.map((def) => ({
    id: def.id,
    description: def.description,
    input: recordInput(def),
    expected: summarize(runtime.SimEngine.simulate(buildInput(runtime, def)))
  }));
}

function update(selected) {
  const previous = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    : null;

  // A partial re-record keeps the untouched cases from the old baseline, so
  // `--update <one-case>` after a deliberate single-case change does not quietly
  // bless drift everywhere else.
  const recorded = runAll(selected);
  const byId = new Map(recorded.map((c) => [c.id, c]));
  const cases = CASES.map((def) => {
    if (byId.has(def.id)) return byId.get(def.id);
    const old = previous && previous.cases.find((c) => c.id === def.id);
    if (!old) throw new Error(`No baseline for ${def.id}; re-record all cases`);
    return old;
  });

  const baseline = {
    schemaVersion: SCHEMA_VERSION,
    capturedAt: new Date().toISOString().slice(0, 10),
    source: {
      scripts: SCRIPT_FILES,
      entrypoint: 'SimEngine.simulate() via Node vm context',
      excludedScripts: ['market.js', 'planner-core.js', 'views.jsx', 'planner.jsx'],
      priceSource:
        'gamedata.js embedded ITEM_PRICES and ALCH_VALUES; no market sync or localStorage state'
    },
    tolerances: {
      defaultNumericAbs: TOLERANCE,
      note: 'Summaries are rounded to 6 decimals before comparison; tolerance exists for floating point drift.'
    },
    cases
  };

  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(
    `Recorded ${recorded.length} case(s) into ${path.relative(ROOT, BASELINE_PATH)}` +
      ` (${cases.length} total, captured ${baseline.capturedAt}).`
  );
}

function compare(selected, verbose) {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error('No baseline yet. Record one with: node tools/run-golden.js --update');
    return 1;
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  if (baseline.schemaVersion !== SCHEMA_VERSION) {
    console.error(
      `Baseline schemaVersion ${baseline.schemaVersion} != ${SCHEMA_VERSION}; re-record it.`
    );
    return 1;
  }

  const stored = new Map(baseline.cases.map((c) => [c.id, c]));
  const results = runAll(selected);
  const failures = [];
  const missing = [];

  for (const result of results) {
    const want = stored.get(result.id);
    if (!want) {
      missing.push(result.id);
      continue;
    }
    const fields = diff(want.expected, result.expected);
    const inputs = diff(want.input, result.input);
    if (fields.length || inputs.length) failures.push({ id: result.id, fields, inputs });
  }

  const orphans = baseline.cases
    .map((c) => c.id)
    .filter((id) => !CASES.some((def) => def.id === id));

  const passed = results.length - failures.length - missing.length;
  console.log(`golden: ${passed}/${results.length} passed (baseline ${baseline.capturedAt})`);

  for (const failure of failures) {
    console.log(`\nFAIL ${failure.id}`);
    if (failure.inputs.length) {
      console.log('  case definition changed since the baseline was recorded:');
      for (const d of failure.inputs) {
        console.log(`    ${d.at.padEnd(34)} baseline=${show(d.expected)}  now=${show(d.actual)}`);
      }
    }
    const shown = verbose ? failure.fields : failure.fields.slice(0, 12);
    for (const d of shown) {
      console.log(`    ${d.at.padEnd(34)} baseline=${show(d.expected)}  now=${show(d.actual)}`);
    }
    if (shown.length < failure.fields.length) {
      console.log(`    ... and ${failure.fields.length - shown.length} more (--verbose for all)`);
    }
  }

  if (missing.length) {
    console.log(`\nNO BASELINE (${missing.length}): ${missing.join(', ')}`);
    console.log('  These cases are new. Record them with --update.');
  }
  if (orphans.length) {
    console.log(`\nSTALE IN BASELINE (${orphans.length}): ${orphans.join(', ')}`);
    console.log('  No case in golden-cases.js has these ids. Re-record to drop them.');
  }

  if (failures.length || missing.length) {
    console.log('\nIf the change was intended, re-record: node tools/run-golden.js --update');
    return 1;
  }
  return 0;
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const ids = argv.filter((a) => !a.startsWith('--'));

  if (flags.has('--list')) {
    for (const def of CASES) console.log(`${def.id}\n    ${def.description}`);
    return 0;
  }

  let selected = CASES;
  if (ids.length) {
    selected = CASES.filter((def) => ids.includes(def.id));
    const unknown = ids.filter((id) => !CASES.some((def) => def.id === id));
    if (unknown.length) {
      console.error(`Unknown case id(s): ${unknown.join(', ')}`);
      console.error('List them with: node tools/run-golden.js --list');
      return 1;
    }
  }

  if (flags.has('--update')) {
    update(selected);
    return 0;
  }
  return compare(selected, flags.has('--verbose'));
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, diff, runAll, BASELINE_PATH };
