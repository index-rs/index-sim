'use strict';
// golden-lib.js — load the simulator outside the browser and reduce a run to a
// comparable summary.
//
// The app is a zero-build page: gamedata.js, engine.js, trip.js and equipment.js
// are plain scripts that hang their exports off `window`. That means they load
// unmodified in a Node `vm` context with a stub `window` and `localStorage`, and
// SimEngine.simulate() can be called directly — no bundler, no test framework,
// no changes to the app to make it testable. tools/audit-droptables.js uses the
// same trick to read gamedata.js.
//
// market.js, planner-core.js and the .jsx views are deliberately NOT loaded.
// They pull in live prices and UI state; leaving them out is what makes a run
// deterministic, so a case only ever moves when the simulator moves.
//
// Ported from index-sim-v2's src/tests/helpers/legacy-sim.ts.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const SCRIPT_FILES = ['gamedata.js', 'engine.js', 'trip.js', 'equipment.js'];

const DEFAULT_LEVELS = { attack: 70, strength: 70, defence: 60, ranged: 70, magic: 70, prayer: 43 };

const DEFAULT_GEAR = {
  helm: 'none',
  amulet: 'none',
  body: 'none',
  legs: 'none',
  shield: 'none',
  gloves: 'none',
  boots: 'none',
  cape: 'none',
  ring: 'none'
};

const DEFAULT_WEAPON = { melee: 'rune_scimitar', ranged: 'magic_shortbow', magic: 'staff_of_fire' };
const DEFAULT_STYLE = { melee: 'aggressive', ranged: 'rapid', magic: 'accurate' };

const DEFAULT_TRIP = {
  foodKey: 'none',
  teleport: false,
  bankSeconds: 0,
  prayerMode: 'none',
  recoverAmmo: true
};

// gamedata.js and engine.js both read localStorage on load. A Map-backed stub
// keeps each runtime isolated, so nothing a case writes leaks into the next one.
function memoryStorage() {
  const store = new Map();
  return {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    key(index) { return Array.from(store.keys())[index] ?? null; },
    removeItem(key) { store.delete(key); },
    setItem(key, value) { store.set(key, String(value)); }
  };
}

function createRuntime(rootDir = ROOT) {
  const context = { console, localStorage: memoryStorage(), setTimeout, clearTimeout };
  context.window = context;
  vm.createContext(context);

  for (const fileName of SCRIPT_FILES) {
    const source = fs.readFileSync(path.join(rootDir, fileName), 'utf8');
    vm.runInContext(source, context, { filename: fileName });
  }
  return context;
}

// simulate() mutates parts of the monster it is handed, so each case gets its
// own deep copy rather than the shared GameData entry.
function getMonster(runtime, monsterId) {
  const monster = runtime.GameData.MONSTERS.find((m) => m.id === monsterId);
  if (!monster) throw new Error(`Unknown monster id: ${monsterId}`);
  return JSON.parse(JSON.stringify(monster));
}

