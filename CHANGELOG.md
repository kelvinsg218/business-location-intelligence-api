# Changelog

All notable changes to Business Location Intelligence will be documented in
this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/) and stays in
the `0.x.x` range during the current development phase — a `MINOR` bump
means a relevant new feature or product evolution, a `PATCH` bump means a
fix or small adjustment that isn't a new feature. `1.0.0` is reserved for
when the product is considered a consolidated first version.

## [Unreleased]

Two sets of changes are waiting for a release, both unreleased: `0.3.0`
("Foundation", a MINOR) and, underneath it, the `0.2.1` hygiene patch it was
built on. They are kept in separate subsections so they can be tagged
separately if that is preferred.

### 0.3.0 — Foundation: PostgreSQL and real authentication

The first version with a database and real user accounts. The analysis itself
is unchanged (algorithm, business profiles, ecosystem, providers, response and
score); what changes is who can run it.

#### Added
- PostgreSQL 18 persistence with versioned SQL migrations (`node-pg-migrate`, `db/migrations`, `npm run db:migrate`); two tables only, `users` and `sessions`, with their constraints and indexes. Parameterized SQL through `pg`; no ORM, no query builder, no PostGIS
- `npm run db:init` (one-time role and database creation, secrets read from the environment only), `npm run db:wait`, `npm run test:unit`
- Accounts and sessions: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
  - passwords: Argon2id (19456 KiB, 2 passes, 1 lane), NFC-normalized, 12–128 characters, no composition rules, common/predictable/self-referential passwords refused; upgraded transparently at login if the parameters change
  - sessions: opaque random id in an `HttpOnly`, `SameSite=Strict` cookie (`__Host-bli_sid` and `Secure` in production, `bli_sid` on local HTTP), stored only as a SHA-256 hash; 7 days idle / 30 days absolute; id regenerated on register/login, destroyed on logout; expired rows pruned in the background
  - `REGISTRATION_ENABLED` (default `true`) to close sign-ups without a code change
  - the public user is `{ id, name, email, createdAt }`; the password hash is never returned
- HTTP protections: origin guard for state-changing requests (`Origin` allow-list + `Sec-Fetch-Site`), JSON-only bodies (`415`), `400 INVALID_JSON` and `413 PAYLOAD_TOO_LARGE` for bad bodies, `503 DATABASE_UNAVAILABLE` when the database is down
- Rate limits: sign-up (5/hour/address), failed logins (per address, per address + account, per account), and a per-user cap on analyses (`ANALYZE_RATE_LIMIT_MAX` / `ANALYZE_RATE_LIMIT_WINDOW_MINUTES`, 30 per hour by default)
- `GET /ready` (readiness: PostgreSQL answers a query; `200`/`503`, no details). `/health` stays liveness-only and never touches the database. Both are exempt from the global rate limit
- New configuration: `DATABASE_URL`, `TEST_DATABASE_URL`, `DATABASE_*`, `SESSION_*`, `ALLOWED_ORIGINS`, `CORS_ORIGINS`, `TRUST_PROXY`, `REGISTRATION_ENABLED`, `ANALYZE_RATE_LIMIT_*` (see `.env.example`); production refuses to start without a strong `SESSION_SECRET`, `ALLOWED_ORIGINS` and a Secure cookie
- Frontend: real login and sign-up pages, `react-router` routes (`/login`, `/register`, `/app`, `/app/plans`, `/` → `/app`), `RequireAuth` / `PublicOnly`, a single API client (`credentials: 'include'`), session recovery on reload through `GET /auth/me`, an "expired session" notice, Portuguese error messages, the signed-in user's name and a working "Sair"
- Tests: real-PostgreSQL suites (migrations and idempotence, constraints, users repository, session store, register/login/me/logout, fixation, idle and absolute expiry, cookie attributes, origin guard, every rate limit, database outage, `/ready`, analyze with and without a session, and that no password, hash or cookie reaches a response or a log); architecture tests for the ownership convention and against interpolated SQL; frontend tests for every auth flow and a guard that the client keeps no token in web storage
- Documentation: `docs/DEVELOPMENT.md` (setup on Windows, PostgreSQL 18, migrations, tests, troubleshooting, ownership rules, install scripts, production notes)
- CI: a PostgreSQL 18 service container for the backend job; migrations applied twice to prove idempotence; still no secrets, mock providers only

#### Changed
- **`GET /api/v1/locations/analyze` now requires authentication** (`401 UNAUTHENTICATED` without a session). Its response, algorithm, profiles, providers and score are unchanged
- CORS is no longer open: headers are sent only for the origins in `CORS_ORIGINS` (empty by default). The front end calls the API through its own origin — a Vite dev-server proxy for `/api` in development
- `VITE_API_BASE_URL` now defaults to empty (same-origin `/api`) instead of `http://localhost:3000`
- Error responses for malformed JSON, oversized bodies and database failures now have stable codes; the global error handler no longer tries to write a second response after one has started
- The Plans page no longer says that accounts do not exist (billing still does not)
- Dependency `allowScripts` reviewed in both `package.json` files: all install scripts are denied, including `@scarf/scarf` telemetry
- Package versions and lockfile roots are `0.3.0`

