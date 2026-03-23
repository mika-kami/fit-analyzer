#!/usr/bin/env python3
"""
Garmin Connect local bridge server.
Run: python garmin_server.py
Then open the FIT Analyzer and click "Подключить Garmin".
"""

import os, sys, subprocess, tempfile

# ── Dependency check with auto-install fallback ───────────────────────────────
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

    print(f"\n  Missing packages: {', '.join(missing)}")
    print(f"  Trying: {sys.executable} -m pip install {' '.join(install_names)}\n")

    result = subprocess.run(
        [sys.executable, "-m", "pip", "install"] + install_names,
        capture_output=True, text=True
    )

    if result.returncode != 0:
        print("  pip failed:")
        print(result.stdout[-800:] if result.stdout else "")
        print(result.stderr[-800:] if result.stderr else "")
        print(f"\n  Fix: {sys.executable} -m pip install {' '.join(install_names)}\n")
        sys.exit(1)

    still_missing = []
    for pkg in missing:
        try:
            __import__(pkg)
        except ImportError:
            still_missing.append(pkg)

    if still_missing:
        print(f"\n  Import still fails: {still_missing}")
        sys.exit(1)

check_and_install()

# ── Imports ───────────────────────────────────────────────────────────────────
from garminconnect import Garmin
from flask import Flask, jsonify, request, send_file, make_response
from flask_cors import CORS

app = Flask(__name__)

# Explicit CORS: allow all origins, all methods, all headers
# This handles the preflight OPTIONS requests from the browser
CORS(app, resources={r"/*": {
    "origins": "*",
    "methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"],
}})

client = None

# ── Helper: add CORS headers to every response ────────────────────────────────
@app.after_request
def after_request(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

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
    global client
    data  = request.get_json()
    email = data.get("email", "")
    pwd   = data.get("password", "")
    if not email or not pwd:
        return jsonify({"error": "email and password required"}), 400
    try:
        c = Garmin(email, pwd)
        c.login()
        client = c
        try:   name = client.get_full_name()
        except: name = email
        return jsonify({"ok": True, "name": name})
    except Exception as e:
        client = None
        return jsonify({"error": str(e)}), 401

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
        return jsonify({"error": str(e)}), 500

@app.route("/activity/<int:activity_id>/fit")
def download_fit(activity_id):
    if not client:
        return jsonify({"error": "not logged in"}), 401
    try:
        # Garmin Connect returns a ZIP file containing the .fit
        data = client.download_activity(
            activity_id,
            dl_fmt=client.ActivityDownloadFormat.ORIGINAL,
        )

        # Extract the .fit from the ZIP
        import zipfile, io
        fit_bytes = None

        if data[:2] == b'PK':
            # It's a ZIP — extract the first .fit file inside
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                for name in zf.namelist():
                    if name.lower().endswith('.fit'):
                        fit_bytes = zf.read(name)
                        break
            if fit_bytes is None:
                return jsonify({"error": "No .fit file found inside ZIP"}), 500
        else:
            # Already raw FIT bytes (some API versions return directly)
            fit_bytes = data

        tmp = tempfile.NamedTemporaryFile(suffix=".fit", delete=False)
        tmp.write(fit_bytes)
        tmp.close()
        return send_file(tmp.name, mimetype="application/octet-stream",
                         as_attachment=True,
                         download_name=f"{activity_id}.fit")
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
║                                                      ║
║  Test in browser: http://localhost:{port}/ping          ║
║  Expected:  {{"ok": true, "status": "no_session"}}     ║
║                                                      ║
║  Open FIT Analyzer → click "Подключить Garmin"       ║
║  Press Ctrl+C to stop                                ║
╚══════════════════════════════════════════════════════╝
""")
    app.run(host="127.0.0.1", port=port, debug=False)
