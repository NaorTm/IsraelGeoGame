# Israel Geo Game

Production MVP foundation for a browser geography game about Israeli settlements and districts, now evolved from a frontend-only toy into a backend-backed web product with real auth, persistent progress, and authoritative PvP.

## What Exists Now

- guest solo play
- Supabase auth with email magic link and Google OAuth wiring
- persistent profiles with username claim flow
- cloud-saved solo progress
- authoritative 1v1 PvP with backend-owned seed, rounds, scoring, and winner resolution
- Supabase RLS, triggers, and SQL RPCs
- runtime-validated local Supabase setup
- browser E2E coverage for login, onboarding, solo save, PvP queue, ready, match, refresh resilience, result, logout, and relogin
- preview-deployable Vercel frontend setup

## Stack

- Frontend: React 19, TypeScript, Vite, React Router, Leaflet
- Backend: Supabase Auth, Postgres, Realtime, SQL RPC functions
- Testing: Vitest, Playwright
- Deployment: Vercel frontend + Supabase backend

## Architecture

### Auth

- solo stays playable without login
- cloud save and PvP require a real Supabase session
- a `profiles` row is created automatically from `auth.users`
- users claim a unique public username after login for PvP and future leaderboard display
- email magic link is locally validated end to end
- Google OAuth is wired for local and preview, but still requires real provider credentials and a real Google account login to complete final validation

### Solo

- solo gameplay stays client-driven for responsiveness
- authenticated solo runs are written through `record_solo_session`
- `user_district_progress` stores best score, best streak, accuracy, totals, and last-played metadata
- solo persistence is intentionally non-authoritative in MVP and must not be used for ranked competition

### PvP

- players queue by district
- backend creates the match, seed, official round order, and player rows
- both players get the same official challenge
- client submits guesses only
- backend computes round resolution and final winner
- winner order: higher score, fewer misses, faster completion time, else draw

### Realtime and Reliability

- queue and match pages use Supabase Realtime as the primary update path
- a 4-second polling fallback remains in place for reliability
- the fallback does not weaken authority because all official state still comes from backend tables and RPCs
- browser validation now covers refresh during PvP lobby, active match, and waiting-for-result states

## Database

Main migration:

- [20260319150000_prod_mvp_foundation.sql](C:/Users/gameo/OneDrive/Desktop/IsraelGeoGame/IsraelGeoGame/supabase/migrations/20260319150000_prod_mvp_foundation.sql)

Core tables:

- `profiles`
- `districts`
- `settlements_catalog`
- `user_district_progress`
- `game_sessions`
- `session_players`
- `session_rounds`
- `player_round_results`
- `session_answer_events`
- `matchmaking_queue`

Authoritative RPCs:

- `claim_username`
- `queue_pvp_match`
- `cancel_matchmaking`
- `set_match_ready`
- `submit_pvp_guess`
- `submit_pvp_timeout`
- `record_solo_session`

## Local Setup

### 1. Install dependencies

```bash
npm ci
```

### 2. Frontend env

Copy [.env.example](C:/Users/gameo/OneDrive/Desktop/IsraelGeoGame/IsraelGeoGame/.env.example) to `.env` and set:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local-or-hosted-anon-key>
```

### 3. Start local Supabase

```bash
npm run supabase:start:local
npm run supabase:reset:local
```

Validated local ports:

- API/Auth/REST: `http://127.0.0.1:54321`
- Postgres: `127.0.0.1:54322`
- Studio: `http://127.0.0.1:54323`
- Mailpit: `http://127.0.0.1:54324`

The reset applies migrations and [seed.sql](C:/Users/gameo/OneDrive/Desktop/IsraelGeoGame/IsraelGeoGame/supabase/seed.sql).

### 4. Auth providers

Configured local redirect URLs in [config.toml](C:/Users/gameo/OneDrive/Desktop/IsraelGeoGame/IsraelGeoGame/supabase/config.toml):

- `http://127.0.0.1:5173/auth/callback`
- `http://127.0.0.1:4173/auth/callback`

Email magic link works locally through Mailpit.

Google OAuth requires:

- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`

Supabase callback:

- `http://127.0.0.1:54321/auth/v1/callback`

Frontend callback:

- `http://127.0.0.1:5173/auth/callback`
- `http://127.0.0.1:4173/auth/callback`

### 5. Run the frontend

```bash
npm run dev
```

## Validation Commands

### Core

```bash
npm test
npm run lint
npm run build
```

### Live backend and browser

```bash
npm run test:runtime
npm run test:e2e
npm run test:all:local
```

### Data / content maintenance

```bash
npm run audit:alerts-map
npm run report:unmatched-placemarks
npm run report:inhabited-unmatched
```

