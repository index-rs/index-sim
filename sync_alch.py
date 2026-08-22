#!/usr/bin/env python3
"""
sync_alch.py — regenerate the ALCH fallback table in gamedata.js from Lost
City's own item costs, as published by LC-bankvalue.

High alch is not a market price, it's a content constant: floor(cost * 0.6).
LC-bankvalue's data/items.json carries `cost` for all 3,894 items, read
straight out of LostCityRS/Content. So there is nothing to scrape here and no
second source to keep in sync by hand — this script just copies the arithmetic
into gamedata.js.

Why it matters: `alchForName()` reads the `const ALCH` table DIRECTLY, not the
runtime ALCH_VALUES patched in from alch.json. So a stale entry changes what
`defaultLootAction()` decides (alch vs skip) even on the live site, and is the
only alch source at all for the file:// standalone build.

Stdlib only — no pip install, safe to run in CI.

Usage:
    python sync_alch.py                  # fetch from LC-bankvalue, rewrite
    python sync_alch.py --check          # report drift, write nothing, exit 1
    python sync_alch.py --items PATH     # use a local items.json instead
"""

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

ITEMS_URL = ("https://raw.githubusercontent.com/index-rs/LC-bankvalue"
             "/main/data/items.json")
GAMEDATA = Path(__file__).with_name("gamedata.js")
ALCH_JSON = Path(__file__).with_name("alch.json")

# High alch = floor(cost * 0.6). Not a guess — it's how the game computes it.
ALCH_RATE = 0.6

# gamedata key -> Content slug, for the few that differ. Lost City's own pack
# misspells the adamant warhammer; the rest of the ALCH table resolves on an
# identity slug.
ALIASES = {
    "adamant_warhammer": "adamnt_warhammer",
}


def load_items(src):
    if src and not str(src).startswith(("http://", "https://")):
        return json.loads(Path(src).read_text(encoding="utf-8"))
    url = src or ITEMS_URL
    print(f"fetching {url}", flush=True)
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def cost_by_slug(items):
    """slug -> cost. First id wins; cert_ variants carry their own slugs."""
    out = {}
    for entry in items.values():
        out.setdefault(entry["slug"], entry.get("cost") or 0)
    return out


def alch_for(key, costs):
    slug = ALIASES.get(key, key)
    if slug not in costs:
        return None
    return int(costs[slug] * ALCH_RATE)


def rewrite_block(text, costs):
    """Rewrite the numbers inside `const ALCH = {...}`, preserving layout."""
    m = re.search(r"(const ALCH = \{)(.*?)(\n\};)", text, re.S)
    if not m:
        sys.exit("ERROR: could not find the `const ALCH = {` block in gamedata.js")

    changes, unresolved = [], []

    def repl(mo):
        key, old = mo.group(1), int(mo.group(2))
        new = alch_for(key, costs)
        if new is None:
            unresolved.append(key)
            return mo.group(0)
        if new != old:
            changes.append((key, old, new))
        return f"{key}:{new}"

    # Scoped to the block body so the price tables elsewhere in gamedata.js —
    # which share these key names — are never touched.
    body = re.sub(r"(\w+)\s*:\s*(\d+)", repl, m.group(2))
    return text[:m.start(2)] + body + text[m.end(2):], changes, unresolved


def check_alch_json(costs):
    """alch.json is written by scrape_prices.py (it owns the SLUG map). We only
    report drift here rather than rewriting behind its back."""
    if not ALCH_JSON.exists():
        return []
    data = json.loads(ALCH_JSON.read_text(encoding="utf-8"))
    bad = []
    for key, val in data.items():
        if key.startswith("_"):
            continue
        new = alch_for(key, costs)
        if new is not None and new != val:
            bad.append((key, val, new))
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="report drift without writing; exit 1 if any")
    ap.add_argument("--items", help="path or URL to items.json")
    args = ap.parse_args()

    costs = cost_by_slug(load_items(args.items))
    print(f"{len(costs)} slugs with a cost\n", flush=True)

    # newline="" on both read and write: never translate line endings, so the
    # diff is the numbers we changed and nothing else.
    with open(GAMEDATA, encoding="utf-8", newline="") as fh:
        text = fh.read()
    new_text, changes, unresolved = rewrite_block(text, costs)

    if changes:
        width = max(len(k) for k, _, _ in changes)
        print(f"{'key':<{width}}{'was':>12}{'now':>12}{'delta':>12}")
        for key, old, new in sorted(changes, key=lambda c: -abs(c[1] - c[2])):
            print(f"{key:<{width}}{old:>12,}{new:>12,}{new - old:>+12,}")
    print(f"\n{len(changes)} corrected, "
          f"{len(unresolved)} unresolved{': ' + ', '.join(unresolved) if unresolved else ''}")

    drift = check_alch_json(costs)
    if drift:
        print(f"\nalch.json disagrees on {len(drift)} keys "
              f"(regenerate it via scrape_prices.py):")
        for key, old, new in drift:
            print(f"  {key:<28}{old:>10,} -> {new:>10,}")

    if args.check:
        if changes or drift:
            print("\n--check: drift found, nothing written.")
            return 1
        print("\n--check: gamedata.js ALCH is up to date.")
        return 0

    if changes:
        with open(GAMEDATA, "w", encoding="utf-8", newline="") as fh:
            fh.write(new_text)
        print(f"\nwrote {len(changes)} corrections to {GAMEDATA.name}")
    else:
        print("\nNothing to do — gamedata.js ALCH already matches.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