// Expand a case definition into the input object simulate() expects, applying
// the same defaults the UI does for anything the case leaves unsaid.
function buildInput(runtime, def) {
  const levels = { ...DEFAULT_LEVELS, ...def.levels };
  const combatType = def.combatType;
  const weapon = def.weapon ?? DEFAULT_WEAPON[combatType];
  const weaponDef = runtime.SimEngine.WEAPONS[weapon];
  const ammo = def.ammo ?? (weaponDef && weaponDef.sub === 'bow' ? 'rune_arrow' : 'none');
  const gear = { ...DEFAULT_GEAR, ...def.gear };
  const loadout = runtime.Equipment.loadoutToInput({ ...gear, weapon, ammo }, combatType);
  const spellKey = def.spell ?? (combatType === 'magic' ? 'fire_bolt' : undefined);
  const spell = spellKey ? runtime.SimEngine.SPELLS[spellKey] : undefined;

  // Only bows carry the ammo's range bonus; thrown weapons have it built in.
  const ammoRangeBonus =
    combatType === 'ranged' && weaponDef && weaponDef.sub === 'bow'
      ? (runtime.SimEngine.ARROWS[ammo] ? runtime.SimEngine.ARROWS[ammo].rangeBonus ?? 0 : 0)
      : 0;

  const input = {
    ...levels,
    combatType,
    monster: getMonster(runtime, def.monsterId),
    style: def.style ?? DEFAULT_STYLE[combatType],
    weapon,
    ammo,
    gear,
    prayers: def.prayers ?? ['none'],
    boosts: def.boosts ?? ['none'],
    sustained: def.sustained ?? false,
    repotThreshold: def.repotThreshold,
    trip: { ...DEFAULT_TRIP, ...def.trip },
    ringOfWealth: def.ringOfWealth ?? gear.ring === 'ring_of_wealth',
    legends: def.legends ?? true,
    jewelSpotByMonster: { [def.monsterId]: def.jewelSpot ?? 'underground' },
    specWeapon: def.specWeapon ?? 'none',
    specAmmo: def.specAmmo,
    cannon: def.cannon,
    lootPrefs: def.lootPrefs,
    overheadSec: def.overheadSec,
    accBonus: loadout.accBonus,
    dmgBonus: loadout.dmgBonus,
    accByType: loadout.accByType,
    attackSpeed: loadout.attackSpeed ?? (weaponDef ? weaponDef.speed : 4) ?? 4,
    ammoRangeBonus
  };

  if (spellKey && spell) {
    input.spell = spellKey;
    input.spellBase = spell.base;
    input.charge = def.charge;
  }
  return input;
}

