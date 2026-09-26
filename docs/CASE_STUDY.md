# Case Study: Business Location Intelligence API

> This is a portfolio project built to demonstrate backend engineering
> ability. It is not deployed for a real business, has no paying users, and
> is not in production for a client. Everything below describes the system
> as designed and built, not a commercial outcome.

## Business Problem

Someone deciding where to open a physical business (a gym, a restaurant, a
pharmacy) typically has to manually check a map, count nearby competitors,
and guess whether an area is saturated or underserved. That process is
slow, subjective, and doesn't scale to comparing several candidate
locations. The goal of this project was to turn that manual process into a
single API call: give it a place, a business type and a radius, and get
back a structured, explainable analysis of the competitive landscape.

## Solution

A REST API that:

1. Resolves a free-text location to coordinates (geocoding).
2. Searches for existing businesses of the target type within the
   requested radius, using a multi-point search grid instead of a single
   query, to work around third-party API pagination/coverage limits.
3. Deduplicates and geographically re-filters the results.
4. Computes a set of metrics (competitor count, density, average distance,
   competition level) and a 0–100 competitor-density indicator (the
   `opportunityScore` field).
5. Returns everything as one structured JSON response, paired with a React
   dashboard that visualizes it on an interactive map.

## Architecture

```
React Frontend
      ↓  same origin (/api)
Node.js / Express REST API ── session + origin guard ── PostgreSQL (users, sessions)
      ↓
Geocoding Provider  (Mock or Google Geocoding API)
      ↓
Places Provider     (Mock or Google Places API "New")
      ↓
Location Analysis Engine   (grid search, dedup, distance filter)
      ↓
Competitor-density indicator   (`opportunityScore`)
```

Providers are injected behind a contract (`geocodingProvider.contract.js`,
`placesProvider.contract.js`), never imported directly by business logic. A
single factory (`config/providerFactory.js`) decides, from environment
variables, whether to wire in the mock implementation or the real Google
one. This meant the entire analysis engine, controller, and test suite
could be built and fully tested — including error paths — without ever
calling Google or spending a cent, and the real integration could be added
later behind the exact same interface.

## Technical Challenges

**Coverage vs. cost.** A single Places API call caps out well below what a
5–20 km radius can contain, and doesn't guarantee full coverage. The fix
was a small grid of overlapping search points around the geocoded center —
but grid size directly drives API cost, so the grid is capped (a hard
ceiling in code, independent of configuration) and the response is always
explicit that it reports what the search strategy found, not an exhaustive
census.

**Determinism in mock mode.** Development and tests needed to run without
any network access, but still needed to exercise every response shape
(including "location not found" and "zero competitors found"). The mock
providers generate procedural, deterministic data from the input itself
(not a fixed fixture file), plus two sentinel inputs that reliably trigger
the not-found and zero-results paths on demand.

**A frontend map library bug.** During integration testing, the map
component crashed after every successful analysis: `FitBounds` was calling
`.getBounds()` on a Leaflet circle that had never been attached to the map,
which only exposes that method's dependencies once attached. The fix was
switching to `LatLng.toBounds()`, which computes the same bounding box from
the center point alone. A small error boundary was added around the map
component afterward, so a future map-rendering issue degrades to a
fallback message instead of taking down the whole dashboard.

## API Integration

Two Google APIs are integrated behind the provider contracts described
above: the Geocoding API, and the Places API ("New") using its
`searchText` endpoint with an explicit field mask. The field mask requests
only what the analysis actually uses — id, name, address, location, types,
business status — deliberately excluding rating, reviews, photos, price
level, opening hours and phone number, which sit behind a more expensive
SKU tier this project has no use for. Every outbound request has a hard
timeout and zero automatic retries, so a transient failure is reported
once, never silently multiplied into extra cost.

## Geospatial Processing

Haversine distance is used twice, independently: once server-side to
defensively re-filter every result against the actual requested radius
(regardless of what the Places API returned), and once client-side, purely
for display, to sort the results table by distance from the analyzed
point. Deduplication happens by the provider's own place ID across all
grid points before any distance filtering runs, so a place found by two
overlapping search points is only counted once.

## Competitor-Density Indicator (`opportunityScore`)

A 0–100 heuristic combining a density score (competitors per km² relative
to the analyzed area) and a distribution score (how spread out or
clustered competitors are), weighted and blended into a single number.
Higher values mean fewer competitors per km². It is explicitly scoped as an
MVP indicator — it does not incorporate rating, price or popularity data,
it does not measure demand, and it is not a recommendation — and every
response carries a `notes` field explaining exactly what it does and doesn't
account for, so it's never presented as more authoritative than it is. (The
API field kept its original name, `opportunityScore`, for compatibility; the
dashboard labels it "Indicador de concorrência local".)

## Error Handling

Every failure path — invalid input, an unresolvable location, a rate-limit
hit, an upstream Google error, an upstream timeout, a missing API key —
maps to a typed `ApiError` with a stable `code`, a human-readable
`message`, and an appropriate HTTP status. The global error handler never
leaks a stack trace or a raw upstream error body to the client, and a
dedicated log redaction list keeps the API key out of logs even if a
future code path accidentally tried to log a request URL or header
containing it.

## Accounts, Sessions and Persistence (v0.3.0)

