'use strict';
// run-dist.js — check dist.js against the simulator whose attack it describes.
//
// The distribution is exact arithmetic, not sampling, so there is no noise to
// tolerate and nothing to average out. That makes the contract unusually
// strict: the mean of the distribution must equal the engine's own mean to
// floating-point precision, because both sides are computing hitChance x
// maxHit / 2 by different routes. A gap of any size is a real disagreement.
//
// What it asserts, per golden case:
//
//   1. total probability is 1                    (nothing lost, nothing double-counted)
//   2. normal mean  == result.avgHit             (the engine's own attack mean)
//   3. normal max   == result.peakMaxHit         (the mixture spans up to the peak)
//   4. spec mean    == specInfo.expPerSpec       (the engine's own spec mean)
//   5. spec miss    == (1 - hitChance) ^ hits    (independence across spec hits)
//   6. cumulative is monotone, starts at 1, and agrees with koChance
//
// Plus a handful of algebraic identities that hold regardless of any case.
//
// Usage:
//   node tools/run-dist.js              all cases
//   node tools/run-dist.js <case-id>    one case
//   node tools/run-dist.js --verbose    print each distribution

const fs = require('fs');
const path = require('path');
const { CASES } = require('./golden-cases');
const { createRuntime, buildInput } = require('./golden-lib');

// Both sides compute the same product in a different order, so the only gap
// allowed is float association. This is deliberately far tighter than the risk
// harness's 5%: that one samples, this one does not.
const EPSILON = 1e-9;

function relError(actual, expected){
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return Infinity;
  if (expected === 0) return Math.abs(actual) < EPSILON ? 0 : Infinity;
  return Math.abs(actual - expected) / Math.abs(expected);
}

function loadRuntime(){
  // Same split as tools/run-risk.js: the four browser scripts need a vm and a
  // `window`, dist.js needs neither beyond the global it attaches itself to.
  // It is pure arithmetic over plain numbers, so it is evaluated in the host
  // realm and handed results that have already crossed back as data.
  const runtime = createRuntime();
  const source = fs.readFileSync(path.join(__dirname, '..', 'dist.js'), 'utf8');
  const host = { window: {} };
  host.window.window = host.window;
  new Function('window', source)(host.window);
  runtime.HitDist = host.window.HitDist;
  return runtime;
}

function checkDistributionShape(dist, label, failures){
  if (relError(dist.probabilityTotal, 1) > EPSILON) {
    failures.push(`${label}: probabilities sum to ${dist.probabilityTotal} (want 1)`);
  }
  if (dist.buckets.some((bucket) => bucket.probability < 0)) {
    failures.push(`${label}: negative probability in a bucket`);
  }
  // The bucket list is the miss bucket plus one per damage value.
  if (dist.buckets.length !== dist.maxHit + 2) {
    failures.push(`${label}: ${dist.buckets.length} buckets for maxHit ${dist.maxHit} (want ${dist.maxHit + 2})`);
  }
  // hitChance is defined as the complement of the miss mass, so a landed hit
  // for zero has to be inside it. If these ever disagree the accurate/miss
  // split has collapsed somewhere in the composition.
  if (relError(dist.hitChance + dist.missChance, 1) > EPSILON) {
    failures.push(`${label}: hitChance + missChance = ${dist.hitChance + dist.missChance} (want 1)`);
  }
}

function checkCumulative(runtime, dist, label, failures){
  const cumulative = runtime.HitDist.cumulative(dist);
  if (cumulative[0] !== 1) {
    failures.push(`${label}: cumulative[0] = ${cumulative[0]} (want 1 — every attack deals at least 0)`);
  }
  for (let damage = 1; damage <= dist.maxHit; damage++){
    if (cumulative[damage] > cumulative[damage - 1] + EPSILON) {
      failures.push(`${label}: cumulative rises at ${damage} (${cumulative[damage - 1]} -> ${cumulative[damage]})`);
      break;
    }
    // koChance answers the same question the cumulative curve does, by a
    // different loop. They must not drift apart.
    const ko = runtime.HitDist.koChance(dist, damage);
    if (relError(ko, cumulative[damage]) > EPSILON) {
      failures.push(`${label}: koChance(${damage}) = ${ko} but cumulative says ${cumulative[damage]}`);
      break;
    }
  }
  if (runtime.HitDist.koChance(dist, dist.maxHit + 1) !== 0) {
    failures.push(`${label}: koChance above maxHit is not 0`);
  }
  if (runtime.HitDist.koChance(dist, 0) !== 1) {
    failures.push(`${label}: koChance(0) is not 1`);
  }
}

