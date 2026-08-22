#!/usr/bin/env python3
"""
sync_prices.py — refresh prices.json / alch.json / price-history.json from
LC-bankvalue's published data instead of scraping markets.lostcity.rs again.

LC-bankvalue (github.com/index-rs/LC-bankvalue) scrapes the market once a day
and commits data/prices.json + data/items.json. This reads those two files and
maps them onto gamedata keys. Two static GETs, no market requests, stdlib only.

Prices carry a confidence tier upstream. Not every tier is welcome here — see
TIER_POLICY below and docs/price-sync-spec.md §4.2 for why.

Usage:
    python sync_prices.py                 # fetch, apply, write
    python sync_prices.py --dry-run       # show the table, write nothing
    python sync_prices.py --data DIR      # use a local LC-bankvalue/data dir
    python sync_prices.py --force         # write even if a guard trips
"""

import argparse
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from keymap import (
    DERIVED_KEYS, DOSE_3_TO_4, POTION_3DOSE_KEYS,
    is_bulk_unsellable, to_content_slug,
)

RAW = "https://raw.githubusercontent.com/index-rs/LC-bankvalue/main/data"
HERE = Path(__file__).parent
PRICES = HERE / "prices.json"
ALCH = HERE / "alch.json"
HISTORY = HERE / "price-history.json"
HISTORY_CAP = 160

# Tiers we accept as a sale price. See docs/price-sync-spec.md §4.2.
# `bulk` is a market price with upstream's 50% low-volume haircut applied, and
# `cloth` is priced from materials — both are still what you'd get for selling
# one, so both are welcome. An unrecognised tier is kept, not guessed at.
ACCEPT = {"market", "bid", "dose", "charge", "enchant",
          "noted", "fixed", "sameAs", "unfinished", "bulk", "cloth"}
# Accepted only when we have nothing on file for that key.
#
# `ask` is a standing sell listing — a seller's hope, with nothing proving
# anyone pays it. `stale` is an old trade. Both lose to a real price we already
# hold: the last genuine sale stands until the item trades again for real.
ACCEPT_IF_EMPTY = {"stale", "ask"}
# Never a sale price: an alch/vendor estimate is what you'd get from destroying
# the item, not from selling it.
REJECT = {"alch", "vendor", "junk", "container"}

# Guards — a silent bad mapping is worse than a stale file.
MIN_RESOLVED = 90
MAX_EXTREME_MOVES = 10
EXTREME_FACTOR = 5


