#!/usr/bin/env python3
"""
scrape_prices.py — fetch 2004scape market prices from markets.lostcity.rs
Requires:  pip install requests
Output:    prices.json  and  alch.json

Usage:
    python scrape_prices.py            # scrape all items
    python scrape_prices.py coal       # single item
    python scrape_prices.py --debug coal  # save raw HTML to debug.html
"""

import sys
print("scrape_prices.py starting...", flush=True)

import json, re, time
from html import unescape
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: run:  pip install requests")
    sys.exit(1)

BASE    = "https://markets.lostcity.rs"
HEADERS = {"User-Agent": "preservation-sim/0.1 price-scraper"}
RATE    = 1.1
MAX     = 5
TIMEOUT = 12

# Key/slug tables live in keymap.py so scrape_prices.py, sync_prices.py and
# sync_alch.py all read the same map.
from keymap import (  # noqa: E402
    SLUG, POTION_3DOSE_KEYS, DOSE_3_TO_4,
    TIER_PREFIXES, EQUIP_SUFFIXES, RUNE_ALCH, EXCLUDE_EXPLICIT,
    is_excluded, to_slug,
)

DEFAULT_ITEMS = [
    "dragon_bones",
    # arrows (bronze→rune; no black/adamant-tier black arrow in 2004)
    "bronze_arrow", "iron_arrow", "steel_arrow", "mithril_arrow",
    "adamant_arrow", "rune_arrow",
    # thrown knives (bronze→rune; black/no longer sold are skipped)
    "bronze_knife", "iron_knife", "steel_knife",
    "mithril_knife", "adamant_knife", "rune_knife",
    # thrown darts (bronze→rune)
    "bronze_dart", "iron_dart", "steel_dart",
    "mithril_dart", "adamant_dart", "rune_dart",
    "uncut_sapphire", "uncut_emerald", "uncut_ruby", "uncut_diamond",
    # dwarf multicannon ammo (steel cannonball)
    "mcannonball",
    # individual identified herbs (for 'loot' action per-herb prices)
    "herb_guam", "herb_marrentill", "herb_tarromin", "herb_harralander",
    "herb_ranarr", "herb_irit", "herb_avantoe", "herb_kwuarm",
    "herb_cadantine", "herb_lantadyme", "herb_dwarf_weed",
    "dragonhide_green", "dragonhide_blue", "dragonhide_red",
    # rune scimitar / 2h / armour ARE scraped (real market value, not alch-only)
    "rune_scimitar", "rune_2h", "dragon_spear", "fire_battlestaff",
    "rune_full_helm", "rune_med_helm", "rune_chainbody", "rune_platebody",
    "rune_platelegs", "rune_kiteshield", "rune_sq_shield",
    # granite shield — tradeable (real market value, not alch-only); slug = key
    "granite_shield",
    # ring of recoil — tradeable on the market; the per-shatter supply cost
    "ring_of_recoil",
    # jewel-table talismans — now market-scraped (chaos = underground spot,
    # nature = overground spot; nature is genuinely valuable ~15k).
    "chaos_talisman", "nature_talisman",
    "lobster", "swordfish", "shark", "tuna", "limpwurt_root",
    # seaweed — worth scraping (glass-making demand)
    "seaweed",
    # potions (3-dose scraped → scaled to 4-dose for the trip model)
    "super_attack", "super_strength", "super_defence",
    "restore_potion", "prayer_potion", "ranging_potion", "magic_potion",
    "antifire_potion",
    "super_antipoison",
    "loop_half_key", "tooth_half_key",
    "gold_bar", "steel_bar", "mithril_bar", "adamantite_bar", "coal",
    "gold_ore", "iron_ore", "mithril_ore", "adamantite_ore",
    "naturerune", "chaosrune", "deathrune", "lawrune",
    "airrune", "waterrune", "earthrune", "firerune",
    # metal dragon (bronze/iron/steel) drops @289. dragon_platelegs isn't
    # obtainable in game yet, so it has never traded — until a real sale shows
    # up here it carries a flagged GUESS (see PLACEHOLDER_PRICES in
    # gamedata.js); the first scraped price clears the flag automatically.
    # runite_bar was previously only a hard-coded fallback in the ultra-rare
    # table. NOT soulrune — fixed price in STATIC_PRICES (see EXCLUDE_EXPLICIT).
    "dragon_platelegs", "runite_bar", "rune_axe",
]



def parse_page(html):
    """Extract Inertia data-page JSON. Returns props dict or None."""
    m = re.search(r'data-page="([^"]*)"', html)
    if not m:
        return None
    try:
        return json.loads(unescape(m.group(1))).get("props", {})
    except Exception as e:
        print(f"    parse error: {e}", flush=True)
        return None


