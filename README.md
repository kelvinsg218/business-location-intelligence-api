# Business Location Intelligence API

A REST API that analyzes the business competition around a free-text
location — no latitude/longitude required from the client. Give it a place,
a business type and a radius; it geocodes the place, searches nearby
establishments across a small grid of points for better coverage,
deduplicates and filters the results, and returns a transparent, descriptive
competition analysis. A React dashboard consumes the same API to visualize
the result on an interactive map.

```
GET /api/v1/locations/analyze?location=Vila+Velha,+ES&businessType=gym&radius=5
```

## Current Version

**v0.3.0 — Foundation: PostgreSQL and real authentication**

The first version with a database and real user accounts. The analysis itself
is unchanged (same algorithm, profiles, providers, response and score); what
changes is who can run it: `GET /api/v1/locations/analyze` now requires a
signed-in user, and the temporary client-side development login (`root` / `1`)
is gone.

Key changes:
- PostgreSQL 18 with versioned SQL migrations (`node-pg-migrate`); two tables only: `users` and `sessions`
- Accounts: register, sign in, sign out and "who am I" (`/api/v1/auth/*`); passwords hashed with Argon2id, never stored, returned or logged
- Server-side sessions in an `HttpOnly`, `SameSite=Strict` cookie (`__Host-` prefixed and `Secure` in production): 7 days idle / 30 days absolute, id rotated on sign-in, stored only as a hash
- Protection against CSRF (origin check + `SameSite=Strict` + JSON-only bodies), session fixation, brute force / credential stuffing (per-address, per-account and per-user rate limits), SQL injection (parameterized queries only, enforced by a lint rule) and account enumeration at login
- `/health` (process alive) and the new `/ready` (database reachable) probes, both outside the rate limit; a database outage answers `503 DATABASE_UNAVAILABLE` without crashing or leaking details
- Frontend: real login and sign-up pages, protected routes (`react-router`), session recovery on reload, no token anywhere in `localStorage`/`sessionStorage`
- CI runs against a PostgreSQL 18 service container and checks that the migrations are idempotent

Requires PostgreSQL 18 and a one-time database setup — see [Installation](#installation) and
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). See [CHANGELOG.md](CHANGELOG.md) for the full version history
(v0.2.1, a hygiene release, is included in the same unreleased set of changes).

## Overview

This project demonstrates a complete, production-shaped backend: input
validation, an external-API integration layer with provider abstraction
(mock/real), geospatial processing, a scoring engine, structured error
handling, rate limiting, logging, automated tests and OpenAPI documentation
— plus a React frontend that consumes it end to end.

It runs in two modes:
- **Mock mode** (default): zero external calls, zero cost, deterministic output. This is how you should run it to explore the project.
- **Google mode**: real Geocoding API + Places API (New) calls, opt-in only, behind an API key you provide. **For private, controlled testing only** — the current map does not meet Google's terms for a public deployment (see [Google Maps Platform terms](#google-maps-platform-terms--current-limitation)).

## Demo

> Screenshots go here — add real captures of the running dashboard
> (empty state, loading state, a completed analysis with the map and
> competition indicator, and the Plans page) before publishing this README.
> No production URL exists for this project; run it locally with the
> instructions below.

## Features

### Implemented

