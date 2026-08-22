# Spec — sourcing prices from LC-bankvalue

Status: **implemented 2026-08-21** — see §7 for what actually landed
Date: 2026-08-20

## 1. Where we are now

`scrape_prices.py` in this repo hits `markets.lostcity.rs` **one page per item**,
89 items in `DEFAULT_ITEMS`, at `RATE = 1.1s` — roughly 100 seconds of requests, run by
hand, needing `requests` installed. It writes three files that the app already knows how
to eat:

| File | Shape | Consumed by |
|---|---|---|
| `prices.json` | flat `{gamedata_key: gp}` + `_scraped_at` | `market.js` autoload → `GameData.ITEM_PRICES` |
| `alch.json` | flat `{gamedata_key: alch_gp}` | `market.js` autoload → `GameData.ALCH_VALUES` |
| `price-history.json` | `[{t, prices}]`, capped at 160 | `market.js` `loadSharedHistory()` → Economy tab |

Last run was 2026-08-02 (`_scraped_at` 1785659955); the README still advertises 13 July.
17 history snapshots exist. That staleness is the actual problem — the scraper works, it
just only runs when someone remembers.

`LC-bankvalue` already solved this. Its `scripts/scrape_prices.py` reads **three list
feeds** instead of per-item pages (~56 requests, ~1 min, stdlib only), assigns every item
a price with an explicit confidence tier (`market` / `bid` / `ask` / `stale` / `alch` /
`vendor` / `dose` / `fixed` / …), and a GitHub Action commits the result daily at 04:15
UTC. It publishes `data/prices.json` (2,639 priced entries, keyed by numeric item id) and
`data/items.json` (3,894 items: `slug`, `name`, `cost`, `category`, `tradeable`) — both
read straight out of LostCityRS/Content build 274, so ids and slugs are authoritative.

Both repos live under `github.com/index-rs`.

## 2. The mapping actually lines up

Measured, not assumed. Taking this repo's 128 priced keys and resolving them through the
existing `SLUG` map into LC-bankvalue's `slug → id` index:

```
identity-slug hits   98
via existing SLUG    29
unresolved            1   (super_set — a derived bundle, never scraped)
LC has a price for  127   (110 market, 4 stale, 13 alch)
```

And alch is free: `int(items.json[id].cost * 0.6)` reproduces **all 135** overlapping
entries in our `alch.json` exactly. No scraping needed for alch at all, ever.

So the join key is the market slug, and we already maintain the only 29 exceptions.

## 3. Options

**A. Mirror job — adapter script + own GH Action.** (recommended)
A new `scripts/sync_prices.py` fetches LC-bankvalue's `prices.json` + `items.json` from
raw.githubusercontent, maps to gamedata keys, writes `prices.json` / `alch.json` /
`price-history.json` in today's exact format, and a workflow commits daily. Zero runtime
changes, zero scraping from this repo, `file://` and offline still work, committed history
keeps filling, and the Economy tab is untouched.

**No second scrape.** This never touches `markets.lostcity.rs`. Two static GETs to
raw.githubusercontent (`prices.json` 367 KB + `items.json` 630 KB, ~1 MB), against
today's 89 sequential page fetches at 1.1s. LC-bankvalue already pays the ~56-request
scrape once a day; this repo just reads what it produced.