def get_prices_and_alch(props, key_hint=""):
    """Return (price_list, alch_value) from Inertia props."""
    item = props.get("item", {})
    sold = props.get("soldListings", {}).get("data", [])

    # Sold listings: only count coin-based trades
    # Each listing: offers[0].items[0] is the payment item.
    # Filter for slug='coins' or game_id=995 to exclude barter trades
    # (e.g. dragon bones traded for nature runes)
    cost = item.get("cost")
    alch = int(cost * 0.6) if cost and cost > 0 else None

    # Per-trade sanity cap for rune_platebody only — people list full rune
    # sets under the platebody slug. Cap at 70,000 gp per unit for that item.
    BUNDLE_CAPS = {
        "rune_platebody": 70_000,
        # Supers share a slug with super SETS (3 potions sold as one coin
        # listing). Cap the per-unit 3-dose price to drop those set sales:
        # singles sit ~1.2k (att/def) and ~3.5-4k (str); sets run 4-6k.
        "super_attack":  2_000,
        "super_defence": 2_000,
        "super_strength": 4_900,
    }
    max_unit_price = BUNDLE_CAPS.get(key_hint, 10_000_000)

    prices = []
    for listing in sold[:MAX * 3]:
        try:
            offer_item = listing["offers"][0]["items"][0]
            payment    = offer_item.get("item", {})
            is_coins   = (payment.get("slug") == "coins"
                          or payment.get("game_id") == 995
                          or payment.get("name","").lower() == "coins")
            if not is_coins:
                continue
            qty = int(offer_item["quantity"])
            if 0 < qty <= max_unit_price:
                prices.append(qty)
            if len(prices) >= MAX:
                break
        except (IndexError, KeyError, TypeError, ValueError):
            pass

    return prices, alch


NAT_RUNE_DEFAULT = 342  # fallback if nature rune price not yet scraped


def alch_fallback(alch_val, prices_dict):
    """Return alch - nature rune price as a fallback price."""
    if alch_val is None or alch_val <= 0:
        return None
    nat = prices_dict.get("naturerune", NAT_RUNE_DEFAULT)
    val = alch_val - nat
    return max(1, val) if val > 0 else None


def fetch(key, session, prices_so_far, debug=False):
    slug = to_slug(key)
    url  = f"{BASE}/items/{slug}"
    try:
        r = session.get(url, headers=HEADERS, timeout=TIMEOUT)
    except requests.RequestException as e:
        return None, None, f"network error: {e}"

    if debug:
        Path("debug.html").write_text(r.text, encoding="utf-8")
        print(f"    saved {len(r.text):,} bytes to debug.html", flush=True)

    if r.status_code == 404:
        return None, None, f"404 (slug '{slug}' not on site)"
    if r.status_code != 200:
        return None, None, f"HTTP {r.status_code}"

    props = parse_page(r.text)
    if props is None:
        return None, None, "data-page not found in HTML"

    prices_list, alch_val = get_prices_and_alch(props, key_hint=key)
    if not prices_list:
        fb = alch_fallback(alch_val, prices_so_far)
        if fb:
            return fb, alch_val, f"0 coin sales — using alch fallback: {fb:,} gp (alch {alch_val:,} - nat {prices_so_far.get('naturerune', NAT_RUNE_DEFAULT):,})"
        return None, alch_val, f"0 coin sales, no alch fallback available"

    avg = sum(prices_list) // len(prices_list)
    note = f"{avg:,} gp  ({len(prices_list)} coin sales)"
    if alch_val:
        note += f"  alch:{alch_val:,}"
    return avg, alch_val, note


def load_json(path):
    try:
        if Path(path).exists():
            return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Warning: could not read {path}: {e}", flush=True)
    return {}


PATCH_START = "<!-- __PRICES_PATCH_START__ -->"
PATCH_END   = "<!-- __PRICES_PATCH_END__ -->"


def update_price_history(prices, path="price-history.json", cap=160):
    """Append this scrape as a {t, prices} snapshot to the committed
    price-history.json that ships with the site, so the published Economy tab
    shows movers to every visitor (not just per-browser). Dedupes against the
    last entry the same way the in-app recorder does."""
    clean = {k: v for k, v in prices.items()
             if not k.startswith("_") and isinstance(v, (int, float)) and v > 0}
    if not clean:
        return
    t = int(prices.get("_scraped_at") or time.time())
    hist = []
    p = Path(path)
    if p.exists():
        try:
            loaded = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(loaded, list):
                hist = loaded
        except Exception as e:
            print(f"Warning: could not read {path}: {e}", flush=True)
    last = hist[-1] if hist else None
    if last and last.get("prices") == clean:
        # No price change — just keep the freshest timestamp on the last entry.
        if t > last.get("t", 0):
            last["t"] = t
    elif last and last.get("t") == t:
        hist[-1] = {"t": t, "prices": clean}
    else:
        hist.append({"t": t, "prices": clean})
    hist = hist[-cap:]
    p.write_text(json.dumps(hist), encoding="utf-8")
    print(f"\u2713 appended snapshot to {path} ({len(hist)} points)", flush=True)