function checkCase(runtime, def, verbose){
  const input = buildInput(runtime, def);
  const result = runtime.SimEngine.simulate(input);
  const { normal, spec } = runtime.HitDist.fromResult(result);
  const failures = [];

  checkDistributionShape(normal, 'normal', failures);
  checkCumulative(runtime, normal, 'normal', failures);

  // The engine averages hitChance x maxHit / 2 over its decay samples; the
  // mixture sums d x P(d) over the same samples' uniforms. Same quantity.
  const meanError = relError(normal.averageHit, result.avgHit);
  if (meanError > EPSILON) {
    failures.push(`normal mean ${normal.averageHit} vs engine avgHit ${result.avgHit}`);
  }

  // A mixture spans as wide as its widest component, and offSamples[0] is the
  // freshly-potted peak — so the distribution must reach peakMaxHit, not the
  // decayed mean the old chart drew.
  const peak = Math.round(result.peakMaxHit != null ? result.peakMaxHit : result.maxHit);
  if (normal.maxHit !== peak) {
    failures.push(`normal maxHit ${normal.maxHit} vs peakMaxHit ${peak}`);
  }

  if (spec) {
    const info = result.specInfo;
    checkDistributionShape(spec, 'spec', failures);
    checkCumulative(runtime, spec, 'spec', failures);

    const specMeanError = relError(spec.averageHit, info.expPerSpec);
    if (specMeanError > EPSILON) {
      failures.push(`spec mean ${spec.averageHit} vs engine expPerSpec ${info.expPerSpec}`);
    }
    // Every hit has to miss for the spec to miss.
    const expectedMiss = Math.pow(1 - info.hitChance, info.hits);
    if (relError(spec.missChance, expectedMiss) > EPSILON) {
      failures.push(`spec miss ${spec.missChance} vs (1-hc)^${info.hits} = ${expectedMiss}`);
    }
    if (spec.maxHit !== info.hits * Math.round(info.maxHit)) {
      failures.push(`spec maxHit ${spec.maxHit} vs hits x maxHit ${info.hits * Math.round(info.maxHit)}`);
    }
  } else if (result.specInfo) {
    failures.push('result has specInfo but fromResult produced no spec series');
  }

  if (verbose) {
    console.log(`\n${def.id} — ${def.description}`);
    console.log(`  rolls ${JSON.stringify(result.hitRolls)}`);
    console.log(`  normal mean ${normal.averageHit.toFixed(4)} max ${normal.maxHit} `
      + `miss ${(normal.missChance * 100).toFixed(1)}% zero ${(normal.probabilities[0] * 100).toFixed(1)}%`);
    if (spec) {
      console.log(`  spec   mean ${spec.averageHit.toFixed(4)} max ${spec.maxHit} `
        + `miss ${(spec.missChance * 100).toFixed(1)}% (${spec.hits} hits)`);
    }
  }

  return { id: def.id, failures };
}

