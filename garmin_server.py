#!/usr/bin/env python3
"""
Garmin Connect local bridge — Playwright scraping edition.
Run: python garmin_server.py

Flow:
  POST /sync { known_ids: [...] }
    → opens a VISIBLE browser window
    → user logs in once (or already logged in via saved state)  
    → scrapes /app/activities in the SAME authenticated session
    → downloads each new FIT (up to 10) in the same session
    → closes browser, returns results
    → frontend saves workouts to Supabase

No headless context — avoids Cloudflare blocking entirely.
Session cookies saved after each successful sync for next time.
"""

import os, sys, subprocess, tempfile, json, threading, re, zipfile, io, base64, traceback
from pathlib import Path

REQUIRED = ["flask", "flask_cors", "playwright"]

# ── Config file ───────────────────────────────────────────────────────────────
# garmin_config.json is created automatically on first run.
# DOWNLOADED_ACTIVITIES_QUANTITY:
#   0  = no limit (download everything new, respecting infinite scroll)
#   N  = download at most N newest activities per sync
CONFIG_FILE = Path(__file__).parent / "garmin_config.json"
DEFAULT_CONFIG = {
    "DOWNLOADED_ACTIVITIES_QUANTITY": 10,
    "DOWNLOADED_ACTIVITIES_MAX_QUANTITY": 20,
    "FILTERS": ["all", "cycling", "running", "swimming", "hiking", "walking"],
}

def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            cfg = json.loads(CONFIG_FILE.read_text())
            # Merge with defaults so new keys are always present
            return {**DEFAULT_CONFIG, **cfg}
        except Exception:
            pass
    # Write defaults on first run
    CONFIG_FILE.write_text(json.dumps(DEFAULT_CONFIG, indent=2))
    print(f"  Created config: {CONFIG_FILE}")
    return dict(DEFAULT_CONFIG)

def check_and_install():
    missing = []
    for pkg in REQUIRED:
        try: __import__(pkg.replace("-","_"))
        except ImportError: missing.append(pkg)
    if not missing: return
    print(f"  Installing: {' '.join(missing)}")
    subprocess.run([sys.executable,"-m","pip","install"]+missing, capture_output=True)
    os.execv(sys.executable, [sys.executable]+sys.argv)

check_and_install()

def ensure_chromium():
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            try: b=p.chromium.launch(headless=True); b.close(); return
            except Exception: pass
    except ImportError: return
    print("  Installing Playwright Chromium (~120 MB, one-time)...")
    subprocess.run([sys.executable,"-m","playwright","install","chromium"])

ensure_chromium()

from flask import Flask, jsonify, request, make_response
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*":{"origins":"*","methods":["GET","POST","OPTIONS"],
                             "allow_headers":["Content-Type"]}})

@app.after_request
def add_cors(r):
    r.headers["Access-Control-Allow-Origin"]  = "*"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type"
    r.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return r

# ── State ─────────────────────────────────────────────────────────────────────
STATE_FILE = Path.home() / ".garmin_browser_state.json"

# Single shared sync status — one sync at a time
_status = {
    "running":   False,
    "step":      "",       # human-readable current step
    "results":   [],       # [{garmin_activity_id, activity_name, fit_b64, fit_size}]
    "message":   "",       # "3 new activities added" / "No new activities"
    "error":     None,
    "done":      False,
}

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")

# ── Utilities ─────────────────────────────────────────────────────────────────
def _extract_fit(data: bytes):
    """Return raw .fit bytes from a ZIP archive, or the data itself if already FIT."""
    if data[:2] == b'PK':
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                for name in zf.namelist():
                    if name.lower().endswith('.fit'):
                        return zf.read(name)
        except Exception:
            pass
    # Raw FIT: header length byte is 0x0E or 0x0C, followed by protocol version
    if len(data) > 12 and data[8:12] == b'.FIT':
        return data
    if len(data) > 4 and data[0] in (0x0E, 0x0C):
        return data
    return None

