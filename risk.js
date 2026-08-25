// risk.js — Monte Carlo variance around the simulator's averages.
//
// Everything else in the app reports an expectation: gp/hr, kills/hr, food per
// kill. Those are correct on average and say nothing about a single trip. This
// re-rolls the same fight thousands of times and reports the spread — how long
// a kill actually takes, how often you run out of food before the target kill
// count, what an hour is worth at the tenth percentile rather than the mean.
//
// It samples the events the simulator averages over:
//
//   player damage    hit or miss at hitChance, then uniform 0..peakMaxHit
//   incoming damage  the monster's own attacks, same roll shape
//   loot             which row a kill's drop-table roll lands on
//
// Anything else — special attacks, cannon, poison ticks, dragonfire — enters as
// its mean. Those are declared in the coverage report rather than hidden, so a
// number that carries less variance than it looks like says so.
//
// Ported from index-sim-v2's src/domain/risk/index.ts. The loot model is not a
// port: v2 treated drop rows as independent Bernoulli trials, which is wrong
// for this data — see buildLootModel.
(function(){
'use strict';

const MODEL_VERSION = 1;
const DEFAULT_SAMPLES = 10000;
const MIN_SAMPLES = 100;
const MAX_SAMPLES = 50000;

// Guards on the sampling loops. A kill that cannot finish, or a trip that never
// hits a bound, must terminate the loop rather than hang the tab.
const MAX_ATTACKS_PER_KILL = 10000;
const MAX_KILLS_PER_TRIP = 10000;

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function finiteOr(v, fallback){ return (v != null && Number.isFinite(v)) ? v : fallback; }

// ---------------------------------------------------------------------------
// Randomness
//
// Seeded, not Math.random. Two runs of an unchanged setup must agree: a p10
// that moves on its own is indistinguishable from one that moved because the
// setup did, and the whole pane becomes unreadable. The seed is a fingerprint
// of the inputs, so identical inputs give identical numbers and any movement
// on screen is genuinely the inputs moving.
// ---------------------------------------------------------------------------

function createRandom(seed){
  let state = seed >>> 0;
  return function next(){
    state = (state + 0x6d2b79f5) >>> 0;
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function stableHash(str){
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++){
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

function quantile(sorted, p){
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = clamp(p, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] * (1 - (pos - lo)) + sorted[hi] * (pos - lo);
}

function summarize(values){
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return { mean:0, p10:0, p50:0, p90:0, min:0, max:0 };
  let sum = 0;
  for (const v of finite) sum += v;
  return {
    mean: sum / finite.length,
    p10: quantile(finite, 0.10),
    p50: quantile(finite, 0.50),
    p90: quantile(finite, 0.90),
    min: finite[0],
    max: finite[finite.length - 1]
  };
}

// P(at least one) over n independent trials. Written with log1p/expm1 so a rare
// drop over many kills keeps its precision — 1-(1-p)^n loses it exactly where
// the answer matters.
function atLeastOnce(chance, trials){
  if (!(chance > 0) || trials <= 0) return 0;
  if (chance >= 1) return 1;
  return clamp(-Math.expm1(trials * Math.log1p(-chance)), 0, 1);
}

// ---------------------------------------------------------------------------
// Loot model
//
// This deliberately departs from v2, which rolled every drop row as its own
// independent Bernoulli trial. That is wrong for this data. gamedata.js rows
// come from a single RuneScript `random(128)` per kill: the weighted rows are
// one exclusive choice, and their chances sum to at most 1 with the remainder
// being the empty outcome. Rolling them independently lets two rare drops land
// on the same kill, which inflates both the GP variance and the rate the pack
// fills. Verified across the table: no monster's weighted rows sum above 1.
//
// `always()` rows are the exception — chance >= 1, dropped every kill, genuinely
// independent of the roll.
// ---------------------------------------------------------------------------

// The slots a row costs on the kills it lands, mirroring trip.js's
// nonStackPerKill accounting exactly — same exclusions, same slotFrac. A
// stackable costs a fixed reserve rather than a slot per kill, and that reserve
// is already subtracted from lootCapacity, so it contributes nothing here.
function slotsOnHit(row){
  if (row.pref === 'skip' || row.pref === 'bury' || row.pref === 'alch') return 0;
  if (!(row.evGp > 0)) return 0;
  const isStackable = window.TripModel && window.TripModel.isStackable;
  if (isStackable && isStackable(row.key, row.name)) return 0;
  return Math.max(0, finiteOr(row.qtyAvg, 0) * finiteOr(row.slotFrac, 1));
}

function buildLootModel(result){
  const all = (result.lootBreakdown || []).map((row, index) => {
    const banked = row.pref !== 'skip' && row.pref !== 'bury';
    const chance = clamp(finiteOr(row.chance, 0), 0, 1);
    const evGp = banked ? finiteOr(row.evGp, 0) : 0;
    return {
      id: String(index) + ':' + (row.key || row.name),
      name: row.name,
      chance,
      evGp,
      // What the row pays on the kills it actually lands, rather than amortised
      // across all of them. This is the whole point of sampling it.
      gpOnHit: chance > 0 ? evGp / chance : 0,
      slots: slotsOnHit(row),
      guaranteed: chance >= 1,
      weighted: banked && chance > 0 && chance < 1
    };
  });

  const guaranteed = all.filter((r) => r.guaranteed);
  const weighted = all.filter((r) => r.weighted);

  // Everything the rolls account for. The remainder — skipped rows that still
  // move gpPerKill, buried bones' prayer credit, rounding — rides as a constant
  // so the sampled mean still lands on the simulator's number.
  const sampledMean = guaranteed.reduce((s, r) => s + r.evGp, 0)
    + weighted.reduce((s, r) => s + r.evGp, 0);
  const totalMean = finiteOr(result.gpPerKill, 0);

  // The sampler runs once per kill per trial — tens of millions of times for a
  // full pane refresh — so the per-kill work is flattened into typed arrays
  // here rather than walked as objects there. Guaranteed rows never vary, so
  // they collapse to two constants; the weighted table becomes a cumulative
  // array a single scan can resolve.
  const cumulative = new Float64Array(weighted.length);
  const weightedGp = new Float64Array(weighted.length);
  const weightedSlots = new Float64Array(weighted.length);
  let running = 0;
  weighted.forEach((row, i) => {
    running += row.chance;
    cumulative[i] = running;
    weightedGp[i] = row.gpOnHit;
    weightedSlots[i] = row.slots;
  });

  return {
    guaranteed,
    weighted,
    cumulative, weightedGp, weightedSlots,
    guaranteedGp: guaranteed.reduce((s, r) => s + r.gpOnHit, 0),
    guaranteedSlots: guaranteed.reduce((s, r) => s + r.slots, 0),
    weightedTotal: clamp(running, 0, 1),
    residualGp: totalMean - sampledMean,
    // 1 when every gp of a kill is attached to a row we roll for.
    occurrenceCoverage: Math.abs(totalMean) > 0
      ? clamp(Math.abs(sampledMean) / Math.abs(totalMean), 0, 1) : 1,
    // Quantities are always their average — a coins row worth 15-62 contributes
    // a flat 38.5 rather than a fresh roll. Declared, not hidden.
    quantitySampled: false,
    all
  };
}

// Writes into `out` instead of allocating, because it is called once per kill
// per trial and the garbage would dominate the run.
function sampleLootInto(loot, random, out){
  // Guaranteed rows and the residual never vary; they are one constant.
  out.gp = loot.residualGp + loot.guaranteedGp;
  out.slots = loot.guaranteedSlots;

  // One roll across the whole weighted table. Landing past the final cumulative
  // value is the empty outcome — most kills, on most monsters.
  const roll = random();
  const cumulative = loot.cumulative;
  for (let i = 0; i < cumulative.length; i++){
    if (roll < cumulative[i]){
      out.gp += loot.weightedGp[i];
      out.slots += loot.weightedSlots[i];
      return out;
    }
  }
  return out;
}

// Allocating wrapper, for callers outside the hot loop.
function sampleLoot(loot, random){
  return sampleLootInto(loot, random, { gp:0, slots:0 });
}

// ---------------------------------------------------------------------------
// Model assembly
// ---------------------------------------------------------------------------

function buildModel(result, input){
  const monster = input.monster || {};
  const trip = result.trip || {};
  const incoming = trip.incoming || {};
  const slots = trip.slots || {};

  const attackSpeedSec = Math.max(0.001, finiteOr(result.attackSpeedSec, 2.4));
  const peakMaxHit = Math.max(0, Math.round(finiteOr(result.peakMaxHit, 0)));
  const hitChance = clamp(finiteOr(result.hitChance, 0), 0, 1);
  const monsterHp = Math.max(1, finiteOr(monster.hp, 1));
  const ttkSec = Math.max(0.001, finiteOr(result.ttkSec, 1));

  // Everything the simulator kills with that this model does not roll for —
  // specials, cannon, poison — folded into a flat damage-per-second: the rolled
  // normal hits supply modelledDps and this makes up the difference to the rate
  // the simulator actually killed at.
  //
  // That alone does not make the sampled mean land on ttkSec, because two
  // biases pull against each other. Attacks are discrete, so the killing blow
  // overshoots and drags the mean kill time up. Meanwhile peakMaxHit is the
  // boosted peak, while ttkSec is computed from the sustained average, which
  // pulls it down. Which one wins depends on the setup — measured across the
  // test cases, kill time came out 12% high on a fast dagannoth and 6% low on a
  // black dragon. Neither is a rounding error, and a spread centred on the
  // wrong place is worse than no spread at all, so the mean is calibrated out
  // explicitly below rather than argued about.
  const avgHit = finiteOr(result.avgHit, hitChance * (peakMaxHit / 2));
  const modelledDps = avgHit / attackSpeedSec;
  const requiredDps = monsterHp / ttkSec;
  const continuousDps = Math.max(0, requiredDps - modelledDps);

  // Incoming: trip.js builds hpPerKill as attacks × meleeShare × hitChance ×
  // (monMax/2), plus flat dragonfire and poison. Roll the first product and
  // keep the flat parts as means — dragonfire is already an expectation over a
  // breath rate, and poison is a damage-over-time, so neither is a per-attack
  // event this loop could roll honestly.
  const incomingAttacks = Math.max(0, finiteOr(incoming.attacks, 0)
    * finiteOr(incoming.meleeShare, 0));
  const foodHeal = Math.max(0, finiteOr(trip.foodHeal, 0));

  const cap = deterministicTripCap(trip);

  const model = {
    monsterHp, hitChance, peakMaxHit, attackSpeedSec, continuousDps, ttkSec,
    // Set by calibrateTimeScale below; 1 until then so the calibration pass
    // itself samples uncalibrated.
    timeScale: 1,
    cycleExtraSec: Math.max(0, finiteOr(result.cycleSec, ttkSec) - ttkSec),

    incomingAttacks,
    // What trip.js concluded actually lands, after regeneration. Used to decide
    // whether food is needed at all: a chicken swings at you 3.8 times a kill
    // with a max hit of 0, so counting swings would report certain starvation
    // on a monster that cannot scratch you.
    netDamagePerKill: Math.max(0, finiteOr(incoming.netHpPerKill, 0)),
    incomingHitChance: clamp(finiteOr(incoming.hitChance, 0), 0, 1),
    incomingMaxHit: Math.max(0, Math.round(finiteOr(incoming.monMax, 0))),
    flatDamagePerKill: Math.max(0, finiteOr(incoming.dragonfire, 0))
      + Math.max(0, finiteOr(incoming.poison, 0)),
    regenPerKill: Math.max(0, finiteOr(incoming.regenPerKill, 0)),
    safespot: !!incoming.safespot,

    foodHeal,
    foodCount: Math.max(0, finiteOr(slots.foodCount, 0)),
    foodPrice: Math.max(0, finiteOr(trip.foodPrice, 0)),
    // Food is the only supply cost that varies with how the fight goes; the
    // rest (runes, ammo, potions) is per-kill regardless.
    otherSupplyPerKill: Math.max(0, finiteOr(result.supplyCostPerKill, 0)
      - finiteOr(result.foodCostPerKill, 0)),

    lootCapacity: Math.max(0, finiteOr(slots.lootCapacity, 0)),
    deterministicTripCap: cap,
    bankSeconds: Math.max(0, finiteOr(trip.bankSeconds, 0)),
    altarSecPerKill: Math.max(0, finiteOr(trip.altarSecPerKill, 0)),

    loot: buildLootModel(result)
  };

  calibrateTimeScale(model);
  calibrateSlots(model, trip);
  return model;
}

// Match the model's expected slots per kill to the figure trip.js reports.
//
// Re-deriving it from result.lootBreakdown does not reproduce it: engine.js
// decides which low-value non-stackables are worth a slot and re-runs the trip,
// so the breakdown we can see here is the post-decision one while
// nonStackPerKill came from the pre-decision pass. On a blue dragon that gap is
// 2.27 against 2.16 — small, but it compounds over a trip into a pack that
// fills a kill early. Rather than guess which rows engine.js dropped, take its
// answer as authoritative and scale to it, the same way kill time is scaled to
// ttkSec. Which rows carry the slots still varies; only the total is pinned.
function calibrateSlots(model, trip){
  const target = finiteOr(trip.slots && trip.slots.nonStackPerKill, NaN);
  if (!(target > 0)) return;

  const loot = model.loot;
  let expected = loot.guaranteedSlots;
  for (let i = 0; i < loot.cumulative.length; i++){
    const chance = i === 0 ? loot.cumulative[0] : loot.cumulative[i] - loot.cumulative[i - 1];
    expected += chance * loot.weightedSlots[i];
  }
  if (!(expected > 0)) return;

  const scale = target / expected;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 5) return;
  loot.guaranteedSlots *= scale;
  for (let i = 0; i < loot.weightedSlots.length; i++) loot.weightedSlots[i] *= scale;
  loot.slotScale = scale;
}

// Sample a fixed batch of kills and scale time so their mean is exactly ttkSec.
//
// This corrects the centre without touching the shape: every sampled duration
// moves by the same factor, so the relative spread — which is the entire point
// of this model, and which nothing else in the app can tell you — survives
// intact. A fixed seed keeps it deterministic, and it runs once per model, not
// per trial.
const CALIBRATION_SAMPLES = 3000;

function calibrateTimeScale(model){
  if (!(model.ttkSec > 0)) return;
  const random = createRandom(0x5eed1);
  let total = 0, counted = 0;
  for (let i = 0; i < CALIBRATION_SAMPLES; i++){
    const seconds = sampleKillSeconds(model, random);
    if (seconds > 0){ total += seconds; counted += 1; }
  }
  if (!counted) return;
  const sampledMean = total / counted;
  // A wild ratio means the model is not describing this fight at all; leave it
  // uncalibrated and let the coverage report and the mean check speak.
  const scale = model.ttkSec / sampledMean;
  model.timeScale = (Number.isFinite(scale) && scale > 0.2 && scale < 5) ? scale : 1;
}

// Trips bounded by prayer, recoil or respawn end on a count this model does not
// roll for, so that count is taken from the simulator directly.
function deterministicTripCap(trip){
  if (trip.bound === 'prayer' || trip.bound === 'recoil' || trip.bound === 'respawn'){
    return Number.isFinite(trip.killsPerTrip) ? Math.max(1, Math.floor(trip.killsPerTrip)) : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Samplers
// ---------------------------------------------------------------------------

function sampleKillSeconds(model, random){
  if (model.peakMaxHit <= 0 && model.continuousDps <= 0) return 0;
  let hp = model.monsterHp;
  let elapsed = 0;
  for (let i = 0; i < MAX_ATTACKS_PER_KILL; i++){
    elapsed += model.attackSpeedSec;
    const landed = random() < model.hitChance;
    const damage = landed ? Math.floor(random() * (model.peakMaxHit + 1)) : 0;
    hp -= damage + model.continuousDps * model.attackSpeedSec;
    if (hp <= 0) return elapsed * model.timeScale;
  }
  return 0;   // never died — caller treats this as an unbounded fight
}

// Food eaten across `kills` kills, in whole-unit fractions. Fractional because
// a kill that costs half a lobster is real; callers accumulate.
//
// `killSeconds` scales a single kill by how long it actually took — a fight
// that drags takes more of the monster's swings, which is precisely what
// couples food use to bad luck. It only applies to one kill; over several the
// durations average out, so the aggregate form skips it and saves the caller
// from sampling kill times it would then throw away.
function sampleFoodUnits(model, random, kills, killSeconds){
  if (!(model.foodHeal > 0) || model.safespot) return 0;

  const scale = (kills === 1 && killSeconds > 0)
    ? clamp(killSeconds / model.ttkSec, 0.1, 100) : 1;
  const expected = model.incomingAttacks * kills * scale;
  let count = Math.floor(expected);
  // Carry the fractional attack as a coin flip rather than rounding it away.
  if (random() < expected - count) count += 1;

  let damage = 0;
  const cap = Math.min(count, MAX_ATTACKS_PER_KILL);
  for (let i = 0; i < cap; i++){
    if (random() >= model.incomingHitChance) continue;
    damage += Math.floor(random() * (model.incomingMaxHit + 1));
  }
  damage += model.flatDamagePerKill * kills;
  // Regen is subtracted per kill exactly as trip.js does, floored at zero.
  return Math.max(0, damage - model.regenPerKill * kills) / model.foodHeal;
}

function tripEnded(model, kills, foodUsed, lootSlots){
  if (model.deterministicTripCap != null && kills >= model.deterministicTripCap) return true;
  if (model.foodCount > 0 && foodUsed > model.foodCount + 1e-9) return true;
  // Full, not overflowing. The distinction is worth a whole slot: on a rock
  // crab, one slot is 21 kills. Requiring the pack to overflow means waiting
  // for a 28th drop into 27 slots, and the trip runs 4% long — which is exactly
  // the gap this produced before the comparison was tightened. You bank when
  // the last slot is taken, not when a drop has nowhere to go.
  if (model.lootCapacity > 0 && lootSlots >= model.lootCapacity - 1e-9) return true;
  return false;
}

// Can a trip ever end? With no food demand, no pack pressure and no hard cap it
// cannot, and reporting a kills-per-trip figure would be a fiction.
function tripCanEnd(model){
  if (model.deterministicTripCap != null) return true;
  if (model.lootCapacity > 0 && model.loot.all.some((r) => r.slots > 0)) return true;
  return model.foodHeal > 0 && model.incomingAttacks > 0 && model.foodCount > 0;
}

const LOOT_SCRATCH = { gp:0, slots:0 };

function sampleTrip(model, random){
  let kills = 0, seconds = 0, foodUsed = 0, lootSlots = 0;
  for (let i = 0; i < MAX_KILLS_PER_TRIP; i++){
    const killSeconds = sampleKillSeconds(model, random);
    if (!(killSeconds > 0)) return { kills, seconds, unbounded:true };
    const food = sampleFoodUnits(model, random, 1, killSeconds);
    // Out of food before this kill? The trip ended on the previous one.
    if (model.foodCount > 0 && foodUsed + food > model.foodCount + 1e-9 && kills > 0) break;
    const loot = sampleLootInto(model.loot, random, LOOT_SCRATCH);
    kills += 1;
    seconds += killSeconds + model.cycleExtraSec;
    foodUsed += food;
    lootSlots += loot.slots;
    if (tripEnded(model, kills, foodUsed, lootSlots)) break;
  }
  if (kills >= MAX_KILLS_PER_TRIP) return { kills, seconds, unbounded:true };
  seconds += model.bankSeconds + model.altarSecPerKill * kills;
  return { kills, seconds, unbounded:false };
}

// One stretch of wall-clock time, banking whenever a trip bound is hit and the
// remaining time can absorb the trip back.
function sampleHorizon(model, random, horizonSeconds){
  let elapsed = 0, kills = 0, netGp = 0;
  let foodUsed = 0, lootSlots = 0, tripKills = 0;
  let guard = 0;
  while (elapsed < horizonSeconds && guard < 100000){
    guard += 1;
    const killSeconds = sampleKillSeconds(model, random);
    if (!(killSeconds > 0)) break;
    const food = sampleFoodUnits(model, random, 1, killSeconds);

    if (model.foodCount > 0 && foodUsed + food > model.foodCount + 1e-9 && tripKills > 0){
      const reset = model.bankSeconds + model.altarSecPerKill * tripKills;
      if (elapsed + reset >= horizonSeconds) break;
      elapsed += reset;
      foodUsed = 0; lootSlots = 0; tripKills = 0;
      continue;
    }

    const done = elapsed + killSeconds + model.cycleExtraSec;
    if (done > horizonSeconds) break;   // the hour ran out mid-kill

    const loot = sampleLootInto(model.loot, random, LOOT_SCRATCH);
    elapsed = done;
    kills += 1; tripKills += 1;
    foodUsed += food;
    lootSlots += loot.slots;
    netGp += loot.gp - model.otherSupplyPerKill - food * model.foodPrice;

    if (tripEnded(model, tripKills, foodUsed, lootSlots)){
      const reset = model.bankSeconds + model.altarSecPerKill * tripKills;
      if (elapsed + reset >= horizonSeconds) break;
      elapsed += reset;
      foodUsed = 0; lootSlots = 0; tripKills = 0;
    }
  }
  return { kills, netGp };
}

// ---------------------------------------------------------------------------
// Coverage — what carries real variance and what is riding on its mean
// ---------------------------------------------------------------------------

function buildCoverage(model, result){
  const meanOnly = [];
  if (model.continuousDps > 0) meanOnly.push('Special, poison or cannon damage');
  if (!model.loot.quantitySampled && model.loot.weighted.length) meanOnly.push('Loot quantity ranges');
  if (model.flatDamagePerKill > 0) meanOnly.push('Dragonfire and poison chip');
  if (result.cannon && result.cannon.ballsPerKill > 0) meanOnly.push('Cannon damage variance');

  return {
    playerDamage: model.peakMaxHit > 0 ? 'sampled' : 'mean-only',
    incomingDamage: model.safespot ? 'none'
      : !(model.foodHeal > 0) ? 'mean-only'
      : model.incomingAttacks > 0 ? 'sampled' : 'none',
    lootOccurrence: model.loot.occurrenceCoverage,
    lootQuantity: model.loot.quantitySampled ? 1 : 0,
    meanOnly
  };
}

function fingerprint(result, input, params){
  return stableHash(JSON.stringify({
    modelVersion: MODEL_VERSION,
    monster: input.monster && input.monster.id,
    combatType: input.combatType,
    weapon: input.weapon, ammo: input.ammo, spell: input.spell, style: input.style,
    gear: input.gear, prayers: input.prayers, boosts: input.boosts,
    levels: [input.attack, input.strength, input.defence, input.ranged, input.magic, input.prayer],
    trip: input.trip, cannon: input.cannon, lootPrefs: input.lootPrefs,
    ttk: result.ttkSec, cycle: result.cycleSec, gpPerKill: result.gpPerKill,
    loot: (result.lootBreakdown || []).map((r) => [r.key, r.chance, r.evGp, r.pref]),
    params: { ...params, seed: 0 }
  }));
}

function normalizeParams(params){
  const p = params || {};
  return {
    targetKills: Math.round(clamp(finiteOr(p.targetKills, 50), 1, 10000)),
    horizonMinutes: clamp(finiteOr(p.horizonMinutes, 60), 1, 1440),
    gpTarget: clamp(finiteOr(p.gpTarget, 100000), 0, 1e9),
    targetDropId: typeof p.targetDropId === 'string' && p.targetDropId ? p.targetDropId : null,
    samples: Math.round(clamp(finiteOr(p.samples, DEFAULT_SAMPLES), MIN_SAMPLES, MAX_SAMPLES)),
    seed: p.seed == null ? null : (Math.round(p.seed) >>> 0)
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function analyze(result, input, params){
  const p = normalizeParams(params);
  const model = buildModel(result, input);
  const seed = p.seed != null ? p.seed : fingerprint(result, input, p);
  const warnings = [];

  const canEnd = tripCanEnd(model);
  const horizonSeconds = p.horizonMinutes * 60;

  const killTimes = [];
  const tripKills = [];
  const tripMinutes = [];
  const horizonGp = [];
  const horizonKills = [];
  let foodOutHits = 0;
  let unboundedTrips = 0;

  for (let trial = 0; trial < p.samples; trial++){
    // Each trial gets its own stream, decorrelated from its neighbours, so the
    // trial count can change without reshuffling everything before it.
    const random = createRandom(Math.imul((seed ^ trial) >>> 0, 0x9e3779b1) >>> 0);

    const killSeconds = sampleKillSeconds(model, random);
    killTimes.push(killSeconds > 0 ? killSeconds : model.ttkSec);

    // Food sufficiency over the target kill count, independent of trip bounds:
    // "will I run dry before N kills" is the question the pane asks.
    if (model.foodHeal > 0 && model.netDamagePerKill > 0){
      // Aggregate over the whole target run rather than kill by kill: the
      // question is only whether the total exceeds what is packed, and
      // sampling each kill's duration to then discard it costs far more than
      // it adds.
      const used = sampleFoodUnits(model, random, p.targetKills);
      if (used > model.foodCount + 1e-9) foodOutHits += 1;
    }

    if (canEnd){
      const trip = sampleTrip(model, random);
      if (trip.unbounded) unboundedTrips += 1;
      else { tripKills.push(trip.kills); tripMinutes.push(trip.seconds / 60); }
    }

    const horizon = sampleHorizon(model, random, horizonSeconds);
    horizonGp.push(horizon.netGp);
    horizonKills.push(horizon.kills);
  }

  // Sampling error on a probability, at its widest (p = 0.5).
  const marginPoints = 2 * Math.sqrt(0.25 / p.samples) * 100;
  warnings.push({
    severity: 'info',
    message: `Probabilities carry about ±${marginPoints.toFixed(1)} percentage points of sampling `
      + `error near 50%. Raise the sample count to narrow it.`
  });

  if (model.continuousDps > 0) warnings.push({
    severity: 'info',
    message: 'Special, poison and cannon damage contribute their mean. Kill-time spread is '
      + 'narrower than reality where those carry their own variance.'
  });
  if (model.flatDamagePerKill > 0) warnings.push({
    severity: 'info',
    message: 'Dragonfire and poison enter as a flat per-kill mean, so food use varies less here '
      + 'than at the keyboard.'
  });
  if (!canEnd) warnings.push({
    severity: 'warning',
    message: 'Nothing bounds a trip under these settings — no food demand, no pack pressure, no '
      + 'prayer or recoil cap — so kills per trip is not reported.'
  });
  if (unboundedTrips > 0) warnings.push({
    severity: 'warning',
    message: `${unboundedTrips} of ${p.samples} sampled trips never ended.`
  });
  if (model.loot.occurrenceCoverage < 0.999) warnings.push({
    severity: 'info',
    message: `${((1 - model.loot.occurrenceCoverage) * 100).toFixed(1)}% of GP per kill is not `
      + 'attached to a rolled drop row and rides along as a constant.'
  });

  const gpHits = horizonGp.filter((v) => v >= p.gpTarget).length;

  let targetDrop = null;
  if (p.targetDropId){
    const row = model.loot.all.find((r) => r.id === p.targetDropId);
    if (row && row.chance > 0){
      let timed = 0;
      for (const kills of horizonKills) timed += atLeastOnce(row.chance, kills);
      targetDrop = {
        id: row.id,
        name: row.name,
        chance: row.chance,
        byTargetKills: atLeastOnce(row.chance, p.targetKills),
        withinHorizon: timed / p.samples,
        // Kills for an even-money shot at seeing one.
        killsForEven: row.chance > 0 ? Math.log(0.5) / Math.log1p(-row.chance) : Infinity
      };
    } else {
      warnings.push({
        severity: 'warning',
        message: 'The selected target drop is skipped or unavailable for this monster.'
      });
    }
  }

  return {
    modelVersion: MODEL_VERSION,
    fingerprint: fingerprint(result, input, p).toString(16).padStart(8, '0'),
    samples: p.samples,
    params: p,
    killTimeSeconds: summarize(killTimes),
    // Sampled when food is packed and something is hitting you. Otherwise it is
    // a fact, not a probability: certain if the monster deals damage you have
    // no way to heal, and zero if it deals none.
    foodRunsOutProbability: (model.foodHeal > 0 && model.netDamagePerKill > 0)
      ? foodOutHits / p.samples
      : (model.netDamagePerKill > 0 && model.foodHeal <= 0 ? 1 : 0),
    killsPerTrip: canEnd && tripKills.length ? summarize(tripKills) : null,
    tripMinutes: canEnd && tripMinutes.length ? summarize(tripMinutes) : null,
    horizonNetGp: summarize(horizonGp),
    horizonKills: summarize(horizonKills),
    gpTargetProbability: gpHits / p.samples,
    targetDrop,
    coverage: buildCoverage(model, result),
    warnings
  };
}

// Rows the pane can offer as a target drop: anything actually obtainable.
function targetDropOptions(result){
  return (result.lootBreakdown || [])
    .map((row, index) => ({
      id: String(index) + ':' + (row.key || row.name),
      name: row.name,
      chance: clamp(finiteOr(row.chance, 0), 0, 1),
      pref: row.pref
    }))
    .filter((row) => row.chance > 0 && row.chance < 1 && row.pref !== 'skip');
}

window.RiskModel = {
  MODEL_VERSION, DEFAULT_SAMPLES, MIN_SAMPLES, MAX_SAMPLES,
  analyze, targetDropOptions,
  // Exported for tools/run-risk.js and anything that wants to check the pieces.
  createRandom, stableHash, summarize, atLeastOnce, buildModel, buildLootModel, sampleLoot, sampleFoodUnits, sampleKillSeconds
};

})();
