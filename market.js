// market.js — price sync from markets.lostcity.rs
// Fetches last 5 sold prices per item, averages them, and patches GameData.ITEM_PRICES.
// Attaches window.syncMarketPrices(monster, onDone) for the UI button.
// Falls back gracefully if CORS blocks the fetch.

(function(){

  const BASE = 'https://markets.lostcity.rs';

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
    return [...keys];
  }

  // Apply a {key: price} + {key: alch} result set to GameData and persist
  // to localStorage so it survives reloads / standalone re-opens.
  function applyScrapeResults(prices, alch){
    if (!window.GameData) return 0;
    let n = 0;
    for (const [k,v] of Object.entries(prices || {})){
      if (typeof v === 'number' && v > 0){ window.GameData.ITEM_PRICES[k] = v; n++; }
    }
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
      } catch(_){}
    }
    // Recompute gem EV with new prices
    if (typeof window.GameData.recalcGemEV === 'function'){
      window.GameData.recalcGemEV();
    }
  }

  // Run after a short delay so GameData is guaranteed to be initialised
  setTimeout(autoLoadPriceFiles, 500);
  window.autoLoadPriceFiles = autoLoadPriceFiles;

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
