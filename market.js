// market.js — price sync from markets.lostcity.rs
// Fetches last 5 sold prices per item, averages them, and patches GameData.ITEM_PRICES.
// Attaches window.syncMarketPrices(monster, onDone) for the UI button.
// Falls back gracefully if CORS blocks the fetch.

(function(){

  const BASE = 'https://markets.lostcity.rs';

  // ---- Scraped-price key registry ----------------------------------------
  // Tracks which item keys carry a REAL scraped market price — i.e. they came
  // from a prices.json load, a live market scrape, or a manual import, NOT from
  // a gamedata default/static placeholder. The Economy tab uses this to show
  // only genuinely market-priced items. Persisted so the set survives reloads
  // where the file/remote fetch might not re-run.
  const SCRAPED_KEYS_LS = 'sim_scraped_keys_v1';
  const _scrapedKeys = new Set();
  try {
    const seed = JSON.parse(localStorage.getItem(SCRAPED_KEYS_LS) || '[]');
    if (Array.isArray(seed)) seed.forEach(k => _scrapedKeys.add(k));
  } catch(_){}
  function noteScrapedKeys(obj){
    if (!obj || typeof obj !== 'object') return;
    let added = false;
    for (const k of Object.keys(obj)){
      if (k.charAt(0) === '_') continue;            // skip _scraped_at etc.
      if (typeof obj[k] !== 'number' || obj[k] <= 0) continue;
      if (!_scrapedKeys.has(k)){ _scrapedKeys.add(k); added = true; }
    }
    if (added){ try { localStorage.setItem(SCRAPED_KEYS_LS, JSON.stringify([..._scrapedKeys])); } catch(_){} }
  }
  window.getScrapedPriceKeys = () => _scrapedKeys;

  // Map internal gamedata item keys → market URL slugs
  // Add entries here as more items are needed.
  const SLUG_MAP = {
    // gems
    sapphire:        'uncut_sapphire',
    emerald:         'uncut_emerald',
    ruby:            'uncut_ruby',
    diamond:         'uncut_diamond',
    dragonstone:     'uncut_dragonstone',
    // bones
    bones:           'bones',
    big_bones:       'big_bones',
    dragon_bones:    'dragon_bones',
    // runes
    airrune:         'air_rune',
    waterrune:       'water_rune',
    earthrune:       'earth_rune',
    firerune:        'fire_rune',
    mindrune:        'mind_rune',
    bodyrune:        'body_rune',
    chaosrune:       'chaos_rune',
    deathrune:       'death_rune',
    bloodrune:       'blood_rune',
    naturerune:      'nature_rune',
    lawrune:         'law_rune',
    cosmicrune:      'cosmic_rune',
    soulrune:        'soul_rune',
    // ammo
    bronze_arrow:    'bronze_arrow',
    iron_arrow:      'iron_arrow',
    steel_arrow:     'steel_arrow',
    rune_arrow:      'rune_arrow',
    bolt:            'crossbow_bolt',
    // food
    tuna:            'tuna',
    lobster:         'lobster',
    bass:            'bass',
    swordfish:       'swordfish',
    shark:           'shark',
    // hides
    dragonhide_green:'green_dragonhide',
    dragonhide_blue: 'blue_dragonhide',
    // ores + bars
    coal:            'coal',
    gold_ore:        'gold_ore',
    mithril_ore:     'mithril_ore',
    adamantite_ore:  'adamantite_ore',
    iron_ore:        'iron_ore',
    gold_bar:        'gold_bar',
    steel_bar:       'steel_bar',
    mithril_bar:     'mithril_bar',
    adamantite_bar:  'adamant_bar',
    // herbs
    limpwurt_root:   'limpwurt_root',
    // misc
    cow_hide:        'cowhide',
    body_talisman:   'body_talisman',
    air_talisman:    'air_talisman',
    // jewel-table talismans (now market-scraped, not fixed-price)
    chaos_talisman:  'chaos_talisman',
    nature_talisman: 'nature_talisman',
    // armour / weapons (high value drops worth tracking)
    rune_full_helm:  'rune_full_helm',
    rune_med_helm:   'rune_med_helm',
    rune_chainbody:  'rune_chainbody',
    rune_scimitar:   'rune_scimitar',
    rune_dagger:     'rune_dagger',
    fire_battlestaff:'fire_battlestaff',
    mithril_sq_shield:'mithril_sq_shield',
    mithril_kiteshield:'mithril_kiteshield',
    mithril_chainbody:'mithril_chainbody',
    adamant_platelegs:'adamant_platelegs',
    adamant_full_helm:'adamant_full_helm',
    // accessory — ring of recoil supply cost tracks the live market
    ring_of_recoil:  'ring_of_recoil',
  };

  // Fetch the last N sold prices + high-alch value for one item.
  // Returns { price, alch } — either may be null if unavailable.
  // The markets site is generated from real 2004scape obj data, so its
  // alch value is authoritative (use it over OSRS-memory estimates).
  async function fetchItemData(slug, n=5){
    let price = null, alch = null;

    const pickAlch = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      return obj.highalch ?? obj.high_alch ?? obj.highAlch ?? obj.alchhigh
        ?? obj.alch ?? obj.alchemy ?? obj.highalchemy ?? null;
    };
    const avgOf = (history) => {
      if (!Array.isArray(history) || !history.length) return null;
      const prices = history.slice(0, n).map(h => h.price ?? h.value ?? h.gold ?? h);
      const nums = prices.filter(p => typeof p === 'number' && p > 0);
      return nums.length ? Math.round(nums.reduce((a,b)=>a+b,0)/nums.length) : null;
    };

    // Try JSON API endpoints first
    const apiUrls = [
      `${BASE}/api/items/${slug}`,
      `${BASE}/api/item/${slug}`,
      `${BASE}/items/${slug}.json`,
    ];
    for (const url of apiUrls){
      try {
        const res = await fetch(url, { mode:'cors' });
        if (res.ok){
          const data = await res.json();
          const item = data.item ?? data;
          price = avgOf(data.history ?? data.recentSales ?? data.trades ?? data.sales)
            ?? item.price ?? item.value ?? item.lastSale ?? price;
          alch = pickAlch(item) ?? pickAlch(data) ?? alch;
          if (price != null) return { price, alch };
        }
      } catch(_){}
    }

    // Fallback: parse __NEXT_DATA__ from the HTML page
    try {
      const res = await fetch(`${BASE}/items/${slug}`, { mode:'cors' });
      if (res.ok){
        const html = await res.text();
        const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (m){
          const nextData = JSON.parse(m[1]);
          const props = nextData?.props?.pageProps ?? {};
          const item = props.item ?? props;
          price = avgOf(props.history ?? item?.history ?? props.recentSales ?? props.trades)
            ?? item?.price ?? item?.value ?? price;
          alch = pickAlch(item) ?? pickAlch(props) ?? alch;
        }
        if (price == null){
          const priceMatches = [...html.matchAll(/"price"\s*:\s*(\d+)/g)].map(mm=>+mm[1]);
          const sample = priceMatches.slice(0, n).filter(p => p > 0);
          if (sample.length) price = Math.round(sample.reduce((a,b)=>a+b,0)/sample.length);
        }
        if (alch == null){
          const am = html.match(/"(?:highalch|high_alch|highAlch|alch)"\s*:\s*(\d+)/i);
          if (am) alch = +am[1];
        }
      }
    } catch(e){
      console.warn('[market] CORS or fetch error for', slug, e.message);
    }
    return { price, alch };
  }

  // Back-compat shim — old callers expect just the price.
  async function fetchAvgPrice(slug, n=5){
    const { price } = await fetchItemData(slug, n);
    return price;
  }

  // Get all unique item keys referenced in a monster's loot table
  function itemKeysForMonster(monster){
    if (!monster) return [];
    const keys = new Set();
    for (const drop of (monster.loot || [])){
      // map drop name back to a price key
      const raw = drop.name.toLowerCase().replace(/\s+×\d+$/, '')
        .replace(/\s/g,'_').replace(/[^a-z0-9_]/g,'');
      if (SLUG_MAP[raw]) keys.add(raw);
    }
    // also always-include high-value keys
    ['dragon_bones','dragonhide_green','dragonhide_blue','big_bones','rune_full_helm'].forEach(k=>keys.add(k));
    return [...keys];
  }

  // Sync prices for the current monster + common items.
  // Calls onDone() when finished (even on error).
  async function syncMarketPrices(monster, onDone){
    if (!window.GameData){
      console.warn('[market] GameData not loaded yet');
      onDone && onDone({ error:'GameData not ready' });
      return;
    }

    const keys = itemKeysForMonster(monster);
    // also sync the gem table
    ['sapphire','emerald','ruby','diamond','dragonstone'].forEach(k => {
      if (!keys.includes(k)) keys.push(k);
    });

    let synced = 0, failed = 0;
    const results = {};

    for (const key of keys){
      const slug = SLUG_MAP[key];
      if (!slug) continue;
      const { price, alch } = await fetchItemData(slug, 5);
      if (price !== null && price > 0){
        window.GameData.ITEM_PRICES[key] = price;
        results[key] = price;
        synced++;
      } else {
        failed++;
      }
      // alch value is authoritative from the markets site — store it
      if (alch !== null && alch >= 0 && window.GameData.ALCH_VALUES){
        window.GameData.ALCH_VALUES[key] = alch;
      }
      // polite rate-limiting — 1 req/s
      await new Promise(r => setTimeout(r, 1050));
    }

    // Recalculate gem table EV with new prices (JEWEL_TABLE-based).
    if (typeof window.GameData.recalcGemEV === 'function'){
      window.GameData.recalcGemEV();
    }

    const now = new Date();
    window._marketLastSync  = now.toLocaleTimeString();
    window._marketSynced    = (window._marketSynced ?? 0) + synced;
    if (synced > 0) recordPriceSnapshot(Math.floor(now.getTime()/1000));

    console.log(`[market] sync done: ${synced} updated, ${failed} failed`, results);
    onDone && onDone({ synced, failed, results });
    return { synced, failed, results };
  }

  window.syncMarketPrices = syncMarketPrices;
  window.marketSlugMap    = SLUG_MAP;

  // Component item keys behind the special tagged drops (gem / herb / etc),
  // added to the scrape set so their underlying prices stay fresh.
  const SPECIAL_KEYS = {
    gem:  ['uncut_sapphire','uncut_emerald','uncut_ruby','uncut_diamond','dragonstone'],
    casket: ['uncut_sapphire','uncut_emerald','uncut_ruby','uncut_diamond',
             'loop_half_key','tooth_half_key','cosmic_talisman'],
    herb: ['herb_guam','herb_marrentill','herb_tarromin','herb_harralander',
           'herb_ranarr','herb_irit','herb_avantoe','herb_kwuarm',
           'herb_cadantine','herb_lantadyme','herb_dwarf_weed','unidentified_guam'],
  };

  // Collect every unique item key across ALL monsters' loot tables,
  // EXCLUDING items that don't need scraping (static price, or a default
  // action of skip/bury/alch — those use fixed/alch values, not market data).
  function allLootKeys(){
    const G = window.GameData;
    const statics = G?.STATIC_PRICES || {};
    const keys = new Set();
    for (const m of (G?.MONSTERS || [])){
      // loot may contain nested arrays (gem drops return arrays)
      const flat = (m.loot || []).flat();
      for (const drop of flat){
        // pull in component prices behind gem/herb tagged drops
        if (drop.tag && SPECIAL_KEYS[drop.tag]){
          SPECIAL_KEYS[drop.tag].forEach(k => keys.add(k));
          continue;
        }
        if (!drop.key || drop.key === 'coins') continue;
        if (drop.key in statics) continue;                 // fixed price
        const act = G?.defaultLootAction ? G.defaultLootAction(drop) : null;
        if (act === 'skip' || act === 'bury' || act === 'alch') continue;
        keys.add(drop.key);
      }
    }
    // Always-scrape extras that aren't ordinary loot-table keys: the recoil ring
    // (a supply cost) and the jewel-table talismans (overground/underground).
    ['ring_of_recoil','chaos_talisman','nature_talisman'].forEach(k => keys.add(k));
    return [...keys];
  }

  // ---- Price-history snapshots -------------------------------------------
  // The app otherwise only ever holds ONE price set (the latest). To track
  // change over time we append a compact snapshot of the live ITEM_PRICES to
  // localStorage every time prices are applied (scrape / import / live sync /
  // restore). The Economy tab reads these back to highlight the biggest movers.
  const HISTORY_KEY = 'sim_price_history_v1';
  const HISTORY_CAP = 160;          // keep the last N snapshots

  function loadPriceHistory(){
    try { const a = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(a) ? a : []; } catch(_){ return []; }
  }

  // Build a {key:price} map of the current prices, dropping meta keys (_foo)
  // and non-positive values. Returns null if there is nothing to record.
  function currentPriceMap(){
    const src = window.GameData && window.GameData.ITEM_PRICES;
    if (!src) return null;
    const out = {};
    for (const [k,v] of Object.entries(src)){
      if (k.charAt(0) === '_') continue;
      if (typeof v === 'number' && v > 0) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  }

  function sameMap(a, b){
    if (!a || !b) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (a[k] !== b[k]) return false;
    return true;
  }

  // Record a snapshot. tsOpt (unix seconds) overrides the timestamp; otherwise
  // GameData.scrapedAt, else now. Dedupes: a snapshot sharing the previous
  // entry's timestamp replaces it; an identical price map is skipped.
  function recordPriceSnapshot(tsOpt){
    const prices = currentPriceMap();
    if (!prices) return;
    let t = (typeof tsOpt === 'number' && tsOpt > 0) ? Math.floor(tsOpt)
          : (typeof window.GameData?.scrapedAt === 'number' ? window.GameData.scrapedAt
          : Math.floor(Date.now()/1000));
    const hist = loadPriceHistory();
    const last = hist[hist.length - 1];
    if (last){
      if (sameMap(last.prices, prices)){
        // No price change — just keep the freshest timestamp on the last entry.
        if (t > last.t){ last.t = t; save(hist); }
        return;
      }
      if (last.t === t){ hist[hist.length - 1] = { t, prices }; save(hist); return; }
    }
    hist.push({ t, prices });
    while (hist.length > HISTORY_CAP) hist.shift();
    save(hist);
    function save(h){ try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch(_){} }
  }

  function clearPriceHistory(){ try { localStorage.removeItem(HISTORY_KEY); } catch(_){} }

  // Merge the committed, shipped price history (price-history.json, sitting next
  // to the HTML) into the visitor's local timeline. This is what lets a brand-new
  // visitor see a populated Economy tab immediately, instead of having to return
  // across multiple price pushes for the per-browser timeline to fill in. Each
  // shared snapshot is keyed by its timestamp; we add only the ones the visitor
  // doesn't already have, then re-sort and cap. The visitor's own scrapes/imports
  // are preserved and interleaved by time.
  async function loadSharedHistory(){
    try {
      const r = await fetch('price-history.json');
      if (!r.ok) return;
      const shared = await r.json();
      if (!Array.isArray(shared) || !shared.length) return;
      const hist = loadPriceHistory();
      const byT = new Map(hist.map(h => [h.t, h]));
      let added = 0;
      for (const snap of shared){
        if (!snap || typeof snap.t !== 'number' || !snap.prices) continue;
        if (!byT.has(snap.t)){ byT.set(snap.t, { t: snap.t, prices: snap.prices }); added++; }
      }
      if (added){
        const merged = [...byT.values()].sort((a,b)=>a.t-b.t);
        while (merged.length > HISTORY_CAP) merged.shift();
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(merged)); } catch(_){}
      }
    } catch(_){}
  }

  // One-time cleanup of placeholder prices that leaked into the FIRST (oldest)
  // snapshot before real scrapes existed. v1 stripped the fixed talisman/recoil
  // values; v2 strips the gamedata-default placeholders for items whose real
  // market price arrived later (granite shield, super antipoison, cannonball,
  // ring of recoil) so the Economy tab doesn't show a bogus placeholder→market
  // jump on them. Each migration runs once (guarded by its own flag).
  const HISTORY_SANITIZED_KEY = 'sim_price_history_sanitized_v1';
  const HISTORY_SANITIZED_V2_KEY = 'sim_price_history_sanitized_v2';
  const NON_MARKET_FIXED = { chaos_talisman: 500, nature_talisman: 15000, ring_of_recoil: 1500 };
  const NON_MARKET_BOGUS_KEYS = ['granite_shield','super_antipoison','mcannonball','ring_of_recoil'];
  const HISTORY_SANITIZED_V3_KEY = 'sim_price_history_sanitized_v3';
  const HISTORY_SANITIZED_V4_KEY = 'sim_price_history_sanitized_v4';
  // Exact static placeholder values that leaked into history for these non-market
  // items (they were never really worth this) — purge every matching point so the
  // Economy tab stops showing a bogus swing. Runs once per browser.
  const NON_MARKET_STATIC = { granite_shield: 35000, super_antipoison: 760, mcannonball: 180, cannonball: 180, chaos_talisman: 500 };
  function sanitizePriceHistory(){
    try {
      const hist = loadPriceHistory();
      let changed = false;
      if (!localStorage.getItem(HISTORY_SANITIZED_KEY)){
        for (const snap of hist){
          if (!snap || !snap.prices) continue;
          for (const [k, badVal] of Object.entries(NON_MARKET_FIXED)){
            if (snap.prices[k] === badVal){ delete snap.prices[k]; changed = true; }
          }
        }
        localStorage.setItem(HISTORY_SANITIZED_KEY, '1');
      }
      if (!localStorage.getItem(HISTORY_SANITIZED_V2_KEY)){
        if (hist.length){
          // oldest snapshot = minimum timestamp
          let oldest = hist[0];
          for (const s of hist) if (s && s.t < oldest.t) oldest = s;
          if (oldest && oldest.prices){
            for (const k of NON_MARKET_BOGUS_KEYS){
              if (k in oldest.prices){ delete oldest.prices[k]; changed = true; }
            }
          }
        }
        localStorage.setItem(HISTORY_SANITIZED_V2_KEY, '1');
      }
      if (!localStorage.getItem(HISTORY_SANITIZED_V3_KEY)){
        for (const snap of hist){
          if (!snap || !snap.prices) continue;
          for (const [k, badVal] of Object.entries(NON_MARKET_STATIC)){
            if (snap.prices[k] === badVal){ delete snap.prices[k]; changed = true; }
          }
        }
        localStorage.setItem(HISTORY_SANITIZED_V3_KEY, '1');
      }
      if (!localStorage.getItem(HISTORY_SANITIZED_V4_KEY)){
        // Re-run the static-placeholder purge. Earlier builds re-injected these
        // ghosts via restorePersistedPrices (the persisted cache carries stale
        // gamedata defaults) AFTER V3 had already cleaned them, so a one-shot V3
        // guard wasn't enough. The re-injection is now fixed at the source, so a
        // single extra purge clears the timeline for good.
        for (const snap of hist){
          if (!snap || !snap.prices) continue;
          for (const [k, badVal] of Object.entries(NON_MARKET_STATIC)){
            if (snap.prices[k] === badVal){ delete snap.prices[k]; changed = true; }
          }
        }
        localStorage.setItem(HISTORY_SANITIZED_V4_KEY, '1');
      }
      if (changed) localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    } catch(_){}
  }

  window.getPriceHistory    = loadPriceHistory;
  window.recordPriceSnapshot = recordPriceSnapshot;
  window.clearPriceHistory  = clearPriceHistory;
  window.loadSharedHistory  = loadSharedHistory;
  window.sanitizePriceHistory = sanitizePriceHistory;

  // Apply a {key: price} + {key: alch} result set to GameData and persist
  // to localStorage so it survives reloads / standalone re-opens.
  function applyScrapeResults(prices, alch){
    if (!window.GameData) return 0;
    let n = 0;
    for (const [k,v] of Object.entries(prices || {})){
      if (typeof v === 'number' && v > 0){ window.GameData.ITEM_PRICES[k] = v; n++; }
    }
    noteScrapedKeys(prices);
    // Persist scrape timestamp if the incoming prices carry one.
    if (prices && typeof prices._scraped_at === 'number'){
      window.GameData.scrapedAt = prices._scraped_at;
      try { localStorage.setItem('sim_scraped_at_v1', String(prices._scraped_at)); } catch(_){}
    }
    if (window.GameData.ALCH_VALUES){
      for (const [k,v] of Object.entries(alch || {})){
        if (typeof v === 'number' && v >= 0) window.GameData.ALCH_VALUES[k] = v;
      }
    }
    if (typeof window.GameData.recalcGemEV === 'function') window.GameData.recalcGemEV();
    try {
      localStorage.setItem('sim_prices_v1', JSON.stringify(window.GameData.ITEM_PRICES));
      localStorage.setItem('sim_alch_v1',   JSON.stringify(window.GameData.ALCH_VALUES || {}));
    } catch(_){}
    // Capture this state for the price-history timeline.
    recordPriceSnapshot(prices && typeof prices._scraped_at === 'number' ? prices._scraped_at : undefined);
    return n;
  }

  // Detect whether the local run_sim.py server is available.
  async function serverAvailable(){
    try {
      const r = await fetch('/api/prices', { method:'GET' });
      return r.ok;
    } catch(_){ return false; }
  }

  // One-click: scrape EVERY monster's loot via the local server (2s/item).
  // onProgress({phase, done, total, ok, fail}) is called as it runs.
  async function scrapeAllViaServer(onProgress){
    const ok = await serverAvailable();
    if (!ok){
      onProgress && onProgress({ phase:'error',
        message:'Local server not found. Run "python run_sim.py" and open the simulator from http://localhost:8000.' });
      return { error:'no-server' };
    }
    const items = allLootKeys();
    onProgress && onProgress({ phase:'scraping', done:0, total:items.length });
    try {
      const res = await fetch('/api/scrape', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      const n = applyScrapeResults(data.prices, data.alch);
      onProgress && onProgress({ phase:'done', applied:n, ok:data.ok, fail:data.fail });
      return data;
    } catch(e){
      onProgress && onProgress({ phase:'error', message:e.message });
      return { error:e.message };
    }
  }

  // On load, restore any locally-persisted prices first (instant, offline).
  function restorePersistedPrices(){
    if (!window.GameData) return;
    try {
      const p = JSON.parse(localStorage.getItem('sim_prices_v1') || 'null');
      const a = JSON.parse(localStorage.getItem('sim_alch_v1') || 'null');
      if (p) for (const [k,v] of Object.entries(p)) if (v>0) window.GameData.ITEM_PRICES[k]=v;
      if (a && window.GameData.ALCH_VALUES) for (const [k,v] of Object.entries(a)) window.GameData.ALCH_VALUES[k]=v;
      // Restore scrape timestamp
      const ts = localStorage.getItem('sim_scraped_at_v1');
      if (ts) window.GameData.scrapedAt = parseInt(ts, 10);
      if (typeof window.GameData.recalcGemEV === 'function') window.GameData.recalcGemEV();
      // NOTE: deliberately does NOT record a price-history snapshot. sim_prices_v1
      // is the FULL ITEM_PRICES map, which still carries stale gamedata-default
      // placeholders for any item not in the user's last real scrape (granite
      // shield 35k, chaos talisman 500, super antipoison 760, cannonball 180…).
      // Recording it here re-injected those ghosts every load, showing a bogus
      // "static → market" jump in the Economy tab. Timeline points now come only
      // from real scraped data: the prices.json auto-load, a live sync, or import.
    } catch(_){}
  }

  window.scrapeAllViaServer   = scrapeAllViaServer;
  window.serverAvailable      = serverAvailable;
  window.applyScrapeResults   = applyScrapeResults;
  window.allLootKeys          = allLootKeys;
  setTimeout(restorePersistedPrices, 300);

  // Auto-load prices.json + alch.json if they exist next to the HTML file.
  // Works when running locally (file:// or http://localhost). The simulator
  // will patch GameData.ITEM_PRICES and ALCH_VALUES automatically on load.
  async function autoLoadPriceFiles(){
    if (!window.GameData) return;
    const files = [
      { url:'prices.json', target:'ITEM_PRICES', label:'prices' },
      { url:'alch.json',   target:'ALCH_VALUES', label:'alch'   },
    ];
    for (const f of files){
      try {
        const r = await fetch(f.url);
        if (!r.ok) continue;
        const data = await r.json();
        if (typeof data !== 'object') continue;
        const dest = window.GameData[f.target];
        if (!dest) continue;
        let n = 0;
        for (const [k,v] of Object.entries(data)){
          if (typeof v === 'number' && v > 0){ dest[k] = v; n++; }
        }
        if (n > 0) console.log(`[market] auto-loaded ${n} ${f.label} from ${f.url}`);
        if (f.target === 'ITEM_PRICES') noteScrapedKeys(data);
        // Pick up the scrape timestamp shipped inside prices.json.
        if (f.target === 'ITEM_PRICES' && typeof data._scraped_at === 'number'){
          window.GameData.scrapedAt = data._scraped_at;
          try { localStorage.setItem('sim_scraped_at_v1', String(data._scraped_at)); } catch(_){}
        }
      } catch(_){}
    }
    // Recompute gem EV with new prices
    if (typeof window.GameData.recalcGemEV === 'function'){
      window.GameData.recalcGemEV();
    }
    // Refresh the persisted cache from the canonical file, so next session's
    // restorePersistedPrices shows these fresh values instead of stale defaults.
    try {
      localStorage.setItem('sim_prices_v1', JSON.stringify(window.GameData.ITEM_PRICES));
      localStorage.setItem('sim_alch_v1',   JSON.stringify(window.GameData.ALCH_VALUES || {}));
    } catch(_){}
    // Seed the timeline with the shared, committed history first, then record
    // the freshly-loaded baseline on top of it.
    await loadSharedHistory();
    recordPriceSnapshot(window.GameData.scrapedAt);
  }

  // Run after a short delay so GameData is guaranteed to be initialised
  setTimeout(autoLoadPriceFiles, 500);
  window.autoLoadPriceFiles = autoLoadPriceFiles;

  // One-time history cleanup, after the price files have loaded + recorded.
  setTimeout(sanitizePriceHistory, 800);

  // Python fallback snippet — shown in UI if CORS blocks
  window.marketPythonSnippet = `
# Run this locally to update item prices AND high-alch values.
# pip install requests
import requests, json, time, re

BASE   = "https://markets.lostcity.rs"
ITEMS  = ${JSON.stringify(Object.values(SLUG_MAP).filter((v,i,a)=>a.indexOf(v)===i), null, 2)}
prices = {}
alch   = {}

def extract(slug):
    r = requests.get(f"{BASE}/items/{slug}", timeout=10)
    # try JSON first
    try:
        data = r.json()
    except Exception:
        # parse __NEXT_DATA__ from HTML
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, re.S)
        data = json.loads(m.group(1))["props"]["pageProps"] if m else {}
    item    = data.get("item", data)
    history = data.get("history", data.get("recentSales", []))
    recent  = [h["price"] for h in history[:5] if isinstance(h, dict) and "price" in h]
    price   = round(sum(recent)/len(recent)) if recent else item.get("price")
    a       = item.get("highalch") or item.get("high_alch") or item.get("alch")
    return price, a

for slug in ITEMS:
    try:
        p, a = extract(slug)
        if p: prices[slug] = p
        if a is not None: alch[slug] = a
        time.sleep(1.0)   # 1 req/s — be polite
    except Exception as e:
        print(f"  FAILED {slug}: {e}")

print("PRICES:", json.dumps(prices, indent=2))
print("ALCH:",   json.dumps(alch, indent=2))
# paste prices into ITEM_PRICES and alch into ALCH in gamedata.js
`.trim();

})();
