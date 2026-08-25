// dist.js — the exact damage distribution behind one attack.
//
// Everything upstream of this file reports the MEAN of an attack: `avgHit`,
// `dps`, `expPerSpec`. The mean is the right number for gp/hr and it is the
// wrong number for "can this thing still kill me at 12 hp" or "how often does
// a dagger spec actually finish a 60 hp target". Those are questions about the
// shape, so this computes the shape exactly rather than sampling it.
//
// The shape of one 2004 attack:
//
//   miss           probability 1 - hitChance, damage 0
//   hit            probability hitChance, damage uniform over 0..maxHit
//
// Note the two zeroes. A miss and an accurate zero are different events — the
// splat is different in game, poison and recoil care, and folding them into one
// bar (which the old chart did) hides how much of a low-accuracy setup's zero
// column is actually landed hits. They stay separate here all the way to the
// bars.
//
// Two composition rules sit on top of that:
//
//   mixture      equally-weighted alternative rolls. A decaying boost is not a
//                single uniform: a fresh super-set and a 3-levels-down one have
//                DIFFERENT max hits, so the real distribution is the average of
//                several uniforms of different widths, which is peaked, not
//                flat. engine.js hands over the per-sample rolls as `hitRolls`.
//   independent  n rolls of the same attack, summed. This is a multi-hit
//                special: a dragon dagger spec is two independent accuracy
//                rolls and two independent damage rolls, so its total is a
//                convolution, not a doubled uniform. The whole spec counts as a
//                miss only when EVERY component missed.
//
// The means are load-bearing as a check, not as an output: mixture() must
// average to engine.js's `avgHit` and independent() to `specInfo.expPerSpec`.
// tools/run-dist.js asserts exactly that — if this file and the engine ever
// disagree about the mean, this file is the one that is wrong.
//
// Ported from index-sim-v2's src/domain/combat/index.ts
// (createHitDistribution / createHitDistributionMixture /
// createIndependentHitDistribution). The bucket shape carried over; the
// engine-facing entry points (fromResult, hitRolls) and the cumulative/KO
// helpers are new, because v2 fed this from its own typed combat result.
(function(){
'use strict';

const MODEL_VERSION = 1;

// Convolution bound. Every spec in SPEC_DATA is 1 or 2 hits; 8 is v2's cap and
// keeps a pathological input from building a huge state space.
const MAX_HITS = 8;

// Damage-domain guard. A distribution wider than this is a bug upstream (no
// 2004 attack maxes anywhere near it) and would build a bar per point.
const MAX_DAMAGE = 512;

function clampProbability(v){
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// An attack's two inputs, sanitised. maxHit is rounded because the domain has
// to be integral: the engine's fluid path averages integer max hits into a
// fractional one, and a bar chart cannot have a bar at 7.4.
function normalizeRoll(input){
  const r = input || {};
  return {
    hitChance: clampProbability(r.hitChance),
    maxHit: Number.isFinite(r.maxHit) ? Math.max(0, Math.min(MAX_DAMAGE, Math.round(r.maxHit))) : 0
  };
}

// ---------------------------------------------------------------------------
// States
//
// The intermediate form is a list of {damage, accurate, probability}. `accurate`
// has to ride along rather than being inferred from damage > 0, because a landed
// hit for 0 exists and has to stay distinguishable from a miss through every
// composition step.
// ---------------------------------------------------------------------------

function singleHitStates(rollInput){
  const roll = normalizeRoll(rollInput);
  const perDamage = roll.hitChance / (roll.maxHit + 1);
  const states = [{ damage: 0, accurate: false, probability: 1 - roll.hitChance }];
  for (let damage = 0; damage <= roll.maxHit; damage++){
    states.push({ damage, accurate: true, probability: perDamage });
  }
  return states;
}

function bucketsFromStates(states, hits){
  let missChance = 0;
  let maxHit = 0;
  for (const state of states){
    if (state.accurate) maxHit = Math.max(maxHit, state.damage);
    else missChance += state.probability;
  }
  missChance = clampProbability(missChance);

  // Accurate mass per damage value. Misses are deliberately NOT folded into
  // probabilities[0] — they are their own bucket.
  const probabilities = new Array(maxHit + 1).fill(0);
  for (const state of states){
    if (state.accurate) probabilities[state.damage] += state.probability;
  }

  const buckets = [{
    id: 'miss', label: 'Miss', damage: 0, probability: missChance,
    isMiss: true, isAccurateZero: false, isMaxHit: false
  }];
  for (let damage = 0; damage <= maxHit; damage++){
    buckets.push({
      id: 'damage-' + damage,
      label: String(damage),
      damage,
      probability: probabilities[damage],
      isMiss: false,
      isAccurateZero: damage === 0,
      isMaxHit: damage === maxHit && maxHit > 0
    });
  }

  let averageHit = 0;
  for (let damage = 0; damage <= maxHit; damage++) averageHit += probabilities[damage] * damage;

  const hitChance = clampProbability(1 - missChance);
  return {
    modelVersion: MODEL_VERSION,
    hits: hits || 1,
    hitChance,
    missChance,
    // Mean damage over ALL attacks, misses counted as the zeroes they are.
    // This is the number that must equal the engine's.
    averageHit,
    // Mean damage over the attacks that landed something. Always >= averageHit;
    // it is what "hits for about 9" means colloquially.
    averageOnHit: hitChance > 0 ? averageHit / hitChance : 0,
    maxHit,
    probabilities,
    buckets,
    // Should be 1. Kept visible so a caller can assert it instead of trusting it.
    probabilityTotal: buckets.reduce((sum, b) => sum + b.probability, 0)
  };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

// One attack: miss, or uniform 0..maxHit.
function single(hitChance, maxHit){
  return independent({ hitChance, maxHit }, 1);
}

// Equally-weighted alternatives — the fluid-boost case. Each roll is one decay
// sample with its own accuracy and its own max hit.
function mixture(rolls){
  const list = Array.isArray(rolls) ? rolls : [];
  if (list.length === 0) return bucketsFromStates([{ damage: 0, accurate: false, probability: 1 }], 1);
  if (list.length === 1) return bucketsFromStates(singleHitStates(list[0]), 1);
  const weight = 1 / list.length;
  const states = [];
  for (const roll of list){
    for (const state of singleHitStates(roll)){
      states.push({ damage: state.damage, accurate: state.accurate, probability: state.probability * weight });
    }
  }
  return bucketsFromStates(states, 1);
}

// n independent rolls of the same attack, summed — a multi-hit special.
// `accurate` is an OR across the components, so the spec reads as a miss only
// when every hit missed. That is what makes a 2-hit spec's miss column much
// shorter than its per-hit miss chance suggests.
function independent(rollInput, hitCount){
  const count = Math.max(1, Math.min(MAX_HITS, Math.floor(Number.isFinite(hitCount) ? hitCount : 1)));
  const component = singleHitStates(rollInput);
  let combined = [{ damage: 0, accurate: false, probability: 1 }];
  for (let hit = 0; hit < count; hit++){
    const next = new Map();
    for (const left of combined){
      for (const right of component){
        const damage = left.damage + right.damage;
        const accurate = left.accurate || right.accurate;
        const key = (accurate ? 1 : 0) + ':' + damage;
        const probability = left.probability * right.probability;
        const existing = next.get(key);
        if (existing) existing.probability += probability;
        else next.set(key, { damage, accurate, probability });
      }
    }
    combined = Array.from(next.values());
  }
  return bucketsFromStates(combined, count);
}

// ---------------------------------------------------------------------------
// Derived readings
// ---------------------------------------------------------------------------

// P(damage >= d) for d in 0..maxHit, misses included in the denominator, so
// cumulative[0] is always 1. This is the "at least" reading the chart shows on
// hover, and the one worth having when the question is whether an attack can
// still reach a threshold.
function cumulative(dist){
  const out = new Array(dist.maxHit + 1).fill(0);
  let tail = 0;
  for (let damage = dist.maxHit; damage >= 1; damage--){
    tail += dist.probabilities[damage];
    out[damage] = clampProbability(tail);
  }
  out[0] = 1;
  return out;
}

// P(this single attack deals at least `hp`). At hp <= 0 the target is already
// dead, which reads as certainty; above maxHit it is flatly impossible, which
// is the useful half of the answer — it says a spec CANNOT finish from here.
function koChance(dist, hp){
  if (!Number.isFinite(hp)) return 0;
  const need = Math.ceil(hp);
  if (need <= 0) return 1;
  if (need > dist.maxHit) return 0;
  let tail = 0;
  for (let damage = need; damage <= dist.maxHit; damage++) tail += dist.probabilities[damage];
  return clampProbability(tail);
}

// Both series for a simulate() result: the normal attack, and the special
// attack when a spec weapon is selected. Older results (and any caller that
// builds a result by hand) have no `hitRolls`; those fall back to the peak max
// hit rather than the decayed mean, which is what the chart showed before.
function fromResult(result){
  if (!result) return { normal: single(0, 0), spec: null };
  const rolls = Array.isArray(result.hitRolls) && result.hitRolls.length
    ? result.hitRolls
    : [{ hitChance: result.hitChance, maxHit: result.peakMaxHit != null ? result.peakMaxHit : result.maxHit }];
  const normal = mixture(rolls);
  const info = result.specInfo;
  const spec = info
    ? independent({ hitChance: info.hitChance, maxHit: info.maxHit }, info.hits)
    : null;
  return { normal, spec };
}

window.HitDist = {
  MODEL_VERSION, MAX_HITS, MAX_DAMAGE,
  single, mixture, independent, fromResult, cumulative, koChance,
  // Exported for tools/run-dist.js.
  singleHitStates, bucketsFromStates, normalizeRoll
};

})();