**B. Runtime fetch — `market.js` pulls LC data on load.**
Always fresh with nothing committed, but: needs network on every visit, depends on
GH Pages CORS, breaks the standalone/`file://` build, and `price-history.json` stops
accumulating (that file is what makes a first-time visitor's Economy tab non-empty).
Rejected as the primary path; worth adding later as a *fallback* when the committed file
is older than N days.

**C. Port LC-bankvalue's tiered scraper into this repo.**
Fixes speed and dependency-freeness but leaves two scrapers to maintain against the same
site. No.

Recommendation: **A**, and delete nothing — keep `scrape_prices.py` as the manual escape
hatch if LC-bankvalue's feed ever breaks.

## 4. Design (Option A)

```
LC-bankvalue (daily 04:15 UTC)
  data/prices.json  {id: {price, tier, asOf, sampleSize, …}}
  data/items.json   {id: {slug, name, cost, tradeable, category}}
        │  raw.githubusercontent.com/index-rs/LC-bankvalue/main/data/…
        ▼
index-sim  scripts/sync_prices.py   (daily 05:15 UTC)
        │  slug map + tier policy + derived keys
        ▼
  prices.json · alch.json · price-history.json   (unchanged format)
        ▼
  market.js autoload → GameData.ITEM_PRICES / ALCH_VALUES
```

### 4.1 Key mapping

Move the `SLUG` dict out of `scrape_prices.py` into `scripts/slug_map.py` and import it
from both scripts — one source of truth, 44 entries today. Resolution order per gamedata
key: explicit `SLUG` entry → identity slug → unresolved (warn, keep previous value).

Build `slug → id` from `items.json`, first id wins (the `cert_` noted variants carry their
own slugs so they never collide).

### 4.2 Tier policy

LC-bankvalue prices *everything*, so the question is which tiers we let overwrite us.

| LC tier | Action here |
|---|---|
| `market`, `bid`, `dose`, `charge`, `enchant`, `noted` | accept |
| `fixed`, `sameAs` | accept — hand-set upstream, deliberate |
| `alch`, `vendor` | accept, EXCEPT for bulk-unsellable keys — see below |
| `ask` | accept, but do not treat as scraped for the Economy tab |
| `stale` | accept only if we have no existing value for the key |
| `unfinished`, `junk`, `container` | accept; none of our keys land here today |
| item untradeable / missing from `prices.json` | reject, keep current value |

17 of our keys resolve to a non-market tier, and **all 17 are bulk-unsellable** —
`isBulkUnsellable()` ([gamedata.js:1720](../gamedata.js)) already models the fact that
nobody buys mithril/adamant gear or low rune weapons in stacks. For those the engine sets
`saleValue = 0` ([engine.js:1086](../engine.js)) and values the drop as
`max(0, dropAlch − natCost)`. **Their `ITEM_PRICES` entry never reaches gp/kill.**

That makes the whole tier argument nearly moot: whichever way the rule falls, not one EV
number changes for 16 of 17 keys. The two that looked alarming —

| key | ours | LC (`alch`) | reality |
|---|---|---|---|
| `mithril_spear` | 10,000 | 168 | bulk-dead; hand-set 2026-06-25, never used in EV |
| `rune_dagger` | 15,000 | 4,461 | bulk-dead; overwrote its own 4,458 on 2026-06-25 |

— were display-only warts in the Economy tab, not valuation bugs. 99% of both get alched,
which is precisely what the engine already does with them. **Resolved 2026-08-20:** both
keys, plus `magic_staff`, were dropped from `prices.json` and `price-history.json`, and
`magic_staff` was added to the bulk-unsellable set (`UNSELLABLE_STAVES` in `gamedata.js`)
— it is shop-stocked, so its listing is a hope, not a bid. `scrape_prices.py` already
excluded all three, so nothing re-adds them.

The remaining 15 agree within ±3 gp (`mithril_sword` 167 vs 168, `rune_battleaxe` 24,618
vs 24,621, `rune_longsword` 18,860 vs 18,861, …) because our scraper fell back to alch for
them too.

**Rule:** reject `alch`/`vendor` for bulk-unsellable keys — a net-of-nature alch estimate
is not a sale price, and shipping 168 as `mithril_spear`'s "market value" is as misleading
as 10,000, just in the other direction. Accept them elsewhere. The three worst offenders have already been dropped from
`prices.json` entirely (see above); extending that to every bulk-unsellable key is the
fully honest presentation but is a UI change, out of scope here.

**Overrides live upstream.** If a hand-set price is ever genuinely wanted, add it to
`FIXED_PRICES` in LC-bankvalue's `scripts/lc_items.py` (keyed by slug, overrides every
tier and the live market; already used to pin cannon parts and soul runes). It arrives
here as tier `fixed` and is accepted like anything else. One override table for both
projects — do not grow a second one in this repo.

Keys in `gamedata.js` `STATIC_PRICES` and anything `is_excluded()` already rejects stay
excluded — the sync must not start writing prices for talismans and rune javelins.

### 4.3 Special cases

* **Potions.** LC prices real item ids, and 2004scape tops out at 3 doses — only
  `3dose*` / `2dose*` / `1dose*` slugs exist. This repo's trip model counts 4-dose vials,
  so the existing `POTION_3DOSE_KEYS` × `DOSE_3_TO_4` scaling carries over verbatim: read
  the `3dose…` id, multiply by 4/3, round. Unchanged behaviour, just a different source.
* **`_randomherb_avg` / `unidentified_guam`.** Ours is a weighted *random herb* average
  (1,750); LC's `unidentified_guam` id is the literal Guam herb (366). Different meanings
  — do not map. Keep deriving `_randomherb_avg` locally from the `herb_*` keys.
* **`super_set`.** Stays derived: `super_attack + super_strength + super_defence`, after
  dose scaling, exactly as `scrape_prices.py` does today.
* **`alch.json` — unit trap.** Regenerate wholesale from `items.json` `cost × 0.6`,
  verified identical on all 135 shared keys. Do **not** feed LC's `alch`-*tier price*
  into `ALCH_VALUES`: that number is already **net** of the nature rune (`mithril_spear`
  845 → 507 − 339 = 168), whereas `ALCH_VALUES` is **gross** and `engine.js` subtracts
  `natCost` itself at [engine.js:1130](../engine.js). Conflating them double-subtracts a
  nature rune on every alch in the sim. Gross alch comes from `cost`; the alch tier is a
  price estimate and is only ever a `prices.json` candidate.