### Data generation helpers

```bash
npm run supabase:seed
npm run boundaries:generate-kml-supplement
npm run districts:generate-lookup
npm run settlements:generate-regions
npm run boundaries:generate-district-loaders
```

## Runtime Smoke Test Strategy

Keep the runtime smoke test.

The live runtime check is in [supabase.runtime.test.ts](C:/Users/gameo/OneDrive/Desktop/IsraelGeoGame/IsraelGeoGame/src/services/supabase.runtime.test.ts). It stays separate from browser tests and from the default unit suite so local development does not hang on live I/O.

Run it when:

- SQL migrations change
- RPC logic changes
- RLS changes
- auth/session handling changes
- queue/match read logic changes

## Browser E2E Coverage

The Playwright suite is in [app.e2e.spec.ts](C:/Users/gameo/OneDrive/Desktop/IsraelGeoGame/IsraelGeoGame/e2e/app.e2e.spec.ts).

Current validated browser path:

- email signup via Supabase auth API
- magic-link login through the real UI
- `/auth/callback` handling and session creation
- username claim in the browser UI
- solo start and completion through the map UI
- solo cloud-save confirmation
- PvP queue entry in two browser contexts
- ready-state transitions
- full PvP answer submission through browser polygon clicks
- opponent progress visibility
- refresh during PvP lobby
- refresh during active match
- refresh after finishing before result
- official result screen
- logout and repeat login

## Performance Status

Recent performance work now in place:

- route-level lazy loading
- settlement catalog split by source region
- district-level boundary chunks for narrow play scopes
- vendor chunk splitting in Vite
- district-focused prefetch for likely solo/PvP play paths
- smaller approximate fallback polygons
- lower-vertex approximate polygons
- heavy map/catalog payloads only load when gameplay actually starts

Current biggest remaining frontend cost:

- large broad-scope boundary fallbacks such as the full north-region chunk when selection is too wide for district-level loading

## Data Coverage and Reports

Content completeness reports stay explicit instead of silent:

- [inhabited-unmatched-review.md](C:/Users/gameo/OneDrive/Desktop/IsraelGeoGame/IsraelGeoGame/reports/inhabited-unmatched-review.md)
- [unmatched-placemarks-report.md](C:/Users/gameo/OneDrive/Desktop/IsraelGeoGame/IsraelGeoGame/reports/unmatched-placemarks-report.md)
- [approximate-settlements-review.md](C:/Users/gameo/OneDrive/Desktop/IsraelGeoGame/IsraelGeoGame/reports/approximate-settlements-review.md)

Important current state:

- approximate-only playable places remain explicit and intentionally handled
- approximate fallback polygons are now much smaller than earlier versions
- inhabited-but-ambiguous KML placemarks stay visible in reports for curated review instead of disappearing from sight

## Preview Deployment Checklist

A preview deploy is considered ready only when all of the following are true:

- `npm run build` passes
- `npm run test:runtime` passes against a running Supabase stack
- `npm run test:e2e` passes
- no known broken route in home, solo, profile, PvP queue, match, or auth callback

Required frontend env vars in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Required Supabase redirect URLs:

- local dev: `http://127.0.0.1:5173/auth/callback`
- local E2E: `http://127.0.0.1:4173/auth/callback`
- Vercel preview: `https://<preview-domain>/auth/callback`
- production: `https://<production-domain>/auth/callback`

Required Google OAuth configuration per environment:

- provider enabled in Supabase
- correct Google client ID/secret loaded for that environment
- Google authorized redirect URI pointing at the Supabase auth callback for that environment

Recommended preview validation sequence:

1. deploy preview
2. verify `/`, `/solo`, `/profile`, `/pvp`
3. verify email magic-link login
4. verify username claim
5. verify solo save and profile progress
6. verify two-browser PvP queue, ready, active match, result
7. verify logout and relogin

## Security Status

Protected now:

- RLS on personal and match tables
- participant-only access to match/session data
- official PvP writes through SQL RPCs only
- backend-owned queue matching, round order, and winner resolution
- anon key only on the frontend

Still worth hardening later:

- heartbeat / disconnect-forfeit rules
- stronger SQL-level automated coverage
- authoritative solo if ranked solo becomes a product goal
- moderation / username abuse tooling
- eventual removal of polling fallback if Realtime proves stable enough in browser

## Current Focus After This Pass

- boundary-loading strategy for broader multi-district selections
- continued UI polish around loading and recovery states
- curated additions from the remaining inhabited-but-ambiguous placemark bucket
- final Google OAuth end-to-end validation with real provider credentials and an interactive account login