Version 0.3.0 ("Foundation") put real accounts and a database under the
existing analysis without changing it: same algorithm, providers, response
and score. `GET /api/v1/locations/analyze` now needs a signed-in user, which
is what makes per-user limits and, later, saved work possible. The decisions
worth explaining:

- **Server-side sessions, not JWTs.** A random id in an `HttpOnly`, `SameSite=Strict` cookie (`__Host-` prefixed and `Secure` in production) points at a row in PostgreSQL. Sign-out and revocation are real deletes; nothing in the browser can be read or stolen by script; and the table stores only a SHA-256 of the id, so a leaked copy of the database cannot be turned into working cookies. Two clocks apply: 7 days idle (slides with activity) and 30 days absolute (never extended). The id is replaced at every sign-in (session fixation) and a failed "touch" can never fail a request that already succeeded.
- **Argon2id at OWASP's minimum** (19 MiB, 2 passes, 1 lane), NFC-normalized passwords, 12–128 characters, no composition rules but a check against common, predictable and self-referential passwords. The hash parameters live inside each stored hash, so raising them later needs no migration: a login upgrades old hashes transparently. Login spends the same hashing time whether the e-mail exists or not, and answers identically.
- **CSRF without tokens.** `SameSite=Strict` first; then an origin guard on state-changing methods (`Origin` allow-list, `Sec-Fetch-Site`); then JSON-only bodies, which closes the classic cross-site form POST (`415`). Safe methods have no side effects.
- **Layered rate limits** with different keys — per address, per address + account, per account (against distributed guessing) — counting only *failed* logins, plus a per-user cap on the analyses that can cost real Google calls. All in memory; the multi-instance trade-off is documented rather than hidden behind a Redis dependency nobody needs yet.
- **Plain SQL, no ORM.** `pg` with parameterized queries only, enforced by an ESLint rule that rejects interpolated or concatenated SQL, and versioned SQL migrations (`node-pg-migrate`) applied twice in CI to prove idempotence. No PostGIS, no query builder: two small tables did not justify either.
- **Secure by default through dependency injection.** `createApp({ db, auth })` receives its collaborators; an app built without an auth module answers `401` on every protected route instead of silently being open. The same seam lets the analysis tests run with a stand-in for the authenticated user while the authentication tests run against the real thing.
- **Ownership is enforced by tests before it is needed.** No user-owned data exists yet, but the rule every future repository must follow (`repository(userId, ...)`, `WHERE user_id = $1`, user taken only from the server-side session, another user's resource is a `404`) is checked by architecture tests written against synthetic repositories.
- **Failing well.** If PostgreSQL goes down the process keeps running: database routes answer `503 DATABASE_UNAVAILABLE` with no host, user or SQL in the body, `/health` stays `200` and `/ready` turns `503`. Malformed JSON is a `400`, an oversized body a `413`.
- **A real PostgreSQL in the tests.** The database suites use data that is unique to each test and never truncate or count whole tables, so they run in parallel; time-based behaviour (expiry) is tested with an injected clock. One of them initially compared whole-table counts and failed only under CI's extra parallelism, which is why the rule is now written down.
- **Supply-chain hygiene.** Dependency install scripts are reviewed and denied via `allowScripts` (including a telemetry script); the install, tests and build were verified with `--ignore-scripts`.

## Testing

The backend has unit tests for the pure logic (grid generation, scoring,
distance/unit conversion) and the providers (with `fetch` mocked), plus
integration tests running the real Express app against the mock providers
end to end — covering invalid parameters, an unresolvable location, a
zero-results market, and a scenario where every grid point fails. A
separate test wires the *real* provider classes with no API key configured,
to prove the "misconfigured" path fails with a clear error and never
attempts a network call. The frontend has component and integration tests
(API service, form validation, full render-and-submit flows) using Vitest
and Testing Library. Since v0.3.0 the suite also includes tests against a real
PostgreSQL: migrations and constraints, the session store, and the whole
authentication flow (fixation, expiry, cookie attributes, the origin guard,
every rate limit, database outages, and that a password, a hash or a cookie
never reach a response or a log line).

## Frontend Integration

The dashboard is a separate React application that only ever talks to this
API's HTTP endpoints, through one client that sends the session cookie and
keeps no token anywhere in the browser — it never receives or references a
Google API key. It has real sign-in and sign-up screens, routes that need a
session (`/app`, `/app/plans`), and recovers the session on reload by asking
the server (`GET /api/v1/auth/me`). It renders four distinct states (idle, loading, success, error), an
interactive Leaflet map with the search radius and every competitor found,
a competition-indicator ring, metric cards, and a results table. When the
backend responds with mock data, the UI surfaces a small "Mock Mode"
badge, reading that directly from the API response instead of hardcoding
an assumption about which mode is active.

## Result

A working, tested, documented REST API and dashboard that can run entirely
on mock data (no cost, no external dependency) for demonstration, or be
switched to real Google data with three environment variables. The Swagger
UI, test suite and this document exist specifically so the system is
verifiable rather than taken on faith.

## Future Possibilities

The [`docs/future-saas/`](./future-saas/) directory documents — as
planning only, not implemented — what it would take to evolve this into a
multi-tenant SaaS product: subscriptions, per-plan entitlements, usage
tracking, and a real payment integration. Accounts and sessions now exist
(v0.3.0); everything else in that directory is still planning only. The
current version deliberately stops short of that scope to stay a focused,
honestly-scoped portfolio piece.