function runCase(runtime, def) {
  return runtime.SimEngine.simulate(buildInput(runtime, def));
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// Round to 6 decimals so a baseline captured on one machine compares equal on
// another. Anything non-finite (NaN from a divide-by-zero path) becomes null,
// which still compares — a result that starts producing NaN is a real failure.
function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

function bool(value) {
  return typeof value === 'boolean' ? value : null;
}

// Only the top five earners, by value then name. The full breakdown is dozens
// of rows of mostly-zero noise; the top five move whenever pricing, drop rates
// or keep-preferences change, which is what we want to catch.
function summarizeLoot(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(asRecord)
    .map((row) => ({
      name: String(row.name ?? ''),
      key: typeof row.key === 'string' ? row.key : null,
      pref: typeof row.pref === 'string' ? row.pref : null,
      evGp: num(row.evGp),
      prayerXp: num(row.prayerXp),
      slotFrac: num(row.slotFrac),
      alchValue: num(row.alchValue)
    }))
    .filter((row) => (row.evGp ?? 0) > 0 || (row.prayerXp ?? 0) > 0)
    .sort((a, b) => (b.evGp ?? 0) - (a.evGp ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function summarizeSkills(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const r = asRecord(row);
    return {
      key: typeof r.key === 'string' ? r.key : null,
      name: typeof r.name === 'string' ? r.name : null,
      xpPerHour: num(r.xpPerHour)
    };
  });
}

// The comparable slice of a simulate() result. Sub-objects collapse to null
// when the mechanic is not in play, so "cannon appeared where there was none"
// reads as a diff instead of a wall of zeroes.
function summarize(result) {
  const trip = asRecord(result.trip);
  const slots = asRecord(trip.slots);
  const incoming = asRecord(trip.incoming);
  const cannon = asRecord(result.cannon);
  const scarce = asRecord(result.scarce);
  const spec = asRecord(result.specInfo);
  const poison = asRecord(result.poison);
  const recoil = asRecord(result.recoil);
  const empty = (o) => Object.keys(o).length === 0;

  return {
    combatType: result.combatType,
    maxHit: num(result.maxHit),
    peakMaxHit: num(result.peakMaxHit),
    hitChance: num(result.hitChance),
    avgHit: num(result.avgHit),
    dps: num(result.dps),
    effDps: num(result.effDps),
    ttkSec: num(result.ttkSec),
    cycleSec: num(result.cycleSec),
    killsPerHour: num(result.killsPerHour),
    effectiveKph: num(result.effectiveKph),
    xpPerHour: num(result.xpPerHour),
    effectiveXpPerHour: num(result.effectiveXpPerHour),
    totalXpPerHour: num(result.totalXpPerHour),
    gpPerKill: num(result.gpPerKill),
    gpPerHour: num(result.gpPerHour),
    netGpPerHour: num(result.netGpPerHour),
    effectiveNetGpPerHour: num(result.effectiveNetGpPerHour),
    supplyCostPerKill: num(result.supplyCostPerKill),
    foodCostPerKill: num(result.foodCostPerKill),
    potionCostPerKill: num(result.potionCostPerKill),
    ammoCostPerKill: num(result.ammoCostPerKill),
    runeCostPerKill: num(result.runeCostPerKill),
    castsPerKill: num(result.castsPerKill),
    prayerXpPerKill: num(result.prayerXpPerKill),
    prayerPerKill: num(result.prayerPerKill),
    ammo:
      result.ammoKeyUsed === null || result.ammoKeyUsed === undefined
        ? null
        : {
            key: result.ammoKeyUsed,
            unitPrice: num(result.ammoUnitPrice),
            perKill: num(result.ammoPerKill),
            costPerKill: num(result.ammoCostPerKill)
          },
    trip: empty(trip)
      ? null
      : {
          bound: trip.bound ?? null,
          killsPerTrip: num(trip.killsPerTrip),
          foodPerKill: num(trip.foodPerKill),
          lootFraction: num(trip.lootFraction),
          efficiency: num(trip.efficiency),
          effectiveKph: num(trip.effectiveKph),
          bankSeconds: num(trip.bankSeconds),
          incoming: {
            safespot: bool(incoming.safespot),
            safespotAuto: bool(incoming.safespotAuto),
            hpPerKill: num(incoming.hpPerKill),
            dragonfire: num(incoming.dragonfire),
            poison: num(incoming.poison)
          },
          slots: {
            reserve: num(slots.reserve),
            stackReserve: num(slots.stackReserve),
            foodCount: num(slots.foodCount),
            lootCapacity: num(slots.lootCapacity),
            nonStackPerKill: num(slots.nonStackPerKill)
          }
        },
    cannon: empty(cannon)
      ? null
      : {
          ballsPerKill: num(cannon.ballsPerKill),
          ballsPerHour: num(cannon.ballsPerHour),
          cannonDps: num(cannon.cannonDps),
          ballCostPerKill: num(cannon.ballCostPerKill),
          activeFrac: num(cannon.activeFrac),
          idle: bool(cannon.idle),
          respawnBound: bool(cannon.respawnBound)
        },
    scarce: empty(scarce)
      ? null
      : {
          activeFrac: num(scarce.activeFrac),
          kph: num(scarce.kph),
          respawnBound: bool(scarce.respawnBound)
        },
    spec: empty(spec)
      ? null
      : {
          key: spec.key ?? null,
          maxHit: num(spec.maxHit),
          hitChance: num(spec.hitChance),
          expPerSpec: num(spec.expPerSpec),
          specsPerHour: num(spec.specsPerHour),
          dpsGainPct: num(spec.dpsGainPct)
        },
    poison: empty(poison)
      ? null
      : { severity: num(poison.severity), dps: num(poison.dps), directFrac: num(poison.directFrac) },
    recoil: empty(recoil)
      ? null
      : {
          dps: num(recoil.dps),
          dmgPerKill: num(recoil.dmgPerKill),
          ringsPerKill: num(recoil.ringsPerKill),
          costPerKill: num(recoil.costPerKill)
        },
    topLoot: summarizeLoot(result.lootBreakdown),
    skillXpBreakdown: summarizeSkills(result.skillXpBreakdown)
  };
}

module.exports = { ROOT, SCRIPT_FILES, createRuntime, getMonster, buildInput, runCase, summarize };