def fetch_json(name, data_dir):
    if data_dir:
        return json.loads((Path(data_dir) / name).read_text(encoding="utf-8"))
    url = f"{RAW}/{name}"
    print(f"fetching {url}", flush=True)
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def load_local(path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def as_of_epoch(entry):
    stamp = entry.get("asOf")
    if not stamp:
        return None
    try:
        return int(datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ")
                   .replace(tzinfo=timezone.utc).timestamp())
    except ValueError:
        return None


def decide(key, entry, current):
    """-> (new_price or None, reason). None means keep what we have."""
    tier = entry.get("tier", "?")
    price = entry.get("price")
    if not price or price <= 0:
        return None, f"{tier}: no price"
    if tier in REJECT:
        return None, f"{tier}: not a sale price"
    if tier in ACCEPT_IF_EMPTY:
        if current:
            return None, f"{tier}: keeping existing {current:,}"
        return price, f"{tier}: no existing value, accepted"
    if tier not in ACCEPT:
        return None, f"{tier}: unknown tier, ignored"
    if key in POTION_3DOSE_KEYS:
        return round(price * DOSE_3_TO_4), f"{tier}: {price:,} x4/3 (3-dose to 4-dose)"
    return price, tier


def update_history(prices, ts):
    hist = load_local(HISTORY, [])
    clean = {k: v for k, v in prices.items()
             if not k.startswith("_") and isinstance(v, int) and v > 0}
    last = hist[-1] if hist else None
    if last and last.get("prices") == clean:
        if ts > last.get("t", 0):
            last["t"] = ts
            HISTORY.write_text(json.dumps(hist), encoding="utf-8")
        return "unchanged"
    if last and last.get("t") == ts:
        hist[-1] = {"t": ts, "prices": clean}
    else:
        hist.append({"t": ts, "prices": clean})
    del hist[:-HISTORY_CAP]
    HISTORY.write_text(json.dumps(hist), encoding="utf-8")
    return f"{len(hist)} snapshots"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--data", help="local LC-bankvalue/data directory")
    ap.add_argument("--force", action="store_true",
                    help="write even if a guard trips")
    args = ap.parse_args()

    items = fetch_json("items.json", args.data)
    lc = fetch_json("prices.json", args.data)

    slug_to_id, by_id = {}, {}
    for iid, entry in items.items():
        slug_to_id.setdefault(entry["slug"], iid)
        by_id[iid] = entry
    known = set(slug_to_id)
    print(f"{len(items):,} items, {len(lc):,} priced\n", flush=True)

    prices = load_local(PRICES, {})
    alch = load_local(ALCH, {})
    keys = sorted(k for k in prices if not k.startswith("_"))

    rows, accepted, kept, unresolved, unpriced = [], 0, 0, [], []
    newest = 0
    for key in keys:
        if key in DERIVED_KEYS:
            continue
        # Bulk-unsellable gear carries no sale price at all. The engine zeroes
        # its sale value and pays out alch minus a nature rune regardless, so a
        # market figure here can only mislead whoever reads the Economy tab into
        # thinking a stack of adamant platebodies fetches 15k each. The Economy
        # tab is a nice extra; it does not get to imply a value the sim rejects.
        #
        # The ALCH value stays — that IS what these are worth, and it's what the
        # engine actually pays out.
        if is_bulk_unsellable(key):
            prices.pop(key, None)
            slug = to_content_slug(key, known)
            iid = slug_to_id.get(slug) if slug else None
            cost = (by_id.get(iid, {}).get("cost") or 0) if iid else 0
            if cost > 0:
                alch[key] = int(cost * 0.6)
            unpriced.append(key)
            continue
        slug = to_content_slug(key, known)
        iid = slug_to_id.get(slug) if slug else None
        if not iid or iid not in lc:
            unresolved.append(key)
            continue
        entry = lc[iid]
        newest = max(newest, as_of_epoch(entry) or 0)
        current = prices.get(key)
        new, reason = decide(key, entry, current)
        if new is None:
            kept += 1
            rows.append((key, current, current, reason, False))
            continue
        accepted += 1
        rows.append((key, current, new, reason, new != current))
        prices[key] = new
        cost = by_id[iid].get("cost") or 0
        if cost > 0:
            alch[key] = int(cost * 0.6)

    # super_set = one 4-dose of each super, the standard combo. Derived, never
    # resolved against an item id.
    supers = [prices.get(k) for k in
              ("super_attack", "super_strength", "super_defence")]
    if all(isinstance(s, int) and s > 0 for s in supers):
        prices["super_set"] = int(sum(supers))

    moved = [r for r in rows if r[4]]
    extreme = [r for r in moved
               if r[1] and (max(r[1], r[2]) / min(r[1], r[2]) >= EXTREME_FACTOR)]

    width = max((len(r[0]) for r in moved), default=12)
    if moved:
        print(f"{'key':<{width}}{'was':>11}{'now':>11}  source")
        for key, old, new, reason, _ in sorted(moved, key=lambda r: r[0]):
            print(f"{key:<{width}}{(old or 0):>11,}{new:>11,}  {reason}")
    print(f"\n{accepted} accepted, {kept} kept as-is, {len(moved)} changed, "
          f"{len(unpriced)} unpriced (bulk-unsellable, valued at alch), "
          f"{len(unresolved)} unresolved")
    if unresolved:
        print(f"unresolved: {', '.join(unresolved)}")
    if extreme:
        print(f"\n{len(extreme)} extreme move(s) (>={EXTREME_FACTOR}x):")
        for key, old, new, reason, _ in extreme:
            print(f"  {key:<{width}}{old:>11,} -> {new:>11,}  {reason}")

    failed = []
    if accepted + kept < MIN_RESOLVED:
        failed.append(f"only {accepted + kept} keys resolved "
                      f"(expected >= {MIN_RESOLVED}) — the slug mapping is "
                      f"probably broken")
    if len(extreme) > MAX_EXTREME_MOVES:
        failed.append(f"{len(extreme)} keys moved >= {EXTREME_FACTOR}x "
                      f"(max {MAX_EXTREME_MOVES})")
    if failed and not args.force:
        print("\nGUARD TRIPPED, nothing written:")
        for f in failed:
            print(f"  - {f}")
        print("Review the diff; re-run with --force if it is genuinely correct.")
        return 1

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return 0

    ts = newest or int(datetime.now(timezone.utc).timestamp())
    prices["_scraped_at"] = ts
    PRICES.write_text(json.dumps(prices, indent=2, sort_keys=True) + "\n",
                      encoding="utf-8")
    ALCH.write_text(json.dumps(alch, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8")
    state = update_history(prices, ts)
    stamp = datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"\nwrote prices.json ({len(keys)} keys), alch.json ({len(alch)} keys), "
          f"price-history.json ({state})")
    print(f"upstream prices as of {stamp}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