def patch_html(prices, alch, html_name="Simulator Standalone.html"):
    """Bake prices+alch into the standalone HTML so it works from file://."""
    html_path = Path(html_name)
    if not html_path.exists():
        print(f"\n(skip patch: {html_name} not found in this folder)", flush=True)
        return
    html = html_path.read_text(encoding="utf-8")

    block = (
        f"\n{PATCH_START}\n<script>\n"
        f"(function(){{\n"
        f"  var P = {json.dumps(prices)};\n"
        f"  var A = {json.dumps(alch)};\n"
        f"  function apply(){{\n"
        f"    if (!window.GameData) return setTimeout(apply, 200);\n"
        f"    var pr = window.GameData.ITEM_PRICES, av = window.GameData.ALCH_VALUES, n = 0;\n"
        f"    for (var k in P) {{ if (P[k] > 0) {{ pr[k] = P[k]; n++; }} }}\n"
        f"    for (var k in A) {{ if (av && A[k] > 0) av[k] = A[k]; }}\n"
        f"    if (typeof window.GameData.recalcGemEV === 'function') window.GameData.recalcGemEV();\n"
        f"    console.log('[prices] baked in ' + n + ' prices');\n"
        f"  }}\n  apply();\n}})();\n"
        f"</script>\n{PATCH_END}\n"
    )

    # remove old patch block if present
    html = re.sub(re.escape(PATCH_START) + r".*?" + re.escape(PATCH_END),
                  "", html, flags=re.S)
    if "</body>" not in html:
        print(f"(skip patch: no </body> in {html_name})", flush=True)
        return
    html = html.replace("</body>", block + "</body>", 1)
    html_path.write_text(html, encoding="utf-8")
    print(f"✓ baked {len(prices)} prices into {html_name}", flush=True)


def main():
    debug   = "--debug" in sys.argv
    args    = [a for a in sys.argv[1:] if not a.startswith("--")]
    targets = args if args else DEFAULT_ITEMS
    # When using the default list, drop anything with a fixed/skip/bury/alch
    # default (no need to scrape). Explicit args are always honoured.
    if not args:
        before = len(targets)
        targets = [t for t in targets if not is_excluded(t)]
        if before - len(targets):
            print(f"(excluded {before - len(targets)} fixed/skip/alch items)", flush=True)

    prices = load_json("prices.json")
    alch   = load_json("alch.json")

    print(f"scraping {len(targets)} items from {BASE}", flush=True)
    print(f"rate: {RATE}s/req\n", flush=True)

    session = requests.Session()
    ok = fail = 0

    for i, key in enumerate(targets, 1):
        label = f"[{i:>3}/{len(targets)}] {key:<36}"
        print(f"  {label}", end="", flush=True)
        price, alch_val, note = fetch(key, session, prices, debug=(debug and i == 1))
        # Potions: scale the scraped 3-dose price up to a 4-dose value, which
        # is what the trip model counts (4-dose vials).
        if price is not None and key in POTION_3DOSE_KEYS:
            price = round(price * DOSE_3_TO_4)
            note += f"  →4-dose {price:,} gp"
        print(note, flush=True)
        if price is not None:
            prices[key] = price
            ok += 1
        else:
            fail += 1
        if alch_val is not None:
            alch[key] = alch_val

        if i < len(targets):
            time.sleep(RATE)

    # Super set = one 4-dose of each super (att/str/def), the standard combo.
    supers = [prices.get("super_attack"), prices.get("super_strength"),
              prices.get("super_defence")]
    if all(isinstance(s, (int, float)) and s > 0 for s in supers):
        prices["super_set"] = int(sum(supers))
        print(f"  {'derived super_set':<42}{prices['super_set']:,} gp  "
              f"(att+str+def 4-dose)", flush=True)

    # Stamp a scrape timestamp so the simulator can show price freshness.
    prices["_scraped_at"] = int(time.time())

    Path("prices.json").write_text(
        json.dumps(prices, indent=2, sort_keys=True), encoding="utf-8")
    Path("alch.json").write_text(
        json.dumps(alch, indent=2, sort_keys=True), encoding="utf-8")

    print(f"\nDone: {ok} prices, {fail} failed", flush=True)
    print(f"prices.json  — {len(prices)} entries", flush=True)
    print(f"alch.json    — {len(alch)} entries", flush=True)

    # Append this scrape to the shared, committed price-history timeline.
    update_price_history(prices)

    # Auto-patch the standalone HTML so prices load with no extra step
    patch_html(prices, alch)

    if fail:
        print(f"\nFor 404s: the item may not be traded on the market,", flush=True)
        print(f"or try --debug <itemname> to inspect the page.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        print(f"\nFATAL ERROR: {e}", flush=True)
        traceback.print_exc()
        sys.exit(1)