#### Removed
- The temporary client-side development login (`root` / `1`, `frontend/src/auth/devAuth.js`) and every use of `sessionStorage` for authentication

#### Security
- New protections against CSRF, session fixation, brute force / credential stuffing, SQL injection and account enumeration at login; see the README's "Authentication" section for the design and its known limitations
- Logs redact `password`, `passwordHash` and `password_hash` in addition to `Cookie`/`Set-Cookie`

#### Known limitations
- Rate limits and session pruning are per process; several instances would need a shared store
- No e-mail verification, password reset, "log out everywhere" or international e-mail addresses
- A per-account login limit lets someone lock a victim out of sign-in for up to an hour
- The built front end is not served by the API yet (single-origin production serving is planned)

### 0.2.1 — Hygiene (patch)

Hygiene release (planned as `0.2.1`, a PATCH): tooling, logging, one Google
API contract fix and neutral wording. No new product features.

#### Added
- `X-Request-Id` on every response: a server-generated UUID (never taken from the client), included in every log line and in error bodies as `error.requestId`; the header is exposed to browsers through CORS
- GitHub Actions CI (`.github/workflows/ci.yml`): backend lint + tests and frontend lint + tests + build on every push to `main` and every pull request, on Node 24, with read-only permissions, no secrets, and mock providers only (it can never call Google)
- `.nvmrc` (`24`) and `engines.node: ">=24"` in both `package.json` files
- `searchStrategy.limitations` now notes that a search point may query its bounding box, with results always re-filtered by distance to the requested radius
- Documentation of the Google Maps Platform terms limitation of the current map in Google mode (README)

#### Changed
- Node.js 24 (LTS) is now the single standard for development, CI and production (it was `>=18.16.0`; Node 18 and 20 are end-of-life)
- Neutral language for the competitor-density indicator, without changing the API field `opportunityScore`, its values or its formula:
  - the dashboard label "Opportunity Score" is now "Indicador de concorrência local", and the card explains that higher values mean fewer competitors per km² and that it does not measure demand or recommend anything
  - competition level badges are no longer green (low) / red (high); all levels use a neutral tone
  - the zero-competitors note no longer says "suggesting an open market"; it now says the indicator measures competitor presence only and says nothing about demand
  - page, empty-state, plans and OpenAPI copy no longer promise "opportunities"
- README, case study and `docs/future-saas`: current map status, the Google terms limitation and the planned Google Maps JavaScript API migration are documented; `DATABASE_SCHEMA_EXAMPLE.md` and `IMPLEMENTATION_ROADMAP.md` are marked as superseded

#### Fixed
- Google Text Search (New) requests sent `locationRestriction.circle`, but Text Search only supports `rectangle` there (a circle is valid only for `locationBias`). Each search point now sends the bounding rectangle of its circle; the existing Haversine filter still discards anything outside the requested radius. The new request shape follows Google's reference documentation and is covered by unit tests, but has not been validated against a live Google call
- Lockfile root versions had been left out of sync with `package.json` since v0.2.0
- The OpenAPI document (`/api-docs`) declared version `1.0.0`; it now reports the product version read from `package.json`

#### Security
- Request `Cookie` and response `Set-Cookie` headers were not redacted by the logger and would have been written to the logs; both are now redacted (there is no session mechanism yet, so nothing was exposed — this closes the gap before one exists)

## [0.2.0] - 2026-09-23

### Added
- Business Profiles catalog expanded from 3 to 15 recognized business types (`src/config/businessProfiles.js`)
- Commercial Ecosystem analysis: complementary businesses and potential traffic generators, with dedicated toggleable map layers/filters for each new profile
- Explicit "Commercial ecosystem analysis is not yet available for this business type" placeholder instead of silently hiding the section for unmapped business types
- Temporary development login screen (`root` / `1`), client-side only, gating entry to the app (`frontend/src/auth/devAuth.js`) — not production security, see README

### Changed
- Visual refinements to the dark/purple design system: new `--color-heading` token and retinted text/border colors, applied to page titles, section headings and key values

## [0.1.0] - 2026-09-20

First functional version of Business Location Intelligence.

### Added
- REST API for free-text location analysis (`GET /api/v1/locations/analyze`)
- Geocoding + nearby-places search via pluggable providers (mock or Google)
- Multi-point grid search strategy for wider-radius coverage
- Deduplication by place ID and distance-based re-filtering
- Opportunity Score (0-100) based on competitor density and spatial distribution
- Competition level, density, average distance and analyzed-area metrics
- Interactive map (Leaflet/OpenStreetMap) with competitor markers and search radius
- Mock mode with deterministic, procedurally generated data, and a Mock Mode UI indicator
- Input validation, rate limiting, structured error responses
- Swagger/OpenAPI documentation (`/api-docs`)
- Automated test suite (backend: Jest; frontend: Vitest + Testing Library)
- Visual-only Plans/Subscriptions page previewing a possible future SaaS direction (not a working subscription system)
