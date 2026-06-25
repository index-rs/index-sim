// views.jsx — Workbench A (with embedded Stats/Compare/Loot tabs) +
// Spreadsheet B (standalone) + Architecture board.
// All driven by SimEngine. Supports melee / ranged / magic.

const { useState, useMemo, useEffect } = React;
const E = window.SimEngine;

// ---------- formatters --------------------------------------------------
const fmtInt = n => n == null || !isFinite(n) ? '—' : Math.round(n).toLocaleString();
const fmt1   = n => n == null || !isFinite(n) ? '—' : n.toFixed(1);
const fmt2   = n => n == null || !isFinite(n) ? '—' : n.toFixed(2);
const fmtSigned = n => { const v = n||0; return v>0 ? '+'+v : ''+v; };
const fmtPct = n => n == null || !isFinite(n) ? '—' : (n*100).toFixed(1) + '%';
const fmtK   = n => {
  if (n == null || !isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1) + 'k';
  return Math.round(n).toLocaleString();
};
const fmtTime = s => {
  if (!isFinite(s)) return '—';
  if (s < 60) return s.toFixed(1) + 's';
  const m = Math.floor(s/60), r = s - m*60;
  return `${m}m ${r.toFixed(0)}s`;
};
// Net gp earned (or spent, if negative) per point of combat xp. Small-magnitude
// signed number — the tradeoff metric for expensive spells/ammo: more xp/hr but
// a worse (often negative) gp/xp. '+' on profit so the sign reads at a glance.
const fmtGpXp = n => {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  const s = a >= 100 ? Math.round(n).toLocaleString() : a >= 10 ? n.toFixed(1) : n.toFixed(2);
  return (n > 0 ? '+' : '') + s;
};
const gpPerXp = r => (r && r.effectiveXpPerHour > 0) ? r.effectiveNetGpPerHour / r.effectiveXpPerHour : null;

// useNativeWheelRef — ref callback that attaches a native wheel listener
// (capture phase) so it fires BEFORE design-canvas's bubble-phase zoom
// listener. Stops propagation when the element can scroll.
const useNativeWheelRef = (el) => {
  if (!el) return;
  if (el.__simWheelAttached) return;
  el.__simWheelAttached = true;
  el.addEventListener('wheel', (e) => {
    const canScroll = el.scrollHeight > el.clientHeight + 2;
    if (canScroll) e.stopPropagation();
  });
};

