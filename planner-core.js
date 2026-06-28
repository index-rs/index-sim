// planner-core.js — training-order planner for the combat sim.
// Pure logic, no DOM/React. Attaches window.SimPlanner.
//
// Given current stats, a target, a chosen monster (carried on the base sim
// input) and a POOL of gear the player owns/can afford, it produces a strict
// level-by-level greedy plan: at every level it recommends the skill whose
// next level (with the best gear that level unlocks auto-equipped) buys the
// most of the chosen metric per XP, with lookahead to far weapon/armour/spell
// unlocks so it will climb Attack toward a whip instead of dumping everything
// into Strength.
//
// Metric channels (all read straight off SimEngine.simulate):
//   'xph' effectiveXpPerHour  — folds in tankiness + food + trip efficiency
//   'gph' effectiveNetGpPerHour
//   'dps' effDps              — raw killing power
//
// Provenance: equip requirements are the standard 2004-era levels (Content
// @274 obj configs gate by `levelrequire`; the binary obj.pack isn't readable
// as text so the ladder values below are the documented 2004 requirements).

(function(){
  const E = () => window.SimEngine;
  const EQ = () => window.Equipment;

  // ---- XP table (RS standard) — cumulative xp to REACH level n -------------
  const XP = [0, 0]; // XP[1] = 0
  (function(){
    let total = 0;
    for (let lvl = 1; lvl < 99; lvl++){
      total += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
      XP[lvl + 1] = Math.floor(total / 4);
    }
  })();
  function xpAt(lvl){ return XP[Math.max(1, Math.min(99, Math.floor(lvl)))] || 0; }
  function xpBetween(skill, from, to){ return Math.max(0, xpAt(to) - xpAt(from)); }

  // ---- equip requirements --------------------------------------------------
  // keys are item ids matching SimEngine.WEAPONS / Equipment.*; missing → none.
  // r(att, def, rng, mag) helper keeps the table compact.
  const r = (attack, defence, ranged, magic) => ({ attack, defence, ranged, magic });
  const REQS = {
    // — melee weapons (Attack) —
    iron_scimitar:r(1), steel_scimitar:r(5), black_scimitar:r(10),
    mithril_scimitar:r(20), adamant_scimitar:r(30), rune_scimitar:r(40),
    dragon_longsword:r(60), dragon_mace:r(60), dragon_dagger:r(60),
    dragon_dagger_p:r(60), dragon_halberd:r(60),
    // hypothetical (behind the future-weapons toggle)
    dragon_scimitar:r(60), abyssal_whip:r(70),
    // — bows (Ranged) —
    shortbow:r(0,0,1), oak_shortbow:r(0,0,5), willow_shortbow:r(0,0,20),
    maple_shortbow:r(0,0,30), yew_shortbow:r(0,0,40), yew_longbow:r(0,0,40),
    magic_shortbow:r(0,0,50), magic_longbow:r(0,0,50),
    // — thrown (Ranged) —
    bronze_knife_w:r(0,0,1), iron_knife_w:r(0,0,1), steel_knife_w:r(0,0,5),
    mith_knife_w:r(0,0,20), addy_knife_w:r(0,0,30), rune_knife_w:r(0,0,40),
    bronze_dart_w:r(0,0,1), iron_dart_w:r(0,0,1), steel_dart_w:r(0,0,5),
    mith_dart_w:r(0,0,20), addy_dart_w:r(0,0,30), rune_dart_w:r(0,0,40),
    // — helms —
    iron_full_helm:r(0,1), steel_full_helm:r(0,5), black_full_helm:r(0,10),
    mithril_full_helm:r(0,20), adamant_full_helm:r(0,30), rune_full_helm:r(0,40),
    dragon_med_helm:r(0,60), berserker_helm:r(0,45), warrior_helm:r(0,45),
    coif:r(0,0,1), robin_hood_hat:r(0,0,40), archer_helm:r(0,45,45),
    splitbark_helm:r(0,40,0,40), farseer_helm:r(0,45,0,45), green_hat:r(0),
    // — bodies —
    iron_platebody:r(0,1), steel_platebody:r(0,5), black_platebody:r(0,10),
    mithril_platebody:r(0,20), adamant_platebody:r(0,30),
    rune_platebody:r(0,40), rune_chainbody:r(0,40), dragon_chainbody:r(0,60),
    leather_body:r(0,0,1), hardleather_body:r(0,0,10), studded_body:r(0,0,20),
    green_dhide_body:r(0,40,40), blue_dhide_body:r(0,40,50),
    red_dhide_body:r(0,40,60), black_dhide_body:r(0,40,70),
    splitbark_body:r(0,40,0,40), wizard_robe_top:r(0), monk_robe_top:r(0),
    // — legs (d'hide chaps need Ranged only; metal needs Defence) —
    iron_platelegs:r(0,1), steel_platelegs:r(0,5), black_platelegs:r(0,10),
    mithril_platelegs:r(0,20), adamant_platelegs:r(0,30), rune_platelegs:r(0,40),
    leather_chaps:r(0,0,1), studded_chaps:r(0,0,20),
    green_dhide_legs:r(0,0,40), blue_dhide_legs:r(0,0,50),
    red_dhide_legs:r(0,0,60), black_dhide_legs:r(0,0,70),
    splitbark_legs:r(0,40,0,40),
    // — shields —
    iron_kite:r(0,1), steel_kite:r(0,5), black_kite:r(0,10),
    mithril_kite:r(0,20), adamant_kite:r(0,30), rune_kite:r(0,40), dragon_sq:r(0,60),
  };
  function reqOf(key){ return REQS[key] || {}; }
  function reqLevel(key, skill){ const q = reqOf(key); return q[skill] || 0; }
  function equippable(key, state){
    const q = reqOf(key);
    return (!q.attack  || state.attack  >= q.attack)
        && (!q.defence || state.defence >= q.defence)
        && (!q.ranged  || state.ranged  >= q.ranged)
        && (!q.magic   || state.magic   >= q.magic);
  }

  // ---- hypothetical future weapons (not yet in the game / engine WEAPONS) ---
  // accBonus = slash attack, dmgBonus = strength bonus.
  // ⚠ These are the OSRS Wiki values (slash att / str bonus). 2004scape hasn't
  // added these weapons yet — DOUBLE-CHECK against the .obj configs once they land
  // (expected ~rev 306) and update if the 2004-era numbers differ.
  const HYPO_WEAPONS = {
    dragon_scimitar: { name:'Dragon scimitar', type:'melee', wclass:'scimitar', accBonus:67, dmgBonus:66, speed:4, hypo:true },
    abyssal_whip:    { name:'Abyssal whip',    type:'melee', wclass:'whip',     accBonus:82, dmgBonus:82, speed:4, hypo:true },
  };
  function weaponDef(key){ return (E().WEAPONS[key]) || HYPO_WEAPONS[key] || null; }

  // ---- training stance -----------------------------------------------------
  // The stance you must actually be in to earn a given skill's XP. Training
  // Attack means standing on 'accurate' (forfeiting Aggressive's +3 hidden
  // Strength bonus → lower max hit), Strength on 'aggressive', Defence on
  // 'defensive'. Returns the weapon-specific stance ID (some weapons lack an
  // accurate stance — a halberd trains Attack on 'controlled'); falls back to
  // the loadout's own stance.
  function trainingStanceId(base, skill){
    const ct = base.combatType;
    if (ct === 'ranged') return skill === 'defence' ? 'longrange' : (base.style || 'rapid');
    if (ct === 'magic')  return skill === 'defence' ? 'defensive' : (base.style || 'accurate');
    const want = skill === 'attack'   ? ['accurate','controlled']
              :  skill === 'strength' ? ['aggressive','controlled']
              :                         ['defensive','controlled'];
    let stances = [];
    try { stances = E().weaponStances ? E().weaponStances(base.weapon) : []; } catch(e){}
    for (const w of want){ const hit = stances.find(s => s.style === w); if (hit) return hit.id; }
    return base.style;
  }

  // ---- magic spell ladder, keyed off the equipped staff's element ----------
  const STAFF_ELEM = { staff_of_fire:'fire', staff_of_air:'wind', staff_of_water:'water', staff_of_earth:'earth' };
  function spellLadder(weaponKey){
    const elem = STAFF_ELEM[weaponKey] || 'fire';
    return [`${elem}_strike`, `${elem}_bolt`, `${elem}_blast`, `${elem}_wave`]
      .map(k => ({ key:k, ...(E().SPELLS[k] || {}) }))
      .filter(s => s.base);
  }

  // ---- candidate gear lists per combat type --------------------------------
  // Used to seed the default pool the UI shows; the planner only ever considers
  // items present in the active pool.
  const CANDIDATES = {
    melee: {
      weapon: ['iron_scimitar','steel_scimitar','black_scimitar','mithril_scimitar',
        'adamant_scimitar','rune_scimitar','dragon_mace','dragon_dagger','dragon_longsword'],
      weaponHypo: ['dragon_scimitar','abyssal_whip'],
      helm: ['none','iron_full_helm','steel_full_helm','black_full_helm','mithril_full_helm',
        'adamant_full_helm','rune_full_helm','berserker_helm','dragon_med_helm'],
      body: ['none','iron_platebody','steel_platebody','black_platebody','mithril_platebody',
        'adamant_platebody','rune_platebody','dragon_chainbody'],
      legs: ['none','iron_platelegs','steel_platelegs','black_platelegs','mithril_platelegs',
        'adamant_platelegs','rune_platelegs'],
      shield: ['none','iron_kite','steel_kite','black_kite','mithril_kite','adamant_kite','rune_kite','dragon_sq'],
    },
    ranged: {
      weapon: ['shortbow','oak_shortbow','willow_shortbow','maple_shortbow',
        'yew_shortbow','yew_longbow','magic_shortbow','magic_longbow','rune_knife_w','addy_knife_w'],
      weaponHypo: [],
      helm: ['none','coif','robin_hood_hat','archer_helm'],
      body: ['none','leather_body','studded_body','green_dhide_body','blue_dhide_body','red_dhide_body','black_dhide_body'],
      legs: ['none','leather_chaps','studded_chaps','green_dhide_legs','blue_dhide_legs','red_dhide_legs','black_dhide_legs'],
      shield: ['none'],
    },
    magic: {
      weapon: [],   // staff kept as-is; spell ladder is the progression
      weaponHypo: [],
      helm: ['none','green_hat','splitbark_helm','farseer_helm'],
      body: ['none','wizard_robe_top','splitbark_body'],
      legs: ['none','zamorak_robe_bottom','splitbark_legs'],
      shield: ['none'],
    },
  };
  const ARMOUR_SLOTS = ['helm','body','legs','shield'];

  // Default pool for a combat type: every curated candidate (+ hypotheticals
  // only when enabled). The user prunes to what they actually own.
  function defaultPool(combatType, futureWeapons){
    const c = CANDIDATES[combatType] || CANDIDATES.melee;
    const pool = {
      weapon: [...(c.weapon||[]), ...(futureWeapons ? (c.weaponHypo||[]) : [])],
      helm: [...(c.helm||[])], body: [...(c.body||[])],
      legs: [...(c.legs||[])], shield: [...(c.shield||[])],
    };
    return pool;
  }

  // ---- gear selection for a given stat state -------------------------------
  // Armour: cheap heuristic — pick the equippable pool item maximising
  // (style attack ×1000 + total melee defence). For melee, style-att is 0 so
  // this maximises tankiness (rune plate at def 40 etc); for ranged/magic the
  // style-att term auto-equips d'hide / splitbark the moment their def+style
  // reqs are met. Weapon: simulated per candidate (the expensive, important
  // choice). Returns { weapon, weaponName, spell, armour:{...} }.
  function styleAttKey(combatType){
    return combatType === 'ranged' ? 'rngAtt' : combatType === 'magic' ? 'magAtt' : 'slashAtt';
  }
  // Current-gear lock: freeze the armour slots to whatever's equipped on the
  // base loadout (no upgrades considered).
  function lockedArmour(base){
    const g = base.gear || {};
    return { helm:g.helm||'none', body:g.body||'none', legs:g.legs||'none', shield:g.shield||'none' };
  }

  function pickArmour(combatType, pool, state){    const eq = EQ();
    const slotItems = { helm:eq.HELMS, body:eq.BODIES, legs:eq.LEGS, shield:eq.SHIELDS };
    const styleKey = styleAttKey(combatType);
    const out = {};
    for (const slot of ARMOUR_SLOTS){
      const cands = (pool[slot] || ['none']).filter(k => k === 'none' || (slotItems[slot][k] && equippable(k, state)));
      let best = 'none', bestScore = -Infinity;
      for (const k of cands){
        const it = k === 'none' ? {} : (slotItems[slot][k] || {});
        const att = it[styleKey] || 0;
        const def = (it.stabDef||0) + (it.slashDef||0) + (it.crushDef||0) + (it.rngDef||0) + (it.magDef||0);
        const score = att * 1000 + def;
        if (score > bestScore){ bestScore = score; best = k; }
      }
      out[slot] = best;
    }
    return out;
  }

  // Compute offence (accBonus/dmgBonus/attackSpeed) for a weapon over a fixed
  // armour set — mirrors Equipment.loadoutToInput but accepts an unregistered
  // (hypothetical) weapon by adding its bonus manually.
  function calcOffense(combatType, baseGear, armour, wDef){
    const t = EQ().sumBonuses({ ...baseGear, ...armour, weapon:'none', ammo:'none' });
    if (combatType === 'ranged') return { accBonus:(t.rngAtt||0)+(wDef.accBonus||0), dmgBonus:(t.rngStr||0)+(wDef.dmgBonus||0), attackSpeed:wDef.speed };
    if (combatType === 'magic')  return { accBonus:(t.magAtt||0)+(wDef.accBonus||0), dmgBonus:0, attackSpeed:wDef.speed };
    return { accBonus:(t.slashAtt||0)+(wDef.accBonus||0), dmgBonus:(t.str||0)+(wDef.dmgBonus||0), attackSpeed:wDef.speed };
  }

  function metricFromResult(res, metric, refs){
    if (metric === 'dps') return res.effDps || 0;
    if (metric === 'gph') return res.effectiveNetGpPerHour || 0;
    if (metric === 'bal'){
      // Balanced: normalise eff. xp/hr and net gp/hr to the current setup so a
      // 1% gain in either weighs equally, then average them 50/50.
      const rx = (refs && refs.xph) || 1, rg = (refs && refs.gph) || 1;
      return 0.5 * ((res.effectiveXpPerHour || 0) / rx)
           + 0.5 * ((res.effectiveNetGpPerHour || 0) / rg);
    }
    return res.effectiveXpPerHour || 0;
  }

  // Best full config (weapon/spell + armour) at a stat state, by metric.
  function bestConfig(base, state, pool, opts, stanceId){
    const combatType = base.combatType;
    const armour = opts.lockGear ? lockedArmour(base) : pickArmour(combatType, pool, state);
    const gearSlots = { ...(base.gear || {}), ...armour };
    const style = stanceId || base.style;
    const mk = (over) => E().simulate({ ...base,
      attack:state.attack, strength:state.strength, defence:state.defence,
      ranged:state.ranged, magic:state.magic,
      gear: gearSlots, sustained: opts.sustained, style,
      ...over });

    if (combatType === 'magic'){
      const ladder = spellLadder(base.weapon).filter(s => state.magic >= (s.lvl || 1));
      const spell = ladder.length ? ladder[ladder.length - 1]
        : { key: base.spell, base: base.spellBase };
      const res = mk({ spell: spell.key, spellBase: spell.base });
      return { res, weapon: base.weapon, weaponName: base.weaponName,
        spell: spell.key, spellName: (E().SPELLS[spell.key]?.name) || base.weaponName,
        armour, metricVal: metricFromResult(res, opts.metric, opts.refs), dps: res.effDps || 0 };
    }

    // Current-gear lock (melee/ranged): keep the equipped weapon — no switching
    // between e.g. dragon longsword and dragon scimitar as stats climb.
    if (opts.lockGear){
      const res = mk({});
      return { res, weapon: base.weapon, weaponName: base.weaponName, spell: null,
        armour, metricVal: metricFromResult(res, opts.metric, opts.refs), dps: res.effDps || 0 };
    }

    let weapons = (pool.weapon || []).filter(k => weaponDef(k) && equippable(k, state));
    if (!weapons.length) weapons.push(base.weapon);
    // Perf: drop strictly-dominated weapons within the same class (e.g. iron…
    // adamant scimitars are all beaten by a rune scimitar — same speed, higher
    // bonuses), so we only simulate the few that could actually win. Restricted
    // to same-class so a stab/crush weapon vs a slash one (different monster
    // defence rolled) is never wrongly pruned.
    if (weapons.length > 2){
      const info = weapons.map(k => { const d = weaponDef(k) || {}; let cat;
        try { cat = E().weaponCategory ? E().weaponCategory(k) : null; } catch(e){}
        return { k, cat: cat || d.wclass || k, acc:d.accBonus||0, dmg:d.dmgBonus||0, spd:d.speed||99 }; });
      const kept = info.filter(a => !info.some(b => b !== a && b.cat === a.cat &&
        b.acc >= a.acc && b.dmg >= a.dmg && b.spd <= a.spd &&
        (b.acc > a.acc || b.dmg > a.dmg || b.spd < a.spd))).map(x => x.k);
      if (kept.length) weapons = kept;
    }
    let best = null;
    for (const wk of weapons){
      const wDef = weaponDef(wk) || { name:base.weaponName, accBonus:base.accBonus, dmgBonus:base.dmgBonus, speed:base.attackSpeed };
      const off = calcOffense(combatType, base.gear || {}, armour, wDef);
      const res = mk({ weapon:wk, weaponName:wDef.name,
        accBonus:off.accBonus, dmgBonus:off.dmgBonus, attackSpeed:off.attackSpeed });
      const metricVal = metricFromResult(res, opts.metric, opts.refs);
      if (!best || metricVal > best.metricVal){
        best = { res, weapon:wk, weaponName:wDef.name, spell:null, armour, metricVal, dps:res.effDps || 0 };
      }
    }
    return best;
  }

  // ---- combat level (2004) -------------------------------------------------
  function combatLevel(state, base){
    const hp = base.hp || 10, pray = base.prayer || 1;
    const baseC = 0.25 * (state.defence + hp + Math.floor(pray / 2));
    const melee = 0.325 * (state.attack + state.strength);
    const range = 0.325 * Math.floor(1.5 * state.ranged);
    const mage  = 0.325 * Math.floor(1.5 * state.magic);
    return Math.floor(baseC + Math.max(melee, range, mage));
  }

  // Melee skills ordered att → str → def to match the in-game skill tab.
  const SKILLS_FOR = { melee:['attack','strength','defence'], ranged:['ranged','defence'], magic:['magic','defence'] };
  const SKILL_LABEL = { attack:'Attack', strength:'Strength', defence:'Defence', ranged:'Ranged', magic:'Magic' };
  const SLOT_LABEL = { weapon:'weapon', spell:'spell', helm:'helm', body:'body', legs:'legs', shield:'shield' };

  // binding requirement for an item (the skill+level that gates it). Prefer the
  // skill that actually triggered the change; else the highest single req.
  function bindingReq(key, preferSkill){
    if (preferSkill && reqLevel(key, preferSkill) > 1) return { skill:preferSkill, level:reqLevel(key, preferSkill) };
    let best = null;
    for (const s of ['attack','defence','ranged','magic']){
      const L = reqLevel(key, s);
      if (L > 1 && (!best || L > best.level)) best = { skill:s, level:L };
    }
    return best;
  }

  // ---- the plan ------------------------------------------------------------
  // opts = { metric, targets:{skill:lvl}, startXp:{skill:xp}, pool,
  //          futureWeapons, sustained, maxLevels }
  // A LOCKED skill is simply one whose target equals its current level (set by
  // the caller): it never trains, so its level stays put and any gear needing
  // more of it is excluded automatically by equippable().
  function buildPlan(base, opts){
    const combatType = base.combatType;
    const allSkills = SKILLS_FOR[combatType] || SKILLS_FOR.melee;
    const targets = opts.targets || {};
    const startXp = opts.startXp || {};
    const skills = allSkills.filter(s => (targets[s] ?? base[s]) > base[s]);

    // unlock thresholds per skill from the active pool (+ spell ladder for magic)
    const thresholds = {};
    for (const s of allSkills){
      const set = new Set();
      const items = [...(opts.pool.weapon||[]), ...(opts.pool.helm||[]), ...(opts.pool.body||[]),
        ...(opts.pool.legs||[]), ...(opts.pool.shield||[])];
      if (!opts.lockGear) for (const it of items){ const L = reqLevel(it, s); if (L > 1) set.add(L); }
      if (combatType === 'magic' && s === 'magic'){ for (const sp of spellLadder(base.weapon)) if (sp.lvl > 1) set.add(sp.lvl); }
      thresholds[s] = [...set].sort((a,b)=>a-b);
    }
    const nextThreshold = (s, cur) => { for (const L of thresholds[s]) if (L > cur) return L; return null; };

    // refs for the 'balanced' metric: normalise xp/hr and gp/hr against the
    // current setup so neither unit dominates. Computed once from the base sim.
    if (opts.metric === 'bal' && !opts.refs){
      const r0 = E().simulate({ ...base, sustained: opts.sustained });
      opts.refs = {
        xph: Math.max(1, Math.abs(r0.effectiveXpPerHour || 1)),
        gph: Math.max(1, Math.abs(r0.effectiveNetGpPerHour || 1)),
      };
    }

    const cache = new Map();
    const cfgOf = (state, stanceId) => {
      const sid = stanceId || base.style || '';
      const key = `${state.attack}|${state.strength}|${state.defence}|${state.ranged}|${state.magic}|${sid}`;
      let v = cache.get(key);
      if (!v){ v = bestConfig(base, state, opts.pool, opts, sid); cache.set(key, v); }
      return v;
    };
    const stanceForSkill = (skill) => trainingStanceId(base, skill);

    const state = { attack:base.attack, strength:base.strength, defence:base.defence,
      ranged:base.ranged, magic:base.magic };
    // progressXp[s] = total xp banked in skill s so far. Defaults to the start
    // of the current level, or the caller-supplied current xp (so a player part-
    // way through a level pays only the remainder to ding).
    const progressXp = {};
    for (const s of allSkills){
      const lo = xpAt(state[s]), hi = xpAt(Math.min(99, state[s] + 1));
      const sx = startXp[s];
      progressXp[s] = (sx != null && isFinite(sx)) ? Math.max(lo, Math.min(hi, sx)) : lo;
    }
    const xpToReach = (s, L) => Math.max(0, xpAt(L) - progressXp[s]);

    const startCfg = cfgOf({ ...state }, base.style);
    const steps = [];
    let cumXp = 0;
    const maxLevels = opts.maxLevels || 600;

    const remaining = () => skills.filter(s => state[s] < (targets[s] ?? state[s]));
    let guard = 0;
    while (remaining().length && steps.length < maxLevels && guard < maxLevels + 50){
      guard++;
      let best = null;
      for (const s of remaining()){
        // Decisions are stance-aware: score each skill in the stance you'd train
        // it in (Attack on accurate, etc) so the hidden style bonus + real
        // training DPS are reflected.
        const stance = stanceForSkill(s);
        const now = cfgOf({ ...state }, stance).metricVal;
        const cur = state[s], tgt = targets[s];
        const th = nextThreshold(s, cur);
        const horizon = Math.min(tgt, th ?? tgt);
        // Evaluate the per-XP slope to every level in a short window (plus the
        // gear/spell unlock horizon) and take the BEST. A window — not just cur+1
        // — keeps integer max-hit rounding and tiny spec-damage blips from hiding
        // a skill's real next boundary: Strength is valued at the level where its
        // max hit actually ticks up, not the flat level before it.
        const scanTop = Math.min(tgt, cur + 6);
        const cands = [];
        for (let L = cur + 1; L <= scanTop; L++) cands.push(L);
        if (horizon > scanTop) cands.push(horizon);
        for (const L of cands){
          const m2 = cfgOf({ ...state, [s]: L }, stance).metricVal;
          const dxp = xpToReach(s, L);
          if (dxp <= 0) continue;
          const perXp = (m2 - now) / dxp;
          if (!best || perXp > best.perXp + 1e-15){ best = { s, perXp, gain:m2 - now }; }
        }
      }
      if (!best){ best = { s: remaining()[0], perXp:0, gain:0 }; }

      const s = best.s, from = state[s];
      const dxp = xpToReach(s, from + 1);
      state[s] = from + 1;
      progressXp[s] = xpAt(from + 1);
      cumXp += dxp;
      // Displayed dps/metric use your MAIN fighting stance so the progression is
      // monotonic and comparable (no cross-stance negatives); only the ORDER above
      // is stance-aware.
      const cfg = cfgOf({ ...state }, base.style);
      steps.push({ skill:s, from, to:from + 1, dxp, metricVal:cfg.metricVal, dps:cfg.dps,
        cumXp, combat:combatLevel(state, base), cfg, state:{ ...state }, stance: stanceForSkill(s) });
    }

    // ---- derive gear transitions per slot, with bounce-smoothing -----------
    // Integer max-hit rounding can make the best weapon flip back and forth over
    // a couple of levels near a DPS crossover. We collapse the per-level item
    // sequence into runs and merge any run shorter than MIN_RUN into its
    // predecessor, so only stable transitions surface. Each surviving boundary
    // is classed as an UNLOCK (the item wasn't equippable the level before) or a
    // SWITCH (it was — a pure DPS crossover, e.g. rune scimitar overtaking a
    // dragon longsword as Strength climbs).
    const MIN_RUN = 3;
    const reg = { helm:EQ().HELMS, body:EQ().BODIES, legs:EQ().LEGS, shield:EQ().SHIELDS };
    const nameFor = (slot, key) => {
      if (!key || key === 'none') return 'none';
      if (slot === 'weapon') return weaponDef(key)?.name || key;
      if (slot === 'spell') return E().SPELLS[key]?.name || key;
      return reg[slot]?.[key]?.name || key;
    };
    const slotItems = [
      combatType === 'magic' ? ['spell', (c)=>c.spell] : ['weapon', (c)=>c.weapon],
      ...ARMOUR_SLOTS.map(slot => [slot, (c)=>c.armour[slot]]),
    ];
    const allTransitions = [];
    for (const [slot, get] of slotItems){
      const seq = steps.map(st => get(st.cfg));     // item after each step
      if (!seq.length) continue;
      // runs over the step sequence (run.start = -1 means "the start config")
      const startItem = get(startCfg);
      const runs = [];
      let curItem = startItem, runStart = -1;
      for (let i = 0; i < seq.length; i++){
        if (seq[i] !== curItem){ runs.push({ item:curItem, start:runStart, end:i - 1 }); curItem = seq[i]; runStart = i; }
      }
      runs.push({ item:curItem, start:runStart, end:seq.length - 1 });
      // merge short interior runs into the previous run (treat as noise)
      for (let i = 1; i < runs.length; i++){
        const len = runs[i].end - runs[i].start + 1;
        if (len < MIN_RUN){ runs[i - 1].end = runs[i].end; runs.splice(i, 1); i--; }
      }
      // boundaries → transitions
      for (let i = 1; i < runs.length; i++){
        const r = runs[i];
        if (!r.item || r.item === 'none') continue;
        if (r.item === runs[i - 1].item) continue;
        const stepIdx = r.start;                     // first step where the new item is best
        const st = steps[stepIdx];
        const prevState = { ...st.state, [st.skill]: st.from };  // levels the level BEFORE this step
        const wasEquip = (slot === 'spell')
          ? (E().SPELLS[r.item] && st.from >= (E().SPELLS[r.item].lvl || 1) - 1 && st.from >= (E().SPELLS[r.item].lvl || 1)) // spells: lvl-gated
          : equippable(r.item, prevState);
        const type = (slot === 'spell') ? 'unlock' : (wasEquip ? 'switch' : 'unlock');
        const br = (slot === 'spell')
          ? { skill:'magic', level: E().SPELLS[r.item]?.lvl || st.to }
          : bindingReq(r.item, st.skill) || { skill: st.skill, level: st.to };
        allTransitions.push({
          slot, type, name: nameFor(slot, r.item), prevName: nameFor(slot, runs[i - 1].item),
          skill: st.skill, level: st.to, reqSkill: br.skill, reqLevel: br.level,
          stepIdx, cumXp: st.cumXp, dpsBefore: stepIdx > 0 ? steps[stepIdx - 1].dps : startCfg.dps, dpsAfter: st.dps,
        });
      }
    }
    allTransitions.sort((a, b) => a.stepIdx - b.stepIdx);

    // coalesce consecutive same-skill steps into phases (tracking step range)
    const phases = [];
    steps.forEach((st, idx) => {
      const last = phases[phases.length - 1];
      if (last && last.skill === st.skill){
        last.to = st.to; last.endDps = st.dps; last.endMetric = st.metricVal;
        last.cumXp = st.cumXp; last.combat = st.combat;
        last.xp += st.dxp; last.lastStep = idx;
      } else {
        phases.push({ skill:st.skill, from:st.from, to:st.to,
          startDps: (last ? last.endDps : startCfg.dps), endDps:st.dps,
          startMetric:(last ? last.endMetric : startCfg.metricVal), endMetric:st.metricVal,
          xp: st.dxp, cumXp:st.cumXp, combat:st.combat,
          firstStep: idx, lastStep: idx, unlocks:[] });
      }
    });
    // attach each transition to the phase whose step range contains its stepIdx
    for (const tr of allTransitions){
      const ph = phases.find(p => tr.stepIdx >= p.firstStep && tr.stepIdx <= p.lastStep);
      if (ph) ph.unlocks.push(tr);
    }

    // Headline end-state DPS/metric reflects your MAIN loadout stance (what you
    // actually fight in at the target), so "Now → Target" is apples-to-apples;
    // the per-phase rows keep their training-stance values.
    const endMain = steps.length ? cfgOf({ ...steps[steps.length - 1].state }, base.style) : null;
    return {
      ok: true,
      combatType, metric: opts.metric,
      start: { state:{ attack:base.attack, strength:base.strength, defence:base.defence, ranged:base.ranged, magic:base.magic },
        dps:startCfg.dps, metricVal:startCfg.metricVal, combat:combatLevel(base, base),
        cfg:startCfg },
      end: steps.length ? { ...steps[steps.length - 1], dps:endMain.dps, metricVal:endMain.metricVal } : null,
      steps, phases, unlocks: allTransitions,
      totalXp: cumXp,
      truncated: steps.length >= maxLevels && remaining().length > 0,
      skills, targets,
    };
  }

  window.SimPlanner = {
    XP, xpAt, xpBetween, REQS, reqOf, reqLevel, equippable,
    HYPO_WEAPONS, weaponDef, spellLadder, STAFF_ELEM,
    CANDIDATES, ARMOUR_SLOTS, defaultPool, bestConfig, combatLevel, trainingStanceId,
    SKILLS_FOR, SKILL_LABEL, SLOT_LABEL, buildPlan,
  };
})();
