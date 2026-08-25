# Hiscores lookup

The RSN box in the sidebar fills in Attack, Strength, Defence, Hitpoints,
Prayer, Ranged and Magic from a player's 2004scape hiscores entry.

## Why it needs a local server

The page cannot call the hiscores API itself. `2004.lostcity.rs` answers every
request with a fixed header:

```
access-control-allow-origin: https://2004.lostcity.rs
```

That value never echoes the caller — it is the same whether the request comes
from `localhost`, a Pages deployment or no origin at all — so a browser blocks
the response before the app can read it. Checked directly against the live API,
not assumed. A proxy is the only way to reach it, and
[hiscores_proxy.py](../hiscores_proxy.py) is the smallest one that does the job:
one file, stdlib only, no build step.

**Everything else in the app works without it.** Open `index.html` however you
like; only the RSN box needs the proxy, and it says so when it is not there.

## Running it

```bash
python hiscores_proxy.py
```

Then open `http://localhost:8000/` and type a name into the RSN box. The proxy
serves the app's files as well, so this is the whole local setup.

```bash
python hiscores_proxy.py --port 8080
python hiscores_proxy.py --check Index    # one lookup, print the JSON, exit
```

`--check` is the fastest way to tell a proxy problem from an upstream one.

## The upstream API

`GET https://2004.lostcity.rs/api/hiscores/player/<name>` returns an array of
rows, one per ranked skill:

```json
[{"type":0,"level":1592,"value":1029036020,"rank":56},
 {"type":1,"level":89,"value":51015510,"rank":111}]
```

| | |
| --- | --- |
| `type` | 0 overall, then 1 attack, 2 defence, 3 strength, 4 hitpoints, 5 ranged, 6 prayer, 7 magic |
| `level` | the skill level, 1–99 |
| `value` | experience **scaled by ten** — divide by 10 for real xp |
| `rank` | hiscores position for that skill |

Type 0 is the overall row. The app has no total-level field, so it is skipped.

Two behaviours worth knowing, because neither is what you would guess:

- **An unknown player is `200 []`, not `404`.** An empty array is the only
  signal that a name does not exist, which is why the proxy turns it into a 404
  itself.
- **Rate limits arrive fast.** Three lookups a few seconds apart was enough to
  earn a `429` while this was being built. The proxy keeps a 2-second minimum
  gap between upstream calls and caches each result for two minutes, so a
  double-clicked Load button or a retyped name costs nothing.

## A skill that is missing

A player unranked in a skill has no row for it. The proxy reports those in
`missing`, and the app says so — `✓ Index — 5 stats loaded (unranked: Prayer,
Magic)` — rather than implying all seven were filled. Levels the lookup did not
return keep whatever value they already had. A failed lookup changes nothing at
all.

## Errors

Every failure comes back as `{"error": "..."}` with a status, and the app shows
the message as-is:

| status | when |
| --- | --- |
| 400 | empty name, or one outside 1–12 characters of letters, digits, spaces and underscores — refused locally rather than spent upstream |
| 404 | no hiscores entry, or no ranked skills |
| 429 | upstream rate limit, with its retry hint when it gives one |
| 502 | upstream returned non-JSON, an unexpected shape, or another HTTP error |
| 504 | could not reach 2004.lostcity.rs |

## Notes on the implementation

- The server is a `ThreadingHTTPServer`. A plain `HTTPServer` deadlocks: the
  browser opens several keep-alive connections at once for the app's scripts,
  and a single-threaded server sits on the first one and never reaches the rest.
  The page hangs half-loaded, which is exactly as confusing as it sounds.
- Upstream calls are serialized behind a lock, so two simultaneous lookups
  cannot both decide the rate gap had already elapsed.
- Responses are served `Cache-Control: no-store`. The app is edited in place and
  reloaded; a cached `views.jsx` would show stale code.

## Not covered: "Sync ALL" in the settings pane

The settings pane still tells you to run `python run_sim.py` before using
**Sync ALL**, which scrapes every monster's loot table for prices. That file is
not in the repo and this proxy does not replace it — it proxies hiscores only.
Prices now come from `sync_prices.py` via LC-bankvalue (see
[price-sync-spec.md](price-sync-spec.md)), so that button is a leftover from the
older workflow and the instruction under it is stale.
