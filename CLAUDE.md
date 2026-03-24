# CLAUDE.md — Project map

When asking Claude to modify this project, provide **only the relevant file(s)**.
Each file is self-contained and ≤ 350 lines. Typical edit = 1–2 files.

## Architecture

```
src/
├── core/                     ← Pure logic, no React, fully testable
│   ├── fitParser.js          # FIT binary parser (~220 lines) — rarely changes
│   ├── format.js             # fmtKm, fmtDuration, fmtNum (~60 lines)
│   ├── workoutAnalyzer.js    # Zones, metrics, buildWorkoutModel (~480 lines)
│   ├── trainingEngine.js     # Plan generator, ATL/CTL/TSB (~280 lines) ← changes often
│   ├── sampleWorkout.js      # Demo data (~110 lines)
│   └── gpxExport.js          # GPX file export functionality (~100 lines)
│
├── hooks/                    ← React state, one concern each
│   ├── useWorkout.js         # File-load state machine (~65 lines)
│   ├── useHistory.js         # Storage + in-memory fallback (~165 lines)
│   ├── useOpenAI.js          # Chat: OpenAI → Anthropic fallback (~135 lines)
│   ├── useGarmin.js          # Garmin bridge, localhost:8765 (~85 lines)
│   ├── useAuth.js            # Authentication state management (~120 lines)
│   └── useWorkouts.js        # Supabase workout storage (~180 lines)
│
├── lib/                      ← External service clients
│   └── supabase.js           # Supabase client configuration (~50 lines)
│
├── ui/                       ← React components, no business logic
│   ├── MetricCard.jsx        # Single metric display (~65 lines)
│   ├── ZoneBar.jsx           # Animated zone bar (~75 lines)
│   ├── TimeSeriesChart.jsx   # Recharts wrapper (~100 lines)
│   ├── Upload.jsx            # Drag-drop entry screen (~230 lines)
│   ├── Shell.jsx             # Sticky header + tabs (~155 lines)
│   ├── GarminPanel.jsx       # Garmin slide-in panel (~200 lines)
│   ├── Dashboard.jsx         # Main dashboard view (~150 lines)
│   ├── auth/
│   │   └── AuthPage.jsx      # Login/signup screen (~200 lines)
│   └── tabs/
│       ├── OverviewTab.jsx   # Metrics, TE, zones, recs (~90 lines)
│       ├── ChartsTab.jsx     # Time-series graphs (~200 lines)
│       ├── ZonesTab.jsx      # Multi-model zone analysis (~280 lines)
│       ├── PlanTab.jsx       # Training plan + day picker (~320 lines)
│       ├── HistoryTab.jsx    # Heatmap + period stats (~510 lines)
│       ├── ChatTab.jsx       # AI coach chat (~245 lines)
│       └── MapTab.jsx        # Workout map visualization (~180 lines)
│
├── styles/tokens.css         # CSS variables — single source of truth
├── App.jsx                   # Orchestrator only — 75 lines, touch rarely
└── main.jsx                  # React entry point
```

## Editing guidelines

| Change | Files to provide |
|--------|-----------------|
| Plan algorithm (detraining, ATL/CTL) | `core/trainingEngine.js` |
| Zone model (Seiler/Coggan) | `core/workoutAnalyzer.js` |
| FIT parsing bug | `core/fitParser.js` |
| Format utilities | `core/format.js` |
| GPX export functionality | `core/gpxExport.js` |
| Zone tab UI | `ui/tabs/ZonesTab.jsx` |
| Plan tab UI | `ui/tabs/PlanTab.jsx` |
| History calendar | `ui/tabs/HistoryTab.jsx` |
| Map visualization | `ui/tabs/MapTab.jsx` |
| AI coach chat | `ui/tabs/ChatTab.jsx` + `hooks/useOpenAI.js` |
| Garmin integration | `ui/GarminPanel.jsx` + `hooks/useGarmin.js` |
| Authentication | `ui/auth/AuthPage.jsx` + `hooks/useAuth.js` |
| Dashboard layout | `ui/Dashboard.jsx` |
| Supabase storage | `hooks/useWorkouts.js` + `src/lib/supabase.js` |
| New tab | new `ui/tabs/XTab.jsx` + 3 lines in `App.jsx` + 1 line in `ui/Shell.jsx` |
| Shared atom component | `ui/MetricCard.jsx` or `ui/ZoneBar.jsx` |

## Core rules
- `core/` has no React imports — pure JS/TS functions
- `hooks/` never renders JSX — only state and side effects
- Each tab receives data as props — no direct store access
- `App.jsx` wires hooks to views — zero business logic
- `tokens.css` is the only source of colors, spacing, radii

## Production (Supabase) files

| File | Purpose |
|------|---------|
| `src/lib/supabase.js` | Supabase client (reads .env) |
| `src/hooks/useAuth.js` | Auth: signIn, signUp, signOut, GDPR export |
| `src/hooks/useWorkouts.js` | Replaces useHistory — stores in PostgreSQL |
| `src/ui/auth/AuthPage.jsx` | Login / signup screen |
| `.env.example` | Copy to .env, fill Supabase keys |
| `vercel.json` | SPA routing for Vercel deploy |
| `garmin_server.py` | Local Garmin Connect bridge (localhost:8765) |

## Deployment steps
1. Create Supabase project (Frankfurt region)
2. Set up database tables manually in Supabase SQL Editor
3. Copy .env.example → .env, fill Supabase keys
4. npm install
5. vercel deploy (or: npm run build → upload dist/)

## Local development
- Garmin integration requires: `python garmin_server.py` (runs on localhost:8765)
- Garmin features only work locally (CORS restrictions prevent remote access)
