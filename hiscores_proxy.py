#!/usr/bin/env python3
"""
hiscores_proxy.py — serve the app locally and proxy hiscores lookups.

The RSN box in the sidebar needs this. It cannot work from the page alone:
2004.lostcity.rs answers every request with

    access-control-allow-origin: https://2004.lostcity.rs

a fixed value that never echoes the caller, so a browser fetch from
file://, localhost or Pages is blocked before the response is read. A proxy is
the only way, and this is the smallest one that does the job — stdlib only, one
file, no build step, same as the other scripts here.

Everything except the RSN box works without it. Open index.html directly, or
serve it any other way, and the app is fully usable; this only lights up the
one feature that needs a server.

Usage:
    python hiscores_proxy.py                 # serve . on :8000
    python hiscores_proxy.py --port 8080
    python hiscores_proxy.py --check Index   # one lookup, print it, exit

Then open http://localhost:8000/ and type a name into the RSN box.
"""

import argparse
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse, parse_qs

HERE = Path(__file__).parent
UPSTREAM = "https://2004.lostcity.rs/api/hiscores/player/"
TIMEOUT = 12

# The upstream row `type` for each skill the app can fill in. Type 0 is the
# overall row (total level, total xp); the app has no field for it, so it is
# read past rather than mapped.
SKILL_BY_TYPE = {
    1: "attack",
    2: "defence",
    3: "strength",
    4: "hitpoints",
    5: "ranged",
    6: "prayer",
    7: "magic",
}

# Display names are what the RSN box shows on a partial result.
SKILL_LABELS = {
    "attack": "Attack", "defence": "Defence", "strength": "Strength",
    "hitpoints": "Hitpoints", "ranged": "Ranged", "prayer": "Prayer",
    "magic": "Magic",
}

# LostCity rules: 1-12 characters, letters, digits, spaces and underscores.
# Checked here so a junk name is refused locally instead of spent upstream.
VALID_NAME = re.compile(r"^[A-Za-z0-9 _]{1,12}$")

# Upstream rate-limits hard and fast — three lookups a few seconds apart is
# enough to earn a 429. A minimum gap plus a short cache keeps an impatient
# double-click, or a retype of the same name, from costing anything.
MIN_INTERVAL = 2.0
CACHE_TTL = 120.0

# The server is threaded, so two lookups can land at once. The lock serializes
# upstream calls: without it both would read the same _last_call, both would
# decide no wait was needed, and the rate gap would not exist.
_lock = threading.Lock()
_last_call = 0.0
_cache = {}


class HiscoresError(Exception):
    """A failure with an HTTP status and a message fit to show the user."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def fetch_player(player):
    """Look a player up, honouring the rate gap and the cache.

    Returns the payload views.jsx expects: a player name and a skills map of
    level per skill, plus xp and rank for anything that wants them later.
    """
    global _last_call

    key = player.lower()
    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < CACHE_TTL:
            return hit[1]

    with _lock:
        gap = MIN_INTERVAL - (time.monotonic() - _last_call)
        if gap > 0:
            time.sleep(gap)
        return _fetch_upstream(player, key)


def _fetch_upstream(player, key):
    """The upstream call itself. Runs with _lock held."""
    global _last_call

    request = urllib.request.Request(
        UPSTREAM + quote(player, safe=""),
        headers={"Accept": "application/json", "User-Agent": "index-sim/hiscores-proxy"},
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            content_type = (response.headers.get("Content-Type") or "").lower()
            if not content_type.startswith("application/json"):
                raise HiscoresError(502, "upstream did not return JSON")
            raw = response.read(256_000)
    except urllib.error.HTTPError as exc:
        _last_call = time.monotonic()
        if exc.code == 404:
            raise HiscoresError(404, f"no hiscores entry for {player}") from exc
        if exc.code == 429:
            retry = exc.headers.get("Retry-After") if exc.headers else None
            suffix = f" — retry in {retry}s" if retry and retry.isdigit() else ""
            raise HiscoresError(429, f"upstream rate limit{suffix}") from exc
        raise HiscoresError(502, f"upstream returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        _last_call = time.monotonic()
        raise HiscoresError(504, f"could not reach 2004.lostcity.rs ({exc.reason})") from exc

    _last_call = time.monotonic()

    try:
        rows = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HiscoresError(502, "could not parse upstream response") from exc
    if not isinstance(rows, list):
        raise HiscoresError(502, "unexpected upstream shape")

    # An unknown player is an empty array with status 200, not a 404, so this
    # is the only place a missing name is detectable.
    if not rows:
        raise HiscoresError(404, f"no hiscores entry for {player}")

    skills, xp, rank = {}, {}, {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        skill = SKILL_BY_TYPE.get(row.get("type"))
        if not skill:
            continue
        level = row.get("level")
        if not isinstance(level, int) or not 1 <= level <= 99:
            continue
        skills[skill] = level
        # `value` is xp scaled by ten upstream.
        value = row.get("value")
        if isinstance(value, int) and value >= 0:
            xp[skill] = value // 10
        if isinstance(row.get("rank"), int):
            rank[skill] = row["rank"]

    if not skills:
        raise HiscoresError(404, f"no ranked skills for {player}")

    missing = [SKILL_LABELS[s] for s in SKILL_BY_TYPE.values() if s not in skills]
    payload = {
        "player": player,
        "skills": skills,
        "xp": xp,
        "rank": rank,
        "missing": missing,
        "source": "2004.lostcity.rs",
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    _cache[key] = (time.monotonic(), payload)
    return payload


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # SimpleHTTPRequestHandler logs every asset. Only the lookups matter.
        pass

    def end_headers(self):
        # The app is edited in place and reloaded; a cached views.jsx would
        # show stale code and waste an afternoon.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path != "/api/hiscores":
            super().do_GET()
            return

        player = (parse_qs(urlparse(self.path).query).get("player") or [""])[0].strip()
        if not player:
            self._send_json({"error": "no player name given"}, 400)
            return
        if not VALID_NAME.match(player):
            self._send_json(
                {"error": "names are 1-12 characters: letters, digits, spaces, underscores"}, 400
            )
            return

        try:
            payload = fetch_player(player)
        except HiscoresError as exc:
            print(f"  hiscores: {player} — {exc.message}", flush=True)
            self._send_json({"error": exc.message}, exc.status)
            return

        print(f"  hiscores: {player} — {len(payload['skills'])} skills", flush=True)
        self._send_json(payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--check", metavar="RSN", help="one lookup, print it, exit")
    args = parser.parse_args()

    if args.check:
        if not VALID_NAME.match(args.check.strip()):
            print("error: names are 1-12 characters: letters, digits, spaces, underscores",
                  file=sys.stderr)
            return 1
        try:
            print(json.dumps(fetch_player(args.check.strip()), indent=2))
        except HiscoresError as exc:
            print(f"error: {exc.message}", file=sys.stderr)
            return 1
        return 0

    handler = partial(Handler, directory=str(HERE))
    # Threading, not HTTPServer: the browser opens several keep-alive
    # connections at once for the app's scripts, and a single-threaded server
    # sits on the first one and never gets to the rest.
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"index-sim on http://localhost:{args.port}/  (ctrl-c to stop)")
    print("hiscores lookups proxied to 2004.lostcity.rs")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
