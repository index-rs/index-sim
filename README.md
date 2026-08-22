# 2004scape Combat Simulator
Revision 274

Prices refresh automatically every day at 05:15 UTC from
[LC-bankvalue](https://github.com/index-rs/LC-bankvalue), which scrapes
markets.lostcity.rs and publishes the result. The in-app timestamp is the
authority on how fresh the data is — see `_scraped_at` in `prices.json`.

See [docs/price-sync-spec.md](docs/price-sync-spec.md) for how the sync works.