- Free-text location analysis (`GET /api/v1/locations/analyze`)
- Geocoding + nearby-places search via pluggable providers (mock or Google)
- Multi-point grid search strategy for wider-radius coverage
- Deduplication by place ID and distance-based re-filtering
- Competitor-density indicator (0–100, API field `opportunityScore`) based on competitor density and spatial distribution — descriptive only, not a recommendation
- Competition level, density, average distance and analyzed-area metrics
- Commercial Ecosystem analysis (complementary businesses and potential traffic generators) for business types with a recognized Business Profile — 15 profiles currently, see `src/config/businessProfiles.js`
- Interactive map (Leaflet/OpenStreetMap) with competitor markers, search radius, and toggleable Commercial Ecosystem layers — see the [Google Maps Platform terms](#google-maps-platform-terms--current-limitation) limitation for Google mode
- Mock Mode indicator in the UI when the response was generated without calling Google
- User accounts with e-mail and password, server-side sessions and real sign-in/sign-out/sign-up screens (see [Authentication](#authentication))
- PostgreSQL persistence for accounts and sessions, with versioned SQL migrations
- Input validation, rate limiting (global, per sign-up/login attempt and per user for analyses), structured error responses
- Swagger/OpenAPI documentation (`/api-docs`)
- Automated test suite (backend: Jest, including tests against a real PostgreSQL; frontend: Vitest + Testing Library)
- A visual Plans/Subscriptions page previewing a possible future SaaS direction (see [Planned Features](#planned-features) — **not a working subscription system**)

### Not implemented (see Planned Features)

E-mail verification, password reset, social sign-in, billing, usage plans,
saved analyses / history, projects and API access plans are **not built** —
they're documented as a future direction only, kept out of the running
application. See [Planned Features](#planned-features). Accounts exist, but
every account has the same access; there are no roles or plans yet.

## Architecture

```
React Frontend
      ↓  same origin: /api/...  (Vite dev proxy in development)
Node.js / Express REST API ── session + origin guard ── PostgreSQL 18 (users, sessions)
      ↓
Geocoding Provider  (Mock or Google Geocoding API)
      ↓
Places Provider     (Mock or Google Places API "New")
      ↓
Location Analysis Engine   (grid search, dedup, distance filter)
      ↓
Competitor-density indicator   (`opportunityScore`)
```

The backend is a modular monolith: feature code lives under `src/modules/*`
(`auth`, `users`), the database plumbing under `src/db`, and the versioned SQL
migrations under `db/migrations`. Everything is wired by dependency injection
in `createApp({ db, auth, ... })`: an app built without an auth module fails
closed (every protected route answers `401`), which is what makes the secure
behaviour the default rather than an opt-in.

Providers are injected, never imported directly by the controller/service —
`src/config/providerFactory.js` is the only place that decides Mock vs
Google, based on `USE_MOCK_GEOCODING` / `USE_MOCK_PLACES`. Swapping either
vendor in the future means adding a new provider behind the same contract
(`src/providers/*/*.contract.js`) and adding one branch to the factory.

```
Client (signed in: session cookie)
  → GET /api/v1/locations/analyze
  → origin guard → session middleware → requireAuth → per-user analyze rate limit
  → locations.routes.js → locations.controller.js   (validates query with zod)
  → locationAnalysis.service.js                      (orchestrates everything)
       → geocodingProvider.geocode(text)
       → placesCoverageSearch.run(...)               (grid + pagination + dedup + distance filter)
             → placesProvider.search(...)
       → opportunityScore.calculateBasicOpportunityScore(...)
  → JSON response
```

## Tech Stack

**Backend:** Node.js 24 (LTS), Express, PostgreSQL 18 (`pg`, parameterized SQL, no ORM),
`node-pg-migrate` (SQL migrations), `express-session` with a PostgreSQL session
store, Argon2id (`argon2`), Zod (validation), Helmet, express-rate-limit, Pino
(logging), Swagger/OpenAPI (swagger-jsdoc + swagger-ui-express), Jest + Supertest.

**Frontend:** React 19, Vite, `react-router`, plain JavaScript (no TypeScript), CSS Modules,
Leaflet + react-leaflet (OpenStreetMap tiles — planned to be replaced by the
Google Maps JavaScript API, see the
[terms notice](#google-maps-platform-terms--current-limitation)), lucide-react
icons, Vitest + Testing Library.

**CI:** GitHub Actions (lint, migrations, tests and frontend build on Node 24, with a PostgreSQL 18 service container).

## How It Works

1. The user enters a location, business type, radius and optional keywords.
2. The backend geocodes the free-text location to coordinates.
3. A small grid of geographic search points is generated to cover the requested radius (a single Places call doesn't guarantee full coverage of a wide area).
4. The Places provider is queried at each grid point (with pagination, capped by `MAX_PAGES_PER_POINT`).
5. Results are deduplicated by place ID.
6. Results are re-filtered by real (Haversine) distance from the original center, defensively, regardless of what the provider returned.
7. Metrics are calculated: competitor count, density per km², average distance from center, competition level and the competitor-density indicator (`opportunityScore`).
8. The frontend renders the analysis: map, indicator ring, metric cards and a results table.

## Competitor-Density Indicator (`opportunityScore`)

A 0–100 heuristic combining two signals: a density score (how many
competitors per km² relative to the analyzed area) and a distribution score
(how spread out or clustered they are). **Higher values mean fewer
competitors per km² and a wider spread of the ones found.** It describes
competitor presence only: it does not measure demand, and a high value is
not a recommendation or a sign of a good location — an area with few
competitors may simply have few customers.

The API field keeps its original name, `opportunityScore`, so existing
clients are not broken; the dashboard labels it "Indicador de concorrência
local". It is an **MVP-level indicator**, not a market-research product — it
deliberately does not use rating/price/opening-hours data, which sit behind
Google's more expensive Places SKU tier. See `src/services/opportunityScore.js`
for the exact formula and weights, and the `analysis.notes` field the API
returns alongside every value.

## Commercial Ecosystem

For business types with a recognized **Business Profile** (`src/config/businessProfiles.js`
— 15 profiles in this version, e.g. `gym`, `restaurant`, `pharmacy`,
`coffee_shop`, `bakery`, `bar`, `pet_shop`), the response also includes a
`commercialEcosystem` object categorizing nearby places into two groups,
distinct from competitors:

- **Complementary businesses** — places that may indicate a commercially
  compatible ecosystem (e.g. a yoga studio near a gym).
- **Potential traffic generators** — places that may contribute to
  foot traffic in the area (e.g. a university near a coffee shop).

Both groups are found with a single Google Places Nearby Search call each
(type-filtered, not free text), at the analyzed center point only — a
deliberate cost/coverage trade-off, not a claim of exhaustive coverage. The
response is explicit about this via `commercialEcosystem.notes`, and about
which specific types were searched via each group's `categoriesSearched`.
A group that fails upstream (timeout/quota) degrades to
`available: false` rather than failing the whole request — the existing
competitor analysis is never affected by a Commercial Ecosystem failure.

`commercialEcosystem` is `null` when `businessType` has no Phase 1 profile,
or when `ENABLE_COMMERCIAL_ECOSYSTEM=false`. This never implies demand,
foot traffic, or business outcomes — see [Disclaimer](#disclaimer).

## Mock Mode

Enabled by default (`USE_MOCK_GEOCODING=true`, `USE_MOCK_PLACES=true` in
`.env.example`). Mock data is deterministic — the same request always
returns the same result — and generated procedurally, so any location or
business type works. Useful sentinels for manual testing:

- `location` containing `__notfound__` → simulates "address not found" (`404 LOCATION_NOT_FOUND`).
- `businessType=__zero_results__` → simulates a market with zero competitors found (`200`, not an error).

When the backend responds with mock data, the frontend dashboard shows a
small **Mock Mode** badge next to the analysis summary — it reads this
directly from the API response (`searchStrategy.provider`) and disappears
automatically once real providers are configured.

## Google API Mode

1. In the [Google Cloud Console](https://console.cloud.google.com/), enable **Geocoding API** and **Places API (New)** on a project, and create an API key.
2. Copy `.env.example` to `.env` and set:
   ```
   GOOGLE_MAPS_API_KEY=your-real-key
   USE_MOCK_GEOCODING=false
   USE_MOCK_PLACES=false
   ```
3. Restart the server. Do this only for controlled, deliberate testing — every request now spends real Google API quota/cost.

If you flip one of the `USE_MOCK_*` flags to `false` and leave the API key
empty, the app still starts normally (with a warning logged); only an actual
call to `/locations/analyze` fails, with a clear `503 CONFIGURATION_ERROR`
and no network call ever made.

The Places integration uses the current **Places API (New)** `searchText`
endpoint with an explicit field mask requesting only what's needed (id,
name, address, location, types, business status) — no rating, reviews,
photos, price level, opening hours or phone number, which sit behind a
pricier SKU tier and this project doesn't need. Text Search only accepts a
**rectangle** as a hard `locationRestriction`, so each search point queries
the bounding rectangle of its circle and the results are then re-filtered by
real (Haversine) distance to the requested radius. The Commercial Ecosystem
uses Nearby Search (New), which does accept a circle.

> **Validation status:** the Google request shapes follow Google's reference
> documentation and are covered by unit tests with the HTTP layer faked, but
> this repository has not yet been validated against live Google calls. Make
> the first real run a small, deliberate smoke test (one or two requests).

## Google Maps Platform terms — current limitation

The map in this version is Leaflet with OpenStreetMap tiles. In **Google
mode** the dashboard shows Google Geocoding/Places content — competitor and
Commercial Ecosystem markers and the analyzed-address pin — on that non-Google
map. Google's terms prohibit that: the Google Maps Platform Terms of Service
§3.2.3(e) ("No Use With Non-Google Maps") and the Service Specific Terms §14.2
(Places API) and §6.2 (Geocoding API) do not allow using this content with or
near a non-Google map. **Mock mode is not affected**, because it uses no
Google content.

What this means today:

- Use Google mode only for private, controlled testing on your own machine. Do not deploy Google mode publicly or offer it to other people.
- Planned: replace Leaflet/OpenStreetMap with the Google Maps JavaScript API for the map (see [Planned Features](#planned-features)).
- The database holds accounts and sessions only; no Google content (places, names, addresses, coordinates) is stored, so Google's caching/storage limits do not apply to this version. They will constrain any future persistence: for Places content only the `place_id` may be stored indefinitely and latitude/longitude for up to 30 days, and copying and saving business names or addresses is not allowed. Saved analyses, history and reports will need to be designed around that.
- This is a summary, not legal advice, and the terms change — read the current text: [Terms of Service](https://cloud.google.com/maps-platform/terms), [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies). (Clauses cited above were checked against the Terms of Service last modified 2026-08-26 and the Service Specific Terms last modified 2026-06-10.)

## Installation

Requires **Node.js 24** (the current LTS; see `.nvmrc` — with
[nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm),
`nvm use` / `fnm use` picks it up) and **PostgreSQL 18**. Node 18 and 20 are
end-of-life and are not supported. There is no Docker/Compose setup: install
PostgreSQL natively. The step-by-step guide (Windows, including how to install
PostgreSQL and create the database) is in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

Backend, once PostgreSQL is running:

```bash
npm install
cp .env.example .env     # then set DATABASE_URL / TEST_DATABASE_URL (see below)
npm run db:init          # one time: creates the "bli" role and the bli_dev / bli_test databases
npm run db:migrate       # applies the SQL migrations (safe to run again)
npm run dev
```

`npm run db:init` needs a PostgreSQL superuser to connect with and a password
for the new `bli` role. It reads both from the environment for that one command
(`PGADMIN_URL` and `BLI_DB_PASSWORD`, see the header of `scripts/db-init.js`),
stores neither, and prints the `DATABASE_URL` / `TEST_DATABASE_URL` lines for your
`.env`. The server refuses to start without `DATABASE_URL`.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and create an account. The backend listens on
`http://localhost:3000`; the frontend calls it through its own origin (`/api/...`,
proxied by the Vite dev server), so the session cookie works and no CORS setup
is needed. `frontend/.env` is optional and normally not needed.

### Troubleshooting: `[nodemon] clean exit` right after startup

If `npm run dev` logs "listening on port 3000" and then immediately
`[nodemon] clean exit - waiting for changes before restart`, it's not an
application bug — something else on the machine already holds port 3000
(most commonly a previous `npm run dev` process that didn't fully exit).

```powershell
# Windows PowerShell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

```bash
# macOS/Linux
lsof -i :3000
kill <PID>
```

## Environment Variables

See `.env.example` (backend) and `frontend/.env.example` (frontend) for the
full list with defaults.

| Var | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | Backend port |
| `DATABASE_URL` | *(none)* | PostgreSQL connection string. **Required**: the server refuses to start without it |
| `TEST_DATABASE_URL` | *(none)* | Database for the automated tests; its name **must end in `_test`** |
| `DATABASE_POOL_MAX` | 10 | Maximum pooled connections |
| `DATABASE_CONNECTION_TIMEOUT_MS` | 5000 | How long a query waits for a free connection before failing with `503` |
| `DATABASE_IDLE_TIMEOUT_MS` | 10000 | Idle connections are closed after this time |
| `DATABASE_STATEMENT_TIMEOUT_MS` | 10000 | Server-side timeout for one statement |
| `DATABASE_SSL` | `disable` | `require` to use TLS (certificate verified) with a managed database |
| `SESSION_SECRET` | *(empty)* | Signs the session cookie, ≥ 32 chars. **Required in production**; several comma-separated values allow rotation. In development an insecure built-in secret is used (with a warning) |
| `SESSION_IDLE_TTL_DAYS` | 7 | Sign out after this many days without activity |
| `SESSION_ABSOLUTE_TTL_DAYS` | 30 | Sign out after this many days regardless of activity (never extended) |
| `SESSION_COOKIE_SECURE` | `true` | Cookie is HTTPS-only and named `__Host-bli_sid`. Local HTTP development sets `false` (cookie `bli_sid`); the server refuses `false` in production |
| `SESSION_COOKIE_SAMESITE` | `strict` | `strict` (default) or `lax` |
| `ALLOWED_ORIGINS` | dev: Vite + API origins | Origins allowed to make state-changing requests. **Required in production** (the public origin) |
| `CORS_ORIGINS` | *(empty)* | Origins allowed to call the API cross-origin with cookies. Empty (default) = same-origin only |
| `TRUST_PROXY` | 0 | Number of reverse proxies in front of the API (for `req.ip` and secure cookies) |
| `REGISTRATION_ENABLED` | `true` | `false` closes sign-ups (existing users can still sign in) |
| `ANALYZE_RATE_LIMIT_MAX` | 30 | Successful analyses per user per window |
| `ANALYZE_RATE_LIMIT_WINDOW_MINUTES` | 60 | Window of the per-user analysis limit |
| `GOOGLE_MAPS_API_KEY` | *(empty)* | Required only when `USE_MOCK_*` is `false` |
| `USE_MOCK_GEOCODING` | `true` | Use the mock geocoding provider |
| `USE_MOCK_PLACES` | `true` | Use the mock places provider |
| `MAX_RADIUS_KM` | 20 | Hard cap on the radius a client can request |
| `GRID_MIN_RADIUS_KM` | 3 | Below this radius, a single search point is used instead of a grid |
| `MAX_SEARCH_POINTS` | 7 | Grid size above the threshold (hard-ceiling of 19 enforced in code regardless of this value) |
| `MAX_PAGES_PER_POINT` | 1 | Pages fetched per grid point (each page is a separate billed call) |
| `ENABLE_COMMERCIAL_ECOSYSTEM` | `true` | Toggles Commercial Ecosystem analysis (adds at most 2 extra Places calls per analysis, only for a recognized Business Profile) independently of `USE_MOCK_PLACES` |
| `HTTP_TIMEOUT_MS` | 8000 | Timeout for each external call |
| `LOG_LEVEL` | info | Pino log level |
| `VITE_API_BASE_URL` (frontend) | *(empty)* | Empty = same-origin `/api` (the default and the recommended setup). Only for an API on another origin — never a Google key |
| `DEV_API_PROXY_TARGET` (frontend dev server) | `http://localhost:3000` | Where the Vite dev server proxies `/api`; only needed if the backend uses another port |

`GOOGLE_MAPS_API_KEY` is only ever read from `process.env`, never logged
(the Places API key travels in a header, stripped from any logs; the
Geocoding API key in a query string, masked before logging), and never sent
to the frontend.

## API Documentation

Swagger UI: `http://localhost:3000/api-docs`. It documents the auth endpoints
(`/api/v1/auth/register|login|logout|me`), the `cookieAuth` security scheme, the
`/health` and `/ready` probes and every error status. `/analyze` needs a session:
sign in through the app first, and "Try it out" sends the same cookie.

Probes (neither touches the rate limiter): `GET /health` answers `200` while the
process is alive and never uses the database; `GET /ready` answers `200` when
PostgreSQL answers a query and `503` otherwise, with no connection details.

## Testing

```bash
npm test              # backend — Jest; needs PostgreSQL (TEST_DATABASE_URL); mocks for everything external
npm run test:unit     # backend tests that need no database at all
npm run test:coverage
npm run lint

cd frontend
npm test               # frontend — Vitest + Testing Library
npm run lint
npm run build           # production build
```

Backend tests are organized under `tests/unit` (pure logic, providers with
`httpClient`/`fetch` mocked), `tests/integration` (Supertest against the
Express app, wired to the mock providers — except `missingApiKey.test.js`,
which wires the real providers with the key removed to prove the
config-error path never touches the network) and `tests/db` (a real
PostgreSQL: migrations, constraints, the users repository, the session store
and the complete authentication flows). Coverage includes invalid
parameters, an unresolvable location, a zero-results market, a total
grid-search failure, the missing-API-key path, and — for authentication —
registration, duplicate e-mails, validation, password hashing, login and the
uniform invalid-credentials answer, session fixation, idle and absolute expiry,
cookie attributes, the origin guard, every rate limit, database outages,
`/ready`, `/analyze` with and without a session, and that a password, a hash or
a cookie never reach a response or a log line.

The database suites use data that is unique to each test and never truncate
tables, so they run in parallel against one database. `TEST_DATABASE_URL` must
point at a database whose name ends in `_test`; the helpers refuse anything else.
`npm test` applies the migrations to it first. Without `TEST_DATABASE_URL`, the
database suites fail with a message explaining what to set (use
`npm run test:unit` to skip them).

**CI:** `.github/workflows/ci.yml` runs on every push to `main` and every pull
request: backend lint, migrations (applied twice, to prove they are idempotent)
and tests against a throwaway PostgreSQL 18 service container, and frontend
lint + tests + production build, on Node 24. It uses no secrets and runs
against the mock providers only, so it never calls Google.

## Security

- No secrets in the repository or its history; `.env` is gitignored on both backend and frontend, `.env.example` files hold variable names only.
- `GOOGLE_MAPS_API_KEY` lives server-side only — never in a `VITE_*` variable, never in a response body.
- Helmet, rate limiting (100 req / 15 min by default, with `/health` and `/ready` exempt) and a global error handler that never leaks stack traces, SQL, connection strings or raw upstream error bodies to the client.
- Logs redact the `Authorization`, `Cookie` and `Set-Cookie` headers, the Google API key header and any `password` / `passwordHash` field, so a credential or session token can never reach the log output.
- Every response carries a server-generated `X-Request-Id` (a UUID, never taken from the client). The same id appears in every log line for that request and in error bodies as `error.requestId`, so a failure can be traced from a support report.
- **Same origin by design.** CORS headers are sent only for the origins in `CORS_ORIGINS`, which is empty by default: the front end and the API share one origin (a Vite proxy in development, a single origin in production), so no cross-origin access is granted.
- Authentication and session protections are described in [Authentication](#authentication).
- No automatic retries on external calls, so a transient failure can never silently multiply cost.
- Dependency install scripts are reviewed: `allowScripts` in both `package.json` files records what is denied (see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#dependency-install-scripts)); in particular the telemetry script of `@scarf/scarf` never runs.

## Authentication

Accounts are e-mail + password. There is no e-mail verification, password reset
or social sign-in yet (see [Planned Features](#planned-features)).

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/auth/register` | Create an account and sign in (`201`). `409 EMAIL_ALREADY_REGISTERED` for a taken e-mail, `403 REGISTRATION_DISABLED` when closed |
| `POST /api/v1/auth/login` | Sign in (`200`). Unknown e-mail and wrong password both answer `401 INVALID_CREDENTIALS` |
| `POST /api/v1/auth/logout` | Destroy the session and clear the cookie (`204`, idempotent) |
| `GET /api/v1/auth/me` | The signed-in user, or `401 UNAUTHENTICATED` |

The public user is `{ id, name, email, createdAt }`; the password hash is never
part of any response.

**Passwords.** 12 to 128 characters (Unicode NFC, counted in characters), no
composition rules (NIST SP 800-63B), but obviously weak passwords are refused:
common passwords, keyboard walks, repetitions, and a password that is the
person's own name or e-mail. They are hashed with **Argon2id** (19 MiB, 2
passes, 1 lane — OWASP's minimum) and upgraded transparently at login if the
parameters are ever raised. The plaintext is never stored, returned or logged.

**Sessions.** A random id in a `HttpOnly`, `SameSite=Strict`, `Path=/` cookie
without `Domain`; in production it is also `Secure` and named `__Host-bli_sid`
(in local HTTP development, `bli_sid`). The database stores only a SHA-256 of
the id, so a copy of the table cannot be replayed. A session ends after 7 days
without activity or 30 days in total, whichever comes first; the id is replaced
on every sign-in and sign-up (fixation) and destroyed on sign-out; expired rows
are pruned in the background. Nothing about the session is kept in
`localStorage` or `sessionStorage`.

**Other protections.**
- *CSRF:* `SameSite=Strict`, plus an origin guard on `POST/PUT/PATCH/DELETE` (`Origin` must be allow-listed; `Sec-Fetch-Site` other than `same-origin` is refused unless the `Origin` is allow-listed), plus JSON-only bodies (anything else is `415`). Safe methods have no side effects.
- *Brute force and credential stuffing:* failed logins are limited per address (20 / 15 min), per address + account (5 / 15 min) and per account from any address (30 / hour); sign-ups 5 / hour / address. Successful logins are never counted and clear the account's counters. These limits are in memory (one process); several instances would need a shared store.
- *Account enumeration:* login answers identically for an unknown e-mail and a wrong password, spending the same hashing time in both cases. Sign-up does answer `409` for a taken e-mail (a deliberate trade-off for a usable form).
- *SQL injection:* every query is a constant string with bind parameters, enforced by an ESLint rule and by tests.
- *Analysis cost:* `GET /api/v1/locations/analyze` requires a session and is limited per user (`ANALYZE_RATE_LIMIT_MAX` per `ANALYZE_RATE_LIMIT_WINDOW_MINUTES`, 30 per hour by default).
- *Ownership:* no user-owned data exists yet, but the convention every future repository must follow (`repository(userId, ...)`, `WHERE user_id = $1`, the user always taken from the server-side session, another user's resource answered `404`) is enforced by architecture tests — see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#adding-a-user-owned-resource).
- *Failure behaviour:* if PostgreSQL is down the process keeps running; database routes answer `503 DATABASE_UNAVAILABLE`, `/health` stays `200` and `/ready` is `503`.

Known limitations: a per-account login limit lets someone lock a victim out of
sign-in for up to an hour by failing on purpose (the price of stopping
distributed guessing without a CAPTCHA); international (non-ASCII) e-mail
addresses are not accepted; there is no "log out everywhere" yet.

## Current Features

Everything under [Features → Implemented](#features) above is real and
working today, against either mock or real Google providers.

## Planned Features

The following are **not implemented** in this version. This is a direction,
not a commitment: order and scope may change as the product is tested with
real users.

**Platform**

- Replace the Leaflet/OpenStreetMap map with the Google Maps JavaScript API, so Google Geocoding/Places content can be shown without breaking Google's terms (see [Google Maps Platform terms](#google-maps-platform-terms--current-limitation))
- E-mail verification, password reset and account settings on top of the accounts introduced in v0.3.0
- Serving the built front end from the same origin as the API in production (single-origin deployment)

**Product direction**

- Projects and candidate locations, with saved analyses (history)
- Demographic data from the IBGE census
- Comparison between candidate locations, user-entered costs and field-visit notes
- Reports

**Commercial (older planning)**

- Real subscriptions and billing
- Per-plan usage limits enforced server-side (entitlements)
- Data export
- Public API access plan
- Usage tracking

The SaaS-oriented planning documents under
[`docs/future-saas/`](docs/future-saas/) and the non-executed example code
under [`examples/future-saas/`](examples/future-saas/) (plus the visual-only
Plans page in the frontend) predate this direction. Their database schema
and phase ordering are **superseded** — see the notice at the top of
`DATABASE_SCHEMA_EXAMPLE.md` and `IMPLEMENTATION_ROADMAP.md`.

## Disclaimer

This tool does not find every establishment that exists in an area — it
reports what its search strategy (a bounded grid of point queries against a
third-party Places API) actually returned, and is explicit about that via
each response's `searchStrategy.limitations`. `opportunityScore` (shown in
the dashboard as "Indicador de concorrência local") is this project's own
heuristic indicator, based only on competitor count, density and spatial
distribution — it describes competitor presence, not demand, and it is not a
recommendation, a guarantee of business success, a complete market census, or
a substitute for real-world due diligence.

`commercialEcosystem` results (complementary businesses and potential
traffic generators) are informational context, not a demand signal: the
presence of complementary businesses does not mean there is customer
demand, and low competition does not automatically mean a good opportunity
— it may simply mean insufficient demand. Coverage is a single search at
the analyzed center point, not the full competitor grid, so
`establishmentsFound` for these groups is never a complete census either.

## Author

Kelvin Simões — Backend Developer

Developed with Claude (Anthropic) as an assistance tool for implementation,
code review, architecture discussions and debugging. The technologies
listed under [Tech Stack](#tech-stack) reflect what the project actually
uses — not necessarily the author's prior hands-on expertise with each one
individually.

## License

Portfolio project. No license file has been added; treat the source as
"all rights reserved" unless a `LICENSE` file is later added to this
repository.
