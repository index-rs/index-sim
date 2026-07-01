// planner.jsx — Training-order planner tab. window.PlannerPane.
// Renders the controls, the ordered phase list, a gear-unlock timeline, a
// DPS-vs-cumulative-XP chart, and the gear-pool editor. All planning lives in
// window.SimPlanner (planner-core.js); this file is presentation + wiring.

(function(){
  const { useState, useMemo, useEffect, useRef, useCallback } = React;
  const P = () => window.SimPlanner;

  const LS = 'sim_planner_v1';
  const loadCfg = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
  const saveCfg = (c) => { try { localStorage.setItem(LS, JSON.stringify(c)); } catch {} };

  const fmt2  = (n) => (n == null || !isFinite(n)) ? '—' : n.toFixed(2);
  const fmtInt = (n) => (n == null || !isFinite(n)) ? '—' : Math.round(n).toLocaleString();
  const fmtK  = (n) => { if (n == null || !isFinite(n)) return '—'; const a = Math.abs(n);
    if (a >= 1e6) return (n/1e6).toFixed(a>=1e7?0:1)+'M'; if (a >= 1e3) return (n/1e3).toFixed(a>=1e4?0:1)+'k'; return Math.round(n).toString(); };
  const fmtXp = (n) => fmtK(n);
  const signed = (n, f) => (n >= 0 ? '+' : '') + f(n);

  const METRICS = [
    { key:'xph', label:'Eff. XP/hr', fmt:fmtK,  unit:'xp/hr',  short:'xp/hr' },
  ];
  const metricMeta = (k) => METRICS.find(m => m.key === k) || METRICS[0];

  const SLOT_COLOR = { weapon:'var(--teal)', spell:'var(--violet)', body:'var(--blue)',
    helm:'var(--amber)', legs:'var(--green)', shield:'var(--gold)' };

  // ---- small controls ------------------------------------------------------
  function Seg({ value, onChange, options }){
    return (
      <div className="seg" style={{display:'flex', borderRadius:4, overflow:'hidden', border:'1px solid var(--border-2)'}}>
        {options.map(o => (
          <button key={o.value} className={value === o.value ? 'active' : ''}
            onClick={() => onChange(o.value)} style={{padding:'5px 10px', whiteSpace:'nowrap'}}>{o.label}</button>
        ))}
      </div>
    );
  }
  function Toggle({ on, onChange, label }){
    return (
      <button className={'btn' + (on ? ' primary' : '')} onClick={() => onChange(!on)}
        style={{display:'flex', alignItems:'center', gap:7}}>
        <span style={{width:9, height:9, borderRadius:2, background: on ? 'var(--teal)' : 'var(--bg-4)',
          boxShadow: on ? '0 0 6px var(--teal)' : 'none', flexShrink:0}}></span>{label}
      </button>
    );
  }
  function NumBox({ value, onChange, min=1, max=99, disabled }){
    return (
      <input className="input num planner-num" type="number" value={value} min={min} max={max} disabled={disabled}
        onChange={e => { const v = Math.max(min, Math.min(max, parseInt(e.target.value || '0', 10) || min)); onChange(v); }}
        style={{width:62, textAlign:'left', padding:'4px 6px', opacity: disabled ? 0.5 : 1}} />
    );
  }
  function Chip({ on, onClick, children, dim }){
    return (
      <button onClick={onClick} style={{
        fontFamily:'var(--mono)', fontSize:10, padding:'3px 8px', borderRadius:3, cursor:'pointer',
        border:'1px solid ' + (on ? 'color-mix(in oklab, var(--teal) 45%, var(--border-2))' : 'var(--border-2)'),
        background: on ? 'color-mix(in oklab, var(--teal) 16%, var(--bg-2))' : 'var(--bg-2)',
        color: on ? 'var(--teal)' : (dim ? 'var(--text-4)' : 'var(--text-3)'),
        textTransform:'none', letterSpacing:0 }}>{children}</button>
    );
  }

  // ---- DPS vs cumulative-XP chart -----------------------------------------
  function DpsChart({ plan }){
    if (!plan || !plan.steps.length) return null;
    const W = 1000, H = 230, padL = 56, padR = 16, padT = 16, padB = 34;
    const pts = [{ x:0, y:plan.start.dps }, ...plan.steps.map(s => ({ x:s.cumXp, y:s.dps }))];
    const maxX = plan.totalXp || 1;
    const maxY = Math.max(...pts.map(p => p.y), 0.01) * 1.08;
    const sx = (x) => padL + (x / maxX) * (W - padL - padR);
    const sy = (y) => H - padB - (y / maxY) * (H - padT - padB);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1)).join(' ');
    const area = path + ` L${sx(maxX).toFixed(1)} ${sy(0).toFixed(1)} L${sx(0).toFixed(1)} ${sy(0).toFixed(1)} Z`;
    const yticks = 4, xticks = 5;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{width:'100%', height:230, display:'block'}}>
        {Array.from({length:yticks+1}).map((_, i) => { const v = maxY * i / yticks; const y = sy(v);
          return (<g key={'y'+i}>
            <line x1={padL} y1={y} x2={W-padR} y2={y} stroke="var(--border-1)" strokeWidth="1"/>
            <text x={padL-8} y={y+3} textAnchor="end" fontSize="11" fontFamily="var(--mono)" fill="var(--text-4)">{v.toFixed(1)}</text>
          </g>); })}
        {Array.from({length:xticks+1}).map((_, i) => { const v = maxX * i / xticks; const x = sx(v);
          return (<text key={'x'+i} x={x} y={H-padB+16} textAnchor="middle" fontSize="11" fontFamily="var(--mono)" fill="var(--text-4)">{fmtK(v)}</text>); })}
        <path d={area} fill="color-mix(in oklab, var(--teal) 12%, transparent)"/>
        <path d={path} fill="none" stroke="var(--teal)" strokeWidth="2"/>
        {plan.unlocks.map((u, i) => { const x = sx(u.cumXp);
          return (<g key={'u'+i}>
            <line x1={x} y1={padT} x2={x} y2={H-padB} stroke={SLOT_COLOR[u.slot]||'var(--text-3)'} strokeWidth="1" strokeDasharray="3 3" opacity="0.7"/>
            <circle cx={x} cy={sy(u.dpsAfter)} r="3.2" fill={SLOT_COLOR[u.slot]||'var(--text-3)'}/>
          </g>); })}
        <text x={padL-46} y={padT+4} fontSize="10" fontFamily="var(--mono)" fill="var(--text-4)" transform={`rotate(-90 ${padL-46} ${H/2})`} textAnchor="middle">DPS</text>
        <text x={(W)/2} y={H-4} fontSize="10" fontFamily="var(--mono)" fill="var(--text-4)" textAnchor="middle">cumulative XP →</text>
      </svg>
    );
  }

  // ---- pool editor ---------------------------------------------------------
  function PoolEditor({ combatType, pool, setPool, futureWeapons, base }){
    const SP = P();
    const C = SP.CANDIDATES[combatType] || SP.CANDIDATES.melee;
    const eq = window.Equipment;
    const reg = { weapon:null, helm:eq.HELMS, body:eq.BODIES, legs:eq.LEGS, shield:eq.SHIELDS };
    const nameOf = (slot, k) => {
      if (k === 'none') return 'none';
      if (slot === 'weapon') return (window.SimEngine.WEAPONS[k]?.name) || SP.HYPO_WEAPONS[k]?.name || k;
      return reg[slot]?.[k]?.name || k;
    };
    const toggle = (slot, k) => {
      const cur = new Set(pool[slot] || []);
      if (cur.has(k)) cur.delete(k); else cur.add(k);
      setPool({ ...pool, [slot]: [...cur] });
    };
    const rows = [];
    if (combatType === 'magic'){
      rows.push({ slot:'spell', label:'Spell ladder', items:null, ladder: SP.spellLadder(base.weapon) });
    } else {
      const weps = [...(C.weapon||[]), ...(futureWeapons ? (C.weaponHypo||[]) : [])];
      rows.push({ slot:'weapon', label:'Weapon', items: weps });
    }
    for (const slot of ['helm','body','legs','shield']){
      const items = (C[slot] || []).filter(k => k !== 'none');
      if (items.length) rows.push({ slot, label: slot[0].toUpperCase()+slot.slice(1), items });
    }
    const reqTag = (slot, k) => {
      const q = SP.reqOf(k); const parts = [];
      if (q.attack) parts.push('att'+q.attack); if (q.ranged) parts.push('rng'+q.ranged);
      if (q.magic) parts.push('mag'+q.magic); if (q.defence) parts.push('def'+q.defence);
      return parts.length ? ' ·'+parts.join('/') : '';
    };
    return (
      <div style={{padding:'10px 14px', display:'flex', flexDirection:'column', gap:12}}>
        {rows.map(row => (
          <div key={row.slot} style={{display:'flex', gap:10, alignItems:'flex-start'}}>
            <div style={{width:70, flexShrink:0, fontFamily:'var(--mono)', fontSize:10, textTransform:'uppercase',
              letterSpacing:'0.06em', color:'var(--text-3)', paddingTop:4}}>{row.label}</div>
            {row.ladder ? (
              <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                {row.ladder.map(s => {
                  const on = base.magic >= (s.lvl || 1);
                  return (<span key={s.key} style={{fontFamily:'var(--mono)', fontSize:10, padding:'3px 8px', borderRadius:3,
                    border:'1px solid var(--border-2)', color: on ? 'var(--violet)' : 'var(--text-4)',
                    background: on ? 'color-mix(in oklab, var(--violet) 14%, var(--bg-2))' : 'var(--bg-2)'}}>
                    {s.name} · mag{s.lvl} · max {s.base}</span>);
                })}
              </div>
            ) : (
              <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                {row.items.map(k => (
                  <Chip key={k} on={(pool[row.slot]||[]).includes(k)} onClick={() => toggle(row.slot, k)}>
                    {nameOf(row.slot, k)}<span style={{opacity:0.6}}>{reqTag(row.slot, k)}</span>
                  </Chip>
                ))}
              </div>
            )}
          </div>
        ))}
        {combatType === 'magic' && (
          <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-4)', lineHeight:1.5}}>
            Magic progression is the spell ladder for your equipped staff ({base.weaponName}). Higher Magic auto-casts the strongest castable spell — that's the unlock that drives magic DPS.
          </div>
        )}
      </div>
    );
  }

  // ---- main pane -----------------------------------------------------------
  function PlannerPane({ input, set }){
    const SP = P();
    const base = input;
    const combatType = base.combatType;
    const persisted = useRef(loadCfg());
    const c0 = persisted.current;

    const [metric, setMetric] = useState('xph');
    const [futureWeapons, setFutureWeapons] = useState(!!c0.futureWeapons);
    const [lockGear, setLockGear] = useState(!!c0.lockGear);
    // Pause recomputation to save cycles when you're not actively planning. The
    // shown plan freezes; `stale` flags that inputs drifted since it was built.
    const [paused, setPaused] = useState(!!c0.paused);
    const [stale, setStale] = useState(false);
    // Sustained-boosts toggle is shared with the melee tab's "Avg over session"
    // toggle — both read/write the same input.sustained so flipping one flips both.
    const sustained = !!base.sustained;
    const [userTargets, setUserTargets] = useState(c0.targets || {});
    const [locked, setLocked] = useState(c0.locked || {});          // skill -> bool (frozen at current)
    const [startXpUser, setStartXpUser] = useState(c0.startXp || {}); // skill -> xp (undefined = default)
    const [poolByType, setPoolByType] = useState(c0.poolByType || {});
    const [showPool, setShowPool] = useState(false);
    // design-canvas captures wheel events (native listener on an ancestor) to
    // zoom/pan the whole page. Stop wheel inside scroll areas so the mouse wheel
    // scrolls the list instead of zooming.
    const noZoom = useCallback((el) => {
      if (!el || el.__noZoom) return;
      el.__noZoom = true;
      el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    }, []);

    // resolve the active pool for this combat type (seed from defaults once)
    const pool = useMemo(() => {
      const stored = poolByType[combatType];
      if (stored) {
        // keep hypotheticals in sync with the toggle
        const def = SP.defaultPool(combatType, futureWeapons);
        const hypo = (SP.CANDIDATES[combatType]?.weaponHypo) || [];
        let weapon = stored.weapon || def.weapon;
        if (futureWeapons) weapon = [...new Set([...weapon, ...hypo])];
        else weapon = weapon.filter(w => !hypo.includes(w));
        return { ...def, ...stored, weapon };
      }
      return SP.defaultPool(combatType, futureWeapons);
    }, [poolByType, combatType, futureWeapons]);
    const setPool = (next) => {
      const nbt = { ...poolByType, [combatType]: next };
      setPoolByType(nbt);
    };

    useEffect(() => { saveCfg({ metric, futureWeapons, lockGear, sustained, paused, targets:userTargets, locked, startXp:startXpUser, poolByType }); },
      [metric, futureWeapons, lockGear, sustained, paused, userTargets, locked, startXpUser, poolByType]);

    // relevant skills + effective targets. A locked skill freezes at its current
    // level (target = current) and is excluded from training.
    const relevant = SP.SKILLS_FOR[combatType] || SP.SKILLS_FOR.melee;
    const defaultTarget = (s) => s === 'defence' ? (relevant.includes('defence') ? 99 : base.defence) : 99;
    const targets = useMemo(() => {
      const t = {};
      for (const s of relevant) t[s] = locked[s] ? base[s] : (userTargets[s] ?? defaultTarget(s));
      return t;
    }, [combatType, locked, userTargets, base.attack, base.strength, base.defence, base.ranged, base.magic]);

    // current xp per skill: default to the xp the current level requires, clamped
    // to the current level's xp band.
    const startXp = useMemo(() => {
      const sx = {};
      for (const s of relevant){
        const lo = SP.xpAt(base[s]), hi = base[s] < 99 ? SP.xpAt(base[s] + 1) - 1 : SP.xpAt(99);
        const u = startXpUser[s];
        sx[s] = (u != null && isFinite(u)) ? Math.max(lo, Math.min(hi, u)) : lo;
      }
      return sx;
    }, [combatType, startXpUser, base.attack, base.strength, base.defence, base.ranged, base.magic]);

    const computePlan = () => {
      try {
        return SP.buildPlan(base, { metric, targets, startXp, pool, futureWeapons, lockGear, sustained, maxLevels:600 });
      } catch (e) { return { ok:false, error: String(e && e.message || e) }; }
    };
    // Debounced: each recompute is ~300ms, so running it synchronously on every
    // keystroke makes the controls feel laggy. Compute once up front, then settle
    // ~180ms after the last change.
    const [plan, setPlan] = useState(computePlan);
    const planFirst = useRef(true);
    useEffect(() => {
      if (planFirst.current){ planFirst.current = false; return; }
      // Paused: skip the recompute and just flag the shown plan as stale.
      if (paused){ setStale(true); return; }
      const id = setTimeout(() => { setPlan(computePlan()); setStale(false); }, 180);
      return () => clearTimeout(id);
    }, [base, metric, JSON.stringify(targets), JSON.stringify(startXp), JSON.stringify(pool), futureWeapons, lockGear, sustained, paused]);
    const recomputeNow = () => { setPlan(computePlan()); setStale(false); };

    const mm = metricMeta(metric);

    if (!plan || !plan.ok) {
      return <div style={{padding:24, fontFamily:'var(--mono)', color:'var(--red)'}}>Planner error: {plan?.error || 'unknown'}</div>;
    }

    const noWork = plan.phases.length === 0;
    const startEquipNote = (() => {
      const cfg = plan.start.cfg;
      const curW = base.weapon;
      if (combatType !== 'magic' && cfg.weapon && cfg.weapon !== curW)
        return `Equip ${cfg.weaponName} now (best in your pool at current stats).`;
      return null;
    })();

    const SK = SP.SKILL_LABEL;
    const skillColor = (s) => ({ strength:'var(--red)', attack:'var(--teal)', defence:'var(--blue)',
      ranged:'var(--green)', magic:'var(--violet)' }[s] || 'var(--text-2)');

    return (
      <div ref={noZoom} className="scroll" style={{height:'100%', minHeight:0, overflowY:'auto'}}>
        {/* controls */}
        <div className="h-strip"><span className="title">Training planner</span>
          <span className="meta">{base.monster?.name || '—'} · {combatType}</span></div>

        <div style={{padding:'12px 14px', display:'flex', flexWrap:'wrap', gap:18, alignItems:'flex-start',
          borderBottom:'1px solid var(--border-1)'}}>
          <div style={{display:'flex', flexDirection:'column', gap:5}}>
            <span className="label-cap">Optimize for</span>
            <span style={{fontFamily:'var(--mono)', fontSize:13, color:'var(--teal)', fontWeight:600}}>Eff. XP/hr</span>
            <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:8}}>
              <div style={{display:'flex', gap:8}}>
                {combatType !== 'magic' && <Toggle on={futureWeapons} onChange={setFutureWeapons} label="Future weapons" />}
                <Toggle on={sustained} onChange={v => set && set('sustained', v)} label="Avg over session" />
              </div>
              <Toggle on={lockGear} onChange={setLockGear} label="Only current gear" />
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <Toggle on={!paused} onChange={live => setPaused(!live)} label={paused ? 'Calc paused' : 'Live calc'} />
                {paused && (
                  <button className={'btn' + (stale ? ' primary' : '')} onClick={recomputeNow}
                    title="Recompute the plan once from the current inputs">
                    Recompute{stale ? ' •' : ''}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* per-skill grid: lock · current level/XP · target */}
          <div style={{display:'flex', flexDirection:'column', gap:5}}>
            <span className="label-cap">Skills — lock to freeze · target to train toward</span>
            <div style={{display:'grid', gridTemplateColumns:'auto auto 1fr auto', gap:'6px 10px', alignItems:'center'}}>
              <div></div>
              <div className="label-cap" style={{fontSize:9}}>current</div>
              <div className="label-cap" style={{fontSize:9}}>xp</div>
              <div className="label-cap" style={{fontSize:9, textAlign:'right'}}>target</div>
              {relevant.map(s => {
                const lk = !!locked[s];
                return (
                  <React.Fragment key={s}>
                    <button onClick={() => setLocked(l => ({ ...l, [s]: !l[s] }))} title={lk ? 'Locked — frozen at current; gear needing more is hidden' : 'Click to lock (freeze at current level)'}
                      style={{display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0}}>
                      <span style={{fontSize:13, width:16, textAlign:'center', filter: lk ? 'none' : 'grayscale(1) opacity(0.5)'}}>{lk ? '🔒' : '🔓'}</span>
                      <span style={{fontFamily:'var(--mono)', fontSize:12, color:skillColor(s), fontWeight:600, width:64, textAlign:'left'}}>{SK[s]}</span>
                    </button>
                    <span className="num" style={{fontFamily:'var(--mono)', fontSize:12, color:'var(--text-2)', textAlign:'right'}}>{base[s]}</span>
                    <input className="input num planner-num" type="number" value={Math.round(startXp[s])} disabled={lk}
                      min={SP.xpAt(base[s])} max={base[s] < 99 ? SP.xpAt(base[s]+1)-1 : SP.xpAt(99)}
                      onChange={e => { const v = parseInt(e.target.value || '0', 10) || 0; setStartXpUser(x => ({ ...x, [s]: v })); }}
                      style={{width:88, textAlign:'left', padding:'3px 6px', fontSize:11, opacity: lk ? 0.4 : 1}} />
                    <div style={{justifySelf:'end'}}>
                      {lk
                        ? <span style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--text-4)'}}>frozen</span>
                        : <NumBox value={targets[s]} min={base[s]} onChange={v => setUserTargets(t => ({ ...t, [s]:v }))} />}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* notes — fills the empty space at right */}
          <div style={{display:'flex', flexDirection:'column', gap:6, maxWidth:300, fontFamily:'var(--mono)', fontSize:10, color:'var(--text-4)', lineHeight:1.6}}>
            <span className="label-cap">Notes</span>
            <div><b style={{color:'var(--text-3)'}}>XP is defaulted</b> to the start of each current level. If you're partway through a level, type your real XP in the <b style={{color:'var(--text-3)'}}>xp</b> box — the plan then charges only the XP left to your next level.</div>
            <div><b style={{color:'var(--text-3)'}}>🔒 Lock</b> freezes a skill at its current level and hides gear that needs more of it.</div>
            <div><b style={{color:'var(--text-3)'}}>Only current gear</b> plans around your equipped setup — no weapon/armour swaps.</div>
          </div>
        </div>

        {/* summary metrics */}
        <div style={{padding:'14px', display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10,
          borderBottom:'1px solid var(--border-1)'}}>
          <div className="metric"><span className="k">Now → Target DPS</span>
            <span className="v" style={{fontSize:'var(--fs-2xl)'}}>{fmt2(plan.start.dps)}
              <span style={{color:'var(--text-4)'}}> → </span>
              <span className="num" style={{color:'var(--teal)'}}>{fmt2(plan.end ? plan.end.dps : plan.start.dps)}</span></span>
            <span className="sub">+{fmt2((plan.end?plan.end.dps:plan.start.dps) - plan.start.dps)} dps</span></div>
          <div className="metric"><span className="k">{mm.label} gain</span>
            <span className="v teal" style={{fontSize:'var(--fs-2xl)'}}>{signed((plan.end?plan.end.metricVal:0) - plan.start.metricVal, mm.fmt)}</span>
            <span className="sub">{mm.fmt(plan.start.metricVal)} → {mm.fmt(plan.end?plan.end.metricVal:plan.start.metricVal)} {mm.short}</span></div>
          <div className="metric"><span className="k">Total XP to plan</span>
            <span className="v" style={{fontSize:'var(--fs-2xl)'}}>{fmtXp(plan.totalXp)}</span>
            <span className="sub">combat {plan.start.combat} → {plan.end?plan.end.combat:plan.start.combat}</span></div>
          <div className="metric"><span className="k">Gear unlocks</span>
            <span className="v gold" style={{fontSize:'var(--fs-2xl)'}}>{plan.unlocks.length}</span>
            <span className="sub">{plan.phases.length} training phases</span></div>
        </div>

        {startEquipNote && (
          <div style={{margin:'12px 14px 0', padding:'8px 12px', borderRadius:4, fontFamily:'var(--mono)', fontSize:11,
            color:'var(--teal)', background:'color-mix(in oklab, var(--teal) 10%, var(--bg-2))',
            border:'1px solid color-mix(in oklab, var(--teal) 30%, var(--border-2))'}}>▸ {startEquipNote}</div>
        )}

        {noWork ? (
          <div style={{padding:'28px 14px', fontFamily:'var(--mono)', fontSize:12, color:'var(--text-3)'}}>
            Targets are at or below your current levels — nothing to train. Raise a target above to build a plan.
          </div>
        ) : (
          <>
            {/* phase list */}
            <div className="h-strip" style={{marginTop:6}}><span className="title">Order of training</span>
              <span className="meta">{plan.phases.length} steps · greedy {mm.short}/xp · scroll ↓</span></div>
            <div ref={noZoom} className="scroll-vis" style={{padding:'8px 14px 4px', maxHeight:'min(46vh, 460px)', overflowY:'auto', overscrollBehavior:'contain'}}>
              {plan.phases.map((ph, i) => {
                const dM = ph.endMetric - ph.startMetric;
                const dDps = ph.endDps - ph.startDps;
                return (
                  <div key={i} style={{display:'flex', gap:12, alignItems:'flex-start', padding:'9px 0',
                    borderBottom: i < plan.phases.length-1 ? '1px solid var(--border-1)' : 'none'}}>
                    <div style={{fontFamily:'var(--mono)', fontSize:12, color:'var(--text-4)', width:22, flexShrink:0, paddingTop:1}}>{i+1}</div>
                    <div style={{minWidth:0, flex:1}}>
                      <div style={{display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap'}}>
                        <span style={{fontFamily:'var(--mono)', fontSize:13, color:skillColor(ph.skill), fontWeight:600}}>{SK[ph.skill]}</span>
                        <span className="num" style={{fontFamily:'var(--mono)', fontSize:13, color:'var(--text-1)'}}>{ph.from} → {ph.to}</span>
                        <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--text-4)'}}>+{ph.to-ph.from} lvl · {fmtXp(ph.xp)} xp</span>
                      </div>
                      {ph.unlocks.length > 0 && (
                        <div style={{display:'flex', flexWrap:'wrap', gap:6, marginTop:5}}>
                          {ph.unlocks.map((u, j) => {
                            const col = SLOT_COLOR[u.slot] || 'var(--text-2)';
                            const isSwitch = u.type === 'switch';
                            return (
                              <span key={j} style={{fontFamily:'var(--mono)', fontSize:10, padding:'2px 7px', borderRadius:3,
                                color: col, background:'var(--bg-2)',
                                border:'1px solid color-mix(in oklab, '+col+' 35%, var(--border-2))'}}>
                                {isSwitch ? '⇄' : '↑'} {u.name}
                                <span style={{color:'var(--text-4)'}}>
                                  {isSwitch
                                    ? ` best from ${SK[u.skill]} ${u.level}`
                                    : ` unlocks · ${SK[u.reqSkill] || SK[u.skill]} ${u.reqLevel}`}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div style={{textAlign:'right', flexShrink:0, fontFamily:'var(--mono)'}}>
                      <div style={{fontSize:13, color: dM >= 0 ? 'var(--teal)' : 'var(--red)'}}>{signed(dM, mm.fmt)}<span style={{fontSize:9, color:'var(--text-4)'}}> {mm.short}</span></div>
                      <div style={{fontSize:10, color:'var(--text-3)'}}>{fmt2(ph.startDps)} → {fmt2(ph.endDps)} dps <span style={{color: dDps>=0?'var(--green)':'var(--red)'}}>({signed(dDps, fmt2)})</span></div>
                      <div style={{fontSize:9, color:'var(--text-4)'}}>cb {ph.combat} · Σ{fmtXp(ph.cumXp)}</div>
                    </div>
                  </div>
                );
              })}
              {plan.truncated && <div style={{padding:'8px 0', fontFamily:'var(--mono)', fontSize:10, color:'var(--amber)'}}>Plan truncated at 600 levels — lower a target to see the full route.</div>}
            </div>

            {/* gear unlock timeline */}
            {plan.unlocks.length > 0 && (
              <>
                <div className="h-strip" style={{marginTop:6}}><span className="title">Gear timeline</span>
                  <span className="meta">↑ unlock · ⇄ DPS crossover</span></div>
                <div style={{padding:'10px 14px'}}>
                  <table className="table" style={{width:'100%', fontFamily:'var(--mono)', fontSize:11, borderCollapse:'collapse'}}>
                    <thead><tr style={{color:'var(--text-3)', textAlign:'left'}}>
                      <th style={{padding:'4px 8px', fontWeight:400}}>ITEM</th>
                      <th style={{padding:'4px 8px', fontWeight:400}}>WHY</th>
                      <th style={{padding:'4px 8px', fontWeight:400, textAlign:'right'}}>AT</th>
                      <th style={{padding:'4px 8px', fontWeight:400, textAlign:'right'}}>Σ XP</th>
                      <th style={{padding:'4px 8px', fontWeight:400, textAlign:'right'}}>DPS</th>
                    </tr></thead>
                    <tbody>
                      {plan.unlocks.map((u, i) => {
                        const col = SLOT_COLOR[u.slot] || 'var(--text-1)';
                        const isSwitch = u.type === 'switch';
                        return (
                          <tr key={i} style={{borderTop:'1px solid var(--border-1)'}}>
                            <td style={{padding:'5px 8px', color: col, whiteSpace:'nowrap'}}>{isSwitch ? '⇄' : '↑'} {u.name}</td>
                            <td style={{padding:'5px 8px', color:'var(--text-3)'}}>
                              {isSwitch
                                ? <>overtakes {u.prevName}</>
                                : <>unlock · {SP.SLOT_LABEL[u.slot]}</>}
                            </td>
                            <td style={{padding:'5px 8px', textAlign:'right', color:'var(--text-1)', whiteSpace:'nowrap'}}>
                              {isSwitch ? `${SK[u.skill]} ${u.level}` : `${SK[u.reqSkill] || SK[u.skill]} ${u.reqLevel}`}</td>
                            <td style={{padding:'5px 8px', textAlign:'right', color:'var(--text-3)'}}>{fmtXp(u.cumXp)}</td>
                            <td style={{padding:'5px 8px', textAlign:'right', color:'var(--text-2)', whiteSpace:'nowrap'}}>{fmt2(u.dpsBefore)} → {fmt2(u.dpsAfter)} <span style={{color: u.dpsAfter>=u.dpsBefore?'var(--green)':'var(--red)'}}>({signed(u.dpsAfter-u.dpsBefore, fmt2)})</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* dps vs xp chart */}
            <div className="h-strip" style={{marginTop:6}}><span className="title">DPS vs cumulative XP</span>
              <span className="meta">dashed = gear changes</span></div>
            <div style={{padding:'10px 14px 4px'}}><DpsChart plan={plan} /></div>
          </>
        )}

        {/* gear pool */}
        <div className="h-strip" style={{marginTop:6, cursor:'pointer'}} onClick={() => setShowPool(v => !v)}>
          <span className="title">{showPool ? '▾' : '▸'} Gear pool</span>
          <span className="meta">items the planner may equip · tap to {showPool ? 'hide' : 'edit'}</span></div>
        {showPool && <PoolEditor combatType={combatType} pool={pool} setPool={setPool} futureWeapons={futureWeapons} base={base} />}

        {/* notes */}
        <div style={{padding:'12px 14px 24px', fontFamily:'var(--mono)', fontSize:10, color:'var(--text-4)', lineHeight:1.6}}>
          <div>· <span style={{color:'var(--text-3)'}}>↑ unlock</span> = a level requirement is met and a new item becomes equippable. <span style={{color:'var(--text-3)'}}>⇄ crossover</span> = a weapon you could already use becomes the highest-DPS choice as a stat climbs (e.g. rune scimitar overtaking a dragon longsword once Strength is high enough that the faster speed wins).</div>
          <div>· <span style={{color:'var(--text-3)'}}>🔒 Lock a skill</span> to freeze it at its current level — it won't be recommended for training and the planner won't offer gear that needs more of it (lock Defence for a pure account; lock Defence at 45 by training it there first, then locking).</div>
          <div>· Decisions use <span style={{color:'var(--text-3)'}}>{mm.label}</span> per XP, so Defence is credited for tankiness (less food → higher trip efficiency) and for the gear it unlocks (d'hide / splitbark / rune armour at 40 Def), not just raw DPS. The current-XP fields let a part-trained level cost only its remaining XP.</div>
          <div>· Armour each level is the most defensive (or, for ranged/magic, the highest-attack) equippable item in your pool; the weapon/spell is chosen by simulating every pool candidate. Lookahead lets the planner climb Attack toward a distant weapon instead of pouring everything into Strength.</div>
          <div>· <span style={{color:'var(--text-3)'}}>Avg over session</span> models potions as a decaying average (drink → peak → repot). A full running-boost timeline (max hit stepping down between sips) is a deeper change to the engine — flagged as a follow-up.</div>
        </div>
      </div>
    );
  }

  window.PlannerPane = PlannerPane;
})();