* **`_scraped_at`.** Set from LC's `asOf` (the upstream scrape time), not our run time,
  so the Economy tab reports when the *prices* were taken.

### 4.3b Alch values — done, 2026-08-20

`sync_alch.py` regenerates the `const ALCH` table in `gamedata.js` from
LC-bankvalue's `items.json` (`floor(cost * 0.6)`). Nothing was added to the
LC-bankvalue scraper: high alch is a content constant, not a market price, and
`items.json` already publishes `cost` for all 3,894 items. Stdlib only, so it runs
in CI; `--check` reports drift and exits 1.

This was not cosmetic. **54 of 66 entries were wrong** — `adamant_platebody` read
16,128 against a true 7,680, `adamant_platelegs` 9,600 against 3,840. The table is
not merely a `file://` fallback either: `alchForName()` reads it directly, so
`defaultLootAction()` was gating on bad numbers live. Six drops changed default
action as a result (Steel kiteshield / warhammer / 2h sword / battleaxe skip→alch,
Black dagger / axe alch→skip).

It also surfaced a mapping bug: `SLUG` mapped `magic_staff` to `staff_of_air`, but
Content has them as separate items — `magic_staff` is id 1389 (cost 200, alch 120),
`staff_of_air` is id 1381 (cost 1500, alch 900). `alch.json` carried 900 for a
120gp item. Both fixed.

When `sync_prices.py` lands it should absorb this script, or call it, so one job
refreshes prices and alch together.

### 4.4 History

Reuse `update_price_history()` unchanged — same 160-point cap, same `{t, prices}` shape,
same "skip if identical to last snapshot" rule. `t` comes from the upstream `asOf`, which
keeps snapshots one-per-upstream-refresh even if our job runs twice.

### 4.5 Workflow

`.github/workflows/update-prices.yml`, modelled on LC-bankvalue's:

* cron `15 5 * * *` — an hour after upstream, so it picks up the fresh commit
* `workflow_dispatch` for manual runs
* `concurrency: update-prices`, `cancel-in-progress: false`
* `permissions: contents: write`
* python 3.12, no pip install (stdlib `urllib` only — drops the `requests` dependency)
* commit `prices.json alch.json price-history.json` with `[skip ci]`, no-op if unchanged

