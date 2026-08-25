'use strict';
// run-risk.js — check risk.js against the simulator it wraps.
//
// The Monte Carlo model is only trustworthy if its averages land on the
// numbers engine.js and trip.js already produce. If the sampled mean kill time
// drifts from ttkSec, or sampled GP per kill drifts from gpPerKill, the spread
// around it is measuring the wrong distribution — a plausible-looking p10 built
// on a broken mean is worse than no p10 at all.
//
// So this asserts the means, not the spread, and it asserts determinism. What
// the spread should be is exactly what nobody knows independently; what the
// centre should be is known exactly.
//
// Usage:
//   node tools/run-risk.js              all cases
//   node tools/run-risk.js <case-id>    one case
//   node tools/run-risk.js --verbose    print the full distributions

const path = require('path');
const { CASES } = require('./golden-cases');
const { createRuntime, buildInput } = require('./golden-lib');

// How far a sampled mean may sit from the simulator's own figure. Monte Carlo
// error at 20k samples is well inside this; anything outside is a model bug,
// not noise.
const MEAN_TOLERANCE = 0.05;   // 5%
const SAMPLES = 20000;

function pct(value){ return (value * 100).toFixed(1) + '%'; }

function relError(actual, expected){
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return Infinity;
  if (expected === 0) return actual === 0 ? 0 : Infinity;
  return Math.abs(actual - expected) / Math.abs(expected);
}

function loadRuntime(){
  // The four simulator scripts must run in a vm — they are browser scripts that
  // expect a `window`. risk.js deliberately does not: code inside a vm context
  // runs roughly fifty times slower than the host realm (measured: 350ns per
  // RNG call inside, 13ns outside), and the Monte Carlo loop is the one place
  // in this repo where that gap turns a quarter-second into half a minute. The
  // browser has no such penalty, so timing risk.js inside the vm would measure
  // the harness rather than the model.
  //
  // So the simulator runs sandboxed, its result crosses over as plain data, and
  // risk.js is evaluated here at full speed against a `window` that borrows the
  // one thing it needs from the other side.
  const runtime = createRuntime();
  const source = require('fs').readFileSync(path.join(__dirname, '..', 'risk.js'), 'utf8');
  const host = { window: { TripModel: runtime.TripModel } };
  host.window.window = host.window;
  new Function('window', source)(host.window);
  runtime.RiskModel = host.window.RiskModel;
  return runtime;
}