def _collect_ids_with_scroll(page, target: int, known_ids: set) -> list:
    """
    Collect garmin_activity_ids from /app/activities, scrolling down
    until we have `target` new ids (not in known_ids), or reach the bottom,
    or find a known id (stop-sentinel).

    target=0 means unlimited — scroll until bottom or known id found.
    """
    LINK_SELECTOR  = "a[href*='/app/activity/']"
    MAX_SCROLL_ATTEMPTS = 200   # safety cap (~200 scroll steps × ~500px)

    # Wait for initial render
    try:
        page.wait_for_selector(
            "[class*='ActivityList_activitiesListItems'] " + LINK_SELECTOR,
            timeout=15000,
        )
    except Exception:
        try: page.wait_for_selector(LINK_SELECTOR, timeout=8000)
        except Exception: pass
    page.wait_for_timeout(1000)

    def _current_ids():
        seen, ids = set(), []
        for link in page.locator(LINK_SELECTOR).all():
            try:
                href = link.get_attribute("href") or ""
                m    = re.search(r'/app/activity/(\d+)', href)
                if not m: continue
                aid  = int(m.group(1))
                if aid not in seen:
                    seen.add(aid); ids.append(aid)
            except Exception:
                continue
        return ids

    all_ids    = _current_ids()
    prev_count = 0

    for _ in range(MAX_SCROLL_ATTEMPTS):
        new_ids_so_far = [i for i in all_ids if i not in known_ids]

        # Stop conditions:
        # 1. Hit a known id → everything below is already in DB
        for aid in all_ids:
            if aid in known_ids:
                print(f"  Scroll: hit known id {aid}, stopping")
                return all_ids
        # 2. Have enough new ids
        if target > 0 and len(new_ids_so_far) >= target:
            print(f"  Scroll: have {len(new_ids_so_far)} new ids, stopping")
            return all_ids

        # Scroll down one viewport
        page.evaluate("window.scrollBy(0, window.innerHeight)")
        page.wait_for_timeout(600)   # wait for lazy-load

        all_ids    = _current_ids()
        new_count  = len(all_ids)
        if new_count == prev_count:
            # No new items loaded → we hit the bottom
            print(f"  Scroll: bottom reached ({new_count} total)")
            break
        prev_count = new_count

    return all_ids

# Folder to store downloaded ZIPs (relative to server script location)
GARMIN_ACTIVITIES_DIR = Path(__file__).parent / "garmin_activities"

def _download_one(page, activity_id: int) -> tuple:
    """
    Navigate to activity page, click ActivitySettingsMenu button,
    click 'Export file', save ZIP to garmin_activities/{id}.zip,
    extract .fit, return (fit_bytes, activity_name).
    """
    GARMIN_ACTIVITIES_DIR.mkdir(exist_ok=True)
    zip_path = GARMIN_ACTIVITIES_DIR / f"{activity_id}.zip"
    fit_path = GARMIN_ACTIVITIES_DIR / f"{activity_id}.fit"

    name = f"Activity {activity_id}"
    page.goto(f"https://connect.garmin.com/app/activity/{activity_id}",
              wait_until="domcontentloaded", timeout=20000)

    # Grab activity name
    try:
        name = (page.locator(
            "h1, [class*='ActivityHeader'] [class*='title'],"
            "[class*='activityName'], [class*='ActivityTitle']"
        ).first.text_content(timeout=3000) or name).strip()[:120]
    except Exception:
        pass

    # Click the ActivitySettingsMenu button (⋯ / gear icon)
    menu = page.locator("[class*='ActivitySettingsMenu']").first
    menu.wait_for(state="visible", timeout=15000)

    with page.expect_download(timeout=30000) as dl_info:
        menu.click()
        page.wait_for_timeout(800)

        # "Export File" is rendered as a <div class="Menu_menuItems__...">
        # Use text selector which matches any element by inner text
        export = page.get_by_text("Export File", exact=True)
        export.wait_for(state="visible", timeout=8000)
        print(f"    Export item found: '{export.text_content().strip()}'")
        export.click()

    # Save ZIP
    dl = dl_info.value
    dl.save_as(str(zip_path))
    print(f"    Saved: {zip_path} ({zip_path.stat().st_size:,} B)")

    # Extract .fit
    with open(zip_path, "rb") as f:
        raw = f.read()
    fit_bytes = _extract_fit(raw)

    # Save .fit alongside ZIP for debugging, clean up both after encoding
    if fit_bytes:
        fit_path.write_bytes(fit_bytes)
        print(f"    FIT:  {fit_path} ({len(fit_bytes):,} B)")

    # Clean up local files — data is returned as base64, no need to keep on disk
    zip_path.unlink(missing_ok=True)
    fit_path.unlink(missing_ok=True)

    return fit_bytes, name

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/config")
def get_config():
    """Return current config so the frontend can show available filters."""
    return jsonify(load_config())

@app.route("/ping")
def ping():
    return jsonify({
        "ok":      True,
        "status":  "running" if _status["running"] else "idle",
        "has_state": STATE_FILE.exists(),
    })

