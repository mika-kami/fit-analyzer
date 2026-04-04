# CLAUDE.md — Project map

When asking Claude to modify this project, provide **only the relevant file(s)**.
Each file is self-contained. Typical edit = 1–2 files.

## Architecture

```
src/
├── core/                     ← Pure logic, no React, fully testable
│   ├── fitParser.js          # FIT binary parser (~225 lines) — rarely changes
│   ├── format.js             # fmtKm, fmtDuration, fmtNum, fmtPace (~61 lines)
│   ├── workoutAnalyzer.js    # Zones, metrics, laps, buildWorkoutModel (~717 lines)
│   ├── analyticsEngine.js    # CTL/ATL/TSB, aerobic efficiency, TE trend (~187 lines)
│   ├── trainingEngine.js     # Plan generator, ATL/CTL/TSB (~282 lines) ← changes often
│   ├── coachEngine.js        # AI coach logic, workout recommendations (~448 lines)
│   ├── sampleWorkout.js      # Demo data (~136 lines)
│   ├── gpxExport.js          # GPX file export (~103 lines)
│   ├── pdfReport.js          # PDF report generation (~188 lines)
│   ├── fitWorkoutBuilder.js  # FIT workout file builder (~209 lines)
│   ├── fitWorkoutDownload.js # FIT workout download helper (~50 lines)
│   └── garminWorkoutBuilder.js # Garmin workout format builder (~155 lines)
│
├── hooks/                    ← React state, one concern each
│   ├── useWorkout.js         # File-load state machine (~94 lines)
│   ├── useWorkouts.js        # Supabase workout storage, duplicate resolution (~360 lines)
│   ├── useOpenAI.js          # Chat: OpenAI GPT, key from env (~289 lines)
│   ├── useGarmin.js          # Garmin bridge, localhost:8765 (~100 lines)
│   ├── useStrava.js          # Strava OAuth + activity import (~317 lines)
│   ├── useAuth.js            # Authentication state management (~92 lines)
│   ├── useCoachState.js      # AI coach state management, recommendations (~270 lines)
│   └── useHistory.js         # Legacy storage + in-memory fallback (~169 lines)
│
├── lib/                      ← External service clients
│   └── supabase.js           # Supabase client configuration (~21 lines)
│
├── ui/                       ← React components, no business logic
│   ├── MetricCard.jsx        # Single metric display (~64 lines)
│   ├── ZoneBar.jsx           # Animated zone bar (~77 lines)
│   ├── TimeSeriesChart.jsx   # Recharts wrapper (~109 lines)
│   ├── Upload.jsx            # Drag-drop entry screen (~231 lines)
│   ├── Shell.jsx             # Sticky header + tabs (~229 lines)
│   ├── Dashboard.jsx         # Main dashboard view (~433 lines)
│   ├── ProfilePage.jsx       # User profile / settings page (~260 lines)
│   ├── GarminPanel.jsx       # Garmin sync slide-in panel (~260 lines)
│   ├── StravaPanel.jsx       # Strava connect + import panel (~268 lines)
│   ├── BulkUploadModal.jsx   # Bulk FIT file upload (~178 lines)
│   ├── auth/
│   │   └── AuthPage.jsx      # Login/signup screen (~156 lines)
│   └── tabs/
│       ├── OverviewTab.jsx   # Metrics, TE, zones, recs (~358 lines)
│       ├── ChartsTab.jsx     # Time-series graphs (~159 lines)
│       ├── ZonesTab.jsx      # Multi-model zone analysis (~214 lines)
│       ├── PlanTab.jsx       # Training plan + day picker (~680 lines)
│       ├── HistoryTab.jsx    # Heatmap + period stats (~322 lines)
│       ├── ChatTab.jsx       # AI coach chat with markdown rendering (~289 lines)
│       ├── MapTab.jsx        # Workout map visualization (~246 lines)
│       ├── LapsTab.jsx       # Per-lap breakdown table (~214 lines)
│       └── AnalyticsTab.jsx  # CTL/ATL/TSB charts, form state (~616 lines)
│
├── styles/tokens.css         # CSS variables — single source of truth
├── App.jsx                   # Orchestrator — wires hooks to views (~235 lines)
└── main.jsx                  # React entry point
```

## Editing guidelines