// Identities that must hold for any inputs at all, checked once rather than
// per case. Each of these was a way the port could have gone wrong.
function checkIdentities(runtime, failures){
  const D = runtime.HitDist;

  // A one-element mixture is just that roll; a one-hit convolution is too.
  const one = D.mixture([{ hitChance: 0.37, maxHit: 13 }]);
  const direct = D.single(0.37, 13);
  if (JSON.stringify(one.probabilities) !== JSON.stringify(direct.probabilities)) {
    failures.push('mixture of one roll differs from single()');
  }

  // Miss and accurate-zero must stay separate. A uniform over 0..max puts
  // hitChance/(max+1) on a landed zero; if that ever equals 0 the two have been
  // folded together again.
  const split = D.single(0.5, 9);
  if (relError(split.probabilities[0], 0.5 / 10) > EPSILON) {
    failures.push(`accurate zero is ${split.probabilities[0]}, want ${0.5 / 10}`);
  }
  if (relError(split.missChance, 0.5) > EPSILON) {
    failures.push(`miss is ${split.missChance}, want 0.5`);
  }

  // A guaranteed-hit attack (Powershot) has no miss bucket at all.
  const guaranteed = D.single(1, 20);
  if (guaranteed.missChance !== 0 || guaranteed.hitChance !== 1) {
    failures.push('a hitChance of 1 still produced a miss');
  }

  // Convolution, not doubling: two 0..10 rolls sum to 0..20 and the total is
  // triangular, so the midpoint must carry more mass than an endpoint. A
  // "doubled uniform" would be flat and is the mistake this guards against.
  const two = D.independent({ hitChance: 1, maxHit: 10 }, 2);
  if (two.maxHit !== 20) failures.push(`two 0..10 hits reach ${two.maxHit}, want 20`);
  if (!(two.probabilities[10] > two.probabilities[20] * 2)) {
    failures.push('summed hits are flat, not peaked — convolution is wrong');
  }

  // A mixture of different widths is NOT the same as a uniform at their mean
  // width. This is the entire reason hitRolls exists.
  const mixed = D.mixture([{ hitChance: 1, maxHit: 4 }, { hitChance: 1, maxHit: 12 }]);
  const meanWidth = D.single(1, 8);
  if (relError(mixed.averageHit, meanWidth.averageHit) <= EPSILON
      && JSON.stringify(mixed.probabilities) === JSON.stringify(meanWidth.probabilities)) {
    failures.push('a mixture collapsed to its mean-width uniform');
  }
  if (mixed.maxHit !== 12) failures.push(`mixture reaches ${mixed.maxHit}, want 12`);

  // Degenerate inputs must produce a usable distribution rather than NaN.
  const zero = D.single(0, 0);
  if (zero.probabilityTotal !== 1 || zero.averageHit !== 0) {
    failures.push('a 0/0 attack did not degenerate cleanly');
  }
  const nonsense = D.single(NaN, NaN);
  if (!Number.isFinite(nonsense.probabilityTotal)) {
    failures.push('NaN inputs leaked into the distribution');
  }

  // The convolution is capped, and asking for more hits must clamp rather than
  // build an unbounded state space.
  const capped = D.independent({ hitChance: 0.5, maxHit: 4 }, 99);
  if (capped.hits !== D.MAX_HITS) failures.push(`hit count did not clamp to ${D.MAX_HITS}`);
}

function main(){
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const ids = args.filter((arg) => !arg.startsWith('--'));
  const selected = ids.length
    ? CASES.filter((def) => ids.includes(def.id))
    : CASES;

  if (ids.length && selected.length !== ids.length) {
    const missing = ids.filter((id) => !CASES.some((def) => def.id === id));
    console.error(`Unknown case id(s): ${missing.join(', ')}`);
    return 1;
  }

  const runtime = loadRuntime();
  const identityFailures = [];
  checkIdentities(runtime, identityFailures);

  const results = selected.map((def) => checkCase(runtime, def, verbose));
  const failed = results.filter((r) => r.failures.length);

  if (identityFailures.length) {
    console.log('\nIDENTITIES');
    for (const failure of identityFailures) console.log(`  ${failure}`);
  }
  for (const result of failed) {
    console.log(`\n${result.id}`);
    for (const failure of result.failures) console.log(`  ${failure}`);
  }

  if (failed.length || identityFailures.length) {
    console.log(`\ndist: ${failed.length} of ${results.length} case(s) failed`
      + (identityFailures.length ? `, ${identityFailures.length} identity failure(s)` : ''));
    return 1;
  }
  console.log(`dist: ${results.length}/${results.length} cases exact (identities ok)`);
  return 0;
}

process.exit(main());