Cross-repo `repository_dispatch` from LC-bankvalue would be tighter, but it needs a PAT
(`GITHUB_TOKEN` can't trigger workflows in another repo). Not worth a token for a job
whose input changes once a day — cron it.

### 4.6 App changes

None required. Optionally, once this is live: surface `_scraped_at` age in the Economy
tab and drop the hardcoded "Prices updated …" line in the README, which will go stale
again the moment it's written.

## 5. Validation

1. **Dry run** — `python scripts/sync_prices.py --dry-run` prints a table of every key:
   old value, new value, tier, % change, and the accept/reject decision. Nothing written.
2. **Diff review** — expect large moves on the first run; the current file is 18 days old.
   Known outliers to eyeball: `dragon_spear` 280k→350k, `dragonstone` 182k→225k,
   `adamant_platebody` 21.8k→15k, `mithril_platebody` 10.3k→16.5k. 102 of 127 keys land
   within 20% of today's values, which is the sanity check that the mapping is right.
3. **Guard** — abort the whole run (non-zero exit, no write) if fewer than 100 keys
   resolve, or if more than 10 keys move by more than 5×. A silent bad mapping is worse
   than a stale file. Note the first run legitimately trips a 5× move on `mithril_spear`
   (10,000 → 168) and a 3× on `rune_dagger` (15,000 → 4,461) — both are the intended
   corrections from §4.2, so review that first diff by hand rather than tuning the guard
   around it.
4. **Load test** — open `index.html`, confirm the `[prices]` console line, Economy tab
   populated, gem EV recalculated (`recalcGemEV`).

## 6. Open questions

* Pin LC-bankvalue to a tag/commit, or always track `main`? Tracking `main` is simpler and
  the data is append-only in practice; a bad upstream refresh would propagate within a day.
  The extreme-mover guard in §5 is the mitigation.
* Should `ask`-tier prices count as "scraped" for the Economy tab's scraped-key registry?
  Proposed no — an ask is a hope, not a trade.
* Worth widening `DEFAULT_ITEMS`? LC-bankvalue has prices for 2,639 items and we use 128.
  Adding coverage is now nearly free, but only matters if the sim gains items that need it.

## 7. What landed (2026-08-21)

| File | Role |
|---|---|
| `keymap.py` | One key/slug table for all three scripts. `scrape_prices.py` now imports from it instead of holding its own copy. |
| `sync_prices.py` | The adapter. Two GETs to raw.githubusercontent, tier policy, dose scaling, guards, `--dry-run`. |
| `sync_alch.py` | Rewrites `const ALCH` in `gamedata.js` from `items.json` costs. `--check` for CI. |
| `.github/workflows/update-prices.yml` | Daily 05:15 UTC, stdlib only, commits the four changed files. |

First real run: **109 accepted, 14 kept, 100 changed, 0 unresolved.**

Three things the design missed, found by running it:

* **Two slug namespaces, not one.** §4.1 assumed the `SLUG` map would carry us
  into Content. It doesn't: 8 entries are market-site names that don't exist in
  Content (`bolt`→`bronze_bolts`, `3dose1attack`→`attack_potion_3_`). Resolution
  is identity-first, `SLUG` only as fallback. Verified no key resolves to two
  different Content items under that order, so the fallback is safe.
* **`unidentified_guam` had to join the derived keys.** §4.3 excluded
  `_randomherb_avg` but missed that `unidentified_guam` carries the same blended
  meaning here — `views.jsx` labels it "Unidentified herb" and `engine.js` reads
  it as `herbUnidGp`. Content's item is the literal unidentified Guam at 350
  against our 1,750 blend. It was the only key to trip the extreme-move guard,
  which is the guard doing its job.
* **Two tiers the spec never saw:** `bulk` (a market price with upstream's 50%
  low-volume haircut) and `cloth` (splitbark, priced from materials). Both are
  genuine sale prices, both accepted. `weapon_poison` 11,000 → 3,875 as a result.
  Unrecognised tiers are kept and reported, never guessed at.

**Resolved 2026-08-21:** the frozen herb keys are gone. Rather than invent a
refresh for a blended "unidentified herb" figure, the `unid` loot pref was
removed outright — herbs are now valued at identified prices (`loot`), at the
≥2,000 threshold (`value`), or skipped. `unidentified_guam` and
`_randomherb_avg` were deleted from `prices.json`, `alch.json`,
`price-history.json`, the `gamedata.js` baked tables, `keymap.py`, the
`scrape_prices.py` item list, and the `market.js` live-scrape herb set, so
nothing re-adds them. Stored `'unid'` overrides are dropped on load, falling
back to each herb's default action. `HERB_EV` (1,907) and `HERB_EV_HIGH`
(1,709) are computed from identified prices and were never affected.

## 8. Policy decisions (2026-08-21)

Six open questions, all settled:

**Fallback scraper is tracked.** `scrape_prices.py` came out of `.gitignore`. It
reads per-item pages from the market site while LC-bankvalue reads list feeds —
a genuinely independent path, so it survives an upstream breakage. It shares
`keymap.py` with the sync scripts, so both halves now live in the repo.

**CI checks alch, never writes it.** `gamedata.js` is source, not data. The
workflow runs `sync_alch.py --check` as its *last* step, so a red build reports
drift without blocking the price commit. Lost City's item costs have moved 7
times in upstream's entire history, so this should almost never fire; when it
does, run the script locally and commit the diff yourself.

**Basic elemental staves are bulk-unsellable.** `staff_of_air/water/earth/fire`
joined `UNSELLABLE_STAVES` in both `gamedata.js` and `keymap.py`, matching the
`vendor` call already made upstream. The elemental BATTLEstaves are deliberately
excluded — those trade properly at ~25k. Staff of water had no alch value
anywhere, which would have zeroed it once it went bulk-dead; all four are now in
`alch.json` and the `const ALCH` table at 900.

**Track `main`, don't pin.** Upstream is actively hand-tuned (several pricing
commits a day). Pinning would strand that work behind a manual version bump. The
extreme-move guard is the real protection.

**`ask` is last-resort only.** Moved from `ACCEPT` to `ACCEPT_IF_EMPTY`, so a
standing sell listing can never overwrite a real recorded sale — the last
genuine trade stands until the item trades again for real. An `ask` price is
only taken when we hold nothing at all. This is stronger than the original
plan of accepting it but hiding it from the Economy tab, and it removes the need
for that special case.

**Bulk-unsellable items carry no sale price at all.** The Economy tab is a nice
extra and does not get to imply a value the sim rejects; alch is the accurate
number for these. All 19 were dropped from `prices.json` and purged from
`price-history.json` (287 points), `sync_prices.py` refuses to price them, and
`market.js` gained a single `priceAllowed()` choke point guarding all three
write paths (live scrape, `prices.json` load, persisted cache) so no future path
can reintroduce them. A `V6` history pass clears each visitor's stored copy.
**Their alch values deliberately stay** — that is what the engine pays out.