| Change | Files to provide |
|--------|-----------------|
| Plan algorithm (detraining, ATL/CTL) | `core/trainingEngine.js` |
| Analytics (CTL/ATL/TSB, AET, TE trend) | `core/analyticsEngine.js` |
| AI coach recommendations | `core/coachEngine.js` + `hooks/useCoachState.js` |
| Zone model (Seiler/Coggan) | `core/workoutAnalyzer.js` |
| FIT parsing bug | `core/fitParser.js` |
| Lap decoding | `core/workoutAnalyzer.js` (LAP_FIELDS, decodeLap) |
| Format utilities | `core/format.js` |
| GPX export | `core/gpxExport.js` |
| PDF report | `core/pdfReport.js` |
| FIT workout builder | `core/fitWorkoutBuilder.js` + `core/fitWorkoutDownload.js` |
| Garmin workout format | `core/garminWorkoutBuilder.js` |
| Zone tab UI | `ui/tabs/ZonesTab.jsx` |
| Plan tab UI | `ui/tabs/PlanTab.jsx` |
| History calendar | `ui/tabs/HistoryTab.jsx` |
| Map visualization | `ui/tabs/MapTab.jsx` |
| Laps tab UI | `ui/tabs/LapsTab.jsx` |
| Analytics tab UI | `ui/tabs/AnalyticsTab.jsx` |
| AI coach chat | `ui/tabs/ChatTab.jsx` + `hooks/useOpenAI.js` |
| LLM config (model, URL, tokens) | `.env_llm` |
| Garmin sync integration | `ui/GarminPanel.jsx` + `hooks/useGarmin.js` |
| Strava integration | `ui/StravaPanel.jsx` + `hooks/useStrava.js` |
| Authentication | `ui/auth/AuthPage.jsx` + `hooks/useAuth.js` |
| User profile / settings | `ui/ProfilePage.jsx` |
| Dashboard layout | `ui/Dashboard.jsx` |
| Supabase storage / duplicates | `hooks/useWorkouts.js` + `src/lib/supabase.js` |
| New tab | new `ui/tabs/XTab.jsx` + 3 lines in `App.jsx` + 1 line in `ui/Shell.jsx` |
| Shared atom component | `ui/MetricCard.jsx` or `ui/ZoneBar.jsx` |

## Core rules
- `core/` has no React imports — pure JS/TS functions
- `hooks/` never renders JSX — only state and side effects
- Each tab receives data as props — no direct store access
- `App.jsx` wires hooks to views — zero business logic
- `tokens.css` is the only source of colors, spacing, radii

## App screens
App.jsx manages three top-level screens routed via `activeScreen` state:
- `'dashboard'` — main workout analysis view with 8 tabs
- `'profile'` — user profile / settings (`ProfilePage.jsx`)
- `'detail'` — (reserved for future drill-down view)

Active hooks in App.jsx: `useAuth`, `useStrava`, `useWorkouts`, `useWorkout`, `useOpenAI`, `useGarmin`, `useCoachState`.

## Data flow: workout saving & duplicate resolution
- `useWorkouts.saveGarminActivities()` — checks for same-date or same-garmin-id duplicates; updates existing if new data is richer (garmin FIT > upload > strava) using `dataRichness()` scoring
- `useWorkouts.saveWorkout()` — upserts by date match
- `summary_json` stores all fields needed for offline display including `laps` and downsampled `timeSeries`

## Environment files

| File | Tracked | Purpose |
|------|---------|---------|
| `.env.example` | yes | Template: Supabase keys, Strava OAuth, OpenAI key |
| `.env` | no (.gitignore) | Actual secrets: Supabase, Strava, `VITE_OPENAI_API_KEY` |
| `.env_llm` | yes | LLM config: `VITE_LLM_URL`, `VITE_LLM_MODEL`, `VITE_LLM_MAX_TOKENS` |
| `garmin_config.json` | no | Garmin sync settings (auto-created on first run) |

## Production (Supabase) files

| File | Purpose |
|------|---------|
| `src/lib/supabase.js` | Supabase client (reads .env) |
| `src/hooks/useAuth.js` | Auth: signIn, signUp, signOut |
| `src/hooks/useWorkouts.js` | Stores workouts in PostgreSQL, handles duplicates |
| `src/ui/auth/AuthPage.jsx` | Login / signup screen |
| `vercel.json` | SPA routing for Vercel deploy |
| `garmin_server.py` | Local Garmin Connect bridge — Playwright scraping (localhost:8765) |
| `vite.config.js` | Vite config — loads `.env_llm` for LLM constants, sets server port 5173 |

## Tech stack
- **React** 18.3 + **Vite** 5.4 (dev server port 5173)
- **Recharts** 2.12 for all charts
- **@supabase/supabase-js** 2.45 for auth + PostgreSQL storage
- **npm scripts:** `npm run dev`, `npm run build`, `npm run preview`

## Deployment steps
1. Create Supabase project (Frankfurt region)
2. Set up database tables manually in Supabase SQL Editor
3. Copy .env.example → .env, fill Supabase + Strava + OpenAI keys
4. Edit `.env_llm` if needed (model, URL, token limit)
5. npm install
6. vercel deploy (or: npm run build → upload dist/)

## Local development
- Garmin integration requires: `python garmin_server.py` (runs on localhost:8765)
- Garmin features only work locally (CORS restrictions prevent remote access)
- Strava OAuth requires callback domain configured at strava.com/settings/api
- AI chat requires `VITE_OPENAI_API_KEY` in `.env`
