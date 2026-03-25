#!/usr/bin/env python3
"""
Garmin Connect local bridge server.
Run: python garmin_server.py
Then open the FIT Analyzer and click "Подключить Garmin".

Handles Garmin SSO rate limiting by caching the session to disk.
"""

import os, sys, subprocess, tempfile, json, pickle
from pathlib import Path

# ── Dependency check ──────────────────────────────────────────────────────────
REQUIRED = ["garminconnect", "flask", "flask_cors"]

def check_and_install():
    missing = []
    for pkg in REQUIRED:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    if not missing:
        return
    pip_names = {"flask_cors": "flask-cors"}
    install_names = [pip_names.get(p, p) for p in missing]
    print(f"\n  Installing: {' '.join(install_names)}")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install"] + install_names,
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(result.stderr[-600:])
        print(f"\n  Fix: {sys.executable} -m pip install {' '.join(install_names)}")
        sys.exit(1)

check_and_install()

from garminconnect import Garmin
from flask import Flask, jsonify, request, send_file, make_response
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {
    "origins": "*",
    "methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"],
}})

@app.after_request
def after_request(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

client = None

# Session cache — avoids re-login on server restart (reduces rate limit risk)
SESSION_FILE  = Path.home() / ".garmin_session"

# ── Login rate-limit state ─────────────────────────────────────────────────────
import time as _time
_last_login_attempt = 0.0   # epoch seconds of last attempt
_rate_limited_until = 0.0   # epoch seconds when Garmin 429 cooldown expires
_LOGIN_DEBOUNCE_S   = 10    # min seconds between any two login calls
_RATE_LIMIT_WAIT_S  = 1800  # 30 min cooldown after a 429 from Garmin

def save_session(c):
    """Pickle the Garmin session tokens to disk."""
    try:
        SESSION_FILE.write_bytes(pickle.dumps(c.garth.dumps()))
        print("  Session saved to", SESSION_FILE)
    except Exception as e:
        print(f"  Session save failed: {e}")

def load_session():
    """Try to restore a saved session — avoids SSO login."""
    if not SESSION_FILE.exists():
        return None
    try:
        g = Garmin()
        g.garth.loads(pickle.loads(SESSION_FILE.read_bytes()))
        g.display_name  # test the session
        print("  Restored saved session (no SSO login needed)")
        return g
    except Exception as e:
        print(f"  Saved session invalid ({e}), will re-login")
        SESSION_FILE.unlink(missing_ok=True)
        return None

# Auto-restore session on startup — so /ping returns "connected" immediately
client = load_session()

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return jsonify({
        "name":    "FIT Analyzer — Garmin Bridge",
        "status":  "running",
        "session": "connected" if client else "no_session",
        "routes":  ["/ping", "/login", "/activities", "/activity/<id>/fit"],
    })

@app.route("/ping")
def ping():
    return jsonify({"ok": True, "status": "connected" if client else "no_session"})

@app.route("/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return make_response("", 204)

    global client, _last_login_attempt, _rate_limited_until
    now = _time.time()

    # Block if Garmin previously returned 429 and cooldown hasn't expired
    if now < _rate_limited_until:
        wait = int(_rate_limited_until - now)
        return jsonify({
            "error": f"Garmin rate limit active. Wait {wait // 60}m {wait % 60}s before retrying."
        }), 429

    # Debounce — prevent rapid repeated calls
    since_last = now - _last_login_attempt
    if since_last < _LOGIN_DEBOUNCE_S:
        wait = int(_LOGIN_DEBOUNCE_S - since_last)
        return jsonify({
            "error": f"Too fast — wait {wait}s before trying again."
        }), 429

    _last_login_attempt = now

    data  = request.get_json()
    email = data.get("email", "")
    pwd   = data.get("password", "")

    if not email or not pwd:
        return jsonify({"error": "email and password required"}), 400

    # Try cached session first — avoids hitting Garmin SSO
    restored = load_session()
    if restored:
        client = restored
        return jsonify({"ok": True, "name": email, "from_cache": True})

    # Fresh login
    try:
        c = Garmin(email, pwd)
        c.login()
        save_session(c)
        client = c
        try:
            name = client.get_full_name()
        except Exception:
            name = email
        return jsonify({"ok": True, "name": name})
    except Exception as e:
        msg = str(e)
        if "429" in msg or "Too Many Requests" in msg:
            _rate_limited_until = now + _RATE_LIMIT_WAIT_S
            return jsonify({
                "error": "Garmin заблокировал попытки входа (429). "
                         "Подождите 30 минут и попробуйте снова. "
                         "Не повторяйте попытки раньше — это сбрасывает таймер."
            }), 429
        if "401" in msg or "Invalid" in msg.lower():
            return jsonify({"error": "Неверный email или пароль"}), 401
        client = None
        return jsonify({"error": msg}), 401

@app.route("/logout", methods=["POST"])
def logout():
    global client
    client = None
    SESSION_FILE.unlink(missing_ok=True)
    return jsonify({"ok": True})

@app.route("/activities")
def activities():
    if not client:
        return jsonify({"error": "not logged in"}), 401
    limit  = min(int(request.args.get("limit", 20)), 50)
    offset = int(request.args.get("offset", 0))
    try:
        acts   = client.get_activities(offset, limit)
        result = []
        for a in acts:
            result.append({
                "id":        a.get("activityId"),
                "name":      a.get("activityName", ""),
                "sport":     a.get("activityType", {}).get("typeKey", ""),
                "date":      (a.get("startTimeLocal") or "")[:10],
                "time":      (a.get("startTimeLocal") or "")[11:16],
                "distanceM": round(a.get("distance") or 0),
                "durationS": round(a.get("duration") or 0),
                "calories":  a.get("calories") or 0,
                "avgHr":     a.get("averageHR") or 0,
                "maxHr":     a.get("maxHR") or 0,
                "elevGain":  a.get("elevationGain") or 0,
            })
        return jsonify({"ok": True, "activities": result})
    except Exception as e:
        msg = str(e)
        if "429" in msg:
            return jsonify({"error": "Rate limited by Garmin. Wait a few minutes."}), 429
        return jsonify({"error": msg}), 500

@app.route("/activity/<int:activity_id>/fit")
def download_fit(activity_id):
    if not client:
        return jsonify({"error": "not logged in"}), 401
    try:
        data = client.download_activity(
            activity_id,
            dl_fmt=client.ActivityDownloadFormat.ORIGINAL,
        )
        import zipfile, io
        fit_bytes = None
        if data[:2] == b'PK':
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                for name in zf.namelist():
                    if name.lower().endswith('.fit'):
                        fit_bytes = zf.read(name)
                        break
            if fit_bytes is None:
                return jsonify({"error": "No .fit file inside ZIP"}), 500
        else:
            fit_bytes = data

        tmp = tempfile.NamedTemporaryFile(suffix=".fit", delete=False)
        tmp.write(fit_bytes)
        tmp.close()
        return send_file(tmp.name, mimetype="application/octet-stream",
                         as_attachment=True,
                         download_name=f"{activity_id}.fit")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/workout", methods=["POST", "OPTIONS"])
def create_workout():
    if request.method == "OPTIONS":
        return make_response("", 204)
    if not client:
        return jsonify({"error": "not logged in"}), 401

    workout_data = request.get_json()
    if not workout_data:
        return jsonify({"error": "workout JSON required"}), 400

    try:
        response = client.garth.post(
            "connect",
            "/workout-service/workout",
            json=workout_data,
            headers={"Content-Type": "application/json"},
        )
        return jsonify({"ok": True, "workoutId": response.get("workoutId")})
    except Exception as e:
        msg = str(e)
        if "429" in msg:
            return jsonify({"error": "Rate limited. Wait 30 min."}), 429
        return jsonify({"error": msg}), 500


@app.route("/schedule", methods=["POST", "OPTIONS"])
def schedule_workout():
    if request.method == "OPTIONS":
        return make_response("", 204)
    if not client:
        return jsonify({"error": "not logged in"}), 401

    data = request.get_json()
    workout_id = data.get("workoutId")
    date_str = data.get("date")  # 'YYYY-MM-DD'

    if not workout_id or not date_str:
        return jsonify({"error": "workoutId and date required"}), 400

    try:
        client.garth.post(
            "connect",
            f"/workout-service/schedule/{workout_id}",
            json={"date": date_str},
            headers={"Content-Type": "application/json"},
        )
        return jsonify({"ok": True, "workoutId": workout_id, "date": date_str})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    print(f"""
╔══════════════════════════════════════════════════════╗
║         FIT Analyzer — Garmin Bridge Server          ║
╠══════════════════════════════════════════════════════╣
║  Python:  {sys.executable:<42}║
║  Port:    {port:<42}║
║  Session: {'saved at '+str(SESSION_FILE) if SESSION_FILE.exists() else 'no cached session':<42}║
║                                                      ║
║  Test: http://localhost:{port}/ping                     ║
╚══════════════════════════════════════════════════════╝
""")
    app.run(host="127.0.0.1", port=port, debug=False)