# Gym OS — Retention & Revenue App

React Native (Expo) MVP for the Gym Retention & Revenue product described in the PRD.
A single app that switches between the **Owner** and **Member** experiences based on role.

**Core loop:** Check-in → Detect inactivity → Alert owner → Re-engage member → Renew → Upsell.

## Demo accounts (mock backend)

| Role  | Phone        | OTP  |
| ----- | ------------ | ---- |
| Owner | 9822000000   | 1234 |
| Member (Priya) | 9876543210 | 1234 |

The login screen has one-tap demo buttons for both roles.

## Run it

```bash
npm install
npx expo start          # scan QR with Expo Go, or press `a` for Android / `i` for iOS
```

Useful commands:

```bash
npx tsc --noEmit                          # typecheck
npx tsx scripts/smoke.ts                  # smoke-test the mock backend logic
npx expo export --platform android        # verify the JS bundle builds

# Real-UI walk-through in headless Chrome (Expo web): logs in as owner and
# member, visits every screen, asserts key content, captures console errors
# and screenshots to /tmp/gym_ui.
npx expo start --web --port 8081   # in one terminal
node scripts/ui-web.mjs            # in another
```

## Real backend (FastAPI + PostgreSQL)

The app ships with two interchangeable transports in `src/services/api/client.ts`:

- **Mock** (default): in-memory server, zero setup — active when `EXPO_PUBLIC_API_URL` is unset.
- **Real**: HTTP to the FastAPI + PostgreSQL backend in `backend/` — enabled by setting
  `EXPO_PUBLIC_API_URL` before starting Expo.

The screens and `services/api/endpoints.ts` are identical for both — only the transport changes.

### Backend setup

```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

# PostgreSQL must be running (e.g. `brew install postgresql@16` + start it),
# with a `gymos` database. Override the connection with DATABASE_URL if needed:
#   export DATABASE_URL=postgresql+psycopg://user@host:5432/gymos

./.venv/bin/python -m app.seed          # creates tables + deterministic demo data
./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Seeding is automatic on first startup if the DB is empty. Demo data mirrors the mock
(owner 9822000000, member Priya 9876543210, 46 members across all risk buckets, OTP 1234).

### Point the app at it

```bash
EXPO_PUBLIC_API_URL=http://localhost:8000 npx expo start
```

On a physical device, use your machine's LAN IP instead of `localhost`.

### Backend tests

```bash
./.venv/bin/python smoke_api.py     # HTTP smoke test mirroring scripts/smoke.ts
node ../scripts/ui-web.mjs          # full UI walk-through against the real backend
```

## Architecture

- **Single Expo app, role-based navigation** — after OTP login, the root navigator mounts
  the Owner tabs (Dashboard / Members / Renewals / Revenue) or Member tabs
  (Home / Check-in / Progress / Profile).
- **Mock backend** (`src/services/api/mock/`) — an in-memory server implementing the
  REST surface from PRD §17 (auth, members, check-ins, at-risk, renewals, revenue,
  notifications) with PRD §19 risk logic and §12 opportunity rules. The client layer
  (`src/services/api/client.ts`) is the only place that talks to it — swap in a real
  API by replacing `handleRequest`.
- **State** — TanStack Query (server state, caching, invalidation), Zustand (auth session,
  offline check-in queue), React Hook Form + Zod (forms).
- **Auth** — mock phone+OTP; access/refresh tokens stored in `expo-secure-store`
  (never AsyncStorage), per PRD §14.
- **QR check-in** — `expo-camera` barcode scanning; the mock validates the QR payload,
  member, and rejects duplicate check-ins within 30 minutes (PRD §7). A "Simulate offline"
  switch exercises the offline queue (PRD §20): pending check-ins sync when back online.
- **Design tokens** (`src/theme/`) follow PRD §25: red = risk, green = healthy,
  yellow = attention, purple = revenue.

## Key flows covered by the MVP

- Owner dashboard KPIs, revenue-at-risk card, attendance trend, top renewals, opportunities
- At-risk list with filters, search, bulk reminders (WhatsApp / call deep links)
- Member profile with timeline, attendance, and one-tap add-on sales
- Renewal dashboard with send-reminder and renew actions
- Revenue hub: opportunity engine, services catalogue, sale recording
- Settings (gear icon on the Dashboard): owner-configurable risk thresholds with a live
  preview of how members re-classify — persisted per gym on the backend (PRD §19 "gym-configurable")
- Member home (membership, streak), QR check-in, progress ring + milestones, profile
- In-app notifications fed by owner actions and streak milestones

## Project structure

```
src/
├── app/            navigation + providers
├── components/     design system (Button, Card, Badge, Avatar, KpiCard, …)
├── features/       auth, dashboard, members, attendance, checkin, renewals, revenue, notifications, profile
├── services/api/   client + mock backend (db.ts, server.ts)
├── services/auth/  secure token storage
├── store/          zustand stores + query keys
├── types/          PRD §18 data model
├── utils/          dates, INR formatting, risk rules, deep links
└── theme/          design tokens
```

## PRD gaps intentionally deferred

- Push notifications (in-app notifications implemented; `expo-notifications` wiring is future work)
- Real backend (mock is swappable at `handleRequest`)
- Staff role, audit logs, payment integration, gym-configurable risk thresholds