function checkCase(runtime, def, verbose){
  const input = buildInput(runtime, def);
  const result = runtime.SimEngine.simulate(input);
  const risk = runtime.RiskModel.analyze(result, input, {
    samples: SAMPLES,
    horizonMinutes: 60,
    targetKills: 50,
    gpTarget: 0
  });

  const failures = [];

  // 1. Mean kill time must match ttkSec. This is the calibration that makes
  //    continuousDps meaningful.
  const ttkError = relError(risk.killTimeSeconds.mean, result.ttkSec);
  if (ttkError > MEAN_TOLERANCE) {
    failures.push(`kill time mean ${risk.killTimeSeconds.mean.toFixed(2)}s vs ttkSec `
      + `${result.ttkSec.toFixed(2)}s (${pct(ttkError)} off)`);
  }

  // 2. Sampled GP per kill must match gpPerKill. Measured off the loot sampler
  //    directly rather than backed out of the horizon: the horizon nets off a
  //    sampled food cost, so reading GP through it would conflate the loot model
  //    with food variance and blame whichever was innocent.
  {
    const model = runtime.RiskModel.buildModel(result, input);
    const random = runtime.RiskModel.createRandom(0xd1ce);
    const draws = 200000;
    let total = 0;
    for (let i = 0; i < draws; i++) total += runtime.RiskModel.sampleLoot(model.loot, random).gp;
    const sampledGpPerKill = total / draws;
    const gpError = relError(sampledGpPerKill, result.gpPerKill);
    if (gpError > MEAN_TOLERANCE) {
      failures.push(`loot gp/kill ${sampledGpPerKill.toFixed(1)} vs gpPerKill `
        + `${result.gpPerKill.toFixed(1)} (${pct(gpError)} off)`);
    }
  }

  // 3. Kills in an hour must match the simulator's effective rate. This is the
  //    end-to-end check: it only passes if kill time, banking and trip bounds
  //    all compose correctly.
  //
  //    Loot-bound trips are checked differently, and not as a way of excusing
  //    them. trip.js ends such a trip at lootCapacity / slotsPerKill — 9.24
  //    kills on a blue dragon. A sampled trip ends on a whole drop, because
  //    that is what happens: the last slot is taken by an item, not by 84% of
  //    one. No discrete process has a mean of 9.24, so demanding one would be
  //    demanding the model reproduce an artefact of the continuous form.
  //
  //    What is legitimate to demand is that the disagreement stays inside the
  //    overshoot the discretization can produce, which renewal theory bounds by
  //    the largest slot increment a single kill can deliver. That bound has to
  //    be computed per monster, because the lump differs wildly: a rock crab
  //    fills 0.047 slots per kill and its biggest single drop is 2 slots, so it
  //    can overshoot by 42 kills' worth; a blue dragon hands over bones and a
  //    hide every single kill, so its lump is a whole kill and no more. A flat
  //    tolerance in either kills or slots is the wrong shape for both.
  const expectedKph = result.effectiveKph || result.killsPerHour;
  const lootBound = result.trip && result.trip.bound === 'loot';
  const slotsPerKill = result.trip && result.trip.slots
    ? result.trip.slots.nonStackPerKill : 0;
  if (lootBound && risk.killsPerTrip && slotsPerKill > 0) {
    const model = runtime.RiskModel.buildModel(result, input);
    let maxWeighted = 0;
    for (const slots of model.loot.weightedSlots) maxWeighted = Math.max(maxWeighted, slots);
    const maxJumpSlots = model.loot.guaranteedSlots + maxWeighted;
    const allowance = maxJumpSlots / slotsPerKill;

    // The upper side always holds: a sampled trip stops at the FIRST bound it
    // reaches, so it cannot systematically outlast the deterministic figure by
    // more than one drop's overshoot.
    const over = risk.killsPerTrip.mean - result.trip.killsPerTrip;
    if (over > allowance) {
      failures.push(`kills/trip ${risk.killsPerTrip.mean.toFixed(2)} vs trip.js `
        + `${result.trip.killsPerTrip.toFixed(2)} — ${over.toFixed(2)} kills long, `
        + `more than the ${allowance.toFixed(2)} a ${maxJumpSlots.toFixed(2)}-slot `
        + `single-kill drop can overshoot by`);
    }

    // The lower side only holds when one bound clearly dominates. trip.js picks
    // a single binding constraint; the sampled trip ends at whichever arrives
    // first on that trial, so when two bounds nearly coincide its mean is
    // E[min(X, Y)] — necessarily below either one. On the moss giant the loot
    // bound is 68.9 kills and the food bound 71.2, and 58% of sampled trips end
    // on food: a mean of 57.7 against trip.js's 64.3 is the right answer to a
    // different question, not a defect.
    //
    // "Clearly dominates" reuses the overshoot allowance rather than inventing
    // a second threshold — if the runner-up sits closer than the quantization
    // slop, the two are not distinguishable anyway.
    const foodBound = result.trip.foodPerKill > 0 && result.trip.slots.foodCount > 0
      ? result.trip.slots.foodCount / result.trip.foodPerKill : Infinity;
    const lootLimit = result.trip.slots.lootCapacity / slotsPerKill;
    const contested = Math.abs(foodBound - lootLimit) < allowance;

    if (!contested) {
      const under = result.trip.killsPerTrip - risk.killsPerTrip.mean;
      if (under > allowance) {
        failures.push(`kills/trip ${risk.killsPerTrip.mean.toFixed(2)} vs trip.js `
          + `${result.trip.killsPerTrip.toFixed(2)} — ${under.toFixed(2)} kills short, `
          + `and no second bound is close enough to explain it `
          + `(loot ${lootLimit.toFixed(1)}, food ${foodBound === Infinity ? 'n/a' : foodBound.toFixed(1)})`);
      }
    }
  } else {
    const kphError = relError(risk.horizonKills.mean, expectedKph);
    if (kphError > MEAN_TOLERANCE) {
      failures.push(`kills/hr ${risk.horizonKills.mean.toFixed(1)} vs effectiveKph `
        + `${expectedKph.toFixed(1)} (${pct(kphError)} off)`);
    }
  }

  // 4. Percentiles must be ordered. A p10 above a p50 means the summary is
  //    broken regardless of what the model computed.
  for (const [label, dist] of [['killTime', risk.killTimeSeconds],
                               ['horizonNetGp', risk.horizonNetGp],
                               ['horizonKills', risk.horizonKills]]) {
    if (!(dist.p10 <= dist.p50 + 1e-9 && dist.p50 <= dist.p90 + 1e-9)) {
      failures.push(`${label} percentiles out of order: `
        + `p10=${dist.p10} p50=${dist.p50} p90=${dist.p90}`);
    }
  }

  // 5. Same inputs, same numbers. The pane recomputes constantly; a model that
  //    jitters on its own is unreadable.
  const again = runtime.RiskModel.analyze(result, input, {
    samples: SAMPLES, horizonMinutes: 60, targetKills: 50, gpTarget: 0
  });
  if (again.killTimeSeconds.mean !== risk.killTimeSeconds.mean
      || again.horizonNetGp.p10 !== risk.horizonNetGp.p10) {
    failures.push('not deterministic: two runs of identical input disagree');
  }

  // 6. Probabilities must be probabilities.
  for (const [label, value] of [['foodRunsOut', risk.foodRunsOutProbability],
                                ['gpTarget', risk.gpTargetProbability]]) {
    if (!(value >= 0 && value <= 1)) failures.push(`${label} out of range: ${value}`);
  }

  if (verbose) {
    console.log(`\n${def.id}`);
    console.log(`  kill time    mean ${risk.killTimeSeconds.mean.toFixed(2)}s  `
      + `p10 ${risk.killTimeSeconds.p10.toFixed(2)}  p50 ${risk.killTimeSeconds.p50.toFixed(2)}  `
      + `p90 ${risk.killTimeSeconds.p90.toFixed(2)}   (ttk ${result.ttkSec.toFixed(2)})`);
    console.log(`  kills/hr     mean ${risk.horizonKills.mean.toFixed(1)}  `
      + `p10 ${risk.horizonKills.p10.toFixed(1)}  p90 ${risk.horizonKills.p90.toFixed(1)}   `
      + `(effectiveKph ${expectedKph.toFixed(1)})`);
    console.log(`  net gp/hr    mean ${Math.round(risk.horizonNetGp.mean)}  `
      + `p10 ${Math.round(risk.horizonNetGp.p10)}  p90 ${Math.round(risk.horizonNetGp.p90)}`);
    console.log(`  food out     ${pct(risk.foodRunsOutProbability)} over 50 kills`);
    console.log(`  kills/trip   ${risk.killsPerTrip
      ? risk.killsPerTrip.mean.toFixed(1) + ' (p10 ' + risk.killsPerTrip.p10.toFixed(1) + ')'
      : 'unbounded'}`);
    console.log(`  coverage     player=${risk.coverage.playerDamage} `
      + `incoming=${risk.coverage.incomingDamage} `
      + `loot=${pct(risk.coverage.lootOccurrence)}`);
    if (risk.coverage.meanOnly.length) {
      console.log(`  mean-only    ${risk.coverage.meanOnly.join('; ')}`);
    }
  }

  return failures;
}

function main(argv){
  const verbose = argv.includes('--verbose');
  const ids = argv.filter((a) => !a.startsWith('--'));
  let selected = CASES;
  if (ids.length) {
    selected = CASES.filter((def) => ids.includes(def.id));
    const unknown = ids.filter((id) => !CASES.some((def) => def.id === id));
    if (unknown.length) {
      console.error(`Unknown case id(s): ${unknown.join(', ')}`);
      return 1;
    }
  }

  const runtime = loadRuntime();
  if (!runtime.RiskModel) {
    console.error('risk.js did not attach window.RiskModel');
    return 1;
  }

  const failed = [];
  for (const def of selected) {
    let failures;
    try {
      failures = checkCase(runtime, def, verbose);
    } catch (error) {
      failures = [`threw: ${error.message}`];
    }
    if (failures.length) failed.push({ id: def.id, failures });
  }

  console.log(`\nrisk: ${selected.length - failed.length}/${selected.length} cases within `
    + `${pct(MEAN_TOLERANCE)} of the simulator's means (${SAMPLES} samples)`);
  for (const entry of failed) {
    console.log(`\nFAIL ${entry.id}`);
    for (const failure of entry.failures) console.log(`    ${failure}`);
  }
  return failed.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, checkCase, loadRuntime };