@app.route("/sync", methods=["POST","OPTIONS"])
def sync():
    """
    POST { "known_ids": [123, 456, ...] }

    Opens a browser window. If saved state exists, tries to use it silently
    (fast path — no login needed). If session expired, shows login page.

    Returns immediately with { ok, message: "Sync started" }.
    Poll GET /sync/status for progress and results.
    """
    if request.method == "OPTIONS": return make_response("",204)
    global _status
    if _status["running"]:
        return jsonify({"error":"Sync already in progress"}), 409

    body          = request.get_json(silent=True) or {}
    known_ids     = set(int(i) for i in (body.get("known_ids") or []))
    activity_type = (body.get("activity_type") or "all").strip().lower()
    cfg           = load_config()
    max_new       = cfg["DOWNLOADED_ACTIVITIES_QUANTITY"]  # 0 = unlimited

    def _run():
        global _status
        _status = {
            "running": True, "step": "Открываем браузер…",
            "results": [], "message": "", "error": None, "done": False,
        }

        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            _status.update(running=False, done=True,
                           error="playwright not installed"); return

        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(
                    headless=False,
                    args=["--no-first-run",
                          "--disable-blink-features=AutomationControlled"],
                )

                # Use saved state if available (may avoid login entirely)
                ctx_kwargs = {"viewport": {"width": 1280, "height": 800},
                              "user_agent": UA}
                if STATE_FILE.exists():
                    ctx_kwargs["storage_state"] = str(STATE_FILE)

                ctx  = browser.new_context(**ctx_kwargs)
                page = ctx.new_page()

                # Navigate to activities
                # Build activities URL with optional activityType filter
                _atype = activity_type if activity_type not in ("all", "") else "All"
                _activities_url = (
                    f"https://connect.garmin.com/app/activities?activityType={_atype}"
                )
                _status["step"] = "Открываем Garmin Connect…"
                print(f"  → {_activities_url}")
                page.goto(_activities_url, wait_until="domcontentloaded", timeout=25000)

                # If redirected to login, wait for user to log in
                if "signin" in page.url or "sso.garmin.com" in page.url:
                    _status["step"] = "Войди в Garmin Connect в открытом окне…"
                    print("  → Waiting for login (max 3 min)...")
                    for _ in range(180):
                        page.wait_for_timeout(1000)
                        url = page.url
                        if ("connect.garmin.com" in url
                                and "signin"         not in url
                                and "sso.garmin.com" not in url
                                and url             != "about:blank"):
                            print(f"  ✓ Logged in — {url}")
                            # Navigate to filtered activities page after login
                            page.goto(_activities_url,
                                      wait_until="domcontentloaded", timeout=20000)
                            break
                    else:
                        browser.close()
                        _status.update(running=False, done=True,
                                       error="Login timeout (3 min)"); return

                # Save state for next time
                ctx.storage_state(path=str(STATE_FILE))
                print(f"  ✓ State saved")

                # ── Scrape activity list ───────────────────────────────────────
                _status["step"] = "Получаем список тренировок…"
                all_ids = _collect_ids_with_scroll(page, max_new, known_ids)
                new_count = len([i for i in all_ids if i not in known_ids])
                print(f"  Found {len(all_ids)} on page, {new_count} new, limit={max_new or '∞'}")

                if not all_ids:
                    browser.close()
                    _status.update(running=False, done=True,
                                   results=[], message="No activities found on page")
                    return

                # ── Download newest-first, stop when we reach a known activity ─
                # Logic:
                #   - Garmin returns activities newest-first
                #   - Download until we hit an id already in DB → stop
                #   - If DB is empty → download up to max_new
                results = []
                for idx_i, aid in enumerate(all_ids, 1):
                    max_abs = cfg["DOWNLOADED_ACTIVITIES_MAX_QUANTITY"]
                    if max_abs > 0 and len(results) >= max_abs:
                        print(f"  Reached absolute max ({max_abs}), stopping")
                        break
                    if max_new > 0 and len(results) >= max_new:
                        print(f"  Reached limit ({max_new}), stopping")
                        break

                    if aid in known_ids:
                        print(f"  Activity {aid} already in DB → stop")
                        break

                    _status["step"] = f"Скачиваем тренировку {len(results)+1}…"
                    print(f"  [{idx_i}] Downloading {aid}…")
                    try:
                        fit_bytes, act_name = _download_one(page, aid)
                        if fit_bytes:
                            results.append({
                                "garmin_activity_id": aid,
                                "activity_name":      act_name,
                                "fit_b64":  base64.b64encode(fit_bytes).decode(),
                                "fit_size": len(fit_bytes),
                            })
                            print(f"    ✓ {act_name} ({len(fit_bytes):,} B)")
                        else:
                            print(f"    ✗ No FIT bytes for {aid}")
                    except Exception as e:
                        print(f"    ✗ {aid}: {e}")

                # Save state again after all downloads (refreshed cookies)
                ctx.storage_state(path=str(STATE_FILE))
                browser.close()

                n   = len(results)
                msg = (f"{n} new Garmin activit{'y' if n==1 else 'ies'} added"
                       if n else "No new activities added")
                _status.update(running=False, done=True,
                               results=results, message=msg)
                print(f"  ✓ Done: {msg}")

        except Exception as e:
            tb = traceback.format_exc()
            print(f"  ✗ Sync error:\n{tb}")
            _status.update(running=False, done=True,
                           error=str(e), traceback=tb)

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"ok": True, "message": "Sync started"})

@app.route("/sync/status")
def sync_status():
    """Poll this to get progress and final results."""
    return jsonify(_status)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    print(f"""
╔══════════════════════════════════════════════════════╗
║     FIT Analyzer — Garmin Bridge (Playwright)        ║
╠══════════════════════════════════════════════════════╣
║  Port: {port:<45}║
╠══════════════════════════════════════════════════════╣
║  POST /sync  start sync (opens browser)              ║
║  GET  /sync/status  poll for progress + results      ║
╚══════════════════════════════════════════════════════╝
""")
    app.run(host="127.0.0.1", port=port, debug=False)