# 2004scape Combat Simulator — deploy folder

Everything in this folder is the complete, static site. No build step, no server.

## Deploy to GitHub Pages

1. Put these files at the **root of a repo** (or in a `/docs` folder).
2. Push to GitHub.
3. Repo **Settings → Pages**:
   - **Source:** Deploy from a branch
   - **Branch:** `main` · folder `/ (root)`  (or `/docs` if you used that)
4. Save. Your site goes live at `https://<user>.github.io/<repo>/` in ~1 min.

## Updating prices (every few days)

1. Run the scraper locally (`python scrape_prices.py` or `update_prices.bat`).
2. Copy the new `prices.json` + `alch.json` into this folder.
3. Commit + push. The live site auto-loads them on next visit.

That's it — the live scraper UI is hidden for visitors, and every visitor gets
their own isolated session (all state is stored in their own browser).
