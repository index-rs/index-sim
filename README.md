# 2004scape Combat Simulator
Revision 274

Prices refresh automatically every day at 05:15 UTC from
[LC-bankvalue](https://github.com/index-rs/LC-bankvalue), which scrapes
markets.lostcity.rs and publishes the result. The in-app timestamp is the
authority on how fresh the data is — see `_scraped_at` in `prices.json`.

See [docs/price-sync-spec.md](docs/price-sync-spec.md) for how the sync works.

## Checking gamedata against source

`gamedata.js` is hand-authored. Two tools check it against the LostCityRS/Content
data it was transcribed from, so drift shows up as a diff instead of a wrong
gp/hr number.

Drop tables, against the RuneScript drop tables — point at the checkout root,
the tree is walked recursively:

```bash
node tools/audit-droptables.js "<content-checkout>"
```

Monster combat stats, against the `all.npc` dumps and the area/quest configs:

```bash
node tools/audit-npcstats.js "<content-checkout>"
```

Neither needs an install step; both load `gamedata.js` in a plain Node `vm`
context, the same way the browser does.

See [docs/droptable-audit.md](docs/droptable-audit.md) and
[docs/npc-stat-audit.md](docs/npc-stat-audit.md).

## Golden tests

20 scenarios run through the simulator and compared against a recorded
baseline, so a refactor that moves gp/hr or kills/hr numbers fails loudly:

```bash
node tools/run-golden.js
```

Exit code is 1 on any mismatch. When a change is deliberate, re-record with
`--update`. See [docs/golden-tests.md](docs/golden-tests.md).

## Running it locally

Open `index.html` directly and everything works except the RSN hiscores box,
which needs a server because the hiscores API refuses cross-origin reads:

```bash
python hiscores_proxy.py
```

That serves the app on http://localhost:8000/ and proxies the lookups. Stdlib
only, no build step. See [docs/hiscores.md](docs/hiscores.md).