// ---------- monster loot / clue filtering -------------------------------
// Deduped list of every drop name across all monsters (qty suffix stripped),
// plus synthetic clue-scroll entries, for the loot-filter autocomplete.
const _stripQty = s => String(s).replace(/\s*[×x]\s*\d+/g, '').replace(/['’]/g, '').trim();
function buildLootIndex(){
  const set = new Set();
  for (const m of E.MONSTERS){
    for (const d of (m.loot||[])){
      if (Array.isArray(d)){ for (const e of d) if (e && e.name) set.add(_stripQty(e.name)); }
      else if (d && d.name) set.add(_stripQty(d.name));
    }
  }
  return [...set].filter(Boolean).sort((a,b)=>a.localeCompare(b));
}
const LOOT_INDEX = buildLootIndex();
const CLUE_SUGGESTIONS = ['Clue scroll (easy)','Clue scroll (medium)','Clue scroll (hard)'];

// Suggestions for the loot search box (clue entries first, then drop names).
function lootSuggestions(query){
  const q = (query||'').toLowerCase().trim();
  if (!q) return [];
  const out = [];
  for (const c of CLUE_SUGGESTIONS) if (c.toLowerCase().includes(q)) out.push(c);
  for (const name of LOOT_INDEX){
    if (name.toLowerCase().includes(q)){ out.push(name); if (out.length >= 12) break; }
  }
  return out.slice(0, 12);
}

// Does monster m drop something matching the loot query? Handles clues (which
// aren't real loot entries) by reading m.clues; everything else is a substring
// match against drop names (including nested gem/herb sub-tables).
function matchLoot(m, query){
  const q = (query||'').toLowerCase().trim();
  if (!q) return true;
  if (q.includes('clue')){
    if (!m.clues || !m.clues.length) return false;
    const tier = q.includes('easy') ? 'easy' : q.includes('med') ? 'medium' : q.includes('hard') ? 'hard' : null;
    return tier ? m.clues.includes(tier) : true;
  }
  for (const d of (m.loot||[])){
    if (Array.isArray(d)){ for (const e of d) if (e && e.name && e.name.toLowerCase().includes(q)) return true; }
    else if (d && d.name && d.name.toLowerCase().includes(q)) return true;
  }
  return false;
}

// Loot search box with an autocomplete dropdown of matching drops / clues.
function LootSearchInput({ value, onChange, placeholder, style, useSelectClass=true }){
  const [open, setOpen] = useState(false);
  const sugg = useMemo(() => lootSuggestions(value), [value]);
  const baseInput = useSelectClass ? {} : {
    fontFamily:'var(--mono)', fontSize:11, padding:'4px 8px', borderRadius:3,
    border:'1px solid var(--border-2)', background:'var(--bg-2)', color:'var(--text-0)', outline:'none',
  };
  return (
    <div style={{position:'relative', ...style}}>
      <input
        type="text"
        className={useSelectClass ? 'select' : undefined}
        placeholder={placeholder}
        value={value}
        onChange={e=>{ onChange(e.target.value); setOpen(true); }}
        onFocus={()=>setOpen(true)}
        onBlur={()=>setTimeout(()=>setOpen(false), 160)}
        style={{width:'100%', boxSizing:'border-box', ...baseInput}}
      />
      {open && sugg.length > 0 && (
        <div className="scroll" style={{position:'absolute', top:'100%', left:0, right:0, zIndex:60,
          background:'var(--bg-1)', border:'1px solid var(--border-2)', borderRadius:3,
          marginTop:2, maxHeight:220, overflow:'auto', boxShadow:'0 8px 22px rgba(0,0,0,.45)'}}>
          {sugg.map(s => {
            const isClue = /^clue scroll/i.test(s);
            return (
              <button key={s} type="button"
                onMouseDown={e=>{ e.preventDefault(); onChange(s); setOpen(false); }}
                style={{display:'flex', justifyContent:'space-between', gap:8, width:'100%', textAlign:'left',
                  padding:'5px 9px', fontFamily:'var(--mono)', fontSize:11, cursor:'pointer', border:'none',
                  borderBottom:'1px solid var(--border-1)', background:'transparent',
                  color: isClue ? 'var(--teal)' : 'var(--text-1)'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--bg-2)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span>{s}</span>
                {isClue && <span style={{fontSize:9, color:'var(--text-3)'}}>clue</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- presets per combat type ------------------------------------

// Gear tiers for the Settings → declutter toggles. tierOf() maps an item KEY
// (weapon, ammo or armour) to a tier tag; hiding a tier drops its items from
// every picker (the currently-equipped item is always kept so you never lose a
// selection). Dragonhide is matched before metal so 'black d-hide' ≠ black metal.
const GEAR_TIER_DEFS = [
  { key:'bronze',      label:'Bronze' },
  { key:'iron',        label:'Iron' },
  { key:'steel',       label:'Steel' },
  { key:'black',       label:'Black' },
  { key:'mithril',     label:'Mithril' },
  { key:'adamant',     label:'Adamant' },
  { key:'green_dhide', label:'Green d-hide' },
  { key:'blue_dhide',  label:'Blue d-hide' },
  { key:'red_dhide',   label:'Red d-hide' },
  { key:'leather',     label:'Leather' },
  { key:'low_bows',    label:'Low-level bows', full:'Hide low-level bows (below magic shortbow)' },
  { key:'mage_1def',   label:'1 defence magic' },
];
// Explicit membership for tiers that aren't a simple key prefix.
const MAGE_1DEF_KEYS = new Set(['green_hat', 'zamorak_robe_bottom', 'wizard_robe_top']);
const LEATHER_KEYS = new Set(['coif', 'leather_body', 'hardleather_body', 'studded_body',
  'leather_chaps', 'studded_chaps', 'leather_vambraces']);
// Bows weaker than the magic shortbow (the best bow). Magic longbow is kept
// (same range attack as the shortbow), so only the strictly-lower bows hide.
const LOW_BOW_KEYS = new Set(['shortbow', 'oak_shortbow', 'willow_shortbow',
  'maple_shortbow', 'yew_shortbow', 'yew_longbow']);
function tierOf(key){
  if (!key) return null;
  const k = key.toLowerCase();
  if (LOW_BOW_KEYS.has(k)) return 'low_bows';
  if (LEATHER_KEYS.has(k)) return 'leather';
  if (MAGE_1DEF_KEYS.has(k)) return 'mage_1def';
  if (/dhide|d-hide|vamb/.test(k)){
    if (k.startsWith('green')) return 'green_dhide';
    if (k.startsWith('blue'))  return 'blue_dhide';
    if (k.startsWith('red'))   return 'red_dhide';
    if (k.startsWith('black')) return 'black_dhide';
    return null;                       // leather vambraces etc — always shown
  }
  if (k.startsWith('bronze')) return 'bronze';
  if (k.startsWith('iron'))   return 'iron';
  if (k.startsWith('steel'))  return 'steel';
  if (k.startsWith('black'))  return 'black';
  if (k.startsWith('mithril') || k.startsWith('mith_')) return 'mithril';
  if (k.startsWith('adamant') || k.startsWith('addy'))  return 'adamant';
  return null;
}
function tierHidden(key, hiddenTiers){
  const t = tierOf(key);
  return !!(t && hiddenTiers && hiddenTiers[t]);
}

// Generic searchable combobox. Behaves like a <select> when idle (shows the
// chosen option's label), but on focus turns into a type-to-filter search — far
// nicer than a giant native dropdown once a slot has many options. Mirrors the
// LootSearchInput interaction (focus opens, mousedown picks, blur closes).
// options: [{ key, label, hint?, color? }].
function SearchSelect({ options, value, onChange, disabled, placeholder='Type to search…' }){
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const cur = options.find(o => o.key === value);
  const curLabel = cur ? cur.label : (value || 'None');
  const q = query.trim().toLowerCase();
  const filtered = options.filter(o =>
    !q || o.label.toLowerCase().includes(q) || o.key.toLowerCase().includes(q));

  return (
    <div style={{position:'relative'}}>
      <input
        type="text"
        className="select"
        value={open ? query : curLabel}
        placeholder={placeholder}
        disabled={disabled}
        onChange={e=>{ setQuery(e.target.value); setOpen(true); }}
        onFocus={e=>{ setOpen(true); setQuery(''); e.target.select(); }}
        // Selecting an option keeps focus on the input (mousedown preventDefault),
        // so a second click fires no onFocus — reopen the list on click too.
        onClick={e=>{ if (!open){ setOpen(true); setQuery(''); e.target.select(); } }}
        onBlur={()=>setTimeout(()=>{ setOpen(false); setQuery(''); }, 160)}
        style={{width:'100%', boxSizing:'border-box', cursor: open?'text':'pointer',
          opacity: disabled?0.5:1}}
      />
      {open && (
        <div className="scroll-vis" style={{position:'absolute', top:'100%', left:0, right:0, zIndex:60,
          background:'var(--bg-1)', border:'1px solid var(--border-2)', borderRadius:3,
          marginTop:2, maxHeight:230, overflowY:'auto', boxShadow:'0 8px 22px rgba(0,0,0,.45)'}}>
          {filtered.length === 0 && (
            <div style={{padding:'6px 9px', fontFamily:'var(--mono)', fontSize:11, color:'var(--text-3)'}}>no match</div>
          )}
          {filtered.map(o => {
            const active = o.key === value;
            return (
              <button key={o.key} type="button"
                onMouseDown={e=>{ e.preventDefault(); onChange(o.key); setOpen(false); setQuery(''); }}
                style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10, width:'100%',
                  textAlign:'left', padding:'5px 9px', fontFamily:'var(--mono)', fontSize:11, cursor:'pointer',
                  border:'none', borderBottom:'1px solid var(--border-1)',
                  background: active ? 'color-mix(in oklab, var(--teal) 16%, transparent)' : 'transparent',
                  color: active ? 'var(--teal)' : (o.color || 'var(--text-1)')}}
                onMouseEnter={e=>{ if(!active) e.currentTarget.style.background='var(--bg-2)'; }}
                onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent'; }}>
                <span>{o.label}</span>
                {o.hint && <span style={{fontSize:10, color:'var(--text-3)', whiteSpace:'nowrap'}}>{o.hint}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Armour-slot picker — builds tier-filtered options (name + bonus hint) and
// renders them through the shared SearchSelect.
function GearSlotPicker({ items, value, onChange, ct, disabled, hiddenTiers }){
  const bonusBits = (v) => {
    const bits = [];
    if (v.str) bits.push(`+${v.str} str`);
    if (v.rngStr && ct==='ranged') bits.push(`+${v.rngStr} rstr`);
    if (v.slashAtt && ct==='melee') bits.push(`+${v.slashAtt} slash`);
    if (v.rngAtt && ct==='ranged') bits.push(`+${v.rngAtt} rng`);
    if (v.magAtt && ct==='magic') bits.push(`+${v.magAtt} mag`);
    if (v.magDmg && ct==='magic') bits.push(`+${v.magDmg}% mdmg`);
    if (v.prayer) bits.push(`+${v.prayer} pray`);
    return bits.join(' · ');
  };
  const options = Object.entries(items)
    .filter(([k]) => k==='none' || k===value || !tierHidden(k, hiddenTiers))
    .map(([k, v]) => ({
      key: k,
      label: (v.name || k) + (v.approx && k!=='none' ? ' ~' : ''),
      hint: k!=='none' ? (bonusBits(v) || v.note || '') : '',
    }));
  return <SearchSelect options={options} value={value} onChange={onChange}
    disabled={disabled} placeholder="Type to search gear…" />;
}

function makeDefaults(combatType = 'melee', monsterId){
  const monster = E.MONSTERS.find(m => m.id === (monsterId || 'hill_giant')) || E.MONSTERS[0];
  const base = {
    combatType,
    attack:60, strength:70, defence:50, ranged:70, magic:55, hp:80, prayer:60,
    monster,
    overheadSec: null,   // per-monster (overheadByMonster); null → engine default
    foodPerKill: 0, foodPrice: 0,
    potionPerKill: 0, potionPrice: 0,
    ammoPerKill: 0, ammoPrice: 0,
    // Ring of wealth is best-in-slot: a free gem-table upgrade with no combat
    // downside, so it's the default equipped ring. Ring of recoil is situational
    // (faster kills with no XP, shatters) — pick it only when it actually helps.
    ringOfWealth: true,
    gear: { ring: 'ring_of_wealth' },
    specWeapon: 'none',   // 2nd weapon brought only to special-attack on cooldown
    sustained: false,
    repotThreshold: null,   // null = auto (peak - 10)
    // Per-monster custom setups: monsterId → snapshot of the loadout fields.
    // defaultSetup is the baseline loadout used for monsters WITHOUT a custom
    // setup (kept in sync while you edit on a non-custom monster).
    monsterSetups: {},
    // Per-monster alching decision (monsterId → bool). Alching is its own
    // per-target choice, NOT a global toggle — some monsters drop alchable gear
    // worth carrying runes for, most don't.
    alchByMonster: {},
    // Per-monster kill overhead override (monsterId → seconds). null/absent →
    // engine default (scales 2–4s by loot/roam). Editable in the Loot tab.
    overheadByMonster: {},
    defaultSetup: null,
    editingDefault: false,
    duelSetups: [],
    // ---- banking-trip / inventory model ----
    // bankSeconds & foodCount are null = auto (per-monster preset / derived
    // from incoming damage vs regen). Set a value to override.
    trip: {
      bankSeconds: null,
      foodKey: 'lobster', foodCount: null,
      potionSets: 1, potionDoses: 4, singleDose: false, dbaRestore: true, alching: false, runeSlots: 2,
      teleport: true, protect: 'none', safespot: null, recoverAmmo: true, antifire: false, antipoison: false,
      foodPerKillOverride: null, recoilRings: 1,
      // scarce-spot / AFK throttle: enabled=false ⇒ monsters never run out
      // (legacy). targets = how many you fight at once; respawnSec = null → use
      // the monster's respawn. Cannon reach is the per-monster cannon's targets.
      scarce: { enabled: false, targets: 2, respawnSec: null },
    },
  };
  if (combatType === 'melee'){
    return {...base, style:'aggressive', prayers:['none'], boosts:['none'],
      accBonus:69, dmgBonus:71, attackSpeed:5, weapon:'dragon_longsword', weaponName:'Dragon longsword'};
  }
  if (combatType === 'ranged'){
    return {...base, style:'rapid', prayers:['none'], boosts:['none'],
      accBonus:69, dmgBonus:0, attackSpeed:4, weapon:'magic_shortbow', weaponName:'Magic shortbow',
      ammo:'rune_arrow', ammoRangeBonus:49,
      ammoPerKill:0, ammoPrice:0};
  }
  // magic
  return {...base, style:'accurate', prayers:['none'], boosts:['none'],
    accBonus:0, dmgBonus:0, attackSpeed:5, weapon:'staff_of_fire', weaponName:'Staff of fire',
    spell:'fire_blast', spellBase:E.SPELLS.fire_blast.base, charge:true,
    potionPerKill:0, potionPrice:0};
}

// =======================================================================
// PRAYER / BOOST ROW SPECS
// =======================================================================
// Rev 274: only melee prayers (att/str). ALL types get defence prayers.
// `abbr` is prefixed into each button so the controls read e.g. "att 5%".
// Each tier: [key, shortLabel, fullLabel]. The sidebar uses fullLabel; the
// gear menu uses 'abbr + shortLabel' (e.g. "attack 5%").
const PRAYER_ROWS_MELEE = [
  { label:'Attack',   abbr:'attack',   tiers:[['clarity','5%','Clarity of Thought'],['reflexes','10%','Improved Reflexes'],['incredible','15%','Incredible Reflexes']] },
  { label:'Strength', abbr:'strength', tiers:[['burst','5%','Burst of Strength'],['superhuman','10%','Superhuman Strength'],['ultimate','15%','Ultimate Strength']] },
  { label:'Defence',  abbr:'defence',  tiers:[['thick_skin','5%','Thick Skin'],['rock_skin','10%','Rock Skin'],['steel_skin','15%','Steel Skin']] },
];
const PRAYER_ROWS_DEF_ONLY = [
  { label:'Defence',  abbr:'defence',  tiers:[['thick_skin','5%','Thick Skin'],['rock_skin','10%','Rock Skin'],['steel_skin','15%','Steel Skin']] },
];
// No ranged or magic stat-boosting prayers in rev 274.
const BOOST_ROWS_MELEE = [
  { label:'Attack',   abbr:'',  tiers:[['attack','N','Attack potion'],['super_att','S','Super attack']] },
  { label:'Strength', abbr:'',  tiers:[['strength','N','Strength potion'],['super_str','S','Super strength'],['dba_spec','DBA','DBA spec']] },
  { label:'Defence',  abbr:'',  tiers:[['defence','N','Defence potion'],['super_def','S','Super defence']] },
];
const BOOST_ROWS_RANGED = [
  { label:'Ranged',   abbr:'',  tiers:[['ranging','Ranging','Ranging potion']] },
];
const BOOST_ROWS_MAGIC = [
  { label:'Magic',    abbr:'',  tiers:[['magic','Magic','Magic potion']] },
  { label:'Gauntlets',abbr:'',  tiers:[['chaos_gauntlets','Chaos','Chaos gauntlets (+3 bolt)']] },
];

// Labelled tier-row control. Each row = category label + 2-3 mutually-exclusive
// tier buttons. `variant` = 'sidebar' (compact, row label left) or 'gear' (full names).
function CategoryRows({ rows, selected, onChange, variant='gear' }){
  const sel = new Set(selected.filter(x => x !== 'none'));

  const pickTier = (rowKeys, k) => {
    const next = new Set(sel);
    const wasOn = next.has(k);
    rowKeys.forEach(rk => next.delete(rk));
    if (!wasOn) next.add(k);
    onChange(next.size ? [...next] : ['none']);
  };

  const toggleExtra = (k) => {
    const next = new Set(sel);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange(next.size ? [...next] : ['none']);
  };

  // sidebar: row label on the left, full item names on the buttons.
  // gear: compact buttons reading "abbr short" (e.g. "attack 5%").
  if (variant === 'sidebar'){
    return (
      <div style={{ display:'grid', gap:6 }}>
        {rows.map(row => {
          const tierKeys = row.tiers.map(t => t[0]);
          return (
            <div key={row.label} style={{ display:'grid', gridTemplateColumns:'52px 1fr', alignItems:'center', gap:6 }}>
              <span className="label-cap" style={{textAlign:'right'}}>{row.label}</span>
              <div style={{ display:'flex', gap:4 }}>
                {row.tiers.map(([k, shortLbl]) => {
                  const on = sel.has(k);
                  const isDba = k === 'dba_spec';
                  const c = isDba ? 'red' : 'teal';
                  return (
                    <button key={k} onClick={() => pickTier(tierKeys, k)} title={row.tiers.find(t=>t[0]===k)?.[2]||''} style={{
                      flex:'1 1 0', minWidth:34, fontFamily:'var(--mono)', fontSize:11,
                      padding:'5px 4px', borderRadius:3, cursor:'pointer', whiteSpace:'nowrap',
                      border:`1px solid ${on ? `color-mix(in oklab, var(--${c}) 50%, var(--border-2))` : 'var(--border-2)'}`,
                      background: on ? `color-mix(in oklab, var(--${c}) 18%, var(--bg-2))` : 'var(--bg-2)',
                      color: on ? `var(--${c})` : 'var(--text-2)', transition:'all .1s',
                    }}>{shortLbl}</button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // gear variant — full names, one row per category
  return (
    <div style={{ display:'grid', gap:6 }}>
      {rows.map(row => {
        const tierKeys = row.tiers.map(t => t[0]);
        const pre = row.abbr ? row.abbr + ' ' : '';
        return (
          <div key={row.label}>
            <div className="label-cap" style={{marginBottom:3}}>{row.label}</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {row.tiers.map(([k, shortLbl, fullLbl]) => {
                const on = sel.has(k);
                const isDba = k === 'dba_spec';
                const c = isDba ? 'red' : 'teal';
                const txt = pre ? pre + shortLbl : (fullLbl || shortLbl);
                return (
                  <button key={k} onClick={() => pickTier(tierKeys, k)} style={{
                    flex:'1 1 0', minWidth:90, fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.02em',
                    padding:'5px 8px', borderRadius:3, cursor:'pointer', whiteSpace:'nowrap',
                    border:`1px solid ${on ? `color-mix(in oklab, var(--${c}) 50%, var(--border-2))` : 'var(--border-2)'}`,
                    background: on ? `color-mix(in oklab, var(--${c}) 18%, var(--bg-2))` : 'var(--bg-2)',
                    color: on ? `var(--${c})` : 'var(--text-2)', transition:'all .1s',
                  }}>{txt}</button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Shared chrome bar
function Chrome({ crumbs, status='live', extras=[] }){
  return (
    <div className="sim-chrome">
      <span className="dot" />
      <div className="crumb">
        {crumbs.map((c,i) => (
          <span key={i}>{i>0 && <span className="sep">/</span>}{i === crumbs.length-1 ? <b>{c}</b> : c}</span>
        ))}
      </div>
      <span className="spacer" />
      {extras.map((e,i)=><span key={i} className="pill">{e}</span>)}
      <span className="pill ok">● {status}</span>
      <span className="pill">2004scape v274</span>
      <span className="pill">tick · 0.6s</span>
    </div>
  );
}

// Hiscores lookup — fetches player stats from the local server proxy.
// Only works when running via run_sim.py (http://localhost:8000).
function HiscoresLookup({ set }) {
  const isLocal = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [name, setName] = React.useState(() => { try { return localStorage.getItem('sim_hiscore_player') || ''; } catch { return ''; } });
  const [status, setStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  if (!isLocal) return (
    <div style={{padding:'7px 12px', borderBottom:'1px solid var(--border-1)',
      fontFamily:'var(--mono)', fontSize:10, color:'var(--text-4)', lineHeight:1.5}}>
      hiscores lookup — run via <span style={{color:'var(--text-3)'}}>python run_sim.py</span> to enable
    </div>
  );

  const lookup = async () => {
    const n = name.trim();
    if (!n) return;
    try { localStorage.setItem('sim_hiscore_player', n); } catch {}
    setLoading(true); setStatus(null);
    try {
      const res = await fetch(`/api/hiscores?player=${encodeURIComponent(n)}`);
      // Read as text first so a non-JSON body (HTML error page, empty) gives
      // a clear message instead of a bare JSON.parse exception.
      const text = await res.text();
      if (!text.trim()) {
        setStatus({ ok: false, msg: 'server returned empty response — check run_sim.py console' });
        setLoading(false); return;
      }
      let data;
      try { data = JSON.parse(text); }
      catch { setStatus({ ok: false, msg: 'server returned non-JSON — is run_sim.py up to date?' }); setLoading(false); return; }
      if (!res.ok || data.error) {
        setStatus({ ok: false, msg: data.error || `HTTP ${res.status}` });
      } else {
        const s = data.skills || {};
        const clamp = v => Math.min(99, Math.max(1, typeof v === 'number' ? v : parseInt(v) || 1));
        if (s.attack)    set('attack',    clamp(s.attack));
        if (s.strength)  set('strength',  clamp(s.strength));
        if (s.defence)   set('defence',   clamp(s.defence));
        if (s.hitpoints) set('hp',        clamp(s.hitpoints));
        if (s.prayer)    set('prayer',    clamp(s.prayer));
        if (s.ranged)    set('ranged',    clamp(s.ranged));
        if (s.magic)     set('magic',     clamp(s.magic));
        const filled = ['attack','strength','defence','hitpoints','prayer','ranged','magic']
          .filter(k => s[k]).length;
        setStatus({ ok: true, msg: `✓ ${data.player} — ${filled} stats loaded` });
      }
    } catch (e) {
      const msg = (e.message||'').toLowerCase();
      if (msg.includes('fetch') || msg.includes('networkerror') || msg.includes('failed')) {
        setStatus({ ok: false, msg: 'server not reachable — run via run_sim.py' });
      } else {
        setStatus({ ok: false, msg: e.message || 'unknown error' });
      }
    }
    setLoading(false);
  };

  return (
    <div style={{padding:'8px 12px 4px', borderBottom:'1px solid var(--border-1)'}}>
      <div style={{display:'flex', gap:5, alignItems:'center'}}>
        <input
          type="text"
          className="input"
          placeholder="RSN — look up hiscores"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          style={{flex:1, fontSize:11, minWidth:0}}
        />
        <button
          className="btn"
          onClick={lookup}
          disabled={loading || !name.trim()}
          style={{flexShrink:0, fontSize:11, padding:'3px 10px'}}>
          {loading ? '…' : 'Load'}
        </button>
      </div>
      {status && (
        <div style={{fontFamily:'var(--mono)', fontSize:10, marginTop:4,
          color: status.ok ? 'var(--teal)' : 'var(--amber)'}}>{ status.msg }</div>
      )}
    </div>
  );
}

// =======================================================================
// =======================================================================
function PlayerSidebar({input, set, setMonster, result}){
  const ct = input.combatType;
  const prayers = useMemo(() => E.availablePrayers(ct), [ct]);
  const potions = useMemo(() => E.availablePotions(ct), [ct]);
  const styles = E.STYLES[ct];

  // when combat type changes, swap to valid style/prayer/potion if needed
  useEffect(()=>{
    // Validate the selected stance/style. For melee the valid set depends on
    // the equipped weapon's stance table (e.g. a halberd has no 'accurate');
    // fall back to the weapon's first stance. For ranged/magic use the fixed
    // style set for the combat type.
    if (ct === 'melee'){
      const ids = E.weaponStances(input.weapon).map(s => s.id);
      if (!ids.includes(input.style)) set('style', ids[0]);
    } else if (!styles[input.style]){
      set('style', Object.keys(styles)[0]);
    }
    // drop any selected prayers/boosts not valid for this combat type
    const validPrayers = (input.prayers||[]).filter(k => prayers[k]);
    if (validPrayers.length !== (input.prayers||[]).length) set('prayers', validPrayers.length?validPrayers:['none']);
    const validBoosts = (input.boosts||[]).filter(k => potions[k]);
    if (validBoosts.length !== (input.boosts||[]).length) set('boosts', validBoosts.length?validBoosts:['none']);
  // eslint-disable-next-line
  }, [ct, input.weapon]);

  return (
    <aside ref={useNativeWheelRef} style={{borderRight:'1px solid var(--border-1)', background:'var(--bg-1)', overflow:'auto', overscrollBehavior:'contain'}} className="scroll">
      {/* combat type segmented */}
      <div className="h-strip"><span className="title">Combat type</span></div>
      <div style={{padding:'10px 12px'}}>
        <div className="seg">
          {Object.entries(E.COMBAT_TYPES).map(([k,v])=>(
            <button key={k} className={ct===k?'active':''} onClick={()=>set('combatType',k)}>{v.label}</button>
          ))}
        </div>
      </div>

      <div className="h-strip"><span className="title">Levels</span></div>
      <HiscoresLookup set={set} />
      <div style={{padding:'10px 12px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
        {ct==='melee' && (<>
          <NumField label="Attack"   v={input.attack}   onChange={v=>set('attack',v)} />
          <NumField label="Strength" v={input.strength} onChange={v=>set('strength',v)} />
        </>)}
        {ct==='ranged' && (
          <NumField label="Ranged" v={input.ranged} onChange={v=>set('ranged',v)} />
        )}
        {ct==='magic' && (
          <NumField label="Magic" v={input.magic} onChange={v=>set('magic',v)} />
        )}
        <NumField label="Defence" v={input.defence} onChange={v=>set('defence',v)} />
        <NumField label="HP"      v={input.hp}      onChange={v=>set('hp',v)} />
        <NumField label="Prayer"  v={input.prayer}  onChange={v=>set('prayer',v)} />
      </div>

      <div className="h-strip"><span className="title">Stance</span>
        {ct==='melee' && <span className="meta">attack type per weapon</span>}
      </div>
      <div style={{padding:'10px 12px'}}>
        {ct==='melee' ? (
          <div style={{display:'grid', gap:4}}>
            {E.weaponStances(input.weapon).map(st => {
              const base = styles[st.style];
              const on = input.style===st.id;
              return (
                <button key={st.id} onClick={()=>set('style',st.id)} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'6px 10px', borderRadius:3, cursor:'pointer', textAlign:'left',
                  border:`1px solid ${on?'color-mix(in oklab, var(--teal) 50%, var(--border-2))':'var(--border-2)'}`,
                  background: on?'color-mix(in oklab, var(--teal) 16%, var(--bg-2))':'var(--bg-2)',
                  fontFamily:'var(--mono)', fontSize:11,
                  color: on?'var(--teal)':'var(--text-2)', transition:'all .1s',
                }}>
                  <span>{st.name} <span style={{color: on?'var(--teal)':'var(--text-3)', opacity:.8}}>· {base?.label || st.style}</span></span>
                  <span style={{fontSize:10, color: on?'var(--teal)':'var(--text-3)', textTransform:'uppercase', letterSpacing:'.05em'}}>{st.type}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="seg">
            {Object.entries(styles).map(([k,v]) => (
              <button key={k} className={input.style===k?'active':''} onClick={()=>set('style',k)}>{v.label.split(' ')[0]}</button>
            ))}
          </div>
        )}
      </div>

      {result && (
        <>
          <div className="h-strip">
            <span className="title">Trip rates</span>
            <span className="meta">after banking</span>
          </div>
          <div style={{padding:'10px 12px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <div style={{padding:'8px 10px', background:'var(--bg-1)', border:'1px solid var(--border-2)', borderRadius:3}}>
              <div style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:2}}>XP / hr</div>
              <div style={{fontFamily:'var(--mono)', fontSize:16, color:'var(--amber)'}}>{fmtK(result.effectiveXpPerHour)}</div>
            </div>
            <div style={{padding:'8px 10px', background:'var(--bg-1)', border:'1px solid var(--border-2)', borderRadius:3}}>
              <div style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:2}}>Net GP / hr</div>
              <div style={{fontFamily:'var(--mono)', fontSize:16, color:'var(--gold)'}}>{fmtK(result.effectiveNetGpPerHour)}</div>
            </div>
          </div>
          {Array.isArray(result.skillXpBreakdown) && result.skillXpBreakdown.length > 0 && (
            <div style={{padding:'0 12px 12px'}}>
              <div style={{display:'grid', gap:1, background:'var(--bg-1)', border:'1px solid var(--border-2)', borderRadius:3, overflow:'hidden'}}>
                <div style={{display:'flex', justifyContent:'space-between', padding:'5px 10px', borderBottom:'1px solid var(--border-2)'}}>
                  <span style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px'}}>XP / hr by skill</span>
                  <span style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px'}}>effective</span>
                </div>
                {result.skillXpBreakdown.map(s => (
                  <div key={s.key} style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'4px 10px'}}>
                    <span style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--text-2)'}}>{s.name}</span>
                    <span style={{fontFamily:'var(--mono)', fontSize:12, color: s.key==='prayer' ? 'var(--teal)' : s.key==='hp' ? 'var(--text-1)' : s.key==='alch' ? 'var(--blue)' : 'var(--amber)'}}>{fmtK(s.xpPerHour)}</span>
                  </div>
                ))}
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'5px 10px', borderTop:'1px solid var(--border-2)', background:'var(--bg-2)'}}>
                  <span style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--text-1)', textTransform:'uppercase', letterSpacing:'.5px'}}>Total</span>
                  <span style={{fontFamily:'var(--mono)', fontSize:13, color:'var(--text-0)'}}>{fmtK(result.totalXpPerHour)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

    </aside>
  );
}

// Equipment overview — player loadout summary (weapon, bonuses, prayers,
// potions). Lives in the right panel; computes ct/labels internally so it can
// be dropped anywhere that has `input`.
const COMBAT_LABELS = {
  melee:  { accB:'Att bonus', dmgB:'Str bonus' },
  ranged: { accB:'Rng bonus', dmgB:'Rng str' },
  magic:  { accB:'Mag att',   dmgB:'Mag dmg %' },
};
function EquipmentOverview({input}){
  const ct = input.combatType;
  const labels = COMBAT_LABELS[ct] || COMBAT_LABELS.melee;
  return (
    <>
      <div className="h-strip">
        <span className="title">Equipment overview</span>
        <span className="meta">edit in {ct} tab</span>
      </div>
      <div style={{padding:'10px 12px', display:'grid', gap:6}}>
        <OverviewRow k="Weapon" v={input.weaponName || 'custom'} />
        {ct==='ranged' && <OverviewRow k="Ammo" v={input.ammo && E.ARROWS[input.ammo] ? E.ARROWS[input.ammo].name : 'custom'} />}
        {ct==='magic' && <OverviewRow k="Spell" v={E.SPELLS[input.spell]?.name || '—'} />}
        <OverviewRow k={labels.accB} v={`+${input.accBonus}`} mono />
        <OverviewRow k={labels.dmgB} v={ct==='magic' ? `${input.dmgBonus}%` : `+${input.dmgBonus}`} mono />
        <OverviewRow k="Speed" v={`${input.attackSpeed}t · ${(input.attackSpeed*0.6).toFixed(1)}s`} mono />
        {(E.WEAPONS[input.weapon]?.poisonSeverity > 0) && (
          <OverviewRow k="Poison" v={`${Math.floor((E.WEAPONS[input.weapon].poisonSeverity+4)/5)} dmg / 18s`} accent="green" />
        )}
        <div className="hr" style={{margin:'2px 0'}} />
        <OverviewRow k="Prayers" v={prayerSummary(input)} />
        <OverviewRow k="Potions" v={boostSummary(input)} />
        {input.sustained && <OverviewRow k="Sustained" v="avg over session" accent="amber" />}
        {input.ringOfWealth && <OverviewRow k="Ring" v="Ring of wealth" accent="teal" />}
        {input.gear?.ring === 'ring_of_recoil' && <OverviewRow k="Ring" v={`Recoil ×${input.trip?.recoilRings ?? 1}`} accent="teal" />}
      </div>
    </>
  );
}

// compact label:value row for the sidebar equipment overview
function OverviewRow({k, v, mono, accent}){
  return (
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8}}>
      <span style={{fontFamily:'var(--mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--text-3)', flexShrink:0}}>{k}</span>
      <span style={{fontFamily: mono?'var(--mono)':'var(--sans)', fontSize:11,
        color: accent?`var(--${accent})`:'var(--text-1)', textAlign:'right'}}>{v}</span>
    </div>
  );
}
function prayerSummary(input){
  const keys = (input.prayers||[]).filter(k=>k!=='none');
  if (!keys.length) return 'none';
  return keys.map(k => E.PRAYERS[k]?.label.split(' (')[0] || k).join(', ');
}
function boostSummary(input){
  const keys = (input.boosts||[]).filter(k=>k!=='none');
  if (!keys.length) return 'none';
  return keys.map(k => E.POTIONS[k]?.label || k).join(', ');
}

// =======================================================================
// EQUIPMENT PANE — one per combat type (melee / ranged / magic).
// Holds weapon/ammo/spell, amulet, prayers, potions, sustained mode,
// DBA spec, and Ring of Wealth. Selecting the tab forces combatType.
// =======================================================================
function EquipmentPane({type, input, set, hiddenTiers = {}}){
  const ct = type;
  const prayers = useMemo(() => E.availablePrayers(ct), [ct]);
  const potions = useMemo(() => E.availablePotions(ct), [ct]);
  const EQ = window.Equipment;
  const AMU = EQ?.AMULETS || { none:{name:'None'} };

  const labels = {
    melee:  { accB:'Slash att', dmgB:'Str bonus', bSuffix:'slash' },
    ranged: { accB:'Range att', dmgB:'Range str', bSuffix:'arrow' },
    magic:  { accB:'Magic att', dmgB:'Magic dmg', bSuffix:'%' },
  }[ct];

  // All worn slots (weapon/ammo/spell handled separately above).
  const ARMOUR_SLOTS = (EQ?.SLOT_DEFS || []);

  // Recompute acc/dmg/speed from the FULL loadout (weapon + ammo + armour).
  const recompute = (gear, weaponKey, ammoKey) => {
    if (!EQ){ return; }
    const loadout = { ...(gear||{}), weapon: weaponKey, ammo: ammoKey };
    const r = EQ.loadoutToInput(loadout, ct);
    set('accBonus', r.accBonus);
    if (ct !== 'magic') set('dmgBonus', r.dmgBonus);
    if (r.attackSpeed) set('attackSpeed', r.attackSpeed);
  };

  const gear = input.gear || {};
  const setSlot = (slotKey, itemKey) => {
    const nextGear = { ...gear, [slotKey]: itemKey };
    set('gear', nextGear);
    recompute(nextGear, input.weapon, input.ammo);
    // Equipping the ring of wealth auto-enables its gem-table effect (and
    // removing it disables it) so the loot EV matches what's worn.
    if (slotKey === 'ring') set('ringOfWealth', itemKey === 'ring_of_wealth');
    // Chaos gauntlets give +3 bolt max hit (magic only) — auto-toggle the
    // matching boost so it tracks what's actually worn in the gloves slot.
    if (slotKey === 'gloves' && ct === 'magic'){
      const cur = (input.boosts || []).filter(b => b !== 'chaos_gauntlets');
      set('boosts', itemKey === 'chaos_gauntlets' ? [...cur, 'chaos_gauntlets'] : cur);
    }
  };

  // ---- Best in slot ----------------------------------------------------
  // Fill every worn slot with the most OFFENSIVE item for this combat type,
  // judged by lowest time-to-kill on the current target (so accuracy vs damage
  // is traded off correctly by the real DPS math, not a fixed weight). Keeps the
  // chosen weapon / ammo / spell. Pure offence — a defensive pick like the
  // anti-dragon shield gets dropped, so re-add it by hand if you need it.
  const bestInSlot = () => {
    if (!EQ || !E) return;
    const ttkOf = (g) => {
      const r = EQ.loadoutToInput({ ...g, weapon: input.weapon, ammo: input.ammo }, ct);
      try {
        return E.simulate({
          ...input, gear: g,
          accBonus: r.accBonus,
          dmgBonus: ct === 'magic' ? input.dmgBonus : r.dmgBonus,
          attackSpeed: r.attackSpeed ?? input.attackSpeed,
        }).ttkSec;
      } catch { return Infinity; }
    };
    // Strength-bonus key that matters for THIS combat type — used as the
    // tie-break below.
    const STR_KEY = ct === 'magic' ? 'magDmg' : ct === 'ranged' ? 'rngStr' : 'str';
    const strOf = (items, k) => items[k]?.[STR_KEY] || 0;
    let g = { ...gear };
    // Offence is additive across slots, so a single pass finds the optimum; a
    // second pass is cheap insurance against any tie/interaction.
    for (let pass = 0; pass < 2; pass++){
      for (const slot of ARMOUR_SLOTS){
        // The ring slot carries no offensive stats; ring of recoil only "wins"
        // on TTK because its reflect damage shortens the kill — but it's
        // situational (no XP, shatters, costs gp, members-only). True best-in-slot
        // is the ring of wealth (free gem-table upgrade, no downside). Force it;
        // the user swaps to recoil by hand when it actually helps.
        if (slot.key === 'ring'){ g = { ...g, ring: 'ring_of_wealth' }; continue; }
        // Score every candidate by TTK, then choose: among items within a
        // small relative tolerance of the best TTK (a DPS wash), prefer the one
        // carrying the most strength bonus — it scales better with levels and
        // buffs, so e.g. the berserker helm (+3 str) wins over the warrior helm
        // (+5 slash accuracy) when they're effectively tied on the target.
        const cands = Object.keys(slot.items).map(k => ({ k, t: ttkOf({ ...g, [slot.key]: k }) }));
        const minT = Math.min(...cands.map(c => c.t));
        const tol = isFinite(minT) ? minT * 0.01 + 1e-6 : Infinity;
        cands.sort((a, b) => {
          const aNear = a.t <= minT + tol, bNear = b.t <= minT + tol;
          if (aNear && bNear){
            const sd = strOf(slot.items, b.k) - strOf(slot.items, a.k);
            if (sd) return sd;            // more strength wins the wash
            return a.t - b.t;             // else the faster kill
          }
          return a.t - b.t;               // clear winner by TTK
        });
        g = { ...g, [slot.key]: cands[0].k };
      }
    }
    set('gear', g);
    set('ringOfWealth', g.ring === 'ring_of_wealth');
    recompute(g, input.weapon, input.ammo);
  };

  const onWeapon = (wk) => {
    if (wk==='custom'){ set('weapon','custom'); return; }
    const wp = E.WEAPONS[wk];
    set('weapon', wk); set('weaponName', wp.name);
    const ng = { ...gear }; recompute(ng, wk, input.ammo);
  };
  const onAmmo = (ak) => {
    if (ak==='custom'){ set('ammo','custom'); set('ammoRangeBonus',0); return; }
    const a=E.ARROWS[ak]; set('ammo',ak); set('ammoRangeBonus',a.rangeBonus);
    recompute(gear, input.weapon, ak);
  };

  // Ranged sub-mode: 'bow' uses arrows from the Ammo slot; 'thrown' weapons
  // occupy the mainhand and are their own ammo (no bow possible).
  const curSub = E.WEAPONS[input.weapon]?.sub;
  const rangedMode = curSub === 'thrown' ? 'thrown' : 'bow';
  const setRangedMode = (mode) => {
    if (mode === rangedMode) return;
    // pick the first weapon of the chosen sub-mode
    const first = Object.entries(E.WEAPONS).find(([,v])=>v.type==='ranged' && v.sub===mode);
    if (!first) return;
    const [wk, wp] = first;
    set('weapon', wk); set('weaponName', wp.name);
    if (mode === 'thrown'){
      // thrown weapon carries its own ammo; clear the arrow slot
      set('ammo','none'); set('ammoRangeBonus',0);
      recompute(gear, wk, 'none');
    } else {
      // default a sensible arrow if none/throwing ammo was selected
      const am = (E.ARROWS[input.ammo]?.kind==='arrow') ? input.ammo : 'rune_arrow';
      const a = E.ARROWS[am]; set('ammo',am); set('ammoRangeBonus',a?a.rangeBonus:0);
      recompute(gear, wk, am);
    }
  };

  // Totals for the live bonus summary strip
  const totals = EQ ? EQ.sumBonuses({ ...gear, weapon:input.weapon, ammo:input.ammo }) : null;

  return (
    <div ref={useNativeWheelRef} className="scroll" style={{flex:1, overflow:'auto', minHeight:0}}>
      <div className="h-strip">
        <span className="title">{ct} loadout</span>
        <span className="meta">{input.weaponName || 'custom'} · +{input.accBonus}/+{ct==='magic'?input.dmgBonus+'%':input.dmgBonus} · {input.attackSpeed}t</span>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:0}}>
        {/* ---- LEFT: gear ---- */}
        <div style={{borderRight:'1px solid var(--border-1)', padding:'14px', display:'grid', gap:14, alignContent:'start'}}>
          <div>
            <div className="label-cap" style={{marginBottom:6}}>{ct==='ranged'?'Ranged weapon':ct==='magic'?'Staff':'Weapon'}</div>
            {ct==='ranged' && (
              <div style={{display:'flex', gap:6, marginBottom:8}}>
                {['bow','thrown'].map(m => (
                  <button key={m} type="button" onClick={()=>setRangedMode(m)}
                    style={{flex:1, padding:'6px 0', fontFamily:'var(--mono)', fontSize:11, textTransform:'uppercase', letterSpacing:'.5px',
                      cursor:'pointer', borderRadius:3, border:'1px solid '+(rangedMode===m?'var(--teal)':'var(--border-2)'),
                      background: rangedMode===m?'color-mix(in srgb, var(--teal) 18%, transparent)':'var(--bg-2)',
                      color: rangedMode===m?'var(--teal)':'var(--text-3)'}}>
                    {m==='bow'?'Bow + arrows':'Thrown'}
                  </button>
                ))}
              </div>
            )}
            <SearchSelect
              value={input.weapon || 'custom'}
              onChange={onWeapon}
              placeholder="Type to search weapons…"
              options={[
                ...Object.entries(E.WEAPONS)
                  .filter(([k,v])=>v.type===ct && (ct!=='ranged' || (v.sub||'bow')===rangedMode)
                    && (k===input.weapon || !tierHidden(k, hiddenTiers)))
                  .map(([k,v])=>({ key:k, label:v.name, hint:`+${v.accBonus}/+${v.dmgBonus} · ${v.speed}t` })),
                { key:'custom', label:'Custom…' },
              ]} />
          </div>

          {ct==='ranged' && rangedMode==='bow' && (
            <div>
              <div className="label-cap" style={{marginBottom:6}}>Arrows</div>
              <SearchSelect
                value={input.ammo || 'custom'}
                onChange={onAmmo}
                placeholder="Type to search arrows…"
                options={[
                  ...Object.entries(E.ARROWS)
                    .filter(([k,v])=>v.kind==='arrow' && (k===input.ammo || !tierHidden(k, hiddenTiers)))
                    .map(([k,v])=>({ key:k, label:v.name, hint:`+${v.rangeBonus} rng` })),
                  { key:'custom', label:'Custom…' },
                ]} />
            </div>
          )}
          {ct==='ranged' && rangedMode==='thrown' && (
            <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.5}}>
              Thrown weapons occupy the mainhand and are their own ammo — no
              bow or arrow slot. Range str +{E.ARROWS[E.WEAPONS[input.weapon]?.ammoKey]?.rangeBonus ?? 0}.
            </div>
          )}

          {(ct==='melee' || ct==='ranged') && (() => {
            // Special-attack weapon: a 2nd weapon brought only to spec on cooldown.
            const specOpts = ct==='melee'
              ? [['none','None'],['dragon_dagger','Dragon dagger (DDS)'],['dragon_longsword','Dragon longsword'],['dragon_mace','Dragon mace'],['dragon_halberd','Dragon halberd']]
              : [['none','None'],['magic_shortbow','Magic shortbow'],['magic_longbow','Magic longbow']];
            const dbaOn = ct==='melee' && (input.boosts||[]).includes('dba_spec');
            const cur0 = input.specWeapon || 'none';
            // Guard against a leftover spec key from the other combat type
            // (melee DDS shown while on the ranged tab) — fall back to None.
            const cur = specOpts.some(o=>o[0]===cur0) ? cur0 : 'none';
            let si = null;
            if (!dbaOn && cur!=='none' && input.monster){
              try { si = E.simulate(input).specInfo; } catch {}
            }
            return (
              <div>
                <div className="label-cap" style={{marginBottom:6}}>Special attack weapon</div>
                <SearchSelect value={cur} onChange={k=>set('specWeapon', k)} disabled={dbaOn}
                  placeholder="Type to search…"
                  options={specOpts.map(([k,lbl])=>({ key:k, label:lbl }))} />
                {/* Thrown main has no arrow slot, but a bow spec fires arrows —
                    let the user pick which arrows the spec uses from the quiver. */}
                {ct==='ranged' && rangedMode==='thrown' && (cur==='magic_shortbow' || cur==='magic_longbow') && (
                  <div style={{marginTop:8}}>
                    <div className="label-cap" style={{marginBottom:6}}>Spec arrows <span style={{color:'var(--text-3)'}}>· quiver for the bow spec</span></div>
                    <SearchSelect value={input.specAmmo || 'rune_arrow'} onChange={k=>set('specAmmo', k)}
                      placeholder="Type to search arrows…"
                      options={Object.entries(E.ARROWS)
                        .filter(([k,v])=>v.kind==='arrow' && (k===(input.specAmmo||'rune_arrow') || !tierHidden(k, hiddenTiers)))
                        .map(([k,v])=>({ key:k, label:v.name, hint:`+${v.rangeBonus} rng` }))} />
                  </div>
                )}
                {dbaOn && (
                  <div style={{marginTop:6, fontFamily:'var(--mono)', fontSize:10, color:'var(--red)', lineHeight:1.5}}>
                    DBA spec is your strength source — all spec energy goes to that, so no DPS spec weapon.
                  </div>
                )}
                {si && (
                  <div style={{marginTop:8, padding:'7px 9px', background:'var(--bg-1)', border:'1px solid var(--border-2)', borderRadius:3,
                    fontFamily:'var(--mono)', fontSize:10, color:'var(--text-2)', display:'grid', gridTemplateColumns:'1fr auto', gap:'3px 10px'}}>
                    <span style={{color:'var(--text-3)'}}>Specs / hr (on cooldown)</span><span style={{textAlign:'right', color:'var(--text-0)'}}>{si.specsPerHour.toFixed(1)}</span>
                    <span style={{color:'var(--text-3)'}}>Spec max hit{si.hits>1?` ×${si.hits}`:''}</span><span style={{textAlign:'right', color:'var(--text-0)'}}>{si.maxHit}</span>
                    <span style={{color:'var(--text-3)'}}>Spec hit chance</span><span style={{textAlign:'right', color:'var(--text-0)'}}>{(si.hitChance*100).toFixed(1)}%</span>
                    <span style={{color:'var(--text-3)'}}>DPS gain</span><span style={{textAlign:'right', color:'var(--gold)'}}>+{si.dpsGainPct.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            );
          })()}

          {ct==='magic' && (
            <div>
              <div className="label-cap" style={{marginBottom:6}}>Spell</div>
              <SearchSelect value={input.spell}
                placeholder="Type to search spells…"
                onChange={k=>{ const s=E.SPELLS[k]; set('spell',k); set('spellBase',s.base); }}
                options={Object.entries(E.SPELLS).map(([k,v])=>({ key:k, label:v.label }))} />
              {(() => {
                const sp = E.SPELLS[input.spell];
                const cost = E.spellRuneCost(input.spell, input.weapon);
                const provided = E.WEAPONS[input.weapon]?.provides;
                const runeNames = sp?.runes ? Object.entries(sp.runes).map(([r,q])=>{
                  const free = r===provided;
                  return `${q}× ${r.replace('rune','')}${free?' (free)':''}`;
                }).join(', ') : '';
                return sp?.runes ? (
                  <div style={{marginTop:6, fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.5}}>
                    {runeNames} · <span style={{color:'var(--gold)'}}>~{fmtInt(cost)} gp/cast</span>
                    {sp.god && input.charge!==false ? <span> · +~{fmtInt(E.chargeCostPerCast(5*E.TICK_SECONDS))} charge</span> : null}
                  </div>
                ) : null;
              })()}
              {E.SPELLS[input.spell]?.god && (
                <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:6}}>
                  <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)'}}>
                    Requires {E.SPELLS[input.spell].staff} · lvl 60 magic
                  </div>
                  <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none', fontFamily:'var(--mono)', fontSize:11, color:'var(--text-2)'}}>
                    <input type="checkbox" checked={input.charge!==false} onChange={e=>set('charge', e.target.checked)} />
                    Charge spell <span style={{color: input.charge!==false?'var(--teal)':'var(--text-3)'}}>(max {input.charge!==false?30:20})</span>
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="hr" />
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
            <div className="label-cap">Worn equipment</div>
            <button type="button" onClick={bestInSlot}
              title={`Equip the most offensive item in every slot for ${ct} (lowest time-to-kill on the current target). Keeps your weapon — may drop defensive items like the anti-dragon shield.`}
              style={{padding:'3px 10px', fontFamily:'var(--mono)', fontSize:10, cursor:'pointer', borderRadius:3,
                border:'1px solid color-mix(in oklab, var(--gold) 45%, var(--border-2))',
                background:'color-mix(in oklab, var(--gold) 14%, var(--bg-2))', color:'var(--gold)',
                textTransform:'uppercase', letterSpacing:'.5px', whiteSpace:'nowrap'}}>
              ★ Best in slot
            </button>
          </div>
          <div style={{display:'grid', gap:8}}>
            {ARMOUR_SLOTS.map(slot => {
              // A two-handed weapon (bows, dragon halberd) occupies the off-hand,
              // so the shield slot is locked to None while one is equipped.
              const twoHand = !!(E?.WEAPONS[input.weapon]?.twoHand);
              const offHandLocked = slot.key==='shield' && twoHand;
              const cur = offHandLocked ? 'none' : (gear[slot.key] || 'none');
              const items = slot.items;
              return (
                <div key={slot.key} style={{display:'grid', gridTemplateColumns:'58px 1fr', alignItems:'center', gap:8}}>
                  <span className="label-cap" style={{textAlign:'right'}}>{slot.label}</span>
                  {offHandLocked ? (
                    <div className="select" style={{opacity:.5, display:'flex', alignItems:'center', fontFamily:'var(--mono)', fontSize:11, color:'var(--text-3)'}}
                      title="Two-handed weapon equipped — the off-hand slot is unavailable.">
                      — 2h weapon (no off-hand)
                    </div>
                  ) : (
                  <GearSlotPicker items={items} value={cur} ct={ct} hiddenTiers={hiddenTiers}
                    onChange={k=>setSlot(slot.key, k)} />
                  )}
                </div>
              );
            })}
          </div>

          {totals && (
            <div style={{display:'grid', gap:8}}>
              {/* Offence */}
              <div style={{padding:'8px 10px', background:'var(--bg-1)', border:'1px solid var(--border-2)', borderRadius:3, fontFamily:'var(--mono)', fontSize:10, color:'var(--text-2)', display:'grid', gridTemplateColumns:'1fr auto 1fr auto', gap:'3px 12px'}}>
                <span style={{gridColumn:'1/-1', color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:2}}>Attack bonuses</span>
                {ct==='melee' && <>
                  <span>Stab</span><span style={{textAlign:'right', color:'var(--text-1)'}}>+{totals.stabAtt}</span>
                  <span>Slash</span><span style={{textAlign:'right', color:'var(--teal)'}}>+{totals.slashAtt}</span>
                  <span>Crush</span><span style={{textAlign:'right', color:'var(--text-1)'}}>+{totals.crushAtt}</span>
                  <span>Strength</span><span style={{textAlign:'right', color:'var(--amber)'}}>+{totals.str}</span></>}
                {ct==='ranged' && <>
                  <span>Range att</span><span style={{textAlign:'right', color:'var(--teal)'}}>+{totals.rngAtt}</span>
                  <span>Range str</span><span style={{textAlign:'right', color:'var(--amber)'}}>+{totals.rngStr}</span></>}
                {ct==='magic' && <>
                  <span>Magic att</span><span style={{textAlign:'right', color:'var(--teal)'}}>+{totals.magAtt}</span>
                  <span>Magic dmg</span><span style={{textAlign:'right', color:'var(--amber)'}}>+{totals.magDmg}%</span></>}
              </div>
              {/* Defence + prayer overview */}
              <div style={{padding:'8px 10px', background:'var(--bg-1)', border:'1px solid var(--border-2)', borderRadius:3, fontFamily:'var(--mono)', fontSize:10, color:'var(--text-2)', display:'grid', gridTemplateColumns:'1fr auto 1fr auto', gap:'3px 12px'}}>
                <span style={{gridColumn:'1/-1', color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:2}}>Defence bonuses</span>
                <span>Stab</span><span style={{textAlign:'right', color:'var(--text-1)'}}>{fmtSigned(totals.stabDef)}</span>
                <span>Slash</span><span style={{textAlign:'right', color:'var(--text-1)'}}>{fmtSigned(totals.slashDef)}</span>
                <span>Crush</span><span style={{textAlign:'right', color:'var(--text-1)'}}>{fmtSigned(totals.crushDef)}</span>
                <span>Magic</span><span style={{textAlign:'right', color:'var(--text-1)'}}>{fmtSigned(totals.magDef)}</span>
                <span>Ranged</span><span style={{textAlign:'right', color:'var(--text-1)'}}>{fmtSigned(totals.rngDef)}</span>
                <span>Prayer</span><span style={{textAlign:'right', color:'var(--gold)'}}>{fmtSigned(totals.prayer)}</span>
              </div>
            </div>
          )}

          <div className="hr" />
          <div className="label-cap">Bonus override</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div className="field"><label>{labels.accB}</label>
              <div className="input-row"><input className="input" type="number" value={input.accBonus} onChange={e=>{set('accBonus',+e.target.value); set('weapon','custom');}} /><span className="suffix">{labels.bSuffix}</span></div>
            </div>
            <div className="field"><label>{labels.dmgB}</label>
              <div className="input-row"><input className="input" type="number" value={input.dmgBonus} onChange={e=>{set('dmgBonus',+e.target.value); set('weapon','custom');}} /><span className="suffix">{ct==='magic'?'%':'+'}</span></div>
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}><label>Attack speed</label>
              <div className="input-row"><input className="input" type="number" min={1} max={10} value={input.attackSpeed} onChange={e=>{set('attackSpeed',+e.target.value); set('weapon','custom');}} /><span className="suffix">ticks · {(input.attackSpeed*0.6).toFixed(1)}s</span></div>
            </div>
          </div>
        </div>

        {/* ---- RIGHT: buffs ---- */}
        <div style={{padding:'14px', display:'grid', gap:14, alignContent:'start'}}>
          <div>
            <div className="label-cap" style={{marginBottom:8}}>Prayers</div>
            <CategoryRows rows={ct==='melee' ? PRAYER_ROWS_MELEE : PRAYER_ROWS_DEF_ONLY}
              selected={input.prayers||[]} onChange={v=>set('prayers',v)} />
          </div>

          <div>
            <div className="label-cap" style={{marginBottom:8}}>Potions &amp; boosts</div>
            <CategoryRows rows={ct==='melee' ? BOOST_ROWS_MELEE : ct==='ranged' ? BOOST_ROWS_RANGED : BOOST_ROWS_MAGIC}
              selected={input.boosts||[]} onChange={v=>set('boosts',v)} />
          </div>

          {ct==='melee' && (input.boosts||[]).includes('dba_spec') && (
            <div style={{padding:'8px 10px', background:'var(--bg-1)', border:'1px solid var(--border-2)', borderRadius:3}}>
              <DBAInfo input={input} />
            </div>
          )}

          <div className="hr" />
          <div>
            <div className="label-cap" style={{marginBottom:8}}>Sustained mode</div>
            <Toggle label="Avg over session" subOn="time-avg level, not peak" subOff="peak boosted level"
              value={input.sustained} onChange={v=>set('sustained',v)} color="amber"/>
            {input.sustained && (
              <div style={{marginTop:8, display:'grid', gap:8}}>
                <SustainedInfo input={input} />
                <div className="field"><label>Repot threshold</label>
                  <div className="input-row">
                    <input className="input" type="number" min={1} max={99} value={input.repotThreshold ?? ''} placeholder="auto"
                      onChange={e=>set('repotThreshold', e.target.value===''?null:+e.target.value)} />
                    <span className="suffix">lvl</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="hr" />
          <div>
            <div className="label-cap" style={{marginBottom:8}}>Ring of Wealth</div>
            <Toggle label="Ring of wealth" subOn="gem table upgraded" subOff="not equipped"
              value={input.ringOfWealth} onChange={v=>set('ringOfWealth',v)} color="teal"/>
            <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', marginTop:6, lineHeight:1.5}}>
              Affects ~randomjewel only — caps the gem roll so it never whiffs.
              Ultra-rare table unaffected.
            </div>
          </div>

          {input.gear?.ring === 'ring_of_recoil' && (
            <div>
              <div className="label-cap" style={{marginBottom:8}}>Ring of recoil</div>
              <NumField label="Rings taken (incl. equipped)"
                v={input.trip?.recoilRings ?? 1}
                onChange={v=>set('trip', {...(input.trip||{}), recoilRings: Math.max(1, v)})} />
              <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', marginTop:6, lineHeight:1.5}}>
                Reflects floor(dmg/10)+1 back per hit taken — kills faster but
                gives no XP. Each ring shatters after 40 reflected dmg; the 1st is
                equipped, spares take {Math.max(0,(input.trip?.recoilRings ?? 1)-1)} inv slot{((input.trip?.recoilRings ?? 1)-1)===1?'':'s'}.
                Assuming all your rings are full. No recoil while safespotted, and
                members areas only.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =======================================================================
// CENTER PANES — one per tab
// =======================================================================
function StatsPane({input, result}){
  return (
    <div ref={useNativeWheelRef} style={{display:'flex', flexDirection:'column', overflow:'auto', minHeight:0}} className="scroll">
      <div style={{padding:'14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
        <div className="metric huge teal">
          <div className="k">DPS</div>
          <div className="v">{fmt2(result.dps)}</div>
          <div className="sub">avg dmg/sec · {fmt2(result.avgHit)} per hit</div>
        </div>
        <div className="metric huge amber">
          <div className="k">XP / hour (effective)</div>
          <div className="v">{fmtK(result.effectiveXpPerHour)}</div>
          <div className="sub">{fmtK(result.xpPerHour)} at the kill · ×{fmtPct(result.tripEfficiency)} after banking · {fmtInt(result.xpPerKill)} xp ea</div>
        </div>
        <div className="metric big gold">
          <div className="k">GP / hour (net, effective)</div>
          <div className="v">{fmtK(result.effectiveNetGpPerHour)}</div>
          <div className="sub">gross {fmtK(result.effectiveGpPerHour)} − supplies {fmtK(result.supplyCostPerKill*result.effectiveKph)} · {fmtGpXp(gpPerXp(result))} gp/xp</div>
        </div>
        <div className="metric big green">
          <div className="k">Hit chance</div>
          <div className="v">{fmtPct(result.hitChance)}</div>
          <div className="sub">att roll {fmtInt(result.attRoll)} vs def {fmtInt(result.defRoll)}</div>
        </div>
      </div>

      <div className="h-strip"><span className="title">Combat roll</span><span className="meta">derived · {input.combatType}</span></div>
      <div style={{padding:'10px 14px', display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10}}>
        <MiniMetric k="Max hit"   v={fmtInt(result.maxHit)} />
        <MiniMetric k="Eff. acc"  v={fmtInt(result.effAcc)} />
        <MiniMetric k="Eff. dmg"  v={fmtInt(result.effDmg)} />
        <MiniMetric k="Tick"      v={`${result.attackTicks} · ${(result.attackSpeedSec).toFixed(1)}s`} />
        <MiniMetric k="TTK"       v={fmtTime(result.ttkSec)} />
        <MiniMetric k="Cycle"     v={fmtTime(result.cycleSec)} />
        <MiniMetric k="Kills/hr"  v={`${fmtInt(result.effectiveKph)}`} />
        <MiniMetric k="GP / kill" v={fmtInt(result.gpPerKill)} />
      </div>

      {result.trip && (
        <>
          <div className="h-strip"><span className="title">Banking trip</span>
            <span className="meta">{result.trip.bound==='food'?'food-bound':result.trip.bound==='loot'?'inventory-bound':result.trip.bound==='prayer'?'prayer-bound':result.trip.bound==='recoil'?'recoil-bound':'no banking'} · bank {fmtTime(result.trip.bankSeconds)}</span>
          </div>
          <div style={{padding:'10px 14px', display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10}}>
            <MiniMetric k="Kills / trip" v={isFinite(result.trip.killsPerTrip)?fmtInt(result.trip.killsPerTrip):'∞'} />
            <MiniMetric k="Trip length"  v={isFinite(result.trip.tripMinutes)?`${result.trip.tripMinutes.toFixed(0)}m`:'—'} />
            <MiniMetric k="Efficiency"   v={fmtPct(result.tripEfficiency)} />
            <MiniMetric k="Food / kill"  v={`${result.trip.foodPerKill.toFixed(2)} ${result.trip.foodName.toLowerCase()}`} />
            <MiniMetric k="Loot capacity" v={`${Math.round(result.trip.slots.lootCapacity)} / ${result.trip.slots.inv}`} />
            <MiniMetric k="Loot slots/kill" v={result.trip.slots.nonStackPerKill.toFixed(2)} />
            <MiniMetric k="Incoming/kill"  v={`${result.trip.incoming.hpPerKill.toFixed(1)} hp`} />
            <MiniMetric k="Supplies/hr"  v={fmtK(result.supplyCostPerKill*result.effectiveKph)} />
            {result.recoil && (
              <MiniMetric k="Recoil/kill" v={`${result.recoil.dmgPerKill.toFixed(1)} dmg · ${result.recoil.ringsPerKill.toFixed(2)} ring`} />
            )}
          </div>
        </>
      )}

      <div className="h-strip"><span className="title">Hit distribution</span><span className="meta">uniform 0..max · including miss</span></div>
      <div style={{padding:'14px'}}>
        <HitHistogram maxHit={result.maxHit} hitChance={result.hitChance} />
      </div>

      <div className="h-strip"><span className="title">XP routing</span><span className="meta">per dmg dealt</span></div>
      <div style={{padding:'10px 14px 14px', display:'flex', gap:8, flexWrap:'wrap'}}>
        {Object.entries(result.xpRouting).map(([k,v])=>(
          <span key={k} style={{fontFamily:'var(--mono)', fontSize:11, padding:'4px 10px', border:'1px solid var(--border-2)', borderRadius:3, background:'var(--bg-2)'}}>
            <span style={{color:'var(--text-3)', textTransform:'uppercase', marginRight:8}}>{k}</span>
            <span style={{color:'var(--amber)'}}>+{v.toFixed(2)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ComparePane({input, set}){
  const LS_IRREL = 'sim_irrelevant_v1';
  const DEFAULT_IRREL = ['_bandit_camp_leader', 'bandit_camp_leader'];
  const [irrelevant, setIrrelevant] = useState(() => {
    try {
      const stored = localStorage.getItem(LS_IRREL);
      if (stored) return new Set(JSON.parse(stored));
    } catch {}
    return new Set(DEFAULT_IRREL);
  });
  const toggleIrrelevant = (id) => {
    setIrrelevant(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(LS_IRREL, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const [compNameQ, setCompNameQ] = useState('');
  const [compLootQ, setCompLootQ] = useState('');
  const compFiltered = !!(compNameQ || compLootQ);

  // Per-monster custom setups: each row simulates with its own saved setup;
  // monsters without one use the DEFAULT loadout (not whatever custom setup
  // happens to be live right now).
  const rows = useMemo(() => {
    const setups = input.monsterSetups || {};
    const onCustom = !!(input.monster && setups[input.monster.id]) && !input.editingDefault;
    const baseSetup = onCustom ? (input.defaultSetup || {}) : {};
    return E.MONSTERS.map(m => {
      const ov = setups[m.id];
      const alchOn = !!(input.alchByMonster||{})[m.id];   // per-monster alch decision
      const sim = ov
        ? {...input, ...ov, monster:m}
        : {...input, ...baseSetup, monster:m,
           trip:{...((baseSetup.trip)||input.trip||{}), bankSeconds:null, foodCount:null, foodPerKillOverride:null, scarce:null}};
      sim.trip = {...(sim.trip||{}), alching:alchOn};
      sim.overheadSec = (input.overheadByMonster||{})[m.id] ?? null;  // per-monster (null → engine default)
      sim.cannon = null;  // compare rows are solo — cannon is a per-spot Stats-tab overlay
      return {m, r:E.simulate(sim), custom:!!ov};
    });
  }, [input]);
  const LS_SORT = 'sim_compare_sort_v1';
  const [sort, setSort] = useState(() => {
    try { const s = localStorage.getItem(LS_SORT); if (s) return JSON.parse(s); } catch {}
    return {key:'effectiveXpPerHour', dir:-1};
  });
  useEffect(() => { try { localStorage.setItem(LS_SORT, JSON.stringify(sort)); } catch {} }, [sort]);
  // Irrelevant rows always go to the bottom; within each group, apply column sort.
  const filteredRows = useMemo(() => rows.filter(({m}) => {
    if (compNameQ && !m.name.toLowerCase().includes(compNameQ.toLowerCase())) return false;
    if (!matchLoot(m, compLootQ)) return false;
    return true;
  }), [rows, compNameQ, compLootQ]);

  const sorted = useMemo(() => [...filteredRows].sort((a, b) => {
    const ai = irrelevant.has(a.m.id) ? 1 : 0;
    const bi = irrelevant.has(b.m.id) ? 1 : 0;
    if (ai !== bi) return ai - bi;
    // Monster name sorts alphabetically; first click is A→Z (dir -1).
    if (sort.key === 'name') return a.m.name.localeCompare(b.m.name) * -sort.dir;
    return (a.r[sort.key] - b.r[sort.key]) * sort.dir;
  }), [filteredRows, sort, irrelevant]);
  const sortBy = k => setSort(s => s.key===k ? {key:k,dir:-s.dir} : {key:k,dir:-1});
  const TH = ({k,label,right=true}) => (
    <th className={right?'right':''} onClick={()=>sortBy(k)} style={{cursor:'pointer', userSelect:'none', whiteSpace:'nowrap'}}>
      {label} {sort.key===k ? (k==='name' ? (sort.dir<0?'▲':'▼') : (sort.dir<0?'▼':'▲')) : ''}
    </th>
  );
  // Scale bars against relevant monsters only — keeps comparison meaningful.
  const relevantRows = rows.filter(({m}) => !irrelevant.has(m.id));
  const maxXph = Math.max(...relevantRows.map(x=>x.r.effectiveXpPerHour), 1);
  const maxGph = Math.max(...relevantRows.map(x=>Math.max(0,x.r.effectiveNetGpPerHour)), 1);
  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0}}>
      <div className="h-strip">
        <span className="title">All monsters · default {input.combatType} loadout · ● = custom setup</span>
        <span className="meta">{irrelevant.size} hidden · click row → set target · click N/A → toggle relevance</span>
      </div>
      <div style={{display:'flex', gap:6, padding:'6px 10px', borderBottom:'1px solid var(--border-1)', alignItems:'center', flexWrap:'wrap'}}>
        <input
          type="text"
          placeholder="Monster name…"
          value={compNameQ}
          onChange={e=>setCompNameQ(e.target.value)}
          style={{fontFamily:'var(--mono)', fontSize:11, padding:'4px 8px', borderRadius:3,
            border:'1px solid var(--border-2)', background:'var(--bg-2)', color:'var(--text-0)',
            outline:'none', width:130, minWidth:0}}
        />
        <LootSearchInput value={compLootQ} onChange={setCompLootQ}
          placeholder="Filter by drop — clue, dragon bones…"
          style={{width:240}} useSelectClass={false} />
        {compFiltered && (
          <button onClick={()=>{setCompNameQ(''); setCompLootQ('');}} style={{
            fontFamily:'var(--mono)', fontSize:10, padding:'3px 9px', borderRadius:3, cursor:'pointer',
            border:'1px solid var(--border-2)', background:'var(--bg-2)', color:'var(--text-2)'}}>
            reset filters
          </button>
        )}
        <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', marginLeft:'auto'}}>
          {compFiltered ? `${filteredRows.length} / ${rows.length}` : `${rows.length} monsters`}
        </span>
      </div>
      <div ref={useNativeWheelRef} className="scroll" style={{flex:1, overflow:'auto'}}>
        <table className="dense">
          <thead>
            <tr>
              <th style={{width:24}}>#</th>
              <TH k="name" label="Monster" right={false} />
              <TH k="hitChance" label="HIT %" />
              <TH k="maxHit"    label="MAX" />
              <TH k="dps"       label="DPS" />
              <TH k="ttkSec"    label="TTK" />
              <TH k="killsPerHour" label="K/HR" />
              <th className="right" style={{width:120, whiteSpace:'nowrap'}}>XP / hr</th>
              <TH k="effectiveXpPerHour" label="XP/HR" />
              <th className="right" style={{width:120, whiteSpace:'nowrap'}}>NET GP / hr</th>
              <TH k="effectiveNetGpPerHour" label="GP/HR" />
              <th style={{width:42}}>N/A</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({m,r,custom},i) => {
              const sel = m.id===input.monster.id;
              const isIrrel = irrelevant.has(m.id);
              const dimColor = isIrrel ? 'var(--text-3)' : undefined;
              return (
                <tr key={m.id}
                    style={{background: sel?'color-mix(in oklab, var(--teal) 10%, transparent)':undefined,
                            cursor:'pointer', opacity: isIrrel ? 0.5 : 1}}
                    onClick={()=>set('monster',m)}>
                  <td className="dim num right">{i+1}</td>
                  <td style={{color: dimColor || (sel?'var(--teal)':'var(--text-0)'), whiteSpace:'nowrap'}}>{sel?'▸ ':'  '}{m.name}{custom?<span style={{color:'var(--teal)'}}> ●</span>:null} <span className="dim">· lvl {m.level}</span></td>
                  <td className="right num" style={{color:dimColor}}>{fmtPct(r.hitChance)}</td>
                  <td className="right num" style={{color:dimColor}}>{r.maxHit}</td>
                  <td className="right num" style={{color:dimColor}}>{fmt2(r.dps)}</td>
                  <td className="right num" style={{color:dimColor}}>{fmtTime(r.ttkSec)}</td>
                  <td className="right num" style={{color:dimColor}}>{fmtInt(r.killsPerHour)}</td>
                  <td><div className="barwrap amber"><div style={{width:`${Math.min(100,(r.effectiveXpPerHour/maxXph)*100)}%`, background: isIrrel?'var(--text-3)':'var(--amber)'}}/></div></td>
                  <td className="right num" style={{color: isIrrel ? 'var(--text-3)' : 'var(--amber)'}}>{fmtK(r.effectiveXpPerHour)}</td>
                  <td><div className="barwrap gold"><div style={{width:`${Math.min(100,Math.max(0,r.effectiveNetGpPerHour)/maxGph*100)}%`, background: isIrrel?'var(--text-3)':'var(--gold)'}}/></div></td>
                  <td className="right num" style={{color: isIrrel ? 'var(--text-3)' : 'var(--gold)'}}>{fmtK(r.effectiveNetGpPerHour)}</td>
                  <td>
                    <button onClick={(e)=>{e.stopPropagation(); toggleIrrelevant(m.id);}}
                      style={{
                        fontFamily:'var(--mono)', fontSize:9, letterSpacing:'.04em',
                        padding:'2px 6px', borderRadius:3, cursor:'pointer',
                        border:`1px solid ${isIrrel ? 'var(--red)' : 'var(--border-2)'}`,
                        background: isIrrel ? 'color-mix(in oklab, var(--red) 18%, var(--bg-2))' : 'var(--bg-2)',
                        color: isIrrel ? 'var(--red)' : 'var(--text-3)',
                      }}>
                      {isIrrel ? '✕' : 'N/A'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LootPane({input, result, lootPrefs={}, setLootPref, setLootPrefsBulk, set}){
  const m = input.monster;
  const [compOpen, setCompOpen] = useState(() => {
    try { return localStorage.getItem('sim_loot_comp_open') !== '0'; } catch { return true; }
  });
  const toggleComp = () => setCompOpen(o => { const n=!o; try{localStorage.setItem('sim_loot_comp_open', n?'1':'0');}catch{} return n; });
  // Which sub-table rows (gem/herb/casket) are expanded to show contents.
  const [expandedRows, setExpandedRows] = useState(() => new Set());
  const toggleRow = (name) => setExpandedRows(s => { const n=new Set(s); n.has(name)?n.delete(name):n.add(name); return n; });


  const totalEvRaw  = result.lootBreakdown.reduce((s,d)=>s+d.evGp, 0) || 1;
  const dropsRaw     = [...result.lootBreakdown].sort((a,b)=>b.evGp-a.evGp);
  const natCost      = window.GameData?.ITEM_PRICES?.naturerune ?? 265;

  // Unidentified herb price (2004 sold herbs as "unidentified herb" in 11-stacks)
  const herbUnidPrice = window.GameData?.ITEM_PRICES?.unidentified_guam ?? 15;

  // 'value' pref (high-value-only): leave sub-table rolls worth <= threshold on
  // the ground. EVs come pre-filtered from GameData.
  const valueThreshold = window.GameData?.VALUE_THRESHOLD ?? 2000;
  const herbEvHigh     = window.GameData?.HERB_EV_HIGH ?? 0;
  const gemEvBaseHigh  = window.GameData?.GEM_EV_BASE_HIGH ?? 0;
  const gemEvRowHigh   = window.GameData?.GEM_EV_ROW_HIGH ?? 0;

  // Per-drop herb override: when a herb's pref is 'unid', value it at the
  // unidentified guam price (2004 had no grimy herbs — herbs dropped as
  // "unidentified herb" and were sold in 11-stacks at the unid price).
  const drops = dropsRaw.map(d => {
    const p = d.pref ?? lootPrefs[d.name];
    if (d.tag === 'herb' && p === 'unid'){
      const ev = d.chance * d.qtyAvg * herbUnidPrice;
      return {...d, price: herbUnidPrice, evGp: ev, _herbUnid:true};
    }
    if ((d.tag === 'herb' || d.tag === 'gem') && p === 'value'){
      const unit = d.tag === 'herb' ? herbEvHigh
        : (input.ringOfWealth ? gemEvRowHigh : gemEvBaseHigh);
      const ev = d.chance * d.qtyAvg * unit;
      return {...d, price: unit, evGp: ev, _highValue:true};
    }
    return d;
  });
  const totalEv = drops.reduce((s,d)=>s+d.evGp,0) || 1;
  const maxEv   = Math.max(...drops.map(d=>d.evGp), 1);

  const prefBtn = (name, pref, active, color='teal', label) => (
    <button onClick={()=>setLootPref && setLootPref(name, pref)}
      style={{padding:'2px 7px', border:`1px solid ${active?`var(--${color})`:'var(--border-2)'}`,
        borderRadius:3, background: active?`color-mix(in oklab,var(--${color}) 18%,var(--bg-2))`:'var(--bg-2)',
        color: active?`var(--${color})`:'var(--text-3)',
        fontFamily:'var(--mono)', fontSize:10, cursor:'pointer', letterSpacing:'.04em'}}>
      {label ?? pref}
    </button>
  );

  // --- per-action net gp/hr (re-simulates with the pref overridden) --------
  const baseNet = result.effectiveNetGpPerHour;
  // High alchemy applies to any item with an alch value (incl. runes — you CAN
  // alch them), except bones and the tagged sub-tables. The optimizer won't
  // pick silly alchs because each cast costs 5 ticks: alching a 75-rune stack
  // (75 casts) tanks kills/hr, and runes that alch below the nature-rune price
  // yield 0 gp, so loot/skip wins.
  // Alch is only an option when the trip's alching toggle is on (otherwise you
  // carry no runes/staff). Keep this in sync with the engine's alchAllowed.
  const alchAllowed = !!(input.trip && input.trip.alching);
  // Nature rune cost per cast — alching is only worth offering when the item's
  // alch value EXCEEDS it, otherwise the cast nets ≤ 0 gp (and wastes time). So
  // don't offer 'alch' on cheap drops (water runes, bass, ore, etc.).
  const natRuneCost = window.GameData?.ITEM_PRICES?.naturerune ?? 347;
  const canAlch = (d) => alchAllowed && !!d.alchValue && (d.alchValue - natRuneCost > 0)
    && !d.isBone && !Array.isArray(d._expand);
  const simNet = (override) => {
    try { return E.simulate({...input, lootPrefs:{...lootPrefs, ...override}}).effectiveNetGpPerHour; }
    catch { return null; }
  };
  const actionsFor = (d) => {
    const o = [];
    // Bulk-unsellable gear (rune armour/weapons) can't be SOLD on the market, but
    // 'loot' still makes sense: you bank it and high-alch at leisure (the engine
    // values a looted bulk item at its alch value, no in-trip cast-time cost). So
    // offer 'loot' for everything except plain (non-dragon) bones.
    if (!d.isBone || /dragon/i.test(d.name)) o.push('loot');
    if (d.tag === 'herb') o.push('unid');
    if (d.tag === 'herb' || d.tag === 'gem') o.push('value');
    if (canAlch(d)) o.push('alch');
    if (d.isBone && !/dragon/i.test(d.name)) o.push('bury');
    o.push('skip');
    return o;
  };
  const [hover, setHover] = useState(null);          // { key:rowIndex, rows:[{action,net,delta,current}] }
  // Keyed by ROW INDEX, not name: a monster can list the same item (e.g. several
  // 'Coins' drops at different amounts) on multiple rows, and keying by name
  // would pop the tooltip on every one of them at once.
  const showHover = (d, rowKey) => {
    const cur = d.pref ?? lootPrefs[d.name] ?? 'loot';
    const rows = actionsFor(d).map(a => {
      const net = simNet({ [d.name]: a });
      return { action:a, net, delta: net==null?null:net-baseNet, current:a===cur };
    });
    setHover({ key:rowKey, rows });
  };

  // --- optimizer: greedy fixpoint over loot/alch/skip(/unid) per item ------
  // Re-simulates each candidate action and keeps the one that maximises net
  // gp/hr, accounting for the inventory-slot cost of banking each item.
  // Plain bones (bury = prayer xp, not gp) are left untouched.
  const [optMsg, setOptMsg] = useState('');
  const resetPrefs = () => {
    // Clear only THIS monster's drop overrides, leaving other monsters intact.
    const names = new Set(drops.map(d => d.name));
    setLootPrefsBulk && setLootPrefsBulk(
      Object.fromEntries(drops.map(d => [d.name, undefined])), true);
    setOptMsg('↺ reset to defaults');
    setTimeout(()=>setOptMsg(''), 4000);
  };
  const optimize = () => {
    let prefs = {...lootPrefs};
    // Optimize ordinary drops plus the herb/jewel sub-tables (they now have
    // real choices: loot / unid / value / skip). Other expandable sub-tables
    // (casket, ultra-rare, mega) are loot-or-nothing, so leave them at default.
    const items = drops.filter(d => !(d.isBone && !/dragon/i.test(d.name))
      && (!Array.isArray(d._expand) || d.tag === 'herb' || d.tag === 'gem'));
    // Start from a CANONICAL state, not the user's current prefs: drop every
    // optimizable item's override so it falls back to its default action. Without
    // this, the greedy hill-climb inherits the current choice and can settle into
    // whatever local optimum is nearest to it — so optimizing the same loadout
    // twice (or from coins=skip vs coins=loot) could give different answers. A
    // fixed start makes the optimizer idempotent. (Overrides for OTHER monsters /
    // untouched sub-tables are preserved.)
    for (const d of items) delete prefs[d.name];
    const netOf = (p) => {
      try { return E.simulate({...input, lootPrefs:p}).effectiveNetGpPerHour; }
      catch { return -Infinity; }
    };
    const isStack = window.TripModel?.isStackable || (()=>false);

    // Stackables (coins, runes) each cost ONE inventory slot for the WHOLE trip,
    // so they all compete for the same scarce slots — and a slot spent on loot is
    // a slot not spent on food (fewer kills/trip). A naive per-item greedy is
    // order-dependent here: starting from "loot everything", the FIRST stackable
    // it touches looks worth skipping (slots are tightest then) and it never
    // reconsiders, so it can keep a low-value stackable (coins) while dropping a
    // high-value one (water runes). Fix: SEED every stackable to 'skip', then add
    // them back in descending gp-value order, keeping each only if it improves
    // net. The most valuable stackable claims the scarce slot first.
    const stackItems = items.filter(d => isStack(d.key, d.name))
      .sort((a,b) => (b.evGp||0) - (a.evGp||0));
    for (const d of stackItems) prefs = {...prefs, [d.name]:'skip'};
    for (const d of stackItems){
      const cur = netOf(prefs);
      const lootNet = netOf({...prefs, [d.name]:'loot'});
      if (lootNet > cur + 0.01) prefs = {...prefs, [d.name]:'loot'};
    }

    // Greedy fixpoint over the rest (non-stackables + herb/gem sub-tables). These
    // don't share a single slot, so per-item greedy is well-behaved; the loop
    // re-checks until stable. Stackables are re-evaluated too so any interaction
    // settles, but they start from the value-ordered seed above.
    // TIE_EPS: if an action beats 'skip' by less than this (gp/hr), treat it as a
    // tie and prefer skip — e.g. a low-value drop that just gets DISPLACED on a
    // loot-bound trip (you'd leave it on the ground anyway) shows a 0 / float-
    // noise gain, so there's no reason to bother picking it up.
    const TIE_EPS = 1;
    let changed = true, guard = 0;
    while (changed && guard++ < 5){
      changed = false;
      for (const d of items){
        const opts = actionsFor(d);
        let best = null, bestNet = -Infinity;
        for (const a of opts){
          const net = netOf({...prefs, [d.name]:a});
          if (net > bestNet + 0.01){ bestNet = net; best = a; }
        }
        // Prefer skip on a (near-)tie: if skipping costs essentially nothing,
        // leave it on the ground rather than clutter the pack.
        if (opts.includes('skip')){
          const skipNet = netOf({...prefs, [d.name]:'skip'});
          if (skipNet >= bestNet - TIE_EPS) best = 'skip';
        }
        const cur = prefs[d.name] ?? d.pref ?? 'loot';
        if (best && best !== cur){ prefs = {...prefs, [d.name]:best}; changed = true; }
      }
    }
    const before = baseNet;
    // Build the full update: every optimizable item gets an explicit value, and
    // any that ended at its default is written as `undefined` so the stale
    // override is cleared (clearUndefined). This keeps the store in sync with the
    // canonical-start optimization instead of leaving old overrides behind.
    const update = {};
    for (const d of items) update[d.name] = prefs[d.name]; // undefined = back to default
    for (const k of Object.keys(prefs)) if (!(k in update)) update[k] = prefs[k];
    setLootPrefsBulk && setLootPrefsBulk(update, true);
    const after = E.simulate({...input, lootPrefs:prefs}).effectiveNetGpPerHour;
    const gain = after - before;
    setOptMsg(`✓ optimized · ${fmtK(after)} net gp/hr (${gain>=0?'+':''}${fmtK(gain)})`);
    setTimeout(()=>setOptMsg(''), 6000);
  };

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0}}>
      <div className="h-strip">
        <span className="title">Drop table · {m.name}</span>
        <span style={{display:'flex', alignItems:'center', gap:10}}>
          {optMsg && <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--green)'}}>{optMsg}</span>}
          <button type="button" onClick={resetPrefs} title="Clear all manual overrides — every drop falls back to its default loot/alch/skip"
            style={{padding:'3px 10px', fontFamily:'var(--mono)', fontSize:10, cursor:'pointer', borderRadius:3,
              border:'1px solid var(--border-2)', background:'var(--bg-2)', color:'var(--text-3)'}}>
            ↺ reset
          </button>
          <button type="button" onClick={optimize} title="Set each drop to loot / alch / skip for the highest net gp/hr"
            style={{padding:'3px 10px', fontFamily:'var(--mono)', fontSize:10, cursor:'pointer', borderRadius:3,
              border:'1px solid color-mix(in oklab, var(--gold) 45%, var(--border-2))',
              background:'color-mix(in oklab, var(--gold) 14%, var(--bg-2))', color:'var(--gold)'}}>
            ⚙ optimize for gp/hr
          </button>
        </span>
      </div>
      {/* High-alch loot is a PER-MONSTER decision: carry a staff + nat/fire runes
          (2 inv slots) to alch gear on this target. When off, 'alch' actions
          collapse to loot/sell. Toggling here drives input.trip.alching for the
          current monster (stored in alchByMonster). */}
      <div style={{display:'flex', alignItems:'stretch', gap:10,
        padding:'8px 12px', borderBottom:'1px solid var(--border-1)', background:'var(--bg-1)'}}>
        {/* Left bar: high-alch text + toggle grouped together. */}
        <div style={{flex:'1 1 0', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10,
          paddingRight:14, borderRight:'1px solid var(--border-1)'}}>
          <div>
            <div style={{fontFamily:'var(--mono)', fontSize:11, color: alchAllowed?'var(--gold)':'var(--text-2)'}}>High-alch loot</div>
            <div style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--text-3)', marginTop:1}}>
              {alchAllowed ? `enabled for ${m.name} · 2 rune slots, alch gear in-trip` : `off · ${m.name} drops sold or banked`}
            </div>
          </div>
          <button type="button" role="switch" aria-checked={alchAllowed}
            onClick={()=> set && set('__setAlch', !alchAllowed)}
            style={{position:'relative', width:38, height:21, borderRadius:11, cursor:'pointer', flexShrink:0,
              border:`1px solid ${alchAllowed?'color-mix(in oklab, var(--gold) 55%, var(--border-2))':'var(--border-2)'}`,
              background: alchAllowed?'color-mix(in oklab, var(--gold) 30%, var(--bg-2))':'var(--bg-2)', transition:'all .12s'}}>
            <span style={{position:'absolute', top:1, left: alchAllowed?18:1, width:17, height:17, borderRadius:'50%',
              background: alchAllowed?'var(--gold)':'var(--text-3)', transition:'all .12s'}} />
          </button>
        </div>
        {/* Right bar: per-monster kill overhead (seconds looting/walking, not
            attacking). Blank/default scales 2–4s with loot & roaming; editable. */}
        {(() => {
          const ovrMap = input.overheadByMonster || {};
          const overridden = ovrMap[m.id] != null;
          const defOvhd = E.defaultOverhead(m);
          const curOvhd = overridden ? ovrMap[m.id] : defOvhd;
          return (
            <div style={{flex:'1 1 0', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10}}>
              <div>
                <div style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--text-2)'}}>Kill overhead</div>
                <div style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--text-3)', marginTop:1}}>
                  {overridden ? `custom · default ${defOvhd}s` : `default ${defOvhd}s · loot + roam`}
                </div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:7, flexShrink:0}}>
                <input type="number" min="0.5" max="15" step="0.5" value={curOvhd}
                  onChange={e=>{ const n = parseFloat(e.target.value); set && set('__setOverhead', isNaN(n)?null:n); }}
                  style={{width:68, padding:'4px 6px', fontFamily:'var(--mono)', fontSize:12, textAlign:'right',
                    background:'var(--bg-2)', color:'var(--text-0)', borderRadius:3,
                    border:`1px solid ${overridden?'color-mix(in oklab, var(--teal) 45%, var(--border-2))':'var(--border-2)'}`}} />
                <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)'}}>s</span>
                {overridden && (
                  <button type="button" onClick={()=> set && set('__setOverhead', null)} title="Reset to default"
                    style={{padding:'2px 6px', fontFamily:'var(--mono)', fontSize:10, cursor:'pointer', borderRadius:3,
                      border:'1px solid var(--border-2)', background:'var(--bg-2)', color:'var(--text-3)'}}>↺</button>
                )}
              </div>
            </div>
          );
        })()}
      </div>
      <div ref={useNativeWheelRef} className="scroll scroll-vis" style={{flex:1, overflow:'auto'}}>
        <table className="dense">
          <thead>
            <tr>
              <th>Item</th>
              <th className="right">Chance</th>
              <th className="right">Qty</th>
              <th className="right">Mkt gp</th>
              <th className="right">Alch gp</th>
              <th style={{width:220}}>EV gp/kill</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {drops.map((d,i)=>{
              // engine pre-resolves the default (non-dragon bones default to 'bury')
              const pref = d.pref ?? lootPrefs[d.name] ?? 'loot';
              const alchProfit = Math.max(0,(d.alchValue||0) - natCost);
              const isInactive = pref === 'skip' || pref === 'bury';
              const isBone = !!d.isBone;
              return (
              <tr key={i} style={{opacity: isInactive?0.55:1}}>
                <td style={{color: isInactive?'var(--text-3)':'var(--text-0)'}}>
                  {Array.isArray(d._expand) ? (
                    <button type="button" onClick={()=>toggleRow(d.name)}
                      style={{background:'none', border:'none', padding:0, cursor:'pointer', color:'inherit',
                        font:'inherit', display:'inline-flex', alignItems:'flex-start', gap:5}}>
                      <span style={{display:'inline-block', width:9, marginTop:2, color:'var(--text-3)', transform:expandedRows.has(d.name)?'rotate(90deg)':'none', transition:'transform .12s'}}>▸</span>
                      <span style={{display:'flex', flexDirection:'column', alignItems:'flex-start'}}>
                        <span>{d.name}</span>
                        <span style={{color:'var(--text-4)', fontSize:10, marginTop:1}}>({d._expand.length} items)</span>
                      </span>
                    </button>
                  ) : d.name}
                  {isBone && <span style={{marginLeft:6, color:'var(--violet)', fontSize:10}}>· {d.prayerXp}xp/bury</span>}
                  {d.tag === 'herb' && lootPrefs[d.name]==='unid' && (
                    <div style={{fontSize:9, color:'var(--teal)', marginTop:2}}>sold as unidentified · {herbUnidPrice}gp ea</div>
                  )}
                  {(d.tag === 'herb' || d.tag === 'gem') && pref==='value' && (
                    <div style={{fontSize:9, color:'var(--green)', marginTop:2}}>high-value only · rolls under {fmtInt(valueThreshold)}gp left on ground</div>
                  )}
                  {d._eaten && (
                    <div style={{fontSize:9, color:'var(--teal)', marginTop:2}}>eaten · saves food, no bank slot</div>
                  )}
                  {d.bulkDead && pref==='loot' && d.evGp>0 && (
                    <div style={{fontSize:9, color:'var(--teal)', marginTop:2}}>banked · high-alch value ({fmtInt(d.alchValue)}gp alch − nat rune)</div>
                  )}
                  {Array.isArray(d._expand) && expandedRows.has(d.name) && (
                    <div style={{marginTop:3, color:'var(--text-3)', fontSize:10, fontFamily:'var(--mono)', lineHeight:1.45, maxWidth:540}}>
                      {d._expand.map((e,j) => (
                        <span key={j}>
                          {j>0 && <span style={{color:'var(--text-4)'}}> · </span>}
                          <span style={{color:'var(--text-2)'}}>{e.name}</span>
                          <span style={{color:'var(--text-4)'}}> ({e.weight}w)</span>
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="right num">{fmtPct(d.chance)}</td>
                <td className="right num">×{d.qtyAvg}</td>
                <td className="right num">{fmtInt(d.price)}</td>
                <td className="right num" style={{color: alchProfit>d.price?'var(--green)':'var(--text-3)'}}>
                  {d.alchValue ? fmtInt(alchProfit) : '—'}
                </td>
                <td><div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div className="barwrap gold" style={{flex:1}}><div style={{width:`${d.evGp/maxEv*100}%`, background:'var(--gold)'}}/></div>
                  <span className="num" style={{color:'var(--gold)', minWidth:60, textAlign:'right'}}>{fmtInt(d.evGp)}</span>
                </div></td>
                <td onMouseEnter={()=>showHover(d, i)} onMouseLeave={()=>setHover(null)} style={{position:'relative'}}>
                  <div style={{display:'flex', gap:4}}>
                    {(!isBone || /dragon/i.test(d.name)) && prefBtn(d.name,'loot',pref==='loot','teal')}
                    {d.tag==='herb' ? prefBtn(d.name,'unid',pref==='unid','blue') : null}
                    {(d.tag==='herb'||d.tag==='gem') ? prefBtn(d.name,'value',pref==='value','green',`≥${fmtInt(valueThreshold)}`) : null}
                    {canAlch(d) ? prefBtn(d.name,'alch',pref==='alch','amber') : null}
                    {isBone ? prefBtn(d.name,'bury',pref==='bury','violet') : null}
                    {prefBtn(d.name,'skip',pref==='skip','red')}
                  </div>
                  {hover && hover.key===i && (
                    <div style={{position:'absolute', right:0, top:'100%', zIndex:30, marginTop:4,
                      background:'var(--bg-0)', border:'1px solid var(--border-3)', borderRadius:4,
                      padding:'7px 9px', minWidth:170, boxShadow:'0 6px 20px rgba(0,0,0,.45)'}}>
                      <div style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5}}>net gp/hr if…</div>
                      {hover.rows.map(r => (
                        <div key={r.action} style={{display:'flex', justifyContent:'space-between', gap:14,
                          fontFamily:'var(--mono)', fontSize:11, padding:'1px 0',
                          color: r.current?'var(--text-0)':'var(--text-2)'}}>
                          <span style={{textTransform:'capitalize'}}>{r.current?'▸ ':''}{r.action}</span>
                          <span>
                            <span style={{color: r.delta>0.5?'var(--green)':r.delta<-0.5?'var(--red)':'var(--text-3)'}}>
                              {r.net==null?'—':fmtK(r.net)}
                            </span>
                            {r.delta!=null && Math.abs(r.delta)>=0.5 && !r.current &&
                              <span style={{color: r.delta>0?'var(--green)':'var(--red)', marginLeft:6, fontSize:9.5}}>
                                {r.delta>0?'+':''}{fmtK(r.delta)}
                              </span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
              );
            })}
            <tr style={{borderTop:'1px solid var(--border-2)', background:'var(--bg-1)'}}>
              <td className="dim">— totals —</td>
              <td></td><td></td><td></td><td></td>
              <td className="num" style={{color:'var(--gold)', textAlign:'right'}}>{fmtInt(totalEv)} gp/kill</td>
              <td className="right num" style={{color:'var(--gold)'}}>{fmtK(result.gpPerHour)}/hr</td>
            </tr>
          </tbody>
        </table>
      </div>

      {result.prayerXpPerHour > 0 && (
        <div className="h-strip"><span className="title">Prayer XP from burying</span>
          <span className="meta" style={{color:'var(--violet)'}}>
            {fmt2(result.prayerXpPerKill)} xp/kill · {fmtK(result.prayerXpPerHour)} xp/hr
          </span>
        </div>
      )}

      {(() => {
        // ---- Loot value composition: where your gp actually comes from ----
        // Per-drop banked contribution, honouring each drop's keep/skip/alch
        // pref (matches how gp/kill is summed). Sorted, top contributors shown
        // as share-of-total bars; the long tail is grouped as "other".
        const contrib = (d) => {
          const pref = d.pref ?? lootPrefs[d.name] ?? 'loot';
          if (pref === 'skip' || pref === 'bury') return 0;
          if (pref === 'alch') return d.chance * d.qtyAvg * Math.max(0, (d.alchValue||0) - natCost);
          return d.evGp;   // loot / unid (evGp already adjusted for unid herbs)
        };
        const parts = drops.map(d => ({ name:d.name, tag:d.tag, gp:contrib(d),
            pref: d.pref ?? lootPrefs[d.name] ?? 'loot' }))
          .filter(p => p.gp > 0).sort((a,b)=>b.gp-a.gp);
        const total = parts.reduce((s,p)=>s+p.gp,0);
        if (total <= 0) return null;
        const TOP = 8;
        const head = parts.slice(0, TOP);
        const tail = parts.slice(TOP);
        const tailGp = tail.reduce((s,p)=>s+p.gp,0);
        const rows = [...head];
        if (tailGp > 0) rows.push({ name:`${tail.length} smaller drops`, gp:tailGp, _other:true });
        const palette = ['#e0a431','#d177c0','#5b8dd6','#e0763a','#6cba5a','#d96a5b','#c9b04a','#7a9ec2'];
        return (
          <>
            <div className="h-strip" onClick={toggleComp} style={{cursor:'pointer', userSelect:'none'}}>
              <span className="title">
                <span style={{display:'inline-block', width:12, color:'var(--text-3)', transition:'transform .15s', transform:compOpen?'rotate(90deg)':'none'}}>▸</span>
                Loot value composition
              </span>
              <span className="meta">{compOpen ? `share of ${fmtInt(total)} gp/kill banked` : `${rows.length} sources · click to expand`}</span>
            </div>
            {compOpen && (
            <div style={{padding:'10px 14px 14px', display:'grid', gap:7}}>
              {/* stacked proportion bar */}
              <div style={{display:'flex', height:10, borderRadius:3, overflow:'hidden', border:'1px solid var(--border-2)'}}>
                {rows.map((p,i)=>(
                  <div key={i} title={`${p.name} · ${fmtInt(p.gp)} gp`}
                    style={{width:`${p.gp/total*100}%`, background: p._other?'var(--text-4)':palette[i%palette.length]}} />
                ))}
              </div>
              {rows.map((p,i)=>(
                <div key={i} style={{display:'flex', alignItems:'center', gap:8, fontFamily:'var(--mono)', fontSize:10}}>
                  <span style={{width:9, height:9, borderRadius:2, flexShrink:0, background: p._other?'var(--text-4)':palette[i%palette.length]}} />
                  <span style={{flex:1, color: p._other?'var(--text-3)':'var(--text-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                    {p.name}{p.pref==='alch'?<span style={{color:'var(--amber)'}}> (alch)</span>:p.pref==='unid'?<span style={{color:'var(--blue)'}}> (unid)</span>:p.pref==='value'?<span style={{color:'var(--green)'}}> (value)</span>:null}
                  </span>
                  <span className="num" style={{color:'var(--gold)', minWidth:54, textAlign:'right'}}>{fmtInt(p.gp)}</span>
                  <span className="num" style={{color:'var(--text-2)', minWidth:42, textAlign:'right'}}>{(p.gp/total*100).toFixed(1)}%</span>
                  <span className="num" style={{color:'var(--text-3)', minWidth:62, textAlign:'right'}}>{fmtK(p.gp*result.killsPerHour)}/hr</span>
                </div>
              ))}
            </div>
            )}
          </>
        );
      })()}

    </div>
  );
}

// =======================================================================
// TRIP PANE — banking trip / inventory model controls
// =======================================================================
function TripPane({input, result, setTrip, setCannon}){
  const t = input.trip || {};
  const TM = window.TripModel;
  const FOOD = TM ? TM.FOOD : {};
  const trip = result.trip;
  const ct = input.combatType;
  const m = input.monster;
  // scarce-spot / AFK throttle state. sc = input settings; scRes = engine output.
  const sc = t.scarce || {};
  const scOn = !!sc.enabled;
  const scTargets = sc.targets ?? 2;
  const scRes = result.scarce;
  const respawnDef = (m && m.respawn) || 60;
  // The cannon's reach is the SAME per-monster cannon used by the Cannon tab —
  // one source of truth, surfaced here so it can be toggled inside scarce mode.
  const c0 = (input.cannonByMonster||{})[m?.id] || {};
  const cannonEnabled = !!c0.enabled;
  const protOpts = [['none','None'],['melee','Protect Melee'],['missiles','Protect Missiles'],['magic','Protect Magic']];

  const cell = { padding:'8px 10px', background:'var(--bg-1)', border:'1px solid var(--border-1)', borderRadius:3 };

  // ---- potion dosage recommendation -----------------------------------
  // A boost decays ~1 level/min and you re-pot when it reaches the threshold
  // (default peak−10). So repot interval ≈ min(10, boost) minutes. Over the
  // trip's active killing time you need ⌈killMin / interval⌉ doses per potion.
  const E = window.SimEngine;
  const potRec = (() => {
    if (!trip || !E) return null;
    const POT_STAT = {
      super_att:['att',input.attack], super_str:['str',input.strength], super_def:['def',input.defence],
      attack:['att',input.attack], strength:['str',input.strength], defence:['def',input.defence],
      ranging:['rng',input.ranged], magic:['mag',input.magic],
    };
    const dba = (input.boosts||[]).includes('dba_spec');
    let sel = (input.boosts||[]).filter(b => POT_STAT[b]);
    if (dba) sel = sel.filter(b => POT_STAT[b][0] !== 'str');  // str comes free from spec
    if (!sel.length) return null;
    const kpt = isFinite(trip.killsPerTrip) ? trip.killsPerTrip : null;
    if (kpt == null) return null;
    const killMin = (result.cycleSec || 0) * kpt / 60;       // active fighting min/trip
    // binding (shortest) repot interval across the selected potions
    let interval = Infinity;
    for (const b of sel){
      const [stat, base] = POT_STAT[b];
      const pf = E.POTIONS[b]?.fn;
      if (!pf) continue;
      const peak = Math.floor(pf(stat, base));
      const boost = peak - base;
      const thr = (input.repotThreshold != null)
        ? Math.max(base, Math.min(peak, input.repotThreshold))
        : Math.max(base, peak - 10);
      interval = Math.min(interval, Math.max(1, peak - thr || boost));
    }
    if (!isFinite(interval) || interval <= 0) interval = 10;
    const doses = Math.max(1, Math.ceil(killMin / interval));
    return { doses, interval, killMin, vials: Math.ceil(doses/4) };
  })();
  // Does the current carry match the recommendation?
  const recMatched = potRec && (t.singleDose
    ? (t.potionDoses ?? 4) === potRec.doses
    : (t.potionSets ?? 1) === potRec.vials);

  // ---- antifire dose recommendation -----------------------------------
  // One antifire dose lasts a FIXED 6 minutes (2004 mechanic), regardless of
  // stat-boost timers. Doses needed = ⌈active fighting minutes / 6⌉.
  const ANTIFIRE_MIN = 6;
  const antifireRec = (() => {
    if (!t.antifire || !trip || !(input.monster && input.monster.dragonfire)) return null;
    const kpt = isFinite(trip.killsPerTrip) ? trip.killsPerTrip : null;
    if (kpt == null) return null;
    const killMin = (result.cycleSec || 0) * kpt / 60;
    const doses = Math.max(1, Math.ceil(killMin / ANTIFIRE_MIN));
    return { doses, killMin, vials: Math.ceil(doses/4) };
  })();

  // ---- super-antipoison dose recommendation ---------------------------
  // One super-antipoison dose gives ~6 minutes of poison immunity (2004
  // mechanic). Doses needed = ⌈active fighting minutes / 6⌉. Skipped at
  // monsters that drop their own antipoison (you sustain it for free).
  const ANTIPOISON_MIN = 6;
  const antipoisonRec = (() => {
    const mo = input.monster;
    if (!t.antipoison || !trip || !(mo && mo.poisons) || mo.antipoisonFromDrops) return null;
    const kpt = isFinite(trip.killsPerTrip) ? trip.killsPerTrip : null;
    if (kpt == null) return null;
    const killMin = (result.cycleSec || 0) * kpt / 60;
    const doses = Math.max(1, Math.ceil(killMin / ANTIPOISON_MIN));
    return { doses, killMin, vials: Math.ceil(doses/4) };
  })();

  return (
    <div ref={useNativeWheelRef} className="scroll" style={{display:'flex', flexDirection:'column', overflow:'auto', minHeight:0}}>
      <div className="h-strip"><span className="title">Banking trip & inventory</span>
        <span className="meta">how often you bank drives effective xp/hr & gp/hr</span>
      </div>

      <div style={{padding:'14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        {/* Food */}
        <div style={{display:'flex', flexDirection:'column', gap:6}}>
          <div className="label-cap">Food</div>
          <select className="select" value={t.foodKey||'lobster'} onChange={e=>setTrip({foodKey:e.target.value})}>
            {Object.entries(FOOD).filter(([k])=>k!=='none').map(([k,v])=>
              <option key={k} value={k}>{v.name} · heals {v.heal}</option>)}
          </select>
          <div className="field">
            <label>Food brought (slots) · {t.foodCount==null?'auto':'manual'}</label>
            <input className="input" type="number" min="0"
              placeholder={`auto: ${trip?trip.slots.foodCount:0}`}
              value={t.foodCount??''}
              onChange={e=>setTrip({foodCount: e.target.value===''?null:Math.max(0,+e.target.value)})} />
          </div>
          {trip && (
            <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.5}}>
              {trip.incoming.safespot
                ? 'safespotted — no incoming damage → 0 food'
                : trip.foodPerKill<=0
                ? `regen out-heals damage (${trip.incoming.regenPerKill.toFixed(1)} hp/kill ≥ ${trip.incoming.hpPerKill.toFixed(1)} taken) → 0 food`
                : `${trip.incoming.hpPerKill.toFixed(1)} taken − ${trip.incoming.regenPerKill.toFixed(1)} regen → ${trip.foodPerKill.toFixed(2)} ${trip.foodName.toLowerCase()}/kill`}
            </div>
          )}
        </div>
        {/* Potions + bank */}
        <div style={{display:'flex', flexDirection:'column', gap:6}}>
          <div className="label-cap">Potions & banking</div>
          <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none', fontFamily:'var(--mono)', fontSize:11, color:'var(--text-2)'}}>
            <input type="checkbox" checked={!!t.singleDose} onChange={e=>setTrip({singleDose:e.target.checked})} />
            Single-dose potions (drop vials)
          </label>
          {t.singleDose
            ? <NumField label="Doses per potion type" v={t.potionDoses??4} onChange={v=>setTrip({potionDoses:Math.max(0,v)})} />
            : <NumField label="Vials per type (4-dose)" v={t.potionSets??1} onChange={v=>setTrip({potionSets:Math.max(0,v)})} />}
          {trip && (
            <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.5}}>
              {trip.slots.potionTypes
                ? `${trip.slots.potionTypes} potion${trip.slots.potionTypes>1?'s':''} × ${trip.slots.singleDose?`${trip.slots.potionDoses} dose`:`${trip.slots.potionSets} vial`}`
                : 'no super potions selected'}
              {' = '}<span style={{color:'var(--text-1)'}}>{trip.slots.potionSlots} slot{trip.slots.potionSlots===1?'':'s'}</span>
              {trip.slots.potionParts.length ? ` (${trip.slots.potionParts.join(' + ')})` : ''}
              {trip.potionCostPerTrip>0 ? <span> · ~{fmtK(trip.potionCostPerTrip)} gp/trip</span> : null}
            </div>
          )}
          {potRec && (
            <div style={{padding:'7px 9px', borderRadius:3, border:'1px solid '+(recMatched?'var(--border-2)':'color-mix(in oklab, var(--amber) 45%, var(--border-2))'),
              background: recMatched?'var(--bg-1)':'color-mix(in oklab, var(--amber) 10%, var(--bg-1))',
              fontFamily:'var(--mono)', fontSize:10, color:'var(--text-2)', lineHeight:1.5}}>
              <span style={{color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px'}}>Recommended</span>{' '}
              <span style={{color:'var(--text-1)'}}>{potRec.doses} dose{potRec.doses===1?'':'s'}</span> per potion
              {' '}({t.singleDose?`${potRec.doses} single`:`${potRec.vials} × (4)-vial`}) — {potRec.killMin.toFixed(0)}min trip, repot every {potRec.interval}min.
              {!recMatched && (
                <button type="button"
                  onClick={()=>setTrip(t.singleDose?{potionDoses:potRec.doses}:{potionSets:potRec.vials})}
                  style={{marginLeft:6, padding:'2px 8px', fontFamily:'var(--mono)', fontSize:10, cursor:'pointer',
                    borderRadius:3, border:'1px solid color-mix(in oklab, var(--amber) 45%, var(--border-2))',
                    background:'color-mix(in oklab, var(--amber) 14%, var(--bg-2))', color:'var(--amber)'}}>
                  apply
                </button>
              )}
              {potRec.doses<=2 && !t.singleDose && (
                <span style={{color:'var(--text-3)'}}> · short trip — single-dose may save gp.</span>
              )}
            </div>
          )}
          <div className="field">
            <label>Bank time (seconds) · {t.bankSeconds==null?'auto':'manual'}</label>
            <input className="input" type="number" min="0" step="5"
              placeholder={`auto: ${trip?trip.bankSeconds:0}`}
              value={t.bankSeconds??''}
              onChange={e=>setTrip({bankSeconds: e.target.value===''?null:Math.max(0,+e.target.value)})} />
          </div>
        </div>
      </div>

      <div style={{padding:'0 14px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          <div className="label-cap">Protection prayer</div>
          <select className="select" value={t.protect||'none'} onChange={e=>setTrip({protect:e.target.value})}>
            {protOpts.map(([k,l])=> <option key={k} value={k}>{l}</option>)}
          </select>
          <Toggle label={`Safespot${t.safespot==null?' (auto)':''}`}
                  subOn="no incoming damage" subOff="taking hits" color="teal"
                  value={trip?!!trip.incoming.safespot:false}
                  onChange={v=>setTrip({safespot:v})} />
          <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)'}}>
            Ranged, magic & halberds safespot by default (attack from behind an
            obstacle — no hits, no dragonfire). Protection blocks that style's
            damage when fighting in the open.
          </div>
          {input.monster && input.monster.dragonfire && (
            <>
              <Toggle label="Antifire potion" subOn="negates dragonfire (full w/ shield)" subOff="no antifire" color="amber"
                      value={!!t.antifire} onChange={v=>setTrip({antifire:v})} />
              {trip && !trip.incoming.safespot && (
                <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)'}}>
                  Dragonfire chip: {trip.incoming.dragonfire} hp/kill
                  {t.antifire && (input.gear?.shield==='anti_dragon') ? ' — immune (potion + shield)' :
                   t.antifire ? ' — potion only (equip anti-dragon shield for full immunity)' :
                   (input.gear?.shield==='anti_dragon') ? ' — shield only (add antifire for full immunity)' : ''}
                </div>
              )}
              {antifireRec && (
                <div style={{padding:'6px 8px', borderRadius:3,
                  border:'1px solid color-mix(in oklab, var(--amber) 30%, var(--border-2))',
                  background:'color-mix(in oklab, var(--amber) 8%, var(--bg-1))',
                  fontFamily:'var(--mono)', fontSize:10, color:'var(--text-2)', lineHeight:1.5}}>
                  <span style={{color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px'}}>Antifire</span>{' '}
                  bring <span style={{color:'var(--text-1)'}}>{antifireRec.doses} dose{antifireRec.doses===1?'':'s'}</span>
                  {' '}({antifireRec.vials} × (4)-vial) — {antifireRec.killMin.toFixed(0)}min trip, 6min/dose.
                </div>
              )}
            </>
          )}
          {input.monster && input.monster.poisons && (
            <>
              {input.monster.antipoisonFromDrops ? (
                <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.5}}>
                  Poisons you, but drops antipoison — you sustain immunity from
                  its own drops, so no antipoison supply is needed (only matters
                  when fighting in the open, not safespotting).
                </div>
              ) : (
                <>
                  <Toggle label="Super antipoison" subOn="immune to poison" subOff="taking poison damage" color="teal"
                          value={!!t.antipoison} onChange={v=>setTrip({antipoison:v})} />
                  {trip && !trip.incoming.safespot && (
                    <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)'}}>
                      Poison chip: {t.antipoison ? '0 hp/kill (immune)' : `${input.monster.poisonMax ?? 5} hp/kill`}
                      {' '}— a DoT that protection prayers don't block; super-antipoison negates it.
                    </div>
                  )}
                  {trip && trip.incoming.safespot && (
                    <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)'}}>
                      Safespotted — no poison taken, antipoison not needed.
                    </div>
                  )}
                  {antipoisonRec && (
                    <div style={{padding:'6px 8px', borderRadius:3,
                      border:'1px solid color-mix(in oklab, var(--teal) 30%, var(--border-2))',
                      background:'color-mix(in oklab, var(--teal) 8%, var(--bg-1))',
                      fontFamily:'var(--mono)', fontSize:10, color:'var(--text-2)', lineHeight:1.5}}>
                      <span style={{color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px'}}>Antipoison</span>{' '}
                      bring <span style={{color:'var(--text-1)'}}>{antipoisonRec.doses} dose{antipoisonRec.doses===1?'':'s'}</span>
                      {' '}({antipoisonRec.vials} × (4)-vial) — {antipoisonRec.killMin.toFixed(0)}min trip, 6min/dose.
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          <div className="label-cap">Inventory reserve</div>
          <Toggle label="Teleport item (glory)" subOn="1 slot" subOff="banking on foot" color="teal"
                  value={t.teleport!==false} onChange={v=>setTrip({teleport:v})} />
          {/* High-alch loot moved to the Loot tab — it's a per-monster decision
              and needs the main reducer (TripPane only has setTrip). */}
          {ct==='ranged' && (
            <Toggle label="Recover ammo" subOn="pick up grounded ammo · lose 1/5" subOff="leave it · pay full" color="teal"
                    value={t.recoverAmmo!==false} onChange={v=>setTrip({recoverAmmo:v})} />
          )}
          {input.boosts && input.boosts.includes('dba_spec') && input.combatType==='melee' && (
            <Toggle label="DBA restore potion" subOn="1 slot — restores att/def" subOff="str boost only (no restore)" color="violet"
                    value={t.dbaRestore!==false} onChange={v=>setTrip({dbaRestore:v})} />
          )}
          {ct==='magic' && <NumField label="Combat rune slots" v={t.runeSlots??2} onChange={v=>setTrip({runeSlots:Math.max(0,v)})} />}
        </div>
      </div>

      {/* ---- Scarce spot / AFK throttle ----------------------------------
          Default OFF = monsters never run out. ON = you only fight a few
          spawns, so kills/hr is capped by ttk + respawn. Cannon can be added
          and may reach more targets than you do in melee. */}
      <div className="h-strip"><span className="title">Scarce spot / AFK</span>
        <span className="meta">cap kills by how fast a few targets respawn</span>
      </div>
      <div style={{padding:'14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          <Toggle label="Limited targets" color="amber"
            subOn={`only ${scTargets} mob${scTargets===1?'':'s'} reachable — wait for respawns`}
            subOff="monsters never run out (default)"
            value={scOn} onChange={v=>setTrip({scarce:{...sc, enabled:v, targets:scTargets}})} />
          {scOn && (
            <>
              <NumField label="Targets you fight (melee / range / mage)" v={scTargets} step={1}
                onChange={v=>setTrip({scarce:{...sc, enabled:true, targets:Math.max(1,Math.min(50,Math.round(v)))}})} />
              <div className="field">
                <label>Respawn / mob (sec){m && m.respawnVerified?' \u2713':''}</label>
                <input className="input" type="number" min="1"
                  placeholder={`default ${respawnDef}`}
                  value={sc.respawnSec ?? ''}
                  onChange={e=>setTrip({scarce:{...sc, enabled:true, respawnSec: e.target.value===''?null:Math.max(1,+e.target.value)}})} />
              </div>
            </>
          )}
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {scOn ? (
            <>
              <Toggle label="Cannon at this spot" color="teal"
                subOn="adds parallel fire over its own reach" subOff="no cannon — your hits only"
                value={cannonEnabled}
                onChange={v=>setCannon({enabled:v, ...(v && c0.targets==null ? {targets:Math.max(1,Math.min(8,scTargets))} : {})})} />
              {cannonEnabled && (
                <NumField label="Cannon reaches (targets, max 8)" v={c0.targets ?? 3} step={1}
                  onChange={v=>setCannon({targets:Math.max(1,Math.min(8,Math.round(v)))})} />
              )}
              {scRes && (
                <div style={{padding:'8px 10px', borderRadius:3,
                  border:'1px solid color-mix(in oklab, var(--amber) 30%, var(--border-2))',
                  background:'color-mix(in oklab, var(--amber) 8%, var(--bg-1))',
                  fontFamily:'var(--mono)', fontSize:10, color:'var(--text-2)', lineHeight:1.6}}>
                  <span style={{color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px'}}>Throttle</span>{' '}
                  solo {fmtInt(scRes.kphSolo)}/hr → <span style={{color:'var(--text-1)'}}>{fmtInt(scRes.kph)}/hr</span>
                  {scRes.respawnBound
                    ? ` — respawn-bound, idle ${fmtPct(1-scRes.activeFrac)} of the time`
                    : ' — not respawn-bound (a target is always up)'}
                  {cannonEnabled && <>{' · '}cannon reaches {c0.targets ?? 3}, you reach {scTargets}.</>}
                </div>
              )}
            </>
          ) : (
            <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.6}}>
              Turn this on for AFK / scarce spots (rock crabs, moss giants, a small
              cluster of mobs) where you can only reach a couple of monsters and
              must wait for them to respawn. Off = the default assumption that a
              fresh target is always available, so kills/hr is limited only by
              your kill speed and banking.
            </div>
          )}
        </div>
      </div>

      <div className="h-strip"><span className="title">Food per kill</span>
        <span className="meta">{t.foodPerKillOverride!=null&&t.foodPerKillOverride!==''?'manual override':'auto from incoming damage'}</span>
      </div>
      <div style={{padding:'10px 14px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, alignItems:'end'}}>
        <MiniMetric k="Incoming dmg/kill" v={trip?`${trip.incoming.hpPerKill.toFixed(1)} hp`:'—'} />
        <MiniMetric k="Auto food/kill" v={trip?`${(trip.incoming.netHpPerKill/(trip.foodHeal||1)).toFixed(2)}`:'—'} />
        <div className="field">
          <label>Override food/kill (blank = auto)</label>
          <input className="input" type="number" step="0.05"
            value={t.foodPerKillOverride??''} placeholder="auto"
            onChange={e=>setTrip({foodPerKillOverride: e.target.value===''?null:+e.target.value})} />
        </div>
      </div>

      {trip && (
        <>
          <div className="h-strip"><span className="title">Trip outcome</span>
            <span className="meta" style={{color: trip.bound==='overfull'?'var(--amber)':trip.bound==='food'?'var(--amber)':trip.bound==='loot'?'var(--teal)':trip.bound==='prayer'?'var(--teal)':'var(--text-3)'}}>
              {trip.bound==='overfull'?'pack fills early — drops missed':trip.bound==='food'?'food-bound (banks with space left)':trip.bound==='loot'?'inventory-bound':trip.bound==='prayer'?'prayer-bound (out of prayer first)':'no banking needed'}
            </span>
          </div>
          <div style={{padding:'10px 14px', display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10}}>
            <MiniMetric k="Kills / trip" v={isFinite(trip.killsPerTrip)?fmtInt(trip.killsPerTrip):'∞'} />
            <MiniMetric k="Trip length"  v={isFinite(trip.tripMinutes)?`${trip.tripMinutes.toFixed(0)} min`:'—'} />
            <MiniMetric k="Efficiency"   v={fmtPct(result.tripEfficiency)} />
            <MiniMetric k="Loot capacity" v={`${Math.round(trip.slots.lootCapacity)} / ${trip.slots.inv}`} />
            <MiniMetric k="Loot slots / kill" v={trip.slots.nonStackPerKill.toFixed(2)} />
            <MiniMetric k="Stackables held" v={`${trip.slots.stackReserve.toFixed(1)} slot${trip.slots.stackReserve>=1.5||trip.slots.stackReserve<1?'s':''}`} />
          </div>
          <div style={{padding:'0 14px 8px', fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.6}}>
            Locked all trip: {trip.slots.reserveParts.length?trip.slots.reserveParts.join(' · '):'none'}
            {' + '}{trip.slots.stackReserve.toFixed(1)} stackable = {Math.round(trip.slots.inv - trip.slots.lootCapacity)} slots.
            {' '}Food ({trip.slots.foodCount}) & potion vials ({trip.slots.potionSlots}) convert to loot as consumed.
          </div>
          {/* End-of-trip pack state — the goal: bank with a FULL pack of loot */}
          <div style={{margin:'0 14px 10px', padding:'8px 10px', borderRadius:3,
            border:'1px solid '+(trip.lootFraction<0.98?'var(--amber)':'var(--border-2)'),
            background:'var(--bg-1)', fontFamily:'var(--mono)', fontSize:10,
            color:'var(--text-2)', lineHeight:1.6}}>
            <span style={{color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px'}}>You bank with</span>{' '}
            ≈{Math.round(trip.slots.lootSlotsAtEnd)} slots of loot
            {trip.slots.stackReserve>=0.5?` + ${Math.round(trip.slots.stackReserve)} stackable`:''}
            {trip.slots.reserveParts.length?` + ${trip.slots.reserveParts.join(' + ')}`:''}
            {trip.lootFraction<0.98
              ? <span style={{color:'var(--amber)'}}>{' '}— pack fills early, ≈{Math.round((1-trip.lootFraction)*100)}% of drops missed; auto food suggests {trip.slots.autoFoodCount}.</span>
              : trip.bound==='loot' ? ' — full pack of loot.'
              : trip.bound==='food' ? ` — banks with ${Math.max(0,Math.round(trip.slots.lootCapacity-trip.slots.lootSlotsAtEnd))} slots unused; auto food suggests ${trip.slots.autoFoodCount}.`
              : ''}
          </div>
          <div style={{padding:'0 14px 16px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10}}>
            <MiniMetric k="Effective xp/hr" v={fmtK(result.effectiveXpPerHour)} />
            <MiniMetric k="Effective net gp/hr" v={fmtK(result.effectiveNetGpPerHour)} />
            <MiniMetric k="Supplies / hr" v={fmtK(result.supplyCostPerKill*result.effectiveKph)} />
          </div>
          {input.combatType==='ranged' && result.ammoKeyUsed && (
            <div style={{padding:'0 14px 16px', fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.6}}>
              Ammo: ~{fmtInt(result.ammoPerKill*result.effectiveKph)} {(window.SimEngine.ARROWS[result.ammoKeyUsed]?.name||'ammo').toLowerCase()}/hr lost
              ({(t.recoverAmmo!==false)?'recovering 4/5':'no recovery'}) · {fmtK(result.ammoCostPerKill*result.effectiveKph)} gp/hr
            </div>
          )}
          {result.trip.prayerActive && (
            <div style={{padding:'0 14px 16px', fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.6}}>
              Prayer: drains ~{fmtInt(result.prayerPointsPerHour)} pts/hr
              ({result.prayerDrainRate}/tick{(t.protect&&t.protect!=='none')?`, incl. protect-from-${t.protect}`:''}) ·
              {' '}{fmtK(result.trip.prayerCostPerKill*result.effectiveKph)} gp/hr on prayer potions
              {result.trip.bound==='prayer' ? ' · prayer runs out first — bank early' : ''}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// =======================================================================
// CANNON PANE — Dwarf multicannon overlay on the current monster
// Models the cannon as a second attacker that borrows YOUR equipped-weapon
// hit roll for accuracy (the quirk), deals a flat 0–30 (avg 15), gives 2
// Ranged xp/dmg, and fires into however many targets stand in the spot — an
// occupancy that's throttled by how fast the combined damage clears them.
// =======================================================================
function CannonPane({input, simInput, result, setCannon}){
  const m = input.monster;
  const c0 = (input.cannonByMonster||{})[m.id] || {};
  const enabled = !!c0.enabled;
  const targets = c0.targets ?? 3;
  const respawnDef = m.respawn ?? 60;
  const c = result.cannon;                 // engine output (only when enabled & killDps>0)
  const ct = input.combatType;
  const ballPrice = (window.GameData?.ITEM_PRICES?.mcannonball) ?? 180;

  const cell = { padding:'8px 10px', background:'var(--bg-1)', border:'1px solid var(--border-1)', borderRadius:3 };
  const rollLabel = ct==='ranged' ? 'your Ranged attack roll'
    : ct==='magic' ? 'your Magic attack roll'
    : 'your melee weapon\u2019s attack roll';
  const defLabel = ct==='ranged' ? 'Ranged defence'
    : ct==='magic' ? 'Magic defence' : 'melee defence';

  return (
    <div style={{flex:1, overflowY:'auto'}}>
      <div className="h-strip">
        <span className="title">Dwarf multicannon</span>
        <span className="meta">
          <span style={{color:'var(--gold)'}}>cannonball {fmtInt(ballPrice)} gp</span>
          <span style={{color:'var(--text-3)'}}>{' · '}</span>
          <span style={{color: enabled ? 'var(--violet)' : 'var(--text-3)'}}>
            {enabled ? (c && !c.idle ? `${fmtK(c.ballsPerHour)} balls/hr` : 'idle — spot too sparse') : 'off'}
          </span>
        </span>
      </div>

      <div style={{padding:'12px 14px', display:'grid', gap:14}}>
        {/* ---- enable + spot inputs ---- */}
        <div style={{display:'grid', gridTemplateColumns:'minmax(0,1.3fr) 1fr 1fr', gap:12, alignItems:'end'}}>
          <Toggle label="Set up cannon" color="violet"
            subOn="4 parts + balls (5 inv slots) — fires alongside you"
            subOff="no cannon — solo combat only"
            value={enabled} onChange={v=>setCannon({enabled:v})} />
          <NumField label="Targets at spot (max)" v={targets} step={1}
            onChange={v=>setCannon({targets:Math.max(1, Math.min(8, Math.round(v)))})} />
          <div className="field">
            <label>Respawn / mob (sec)</label>
            <input className="input" type="number" step="1"
              placeholder={`default ${respawnDef}${m.respawnVerified?' \u2713':''}`}
              value={c0.respawnSec ?? ''}
              onChange={e=>setCannon({respawnSec: e.target.value===''?null:Math.max(1,+e.target.value)})} />
          </div>
        </div>

        <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.6, marginTop:-4}}>
          The cannon sweeps 8 octants, one tick (0.6s) each, firing at most one ball per
          tick into an octant that holds a mob. <span style={{color:'var(--text-2)'}}>Max</span> is
          the spawns the spot can hold (cap 8); the cannon rarely sees all of them at once
          because kills outrun respawns — the <span style={{color:'var(--violet)'}}>effective</span> count
          below is what actually gets hit.
        </div>

        {/* ---- accuracy callout (the quirk) ---- */}
        <div style={{padding:'10px 12px', borderRadius:3,
          border:'1px solid color-mix(in oklab, var(--violet) 45%, var(--border-2))',
          background:'color-mix(in oklab, var(--violet) 7%, var(--bg-1))'}}>
          <div style={{fontFamily:'var(--mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em',
            color:'var(--violet)', marginBottom:4}}>How cannon accuracy works</div>
          <div style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--text-2)', lineHeight:1.6}}>
            A cannonball deals a flat <b style={{color:'var(--text-1)'}}>0–30</b> (avg 15) — no Ranged
            level, gear or potion scaling. Its <b style={{color:'var(--text-1)'}}>hit chance is {rollLabel}</b>{' '}
            (your currently-equipped weapon &amp; stance) vs this monster&rsquo;s {defLabel} — so your{' '}
            {ct} setup on the {ct==='melee'?'Melee':ct==='ranged'?'Ranged':'Magic'} tab drives it.
            Right now that lands <b style={{color:'var(--violet)'}}>{fmtPct(result.hitChance)}</b>, for
            an effective <b style={{color:'var(--text-1)'}}>{fmt2(result.hitChance*15)}</b> dmg/ball.
            Each ball is spent whether it hits or misses; cannon damage gives 2 Ranged xp and no HP xp.
          </div>
        </div>

        {!enabled && (
          <div style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--text-3)', padding:'4px 2px'}}>
            Enable the cannon to fold it into kills/hr, xp/hr and gp/hr on the Stats tab.
          </div>
        )}

        {enabled && (!c || c.idle) && (
          <div style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--amber)', padding:'4px 2px', lineHeight:1.6}}>
            Cannon idle — at {targets} target{targets===1?'':'s'} / {c0.respawnSec ?? respawnDef}s you
            clear this spot solo faster than it repopulates, so nothing stands long enough for the
            cannon to shoot. It won&rsquo;t speed you up here: pick a busier spot (more targets / faster
            respawn) or a tougher mob. Your kills/hr is unchanged from solo.
          </div>
        )}

        {enabled && c && !c.idle && (
          <>
            <div className="h-strip"><span className="title">Cannon output</span>
              <span className="meta">{fmt1(c.effTargets)} of {c.targets} targets hit on average</span>
            </div>
            <div style={{padding:'4px 0', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10}}>
              <MiniMetric k="Effective targets" v={fmt1(c.effTargets)} />
              <MiniMetric k="Cannon DPS" v={fmt2(c.cannonDps)} />
              <MiniMetric k="Balls / hr" v={fmtK(c.ballsPerHour)} />
              <MiniMetric k="Balls / kill" v={fmt2(c.ballsPerKill)} />
              <MiniMetric k="Cannon Ranged xp/hr" v={fmtK(c.rangedXpPerHour)} />
              <MiniMetric k="Ball cost / hr" v={`-${fmtK(c.ballCostPerHour)}`} />
              <MiniMetric k="Ball cost / kill" v={`-${fmtInt(c.ballCostPerKill)}`} />
              <MiniMetric k="Ball price" v={fmtInt(c.ballPrice)} />
            </div>

            <div className="h-strip"><span className="title">Kills / hr uplift</span>
              <span className="meta" style={{color:'var(--green)'}}>
                {c.kphNoCannon>0 ? `+${fmtPct(c.kphWithCannon/c.kphNoCannon - 1)}` : '—'} vs solo
              </span>
            </div>
            <div style={{padding:'4px 0', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10}}>
              <MiniMetric k="Solo kills/hr" v={fmtInt(c.kphNoCannon)} />
              <MiniMetric k="With cannon" v={fmtInt(result.killsPerHour)} />
              <MiniMetric k="Your share of dmg" v={fmtPct(c.activeFrac * c.playerDps / Math.max(1e-9, c.activeFrac * c.playerDps + c.cannonDps))} />
            </div>

            {c.respawnBound && (
              <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--amber)', lineHeight:1.6}}>
                Respawn-bound: at this DPS you and the cannon out-damage the spawns, so you spend
                part of each cycle idle waiting for mobs. More targets / faster respawn would let
                you (and the cannon) work the full time.
              </div>
            )}

            {/* balls to bring */}
            {result.trip && (
              <>
                <div className="h-strip"><span className="title">Cannonballs to bring</span>
                  <span className="meta">stackable — 1 inv slot</span></div>
                <div style={{padding:'4px 0', display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10}}>
                  <MiniMetric k="Per trip"
                    v={c.ballsPerTrip!=null && isFinite(c.ballsPerTrip) ? fmtInt(c.ballsPerTrip) : '—'} />
                  <MiniMetric k="Ball gp / trip"
                    v={c.ballCostPerTrip!=null && isFinite(c.ballCostPerTrip) ? `-${fmtK(c.ballCostPerTrip)}` : '—'} />
                </div>
                <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.6}}>
                  Cannon reserves 5 inventory slots (4 parts + balls), already folded into the Trip
                  tab&rsquo;s loot capacity. Balls are charged as a supply cost in net gp/hr, so a
                  pricey spot can swing the cannon from profit to loss — watch the ball cost/hr above.
                </div>
              </>
            )}

            <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.6, marginTop:2}}>
              Respawn for {m.name}: <span style={{color:'var(--text-2)'}}>{respawnDef}s</span>{' '}
              {m.respawnVerified
                ? '\u2014 sourced from the npc config.'
                : '\u2014 standard 100-tick default (not individually verified for this monster); set the exact value above if you know it.'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// =======================================================================
// DUEL PANE — side-by-side setup comparison on the current monster
// =======================================================================
function DuelPane({input, set}){
  const m = input.monster;
  const setups = input.duelSetups || [];

  // Simulate every setup against the CURRENT monster. Per-monster autos
  // (bank time, food count, food/kill override) are re-derived so each setup
  // is judged fairly on this target, not on whatever monster it was saved on.
  const rows = useMemo(() => {
    const live = { name:'Live loadout', live:true, r:E.simulate(input) };
    const snaps = setups.map((d,i) => ({
      name:d.name, i,
      r:E.simulate({...input, ...d.setup, monster:m, cannon:null,
        trip:{...(d.setup.trip||{}), bankSeconds:null, foodCount:null, foodPerKillOverride:null, scarce:null}}),
      setup:d.setup,
    }));
    return [live, ...snaps];
  }, [input, setups, m]);

  const best = (key) => Math.max(...rows.map(x => x.r[key] || 0));
  const bestXp = best('effectiveXpPerHour'), bestGp = best('effectiveNetGpPerHour');
  const bestGpXp = Math.max(...rows.map(x => { const g = gpPerXp(x.r); return g == null ? -Infinity : g; }));

  const rename = (i, name) => set('duelSetups', setups.map((d,j)=> j===i ? {...d, name} : d));
  const remove = (i) => set('duelSetups', setups.filter((_,j)=>j!==i));
  const snapshot = () => set('duelSetups', [...setups,
    { name:`${input.weaponName || 'Setup'} ${setups.length+1}`, setup:pickSetup(input) }]);

  const loadoutLabel = (s) => {
    const bits = [s.combatType, s.weaponName].filter(Boolean);
    const pr = (s.prayers||[]).filter(p=>p!=='none');
    const bo = (s.boosts||[]).filter(b=>b!=='none');
    if (pr.length) bits.push(`${pr.length} prayer${pr.length>1?'s':''}`);
    if (bo.length) bits.push(bo.includes('dba_spec')?'DBA':`${bo.length} pot`);
    if (s.trip?.singleDose) bits.push('1-dose');
    return bits.join(' · ');
  };

  return (
    <div ref={useNativeWheelRef} className="scroll" style={{display:'flex', flexDirection:'column', overflow:'auto', minHeight:0}}>
      <div className="h-strip">
        <span className="title">Setup duel · {m.name}</span>
        <span className="meta">snapshots re-simulated on this target · autos re-derived</span>
      </div>

      <div style={{padding:'10px 14px', display:'flex', gap:10, alignItems:'center'}}>
        <button type="button" onClick={snapshot}
          style={{padding:'6px 14px', fontFamily:'var(--mono)', fontSize:11, cursor:'pointer', borderRadius:3,
            border:'1px solid color-mix(in oklab, var(--teal) 45%, var(--border-2))',
            background:'color-mix(in oklab, var(--teal) 14%, var(--bg-2))', color:'var(--teal)'}}>
          + snapshot live loadout
        </button>
        <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)'}}>
          Tweak the live loadout, snapshot it, tweak again — then compare. Snapshots persist.
        </span>
      </div>

      <div style={{padding:'0 14px 16px'}}>
        <table className="table" style={{width:'100%'}}>
          <thead>
            <tr>
              <th style={{whiteSpace:'nowrap'}}>Setup</th>
              <th style={{whiteSpace:'nowrap'}}>Loadout</th>
              <th className="right">Max</th>
              <th className="right">DPS</th>
              <th className="right">Hit %</th>
              <th className="right">K/trip</th>
              <th className="right">Eff XP/hr</th>
              <th className="right">Eff net GP/hr</th>
              <th className="right">GP / XP</th>
              <th className="right">Supplies/hr</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const r = row.r;
              const isBestXp = r.effectiveXpPerHour >= bestXp - 0.5 && rows.length > 1;
              const isBestGp = r.effectiveNetGpPerHour >= bestGp - 0.5 && rows.length > 1;
              const gpXp = gpPerXp(r);
              const isBestGpXp = gpXp != null && isFinite(bestGpXp) && gpXp >= bestGpXp - 1e-6 && rows.length > 1;
              const src = row.live ? input : row.setup;
              return (
                <tr key={row.live ? '__live' : row.i}
                    style={{background: row.live ? 'color-mix(in oklab, var(--teal) 6%, transparent)' : undefined}}>
                  <td style={{whiteSpace:'nowrap'}}>
                    {row.live
                      ? <span style={{color:'var(--teal)'}}>▸ Live loadout</span>
                      : <input className="input" value={row.name}
                          onChange={e=>rename(row.i, e.target.value)}
                          style={{width:130, padding:'2px 6px', fontSize:11}} />}
                  </td>
                  <td style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', whiteSpace:'nowrap'}}>{loadoutLabel(src)}</td>
                  <td className="right num">{fmtInt(r.maxHit)}</td>
                  <td className="right num">{fmt2(r.dps)}</td>
                  <td className="right num">{fmtPct(r.hitChance)}</td>
                  <td className="right num">{r.trip && isFinite(r.trip.killsPerTrip) ? fmtInt(r.trip.killsPerTrip) : '∞'}</td>
                  <td className="right num" style={{color: isBestXp ? 'var(--amber)' : undefined, fontWeight: isBestXp ? 600 : 400}}>
                    {fmtK(r.effectiveXpPerHour)}{isBestXp ? ' ★' : ''}</td>
                  <td className="right num" style={{color: isBestGp ? 'var(--gold)' : undefined, fontWeight: isBestGp ? 600 : 400}}>
                    {fmtK(r.effectiveNetGpPerHour)}{isBestGp ? ' ★' : ''}</td>
                  <td className="right num" style={{color: isBestGpXp ? 'var(--green)' : (gpXp != null && gpXp < 0 ? 'var(--text-3)' : undefined), fontWeight: isBestGpXp ? 600 : 400}}>
                    {fmtGpXp(gpXp)}{isBestGpXp ? ' ★' : ''}</td>
                  <td className="right num">{fmtK(r.supplyCostPerKill * r.effectiveKph)}</td>
                  <td style={{whiteSpace:'nowrap', textAlign:'right'}}>
                    {!row.live && <>
                      <button type="button" title="Load into the live editor"
                        onClick={()=>set('__applySetup', row.setup)}
                        style={{padding:'2px 8px', marginRight:4, fontFamily:'var(--mono)', fontSize:10, cursor:'pointer',
                          borderRadius:3, border:'1px solid var(--border-2)', background:'var(--bg-2)', color:'var(--text-2)'}}>
                        load
                      </button>
                      <button type="button" title="Delete snapshot"
                        onClick={()=>remove(row.i)}
                        style={{padding:'2px 7px', fontFamily:'var(--mono)', fontSize:10, cursor:'pointer',
                          borderRadius:3, border:'1px solid var(--border-2)', background:'var(--bg-2)', color:'var(--text-3)'}}>
                        ✕
                      </button>
                    </>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {setups.length===0 && (
          <div style={{padding:'18px 0', fontFamily:'var(--mono)', fontSize:11, color:'var(--text-3)'}}>
            No snapshots yet. Set up a loadout (gear, prayers, potions, trip), hit
            “+ snapshot live loadout”, then change things and snapshot again to duel them.
          </div>
        )}
      </div>
    </div>
  );
}

// =======================================================================
// MONSTER CARD — right rail on workbench
// =======================================================================
function MonsterCard({input, set}){
  const m = input.monster;
  const hasCustom = !!(input.monsterSetups||{})[m.id];
  const [monLootQ, setMonLootQ] = useState('');
  const monFiltered = !!monLootQ;
  // Name search now lives inside the SearchSelect combobox (type-to-filter,
  // like the gear pickers); the loot box is a secondary filter that narrows
  // which monsters the combobox offers.
  const visMonsters = useMemo(() => E.MONSTERS.filter(x => matchLoot(x, monLootQ)), [monLootQ]);
  const monOptions = useMemo(() => {
    const opts = visMonsters.map(x => ({
      key: x.id,
      label: x.name + ((input.monsterSetups||{})[x.id] ? ' \u25cf' : ''),
      hint: `lvl ${x.level} \u00b7 ${x.hp} HP`,
    }));
    // Keep the current target selectable even if the loot filter excludes it.
    if (!visMonsters.find(x => x.id === m.id))
      opts.unshift({ key:m.id, label:m.name, hint:`lvl ${m.level} \u00b7 ${m.hp} HP` });
    return opts;
  }, [visMonsters, input.monsterSetups, m]);
  return (
    <aside ref={useNativeWheelRef} style={{borderLeft:'1px solid var(--border-1)', background:'var(--bg-1)', overflow:'auto', overscrollBehavior:'contain'}} className="scroll">
      <div className="h-strip">
        <span className="title">Target</span>
        <span className="meta">id · {m.id}</span>
      </div>
      <div style={{padding:'12px'}}>
        <div style={{marginBottom:5}}>
          <SearchSelect
            options={monOptions}
            value={m.id}
            onChange={id=>set('monster', E.MONSTERS.find(x=>x.id===id))}
            placeholder="Search monster…" />
        </div>
        <LootSearchInput value={monLootQ} onChange={setMonLootQ}
          placeholder="Filter by drop — e.g. clue, dragon bones…"
          style={{marginBottom:5}} />
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10, minHeight:16}}>
          <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)'}}>
            {monFiltered ? `${visMonsters.length} / ${E.MONSTERS.length} monsters` : `${E.MONSTERS.length} monsters`}
          </span>
          {monFiltered && (
            <button onClick={()=>setMonLootQ('')} style={{
              marginLeft:'auto', fontFamily:'var(--mono)', fontSize:10, padding:'2px 8px', borderRadius:3,
              cursor:'pointer', border:'1px solid var(--border-2)', background:'var(--bg-2)', color:'var(--text-2)'}}>
              reset filter
            </button>
          )}
        </div>
        {/* Per-monster setup is driven from the Setup bar above the tabs. */}
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10}}>
          <span style={{fontFamily:'var(--mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'.5px',
            padding:'3px 8px', borderRadius:3,
            border:'1px solid '+(hasCustom?'color-mix(in oklab, var(--teal) 50%, var(--border-2))':'var(--border-2)'),
            background: hasCustom?'color-mix(in oklab, var(--teal) 16%, var(--bg-2))':'var(--bg-2)',
            color: hasCustom?'var(--teal)':'var(--text-3)'}}>
            {hasCustom?(input.editingDefault?'editing default':'custom setup'):'default setup'}
          </span>
          <span style={{fontFamily:'var(--mono)', fontSize:9.5, color:'var(--text-3)'}}>
            edit via Setup bar ↑
          </span>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
          <KV k="Combat"    v={m.cb} />
          <KV k="HP"        v={m.hp} />
          <KV k="Def lvl"   v={m.defLevel} />
          <KV k="Att lvl"   v={m.attack} />
          <KV k="Def slash" v={m.defSlash ?? 0} hot={input.combatType==='melee'} />
          <KV k="Def range" v={m.defRange ?? 0} hot={input.combatType==='ranged'} />
          <KV k="Def magic" v={m.defMagic ?? 0} hot={input.combatType==='magic'} />
          <KV k="Aggressive" v="yes" />
        </div>
      </div>
      <EquipmentOverview input={input} />
    </aside>
  );
}

// Helper: compute price age info from window.GameData.scrapedAt.
function priceAgeInfo(){
  const ts = window.GameData?.scrapedAt;
  if (!ts || typeof ts !== 'number') return { label:'no timestamp', color:'var(--text-3)', hours:null };
  const hours = (Date.now() / 1000 - ts) / 3600;
  if (hours < 24)  return { label: hours < 1 ? 'just now' : `${Math.floor(hours)}h ago`,   color:'var(--teal)',  hours };
  if (hours < 72)  return { label:`${Math.floor(hours)}h ago`,  color:'var(--amber)', hours };
  return { label:`${Math.floor(hours/24)}d ago`, color:'#e05555', hours };
}

function PriceAgeBadge({ style }){
  const [info, setInfo] = React.useState(priceAgeInfo);
  React.useEffect(() => {
    const id = setInterval(() => setInfo(priceAgeInfo()), 60000);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ fontFamily:'var(--mono)', fontSize:10, display:'inline-flex', alignItems:'center',
      gap:4, padding:'2px 7px', borderRadius:3, border:'1px solid var(--border-2)',
      background:'var(--bg-2)', color: info.color, whiteSpace:'nowrap', ...style }}>
      <span style={{width:6, height:6, borderRadius:'50%', background:info.color, flexShrink:0}}></span>
      prices {info.label}
    </span>
  );
}

// =======================================================================
// SETTINGS PANE — import prices.json / alch.json from local files
// =======================================================================
function SettingsPane({input, hiddenTiers = {}, setHiddenTiers}){
  const m = input && input.monster;
  // The live market scrape (run_sim.py / direct CORS sync) is a local-dev tool.
  // On a public host (GitHub Pages) it can't reach the server and we don't want
  // visitors scraping at all — prices are shipped via prices.json instead.
  const isLocal = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [msg, setMsg] = React.useState('');
  const [tone, setTone] = React.useState('idle');   // idle | ok | err
  const [syncState, setSyncState] = React.useState('idle');
  const [syncMsg, setSyncMsg] = React.useState('');
  const [, forceUpdate] = React.useState(0);
  const [counts, setCounts] = React.useState(() => ({
    prices: window.GameData?.ITEM_PRICES ? Object.keys(window.GameData.ITEM_PRICES).length : 0,
    alch:   window.GameData?.ALCH_VALUES ? Object.keys(window.GameData.ALCH_VALUES).length : 0,
    lastSync: window._marketLastSync || 'never',
  }));

  // Live market sync of the CURRENT monster's loot (CORS-limited in standalone).
  const handleSync = async () => {
    setSyncState('syncing'); setSyncMsg('fetching prices…');
    try {
      const res = await window.syncMarketPrices(m, null);
      if (res?.synced > 0){
        setSyncState('done'); setSyncMsg(`✓ ${res.synced} updated · ${res.failed} failed`);
        forceUpdate(n => n+1);
      } else {
        setSyncState('error'); setSyncMsg('CORS blocked — run Python snippet locally');
      }
    } catch(e){ setSyncState('error'); setSyncMsg('error: ' + e.message); }
  };

  // Scrape EVERY monster's loot via the local run_sim.py server (2s/item).
  const handleSyncAll = async () => {
    setSyncState('syncing');
    setSyncMsg('checking local server…');
    await window.scrapeAllViaServer((p) => {
      if (p.phase === 'scraping'){
        setSyncMsg(`scraping ${p.total} items via local server · ~${Math.ceil(p.total*2/60)} min · watch the cmd window`);
      } else if (p.phase === 'done'){
        setSyncState('done');
        setSyncMsg(`✓ ${p.applied} prices applied · ${p.ok} ok · ${p.fail} failed`);
        forceUpdate(n => n+1);
      } else if (p.phase === 'error'){
        setSyncState('error');
        setSyncMsg(p.message);
      }
    });
  };

  // Read a chosen .json file → parse → apply via the shared market pipeline
  // (patches GameData, recomputes gem EV, persists to localStorage). Accepts a
  // file that is EITHER prices or alch, or a combined { prices, alch } object.
  const importFile = (file, kind) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); }
      catch(e){ setTone('err'); setMsg(`✗ ${file.name}: not valid JSON`); return; }
      let prices = null, alch = null;
      if (data && (data.prices || data.alch)){ prices = data.prices||null; alch = data.alch||null; }
      else if (kind === 'alch') alch = data;
      else prices = data;
      if (!window.applyScrapeResults){ setTone('err'); setMsg('✗ market module not loaded'); return; }
      const n = window.applyScrapeResults(prices, alch);
      const aN = alch ? Object.keys(alch).length : 0;
      // mark a manual sync time so the Loot tab reflects it
      try { window._marketLastSync = new Date().toLocaleString(); } catch(_){}
      setTone('ok');
      setMsg(`✓ imported ${file.name} — ${n} prices${aN?`, ${aN} alch values`:''} applied`);
      setCounts({
        prices: Object.keys(window.GameData.ITEM_PRICES).length,
        alch:   Object.keys(window.GameData.ALCH_VALUES||{}).length,
        lastSync: window._marketLastSync,
      });
    };
    reader.readAsText(file);
  };

  const FileBtn = ({label, kind, accept='application/json,.json'}) => {
    const ref = React.useRef(null);
    return (
      <div style={{display:'flex', flexDirection:'column', gap:6}}>
        <button className="btn primary" onClick={()=>ref.current && ref.current.click()}>{label}</button>
        <input ref={ref} type="file" accept={accept} style={{display:'none'}}
          onChange={e=>{ const f=e.target.files&&e.target.files[0]; importFile(f, kind); e.target.value=''; }} />
      </div>
    );
  };

  return (
    <div className="scroll" style={{flex:1, overflow:'auto', minHeight:0}}>
      <div className="h-strip"><span className="title">Prices &amp; alch values</span>
        <PriceAgeBadge />
      </div>
      <div style={{padding:'12px 14px', display:'grid', gap:14}}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10}}>
          <MiniMetric k="Prices loaded" v={counts.prices} />
          <MiniMetric k="Alch values" v={counts.alch} />
        </div>

        <div style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--text-2)', lineHeight:1.6}}>
          Load a <code>prices.json</code> and/or <code>alch.json</code> exported by the
          scraper. Useful in the standalone file, where live market sync is blocked.
          Imported values patch the loot tables immediately and persist across reloads
          (stored in your browser).
        </div>

        <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
          <FileBtn label="↑ Import prices.json" kind="prices" />
          <FileBtn label="↑ Import alch.json"   kind="alch" />
        </div>

        {msg && (
          <div style={{fontFamily:'var(--mono)', fontSize:11, padding:'8px 10px', borderRadius:3,
            border:`1px solid ${tone==='err'?'color-mix(in oklab, var(--red) 45%, var(--border-2))':'color-mix(in oklab, var(--teal) 45%, var(--border-2))'}`,
            background: tone==='err'?'color-mix(in oklab, var(--red) 10%, var(--bg-2))':'color-mix(in oklab, var(--teal) 10%, var(--bg-2))',
            color: tone==='err'?'var(--red)':'var(--teal)'}}>
            {msg}
          </div>
        )}

        <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.6}}>
          Format: a flat JSON object of <code>{`{ "item_key": price }`}</code> (e.g.
          <code>{` { "dragonhide_blue": 2890 }`}</code>), or a combined
          <code>{` { "prices": {…}, "alch": {…} }`}</code>. Keys match the item ids used in
          the loot tables. Unknown keys are ignored; only positive prices are applied.
        </div>
      </div>

      {/* Gear-menu declutter — hide low/unwanted tiers from every picker. */}
      <div className="h-strip"><span className="title">Gear menu · hide tiers</span>
        <span className="meta">declutter the equipment pickers</span>
      </div>
      <div style={{padding:'12px 14px', display:'grid', gap:12}}>
        <div style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--text-2)', lineHeight:1.6}}>
          Hidden tiers are removed from every weapon, ammo and armour picker — handy
          once you've outgrown the low-level gear. Anything you currently have equipped
          is always kept, even if its tier is hidden.
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:8}}>
          {GEAR_TIER_DEFS.map(t => {
            const on = !!hiddenTiers[t.key];
            return (
              <label key={t.key} style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
                padding:'7px 11px', borderRadius:3, cursor:'pointer', userSelect:'none',
                border:'1px solid '+(on?'color-mix(in oklab, var(--amber) 45%, var(--border-2))':'var(--border-2)'),
                background: on?'color-mix(in oklab, var(--amber) 12%, var(--bg-2))':'var(--bg-2)',
                fontFamily:'var(--mono)', fontSize:11, color: on?'var(--amber)':'var(--text-1)'}}>
                <span>{t.full || ('Hide ' + t.label.toLowerCase() + ' gear')}</span>
                <input type="checkbox" checked={on}
                  onChange={e=>setHiddenTiers && setHiddenTiers({...hiddenTiers, [t.key]: e.target.checked})} />
              </label>
            );
          })}
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <button className="btn"
            onClick={()=>setHiddenTiers && setHiddenTiers(Object.fromEntries(GEAR_TIER_DEFS.map(t=>[t.key, true])))}>
            Hide all listed tiers
          </button>
          {Object.values(hiddenTiers).some(Boolean) && (
            <button className="btn"
              onClick={()=>setHiddenTiers && setHiddenTiers({})}>↺ Show all tiers</button>
          )}
        </div>
      </div>

      {isLocal ? (<>
      <div className="h-strip"><span className="title">Market scrape</span>
        <span className="meta">live sync · last {window._marketLastSync || 'never'}</span>
      </div>
      <div style={{padding:'12px 14px', display:'grid', gap:10}}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10}}>
          <MiniMetric k="Last sync" v={window._marketLastSync || 'never'} />
          <MiniMetric k="Items updated" v={window._marketSynced || '0'} />
          <MiniMetric k="Source" v="markets.lostcity.rs" />
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <button className={`btn primary`} style={{flexShrink:0}}
            disabled={syncState==='syncing'}
            onClick={handleSyncAll}>
            {syncState==='syncing' ? '↻ syncing…' : '↻ Sync ALL prices'}
          </button>
          <button className={`btn`} style={{flexShrink:0}}
            disabled={syncState==='syncing' || !m}
            onClick={handleSync}>
            {syncState==='syncing' ? '…' : `↻ Sync ${m ? m.name : 'this monster'}`}
          </button>
          {syncMsg && (
            <span style={{fontFamily:'var(--mono)', fontSize:11,
              color: syncState==='done' ? 'var(--green)'
                   : syncState==='error' ? 'var(--red)'
                   : 'var(--text-2)'}}>
              {syncMsg}
            </span>
          )}
        </div>
        <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', marginTop:6, lineHeight:1.5}}>
          "Sync ALL" scrapes every monster's loot table once and applies prices everywhere
          (run <span style={{color:'var(--text-2)'}}>python run_sim.py</span> first, open from
          localhost:8000). Prices persist across reloads.
        </div>
        {syncState==='error' && (
          <details style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--text-2)'}}>
            <summary style={{cursor:'pointer', color:'var(--amber)', padding:'4px 0'}}>▸ Python fallback snippet (click to expand)</summary>
            <pre style={{margin:'8px 0 0', padding:12, background:'#050507', border:'1px solid var(--border-2)',
              borderRadius:3, overflow:'auto', maxHeight:300, fontSize:11, lineHeight:1.6,
              color:'var(--text-1)', whiteSpace:'pre', userSelect:'all'}}>
              {window.marketPythonSnippet}
            </pre>
          </details>
        )}
      </div>
      </>) : (
        <div style={{padding:'12px 14px', fontFamily:'var(--mono)', fontSize:10, color:'var(--text-4)', lineHeight:1.6}}>
          Live market scrape is disabled on this hosted build. Prices are shipped in
          <code> prices.json</code> and refreshed periodically by the site owner.
        </div>
      )}
    </div>
  );
}

// =======================================================================
// WORKBENCH — A (primary view), with tabs for Stats / Compare / Loot
// =======================================================================
const LS_INPUT = 'sim_input_v3';
const LS_PREFS = 'sim_loot_prefs_v1';
const LS_HIDDEN_TIERS = 'sim_hidden_tiers_v1';

function loadSavedInput(){
  try {
    const raw = localStorage.getItem(LS_INPUT);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // Re-attach monster object by id
    const monster = E.MONSTERS.find(m => m.id === saved._monsterId) || null;
    if (!monster) return null;
    // Backfill any fields added since this input was persisted (e.g. the trip
    // model) so older saves don't load with empty/zeroed sections.
    const base = makeDefaults(saved.combatType || 'melee', monster.id);
    const trip = { ...base.trip, ...(saved.trip || {}) };
    return {...base, ...saved, trip, monster, _monsterId: undefined};
  } catch { return null; }
}
function saveInput(input){
  try {
    const toSave = {...input, monster:undefined, _monsterId: input.monster?.id};
    localStorage.setItem(LS_INPUT, JSON.stringify(toSave));
  } catch {}
}

// Fields that make up a "setup" (loadout) — snapshotted per monster when the
// user saves a custom setup, and used as the default baseline otherwise.
const SETUP_FIELDS = [
  'combatType','style','prayers','boosts','weapon','weaponName','ammo',
  'ammoRangeBonus','spell','spellBase','charge','gear','accBonus','dmgBonus',
  'attackSpeed','sustained','repotThreshold','ringOfWealth','specWeapon','specAmmo','trip',
];
const pickSetup = (s) => Object.fromEntries(SETUP_FIELDS.map(f => [f, s[f]]));

// Always-visible strip under the tab bar: shows whether the loadout you're
// editing applies to ALL monsters (default) or just this target (custom), and
// lets you switch/create/remove — so the per-monster setup isn't hidden in the
// far-right Target rail.
function SetupBar({input, set}){
  const m = input.monster;
  const hasCustom = !!(input.monsterSetups||{})[m.id];
  const editingDefault = !!input.editingDefault;
  const pill = (label, active, onClick, color='teal') => (
    <button type="button" onClick={onClick}
      style={{padding:'4px 12px', fontFamily:'var(--mono)', fontSize:11, textTransform:'uppercase',
        letterSpacing:'.06em', cursor:'pointer', border:'none', borderRadius:0,
        background: active?`color-mix(in oklab, var(--${color}) 18%, var(--bg-2))`:'var(--bg-2)',
        color: active?`var(--${color})`:'var(--text-3)'}}>{label}</button>
  );
  return (
    <div style={{display:'flex', alignItems:'center', gap:12, padding:'7px 14px',
      borderBottom:'1px solid var(--border-1)', background:'var(--bg-0)', flexShrink:0}}>
      <span style={{fontFamily:'var(--mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--text-3)'}}>
        Loadout for <span style={{color:'var(--text-1)'}}>{m.name}</span>
      </span>
      {hasCustom ? (
        <div style={{display:'flex', border:'1px solid var(--border-2)', borderRadius:3, overflow:'hidden'}}>
          {pill('Custom (this monster)', !editingDefault, ()=>set('__editDefault', false))}
          {pill('Default (all)', editingDefault, ()=>set('__editDefault', true), 'amber')}
        </div>
      ) : (
        <span style={{fontFamily:'var(--mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em',
          padding:'3px 10px', borderRadius:3, border:'1px solid var(--border-2)',
          background:'var(--bg-2)', color:'var(--text-3)'}}>
          Default loadout — shared by all monsters
        </span>
      )}
      <div style={{flex:1}} />
      <button type="button" onClick={()=>set(hasCustom?'__removeSetup':'__saveSetup')}
        style={{padding:'4px 12px', fontFamily:'var(--mono)', fontSize:11, cursor:'pointer', borderRadius:3,
          border:'1px solid '+(hasCustom?'var(--border-2)':'color-mix(in oklab, var(--teal) 45%, var(--border-2))'),
          background: hasCustom?'var(--bg-2)':'color-mix(in oklab, var(--teal) 14%, var(--bg-2))',
          color: hasCustom?'var(--text-2)':'var(--teal)'}}>
        {hasCustom?'✕ remove custom → use default':'+ customize for this monster'}
      </button>
    </div>
  );
}

function CombatWorkbench(){
  const [input, setInput] = useState(() => loadSavedInput() || makeDefaults('melee'));
  const [lootPrefs, setLootPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_PREFS) || '{}'); } catch { return {}; }
  });
  // Gear-tier declutter prefs (Settings) — global UI pref, kept OUT of the
  // per-loadout input so it doesn't churn with setup switching.
  const [hiddenTiers, setHiddenTiersState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_HIDDEN_TIERS) || '{}'); } catch { return {}; }
  });
  const setHiddenTiers = (next) => {
    setHiddenTiersState(next);
    try { localStorage.setItem(LS_HIDDEN_TIERS, JSON.stringify(next)); } catch {}
  };
  const setLootPref = (itemName, pref) => {
    const next = {...lootPrefs, [itemName]: pref};
    setLootPrefs(next);
    try { localStorage.setItem(LS_PREFS, JSON.stringify(next)); } catch {}
  };
  // Bulk merge (used by the loot optimizer to apply many prefs at once).
  // When `clearUndefined` is set, keys whose value is undefined are removed,
  // so they fall back to their default action instead of an override.
  const setLootPrefsBulk = (obj, clearUndefined) => {
    const next = {...lootPrefs, ...obj};
    if (clearUndefined) for (const k in obj) if (obj[k] === undefined) delete next[k];
    setLootPrefs(next);
    try { localStorage.setItem(LS_PREFS, JSON.stringify(next)); } catch {}
  };

  const set = (k, v) => {
    setInput(s => {
      // Write-through: edits save to the monster's custom setup when one is
      // active, or to the default loadout when editing it (or no custom).
      const writeThrough = (s2) => {
        const setups = s2.monsterSetups || {};
        const hasCustom = s2.monster && setups[s2.monster.id];
        if (hasCustom && s2.editingDefault) return {...s2, defaultSetup: pickSetup(s2)};
        if (hasCustom) return {...s2, monsterSetups:{...setups, [s2.monster.id]: pickSetup(s2)}};
        return s2;
      };
      // Toggle between editing this monster's custom setup and the DEFAULT
      // loadout (shared by all non-custom monsters) without switching target.
      if (k === '__editDefault'){
        const setups = s.monsterSetups || {};
        if (!setups[s.monster?.id]) return s;          // nothing to toggle
        if (v && !s.editingDefault){
          // custom → default: custom is already synced; load default fields.
          const base = s.defaultSetup || pickSetup(s);
          return {...s, ...base, editingDefault:true,
            trip:{...(base.trip||{}), bankSeconds:null, foodCount:null, foodPerKillOverride:null}};
        }
        if (!v && s.editingDefault){
          // default → custom: default is synced via write-through; reload custom.
          return {...s, ...setups[s.monster.id], editingDefault:false};
        }
        return s;
      }
      // Per-monster alching toggle: store the decision keyed by the current
      // monster, and mirror it into the live trip so the open panel reflects it.
      // Deliberately NOT written through to the shared setup — alching is its own
      // per-target choice.
      if (k === '__setAlch'){
        const id = s.monster?.id;
        if (!id) return s;
        return {...s, alchByMonster:{...(s.alchByMonster||{}), [id]: !!v},
          trip:{...(s.trip||{}), alching: !!v}};
      }
      // Per-monster kill overhead (seconds). v=null clears the override → engine
      // default. Mirrored into input.overheadSec for the live (current-monster)
      // result; stored per monster, NOT in the shared setup.
      if (k === '__setOverhead'){
        const id = s.monster?.id;
        if (!id) return s;
        const map = {...(s.overheadByMonster||{})};
        if (v == null) delete map[id]; else map[id] = v;
        return {...s, overheadByMonster:map, overheadSec: (v == null ? null : v)};
      }
      // Apply a duel-snapshot loadout to the live editor.
      if (k === '__applySetup'){
        return writeThrough({...s, ...v,
          trip:{...(v.trip||{}), bankSeconds:null, foodCount:null, foodPerKillOverride:null}});
      }
      // Save current loadout as a custom setup for this monster.
      if (k === '__saveSetup'){
        return {...s, editingDefault:false,
          defaultSetup: (s.monsterSetups||{})[s.monster.id] ? s.defaultSetup : pickSetup(s),
          monsterSetups: {...(s.monsterSetups||{}), [s.monster.id]: pickSetup(s)}};
      }
      // Remove the custom setup and restore the default loadout.
      if (k === '__removeSetup'){
        const setups = {...(s.monsterSetups||{})};
        delete setups[s.monster.id];
        const base = s.defaultSetup || pickSetup(s);
        return {...s, ...base, monsterSetups: setups, editingDefault:false,
          trip:{...(base.trip||{}), bankSeconds:null, foodCount:null, foodPerKillOverride:null}};
      }
      if (k === 'combatType' && v !== s.combatType){
        // Stash the current type's full loadout, then restore the target
        // type's saved loadout (or sensible defaults the first time).
        const stash = {
          style:s.style, prayers:s.prayers, boosts:s.boosts,
          accBonus:s.accBonus, dmgBonus:s.dmgBonus, attackSpeed:s.attackSpeed,
          weapon:s.weapon, weaponName:s.weaponName, ammo:s.ammo,
          ammoRangeBonus:s.ammoRangeBonus, spell:s.spell, spellBase:s.spellBase, charge:s.charge,
          gear:s.gear, sustained:s.sustained, repotThreshold:s.repotThreshold,
          ringOfWealth:s.ringOfWealth, specWeapon:s.specWeapon, trip:s.trip,
        };
        const loadouts = { ...(s.loadouts||{}), [s.combatType]: stash };
        const saved = loadouts[v];
        const base = makeDefaults(v, s.monster.id);
        const restored = saved ? {...base, ...saved} : base;
        const writeThroughCT = (s2) => {
          const setups = s2.monsterSetups || {};
          const hasCustom = s2.monster && setups[s2.monster.id];
          // Respect the editing-default mode the user was in BEFORE the
          // switch: route the restored loadout to the default, not the
          // monster's custom setup.
          if (hasCustom && s.editingDefault)
            return {...s2, editingDefault:true, defaultSetup: pickSetup(s2)};
          if (hasCustom)
            return {...s2, monsterSetups:{...setups, [s2.monster.id]: pickSetup(s2)}};
          return s2;
        };
        return writeThroughCT({...restored,
          attack:s.attack, strength:s.strength, defence:s.defence,
          ranged:s.ranged, magic:s.magic, hp:s.hp, prayer:s.prayer,
          monster:s.monster, overheadSec:s.overheadSec,
          combatType:v, loadouts, duelSetups:s.duelSetups,
          monsterSetups:s.monsterSetups, defaultSetup:s.defaultSetup});
      }
      if (k === 'monster' && v && v.id !== s.monster?.id){
        const setups = s.monsterSetups || {};
        // If the live fields are the default (non-custom monster, or custom
        // monster in editing-default mode), keep the default snapshot fresh.
        const liveIsDefault = !setups[s.monster?.id] || s.editingDefault;
        const defaultSetup = liveIsDefault ? pickSetup(s) : s.defaultSetup;
        const next = setups[v.id];
        const alchOn = !!(s.alchByMonster||{})[v.id];   // per-monster alch decision
        const ovhd = (s.overheadByMonster||{})[v.id] ?? null;   // per-monster overhead (null → default)
        if (next){
          // Target has a custom setup → load it wholesale (but alching is per
          // monster, not part of the shared setup, so apply it on top).
          return {...s, ...next, monster:v, defaultSetup, editingDefault:false,
            trip:{...(next.trip||{}), alching:alchOn}, overheadSec:ovhd};
        }
        // No custom setup → restore the default loadout, with per-monster
        // trip autos (bank time, food count) reset for the new target.
        const base = defaultSetup || pickSetup(s);
        return {...s, ...base, monster:v, defaultSetup, editingDefault:false,
          trip:{...(base.trip||{}), bankSeconds:null, foodCount:null, foodPerKillOverride:null, alching:alchOn}, overheadSec:ovhd};
      }
      return writeThrough({...s, [k]:v});
    });
  };
  // Patch a field inside the trip object.
  const setTrip = (patch) => setInput(s => {
    const s2 = {...s, trip:{...(s.trip||{}), ...patch}};
    const setups = s2.monsterSetups || {};
    const hasCustom = s2.monster && setups[s2.monster.id];
    if (hasCustom && s2.editingDefault) return {...s2, defaultSetup: pickSetup(s2)};
    if (hasCustom) return {...s2, monsterSetups:{...setups, [s2.monster.id]: pickSetup(s2)}};
    return s2;
  });
  useEffect(() => { saveInput(input); }, [input]);

  const simInput = useMemo(() => ({...input, lootPrefs,
    cannon: (input.cannonByMonster||{})[input.monster?.id] }), [input, lootPrefs]);
  const result = useMemo(()=>E.simulate(simInput), [simInput]);
  // Patch the cannon settings for the CURRENT monster (per-spot: targets &
  // respawn vary monster to monster, so it's keyed by monster id like overhead).
  const setCannon = (patch) => setInput(s => {
    const id = s.monster?.id; if (!id) return s;
    const map = {...(s.cannonByMonster||{})};
    map[id] = {...(map[id]||{}), ...patch};
    return {...s, cannonByMonster:map};
  });

  const [tab, setTab] = useState('stats');

  // Equipment tabs double as combat-type switches.
  const openEquip = (type) => {
    if (input.combatType !== type) set('combatType', type);
    setTab('equip_' + type);
  };

  return (
    <div className="sim" style={{display:'flex', flexDirection:'column'}}>
      <Chrome crumbs={['Index Combat Simulator']}
              extras={[input.combatType.toUpperCase()]} />

      <div style={{display:'grid', gridTemplateColumns:'280px minmax(0, 1fr) 320px', flex:1, minHeight:0}}>
        <PlayerSidebar input={input} set={set} result={result} />

        <main style={{display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden'}}>
          {/* SETUP BAR — always visible: which loadout drives THIS monster */}
          <SetupBar input={input} set={set} />
          {/* TAB BAR */}
          <div style={{display:'flex', borderBottom:'1px solid var(--border-1)', background:'var(--bg-1)', flexShrink:0, overflowX:'auto'}}>
            {[
              {k:'stats',   label:'Stats',   sub:`DPS · ${fmt2(result.dps)}`, onClick:()=>setTab('stats')},
              {k:'equip_melee',  label:'Melee',  sub:'gear · buffs', onClick:()=>openEquip('melee')},
              {k:'equip_ranged', label:'Ranged', sub:'gear · buffs', onClick:()=>openEquip('ranged')},
              {k:'equip_magic',  label:'Magic',  sub:'gear · buffs', onClick:()=>openEquip('magic')},
              {k:'compare', label:'Compare', sub:`${E.MONSTERS.length} monsters`, onClick:()=>setTab('compare')},
              {k:'loot',    label:'Loot',    sub:`${fmtK(result.gpPerHour)} gp/hr`, onClick:()=>setTab('loot')},
              {k:'trip',    label:'Trip',    sub:`${result.trip&&isFinite(result.trip.killsPerTrip)?Math.floor(result.trip.killsPerTrip)+' k/trip':'—'}`, onClick:()=>setTab('trip')},
              {k:'cannon',  label:'Cannon',  sub: (result.cannon && !result.cannon.idle) ? `${fmtK(result.cannon.ballsPerHour)} balls/hr` : ((input.cannonByMonster||{})[input.monster?.id]?.enabled ? 'idle' : 'off'), onClick:()=>setTab('cannon')},
              {k:'duel',    label:'Duel',    sub:`${(input.duelSetups||[]).length} setups`, onClick:()=>setTab('duel')},
              {k:'settings',label:'Settings',sub:(() => { const i = priceAgeInfo(); return i.hours !== null && i.hours > 24 ? `⚠ prices ${i.label}` : 'prices · import'; })(), onClick:()=>setTab('settings')},
            ].map(t => {
              const isEquip = t.k.startsWith('equip_');
              const equipType = isEquip ? t.k.slice(6) : null;
              const activeEquip = isEquip && input.combatType === equipType;
              return (
              <button key={t.k}
                onClick={t.onClick}
                style={{
                  flex:'0 0 auto', padding:'11px 12px',
                  border:0, borderRight:'1px solid var(--border-1)',
                  borderBottom: tab===t.k ? '2px solid var(--teal)' : '2px solid transparent',
                  background: activeEquip && tab!==t.k ? 'color-mix(in oklab, var(--teal) 6%, transparent)' : 'transparent',
                  cursor:'pointer',
                  display:'flex', alignItems:'center', gap:2,
                }}>
                <span style={{fontFamily:'var(--mono)', fontSize:11, textTransform:'uppercase', letterSpacing:'.06em',
                  color: tab===t.k ? 'var(--teal)' : activeEquip ? 'var(--text-1)' : 'var(--text-2)', whiteSpace:'nowrap'}}>
                  {t.label}{activeEquip ? ' ●' : ''}
                </span>
              </button>
              );
            })}
          </div>

          {tab==='stats'        && <StatsPane input={simInput} result={result}/>}
          {tab==='equip_melee'  && <EquipmentPane type="melee"  input={input} set={set} hiddenTiers={hiddenTiers}/>}
          {tab==='equip_ranged' && <EquipmentPane type="ranged" input={input} set={set} hiddenTiers={hiddenTiers}/>}
          {tab==='equip_magic'  && <EquipmentPane type="magic"  input={input} set={set} hiddenTiers={hiddenTiers}/>}
          {tab==='compare'      && <ComparePane input={simInput} set={set}/>}
          {tab==='duel'         && <DuelPane input={simInput} set={set}/>}
          {tab==='loot'         && <LootPane input={simInput} result={result} lootPrefs={lootPrefs} setLootPref={setLootPref} setLootPrefsBulk={setLootPrefsBulk} set={set}/>}
          {tab==='trip'         && <TripPane input={input} result={result} setTrip={setTrip} setCannon={setCannon}/>}
          {tab==='cannon'       && <CannonPane input={input} simInput={simInput} result={result} setCannon={setCannon}/>}
          {tab==='settings'     && <SettingsPane input={simInput} hiddenTiers={hiddenTiers} setHiddenTiers={setHiddenTiers}/>}
        </main>

        <MonsterCard input={input} set={set} />
      </div>
    </div>
  );
}

// =======================================================================
// SPREADSHEET — B (standalone alternative)
// =======================================================================
function CombatSpreadsheet(){
  const [input, setInput] = useState(makeDefaults('melee','greater_demon'));
  const set = (k,v) => {
    setInput(s => {
      if (k === 'combatType' && v !== s.combatType){
        const next = makeDefaults(v, s.monster.id);
        return {...next,
          attack:s.attack, strength:s.strength, defence:s.defence,
          ranged:s.ranged, magic:s.magic, hp:s.hp, prayer:s.prayer, monster:s.monster};
      }
      return {...s, [k]:v};
    });
  };
  const result = useMemo(()=>E.simulate(input), [input]);
  const rows = useMemo(()=>{
    const setups = input.monsterSetups || {};
    const onCustom = !!(input.monster && setups[input.monster.id]) && !input.editingDefault;
    const baseSetup = onCustom ? (input.defaultSetup || {}) : {};
    return E.MONSTERS.map(m=>{
      const ov = setups[m.id];
      const alchOn = !!(input.alchByMonster||{})[m.id];   // per-monster alch decision
      const sim = ov ? {...input, ...ov, monster:m}
        : {...input, ...baseSetup, monster:m,
           trip:{...((baseSetup.trip)||input.trip||{}), bankSeconds:null, foodCount:null, foodPerKillOverride:null, scarce:null}};
      sim.trip = {...(sim.trip||{}), alching:alchOn};
      sim.overheadSec = (input.overheadByMonster||{})[m.id] ?? null;
      sim.cannon = null;
      return {m, r:E.simulate(sim), custom:!!ov};
    });
  }, [input]);
  const [sort, setSort] = useState({key:'xpPerHour', dir:-1});
  const sorted = useMemo(()=>[...rows].sort((a,b)=>{
    if (sort.key === 'name') return a.m.name.localeCompare(b.m.name) * -sort.dir;
    return (a.r[sort.key]-b.r[sort.key])*sort.dir;
  }), [rows,sort]);
  const sortBy = k => setSort(s => s.key===k ? {key:k,dir:-s.dir} : {key:k,dir:-1});
  const TH = ({k,label,right=true}) => (
    <th className={right?'right':''} onClick={()=>sortBy(k)} style={{cursor:'pointer', userSelect:'none'}}>
      {label} {sort.key===k ? (k==='name' ? (sort.dir<0?'▲':'▼') : (sort.dir<0?'▼':'▲')) : ''}
    </th>
  );

  const ct = input.combatType;
  const styles = E.STYLES[ct];
  const prayers = E.availablePrayers(ct);
  const potions = E.availablePotions(ct);

  return (
    <div className="sim" style={{display:'flex', flexDirection:'column'}}>
      <Chrome crumbs={['workspace','sim','combat.spreadsheet']} extras={[ct.toUpperCase()]} />

      <div style={{display:'grid', gridTemplateColumns:'repeat(13, 1fr)', gap:8, padding:'10px 12px', borderBottom:'1px solid var(--border-1)', background:'var(--bg-1)'}}>
        <CompactSel label="TYPE" v={ct} onChange={v=>set('combatType',v)} opts={Object.entries(E.COMBAT_TYPES).map(([k,v])=>[k,v.label])} />
        {ct==='melee' && (<>
          <Compact label="ATT" v={input.attack} onChange={v=>set('attack',v)} />
          <Compact label="STR" v={input.strength} onChange={v=>set('strength',v)} />
        </>)}
        {ct==='ranged' && (<>
          <Compact label="RNG" v={input.ranged} onChange={v=>set('ranged',v)} />
          <Compact label="—"   v={0} onChange={()=>{}} />
        </>)}
        {ct==='magic' && (<>
          <Compact label="MAG" v={input.magic} onChange={v=>set('magic',v)} />
          <CompactSel label="SPELL" v={input.spell} onChange={v=>{set('spell',v); set('spellBase',E.SPELLS[v].base);}} opts={Object.entries(E.SPELLS).map(([k,v])=>[k,v.name])} />
        </>)}
        <Compact label="DEF" v={input.defence} onChange={v=>set('defence',v)} />
        <CompactSel label="STANCE" v={input.style} onChange={v=>set('style',v)} opts={
          ct==='melee'
            ? E.weaponStances(input.weapon).map(s=>[s.id, `${s.name} · ${(styles[s.style]?.label||s.style)} · ${s.type}`])
            : Object.entries(styles).map(([k,v])=>[k,v.label])
        } />
        <CompactSel label="PRAY"   v={(input.prayers||['none'])[0]} onChange={v=>set('prayers',[v])} opts={Object.entries(prayers).map(([k,v])=>[k,v.label.split(' (')[0]])} />
        <CompactSel label="POT"    v={(input.boosts||['none'])[0]} onChange={v=>set('boosts',[v])} opts={Object.entries(potions).map(([k,v])=>[k,v.label])} />
        <Compact label={ct==='magic'?'M+%':'ACC+'} v={input.accBonus} onChange={v=>set('accBonus',v)} />
        <Compact label={ct==='magic'?'DMG%':'DMG+'} v={input.dmgBonus} onChange={v=>set('dmgBonus',v)} />
        <Compact label="SPD"  v={input.attackSpeed} onChange={v=>set('attackSpeed',v)} />
        <Compact label="F/KL" v={input.foodPerKill} step={0.05} onChange={v=>set('foodPerKill',v)} />
        <CompactSel label="TARGET" v={input.monster.id} onChange={v=>set('monster', E.MONSTERS.find(m=>m.id===v))} opts={E.MONSTERS.map(m=>[m.id,m.name])} />
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(8, 1fr)', borderBottom:'1px solid var(--border-1)'}}>
        <Cell k="DPS"        v={fmt2(result.dps)} accent="teal" />
        <Cell k="MAX HIT"    v={fmtInt(result.maxHit)} accent="red" />
        <Cell k="HIT %"      v={fmtPct(result.hitChance)} accent="green" />
        <Cell k="TTK"        v={fmtTime(result.ttkSec)} />
        <Cell k="KILLS/HR"   v={fmtInt(result.killsPerHour)} />
        <Cell k="XP/HR"      v={fmtK(result.xpPerHour)} accent="amber" />
        <Cell k="GP/HR NET"  v={fmtK(result.netGpPerHour)} accent="gold" />
        <Cell k="GP/KILL"    v={fmtInt(result.gpPerKill)} />
      </div>

      <div className="h-strip"><span className="title">All monsters · current loadout</span><span className="meta">click header to sort · {rows.length} rows</span></div>
      <div className="scroll" style={{flex:1, overflow:'auto'}}>
        <table className="dense">
          <thead>
            <tr>
              <TH k="name" label="Monster" right={false} />
              <TH k="hitChance" label="HIT %" />
              <TH k="maxHit"    label="MAX" />
              <TH k="dps"       label="DPS" />
              <TH k="ttkSec"    label="TTK" />
              <TH k="killsPerHour" label="K/HR" />
              <TH k="xpPerHour" label="XP/HR" />
              <TH k="gpPerKill" label="GP/KL" />
              <TH k="gpPerHour" label="GP/HR" />
              <TH k="effectiveNetGpPerHour" label="NET GP/HR" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({m,r}) => {
              const sel = m.id===input.monster.id;
              return (
                <tr key={m.id}
                    style={{background: sel?'color-mix(in oklab, var(--teal) 8%, transparent)':undefined, cursor:'pointer'}}
                    onClick={()=>set('monster',m)}>
                  <td style={{color:sel?'var(--teal)':'var(--text-0)'}}>{sel?'▸ ':'  '}{m.name} <span className="dim">· lvl {m.level}</span></td>
                  <td className="right num">{fmtPct(r.hitChance)}</td>
                  <td className="right num">{r.maxHit}</td>
                  <td className="right num">{fmt2(r.dps)}</td>
                  <td className="right num">{fmtTime(r.ttkSec)}</td>
                  <td className="right num">{fmtInt(r.killsPerHour)}</td>
                  <td className="right num" style={{color:'var(--amber)'}}>{fmtK(r.xpPerHour)}</td>
                  <td className="right num">{fmtInt(r.gpPerKill)}</td>
                  <td className="right num">{fmtK(r.gpPerHour)}</td>
                  <td className="right num" style={{color:'var(--gold)'}}>{fmtK(r.effectiveNetGpPerHour)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =======================================================================
// SMALL PRIMITIVES
// =======================================================================
function Toggle({label, subOn, subOff, value, onChange, color='teal'}){
  return (
    <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none'}}>
      <div onClick={()=>onChange(!value)} style={{
        width:32, height:18, borderRadius:9, border:'1px solid var(--border-2)',
        background: value ? `color-mix(in oklab, var(--${color}) 60%, var(--bg-2))` : 'var(--bg-2)',
        position:'relative', cursor:'pointer', transition:'background .15s', flexShrink:0,
      }}>
        <div style={{
          position:'absolute', top:2, left: value ? 14 : 2,
          width:12, height:12, borderRadius:'50%',
          background: value ? `var(--${color})` : 'var(--text-3)',
          transition:'left .15s',
        }}/>
      </div>
      <div style={{display:'flex', flexDirection:'column'}}>
        <span style={{fontFamily:'var(--mono)', fontSize:11, color: value ? `var(--${color})` : 'var(--text-2)'}}>{label}</span>
        {(subOn||subOff) && <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)'}}>{value ? subOn : subOff}</span>}
      </div>
    </label>
  );
}

// Multi-select chip list. `options` is an object {key: {label, cat}}.
// Selecting "none" clears everything. Within a category (att/str/def/…),
// only one option can be active — picking another in the same category
// replaces it (you can't stack two strength prayers / potions).
// Empty selection falls back to ['none'].
function ChipMultiSelect({options, selected, onChange}){
  const sel = new Set(selected);
  const toggle = (k) => {
    if (k === 'none'){ onChange(['none']); return; }
    const cat = options[k]?.cat;
    const next = new Set(sel);
    next.delete('none');
    if (next.has(k)){
      next.delete(k);
    } else {
      // drop any other selection sharing this category (mutually exclusive)
      if (cat && cat !== 'special'){
        for (const other of [...next]){
          if (options[other]?.cat === cat) next.delete(other);
        }
      }
      next.add(k);
    }
    onChange(next.size ? [...next] : ['none']);
  };
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
      {Object.entries(options).map(([k,v]) => {
        const on = sel.has(k);
        const isDba = k === 'dba_spec';
        const accent = isDba ? 'red' : 'teal';
        return (
          <button key={k} onClick={()=>toggle(k)}
            style={{
              fontFamily:'var(--mono)', fontSize:10, letterSpacing:'.02em',
              padding:'4px 8px', borderRadius:3, cursor:'pointer',
              border:`1px solid ${on ? `color-mix(in oklab, var(--${accent}) 45%, var(--border-2))` : 'var(--border-2)'}`,
              background: on ? `color-mix(in oklab, var(--${accent}) 16%, var(--bg-2))` : 'var(--bg-2)',
              color: on ? `var(--${accent})` : 'var(--text-2)',
              transition:'all .1s',
            }}>
            {on ? '✓ ' : ''}{v.label}
          </button>
        );
      })}
    </div>
  );
}

function SustainedInfo({input}){
  const ct = input.combatType;
  const potFn  = stat => l => E.combinePotionFn(input.boosts||[])(stat, l);
  const dbaOn  = (input.boosts||[]).includes('dba_spec');

  const rows = [];
  if (ct === 'melee'){
    const dbaInfo = dbaOn ? E.dbaBoost(input.attack, input.defence, input.ranged||1, input.magic||1) : null;
    // Attack: super-attack is maintained and the DBA drain is restored, so it
    // averages like a normal super-attack potion whether or not DBA is on.
    const boostedAtt = Math.floor(potFn('att')(input.attack));
    const repotAtt   = input.repotThreshold ?? Math.max(input.attack, boostedAtt - 10);
    const avgAtt     = E.normalSustained(input.attack, potFn('att'), repotAtt);
    // Strength: from the DBA spec (treated as a potion) when DBA is on, else
    // from a super-strength dose.
    const peakStr    = dbaOn ? input.strength + dbaInfo.totalBoost
                             : Math.floor(potFn('str')(input.strength));
    const repotStr   = input.repotThreshold ?? Math.max(input.strength, peakStr - 10);
    const avgStr     = dbaOn
      ? E.dbaSustainedStr(input.strength, dbaInfo.totalBoost, repotStr)
      : E.normalSustained(input.strength, potFn('str'), repotStr);
    rows.push(['Attack', input.attack, boostedAtt, avgAtt.toFixed(1)]);
    rows.push(['Strength', input.strength, peakStr, avgStr.toFixed(1)]);
  } else if (ct === 'ranged'){
    const boosted = Math.floor(potFn('rng')(input.ranged));
    const repot   = input.repotThreshold ?? Math.max(input.ranged, boosted - 10);
    const avg     = E.normalSustained(input.ranged, potFn('rng'), repot);
    rows.push(['Ranged', input.ranged, boosted, avg.toFixed(1)]);
  } else {
    const boosted = Math.floor(potFn('mag')(input.magic));
    const repot   = input.repotThreshold ?? Math.max(input.magic, boosted - 10);
    const avg     = E.normalSustained(input.magic, potFn('mag'), repot);
    rows.push(['Magic', input.magic, boosted, avg.toFixed(1)]);
  }
  return (
    <table style={{width:'100%', borderCollapse:'collapse', fontFamily:'var(--mono)', fontSize:11}}>
      <thead>
        <tr>{['Stat','Base','Peak','Avg used'].map(h=>(
          <th key={h} style={{textAlign:'right', color:'var(--text-3)', padding:'2px 4px', fontWeight:400, fontSize:10, textTransform:'uppercase', letterSpacing:'.06em'}}>{h}</th>
        ))}</tr>
      </thead>
      <tbody>
        {rows.map(([stat,base,peak,avg])=>(
          <tr key={stat}>
            <td style={{color:'var(--text-2)', padding:'2px 4px'}}>{stat}</td>
            <td style={{textAlign:'right', color:'var(--text-1)', padding:'2px 4px'}}>{base}</td>
            <td style={{textAlign:'right', color:'var(--amber)', padding:'2px 4px'}}>{peak}</td>
            <td style={{textAlign:'right', color:'var(--teal)', padding:'2px 4px', fontWeight:600}}>{avg}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DBAInfo({input}){
  const info = E.dbaBoost(input.attack, input.defence, input.ranged||1, input.magic||1);
  // DBA: str = base + spec boost (no str pot — mutually exclusive, handled by engine)
  const strWithDBA = input.strength + info.totalBoost;
  return (
    <div style={{fontFamily:'var(--mono)', fontSize:11, display:'grid', gap:4}}>
      <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:4}}>
        <span style={{color:'var(--text-2)'}}>Str boost from spec</span>
        <span style={{color:'var(--red)', textAlign:'right'}}>+{info.totalBoost}</span>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:4}}>
        <span style={{color:'var(--text-2)'}}>Effective str (base + DBA)</span>
        <span style={{color:'var(--text-0)', textAlign:'right'}}>{strWithDBA}</span>
      </div>
      <div style={{color:'var(--text-3)', fontSize:10}}>
        +{info.drainAtt} att drain restored by restore pot
      </div>
    </div>
  );
}

function NumField({label, v, step=1, onChange}){
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" type="number" step={step} value={v} onChange={e=>onChange(+e.target.value)} />
    </div>
  );
}
function MiniMetric({k,v}){
  return (
    <div style={{display:'flex', flexDirection:'column', gap:2, padding:'8px 10px', background:'var(--bg-1)', border:'1px solid var(--border-1)', borderRadius:3}}>
      <div className="label-cap">{k}</div>
      <div className="num" style={{fontSize:14, color:'var(--text-0)'}}>{v}</div>
    </div>
  );
}
function KV({k,v,hot}){
  return (
    <div style={{display:'flex', justifyContent:'space-between', padding:'4px 0',
      borderBottom:'1px dashed var(--border-1)',
      background: hot ? 'color-mix(in oklab, var(--teal) 8%, transparent)' : undefined,
      paddingLeft: hot?6:0, paddingRight: hot?6:0, marginLeft: hot?-6:0, marginRight: hot?-6:0,
      borderRadius: hot?3:0}}>
      <span className="label-cap" style={{color:hot?'var(--teal)':undefined}}>{k}</span>
      <span className="num" style={{color:hot?'var(--teal)':'var(--text-0)', fontSize:12}}>{v}</span>
    </div>
  );
}
function Compact({label, v, step=1, onChange}){
  return (
    <div style={{display:'flex', flexDirection:'column', gap:3}}>
      <span className="label-cap">{label}</span>
      <input className="input" type="number" step={step} value={v} onChange={e=>onChange(+e.target.value)} style={{padding:'3px 6px', fontSize:11}} />
    </div>
  );
}
function CompactSel({label, v, onChange, opts}){
  return (
    <div style={{display:'flex', flexDirection:'column', gap:3}}>
      <span className="label-cap">{label}</span>
      <select className="select" value={v} onChange={e=>onChange(e.target.value)} style={{padding:'3px 18px 3px 6px', fontSize:11}}>
        {opts.map(([k,l])=> <option key={k} value={k}>{l}</option>)}
      </select>
    </div>
  );
}
function Cell({k, v, accent}){
  return (
    <div style={{padding:'10px 14px', borderRight:'1px solid var(--border-1)', display:'flex', flexDirection:'column', gap:3}}>
      <div className="label-cap">{k}</div>
      <div className="num" style={{fontSize:18, color: accent ? `var(--${accent})` : 'var(--text-0)'}}>{v}</div>
    </div>
  );
}
function HitHistogram({maxHit, hitChance}){
  const bars = [];
  const missProb = 1 - hitChance;
  const perFace = hitChance / (maxHit + 1);
  for (let i = 0; i <= maxHit; i++){
    bars.push((i === 0 ? missProb : 0) + perFace);
  }
  const max = Math.max(...bars, 0.01);
  return (
    <div style={{display:'flex', alignItems:'flex-end', gap:3, height:140, paddingBottom:18, position:'relative'}}>
      {bars.map((p, i) => (
        <div key={i} style={{flex:1, position:'relative', height:'100%', display:'flex', flexDirection:'column', justifyContent:'flex-end'}}>
          <div style={{height: `${(p/max)*100}%`, background: i === 0 ? 'var(--red)' : 'var(--teal)', borderRadius:'2px 2px 0 0', opacity:0.85}} />
          <div style={{position:'absolute', bottom:-16, left:0, right:0, textAlign:'center', fontFamily:'var(--mono)', fontSize:9, color:'var(--text-3)'}}>{i}</div>
        </div>
      ))}
    </div>
  );
}
function Spark({data, color}){
  const w = 130, h = 22;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v,i) => `${(i/(data.length-1))*w},${h - ((v-min)/(max-min||1))*h}`).join(' ');
  return (
    <svg width={w} height={h} style={{display:'block'}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2"/>
    </svg>
  );
}

// =======================================================================
// ARCHITECTURE BOARD
// =======================================================================
function ArchitectureBoard(){
  return (
    <div className="sim" style={{display:'flex', flexDirection:'column'}}>
      <Chrome crumbs={['workspace','docs','local-dev']} status="docs" />
      <div style={{padding:'18px 22px', flex:1, overflow:'auto'}} className="scroll">
        <div style={{marginBottom:16}}>
          <div style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.1em'}}>local-first architecture · v0.1</div>
          <h1 style={{margin:'6px 0 4px', fontSize:24, color:'var(--text-0)', fontWeight:500}}>Run the whole stack on your machine.</h1>
          <p style={{margin:0, color:'var(--text-2)', maxWidth:680, lineHeight:1.5}}>
            One repo, three processes: a Python FastAPI engine, a Next.js front-end, and a polite scraper.
            SQLite + a JSON snapshot of the Lost City data dir is the source of truth — no external services required to launch.
          </p>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:18}}>
          <ArchCard tag="frontend" title="apps/web · Next.js" port="3000" lines={[
            'React 19 · server actions','TanStack Query → /api','Recharts for distributions','Tailwind + shadcn primitives',
          ]} color="teal"/>
          <ArchCard tag="api" title="services/engine · FastAPI" port="8000" lines={[
            'POST /simulate · pure','GET  /monsters /items','GET  /compare?loadout=...','pydantic v2 schemas',
          ]} color="amber"/>
          <ArchCard tag="scraper" title="services/scraper · APScheduler" port="—" lines={[
            'market.2004scape.org','1 req/s · backoff','writes to prices table','cron: every 30 min',
          ]} color="gold"/>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18}}>
          <ArchCard tag="db" title="packages/data · SQLite" port="file://" lines={[
            'monsters, items, drops','price_history (long)','loadouts (saved)','sim_runs (cached)',
          ]} color="blue"/>
          <ArchCard tag="game-data" title="packages/lostcity-extract" port="—" lines={[
            'pulls from LostCityRS/Content @ v274','parses *.npc, *.obj configs','emits JSON → seed.sqlite','one-shot · cached in CI',
          ]} color="violet"/>
        </div>

        <div className="h-strip"><span className="title">Modules · combat engine</span><span className="meta">services/engine/sim/</span></div>
        <table className="dense" style={{marginBottom:18}}>
          <thead><tr><th>Module</th><th>Responsibility</th><th>Public surface</th></tr></thead>
          <tbody>
            <tr><td style={{color:'var(--teal)'}}>rolls.py</td><td>effective levels · attack/defence rolls (melee/ranged/magic)</td><td className="dim">eff_acc, eff_dmg, attack_roll, defence_roll</td></tr>
            <tr><td style={{color:'var(--teal)'}}>damage.py</td><td>max hit per style · hit chance · distribution</td><td className="dim">max_hit_melee, max_hit_ranged, max_hit_magic, dist</td></tr>
            <tr><td style={{color:'var(--teal)'}}>dps.py</td><td>average dps incl. attack speed + rapid mod</td><td className="dim">dps, time_to_kill</td></tr>
            <tr><td style={{color:'var(--amber)'}}>prayers.py</td><td>prayer registry · per-stat multipliers + drain</td><td className="dim">PRAYERS, drain_per_min, available_for(type)</td></tr>
            <tr><td style={{color:'var(--amber)'}}>potions.py</td><td>potion boost curves</td><td className="dim">POTIONS, apply</td></tr>
            <tr><td style={{color:'var(--amber)'}}>spells.py</td><td>spell registry · base dmg, rune cost, lvl req</td><td className="dim">SPELLS, cast_cost</td></tr>
            <tr><td style={{color:'var(--gold)'}}>loot.py</td><td>drop-table eval · ev per kill · monte carlo</td><td className="dim">expected_value, monte_carlo</td></tr>
            <tr><td style={{color:'var(--gold)'}}>trip.py</td><td>inventory + supply consumption</td><td className="dim">trip_duration, supplies_per_kill</td></tr>
            <tr><td style={{color:'var(--blue)'}}>compare.py</td><td>cartesian over loadouts × monsters</td><td className="dim">rank, frontier</td></tr>
          </tbody>
        </table>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          <div>
            <div className="h-strip"><span className="title">Run locally</span></div>
            <pre style={{margin:0, padding:'14px 16px', background:'#050507', border:'1px solid var(--border-2)', borderTop:0, fontFamily:'var(--mono)', fontSize:12, color:'var(--text-1)', lineHeight:1.7}}>
{`$ git clone …/2004scape-sim && cd $_
$ make seed          # parse LostCityRS/Content@v274 → sqlite
$ make dev           # turbo: web + api + scraper
  ↳ web      http://localhost:3000
  ↳ api      http://localhost:8000
  ↳ scraper  pid 41213 (every 30m)

$ python -m sim.repl
sim> simulate(type="ranged", lvl=80, target="dust_devil")
  dps=2.41  xp/h=46.8k  gp/h=92k`}
            </pre>
          </div>
          <div>
            <div className="h-strip"><span className="title">Roadmap</span></div>
            <ol style={{margin:0, padding:'12px 16px 12px 32px', background:'var(--bg-1)', border:'1px solid var(--border-2)', borderTop:0, color:'var(--text-1)', fontSize:12, lineHeight:1.8}}>
              <li><b style={{color:'var(--teal)'}}>W1</b> · engine (melee · ranged · magic) + tests</li>
              <li><b style={{color:'var(--teal)'}}>W2</b> · seed extract from LostCityRS/Content@v274</li>
              <li><b style={{color:'var(--amber)'}}>W3</b> · FastAPI endpoints + schemas</li>
              <li><b style={{color:'var(--amber)'}}>W4</b> · Next.js workbench (this prototype)</li>
              <li><b style={{color:'var(--gold)'}}>W5</b> · scraper · prices · loot EV</li>
              <li><b style={{color:'var(--blue)'}}>W6</b> · optimizer · gear search · prayer flicking</li>
              <li><b style={{color:'var(--violet)'}}>W7+</b> · hiscores import · trip planner</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
function ArchCard({tag, title, port, lines, color}){
  return (
    <div style={{background:'var(--bg-1)', border:'1px solid var(--border-2)', borderRadius:4, padding:'12px 14px'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6}}>
        <span style={{fontFamily:'var(--mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:`var(--${color})`}}>{tag}</span>
        <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)'}}>{port}</span>
      </div>
      <div style={{fontFamily:'var(--mono)', fontSize:13, color:'var(--text-0)', marginBottom:8}}>{title}</div>
      <ul style={{margin:0, padding:0, listStyle:'none', display:'grid', gap:4, fontSize:11, color:'var(--text-2)', fontFamily:'var(--mono)'}}>
        {lines.map((l,i)=>(<li key={i}>· {l}</li>))}
      </ul>
    </div>
  );
}

Object.assign(window, {
  CombatWorkbench, CombatSpreadsheet, ArchitectureBoard,
});
