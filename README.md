# Business Location Intelligence API

A REST API that analyzes the business competition/opportunity around a
free-text location — no latitude/longitude required from the client. Give it
a place, a business type and a radius; it geocodes the place, searches
nearby establishments across a small grid of points for better coverage,
deduplicates and filters the results, and returns a transparent opportunity
analysis. A React dashboard consumes the same API to visualize the result
on an interactive map.

```
GET /api/v1/locations/analyze?location=Vila+Velha,+ES&businessType=gym&radius=5
```

## Overview

This project demonstrates a complete, production-shaped backend: input
validation, an external-API integration layer with provider abstraction
(mock/real), geospatial processing, a scoring engine, structured error
handling, rate limiting, logging, automated tests and OpenAPI documentation
— plus a React frontend that consumes it end to end.

It runs in two modes:
- **Mock mode** (default): zero external calls, zero cost, deterministic output. This is how you should run it to explore the project.
- **Google mode**: real Geocoding API + Places API (New) calls, opt-in only, behind an API key you provide.

## Demo

> Screenshots go here — add real captures of the running dashboard
> (empty state, loading state, a completed analysis with the map and
> Opportunity Score, and the Plans page) before publishing this README.
> No production URL exists for this project; run it locally with the
> instructions below.

## Features

### Implemented

- Free-text location analysis (`GET /api/v1/locations/analyze`)
- Geocoding + nearby-places search via pluggable providers (mock or Google)
- Multi-point grid search strategy for wider-radius coverage
- Deduplication by place ID and distance-based re-filtering
- Opportunity Score (0–100) based on competitor density and spatial distribution
- Competition level, density, average distance and analyzed-area metrics
- Interactive map (Leaflet/OpenStreetMap) with competitor markers and search radius
- Mock Mode indicator in the UI when the response was generated without calling Google
- Input validation, rate limiting, structured error responses
- Swagger/OpenAPI documentation (`/api-docs`)
- Automated test suite (backend: Jest; frontend: Vitest + Testing Library)
- A visual Plans/Subscriptions page previewing a possible future SaaS direction (see [Planned Features](#planned-features) — **not a working subscription system**)

### Not implemented (see Planned Features)

Accounts, authentication, billing, usage limits, analysis history and API
access plans are **not built** — they're documented as a future direction
only, kept out of the running application. See
[`docs/future-saas/`](docs/future-saas/).

## Architecture

```
React Frontend
      ↓
Node.js / Express REST API
      ↓
Geocoding Provider  (Mock or Google Geocoding API)
      ↓
Places Provider     (Mock or Google Places API "New")
      ↓
Location Analysis Engine   (grid search, dedup, distance filter)
      ↓
Opportunity Score
```

Providers are injected, never imported directly by the controller/service —
`src/config/providerFactory.js` is the only place that decides Mock vs
Google, based on `USE_MOCK_GEOCODING` / `USE_MOCK_PLACES`. Swapping either
vendor in the future means adding a new provider behind the same contract
(`src/providers/*/*.contract.js`) and adding one branch to the factory.

```
Client
  → GET /api/v1/locations/analyze
  → locations.routes.js → locations.controller.js   (validates query with zod)
  → locationAnalysis.service.js                      (orchestrates everything)
       → geocodingProvider.geocode(text)
       → placesCoverageSearch.run(...)               (grid + pagination + dedup + distance filter)
             → placesProvider.search(...)
       → opportunityScore.calculateBasicOpportunityScore(...)
  → JSON response
```

## Tech Stack

**Backend:** Node.js, Express, Zod (validation), Helmet, express-rate-limit,
Pino (logging), Swagger/OpenAPI (swagger-jsdoc + swagger-ui-express), Jest +
Supertest.

**Frontend:** React 19, Vite, plain JavaScript (no TypeScript), CSS Modules,
Leaflet + react-leaflet (OpenStreetMap tiles, no Google Maps billing),
lucide-react icons, Vitest + Testing Library.

## How It Works

1. The user enters a location, business type, radius and optional keywords.
2. The backend geocodes the free-text location to coordinates.
3. A small grid of geographic search points is generated to cover the requested radius (a single Places call doesn't guarantee full coverage of a wide area).
4. The Places provider is queried at each grid point (with pagination, capped by `MAX_PAGES_PER_POINT`).
5. Results are deduplicated by place ID.
6. Results are re-filtered by real (Haversine) distance from the original center, defensively, regardless of what the provider returned.
7. Metrics are calculated: competitor count, density per km², average distance from center, competition level and the Opportunity Score.
8. The frontend renders the analysis: map, Opportunity Score ring, metric cards and a results table.

## Opportunity Score

A 0–100 heuristic combining two signals: a density score (how many
competitors per km² relative to the analyzed area) and a distribution score
(how spread out or clustered they are). It is an **MVP-level indicator**,
not a market-research product — it deliberately does not use
rating/price/opening-hours data, which sit behind Google's more expensive
Places SKU tier. See `src/services/opportunityScore.js` for the exact
formula and weights, and the `analysis.notes` field the API returns
alongside every score.

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
pricier SKU tier and this project doesn't need.

## Installation

Backend:

```bash
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env   # sets VITE_API_BASE_URL=http://localhost:3000
npm run dev
```

Open `http://localhost:5173`. The backend listens on `http://localhost:3000`.

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
| `GOOGLE_MAPS_API_KEY` | *(empty)* | Required only when `USE_MOCK_*` is `false` |
| `USE_MOCK_GEOCODING` | `true` | Use the mock geocoding provider |
| `USE_MOCK_PLACES` | `true` | Use the mock places provider |
| `MAX_RADIUS_KM` | 20 | Hard cap on the radius a client can request |
| `GRID_MIN_RADIUS_KM` | 3 | Below this radius, a single search point is used instead of a grid |
| `MAX_SEARCH_POINTS` | 7 | Grid size above the threshold (hard-ceiling of 19 enforced in code regardless of this value) |
| `MAX_PAGES_PER_POINT` | 1 | Pages fetched per grid point (each page is a separate billed call) |
| `HTTP_TIMEOUT_MS` | 8000 | Timeout for each external call |
| `LOG_LEVEL` | info | Pino log level |
| `VITE_API_BASE_URL` (frontend) | `http://localhost:3000` | Base URL the frontend calls — never a Google key |

`GOOGLE_MAPS_API_KEY` is only ever read from `process.env`, never logged
(the Places API key travels in a header, stripped from any logs; the
Geocoding API key in a query string, masked before logging), and never sent
to the frontend.

## API Documentation

Swagger UI: `http://localhost:3000/api-docs`

## Testing

```bash
npm test              # backend — Jest, all against mocks/fakes, no network, no cost
npm run test:coverage
npm run lint

cd frontend
npm test               # frontend — Vitest + Testing Library
npm run lint
npm run build           # production build
```

Backend tests are organized under `tests/unit` (pure logic, providers with
`httpClient`/`fetch` mocked) and `tests/integration` (Supertest against the
Express app, wired to the mock providers — except `missingApiKey.test.js`,
which wires the real providers with the key removed to prove the
config-error path never touches the network). Coverage includes invalid
parameters, an unresolvable location, a zero-results market, a total
grid-search failure and the missing-API-key path.

## Security

- No secrets in the repository or its history; `.env` is gitignored on both backend and frontend, `.env.example` files hold variable names only.
- `GOOGLE_MAPS_API_KEY` lives server-side only — never in a `VITE_*` variable, never in a response body.
- Helmet, rate limiting (100 req / 15 min by default) and a global error handler that never leaks stack traces or raw upstream error bodies to the client.
- CORS is open (`cors()` with no origin restriction) — a deliberate choice for a public, read-only, unauthenticated API with no session/cookie to protect, not an oversight.
- No automatic retries on external calls, so a transient failure can never silently multiply cost.

## Current Features

Everything under [Features → Implemented](#features) above is real and
working today, against either mock or real Google providers.

## Planned Features

The following are **not implemented** in this version. They exist only as
documentation and non-executed example code under
[`docs/future-saas/`](docs/future-saas/) and
[`examples/future-saas/`](examples/future-saas/), and as a visual-only
preview on the frontend's Plans page:

- User accounts and authentication
- Real subscriptions and billing
- Per-plan usage limits enforced server-side (entitlements)
- Saved analysis history
- Data export
- Public API access plan
- Usage tracking

## Disclaimer

This tool does not find every establishment that exists in an area — it
reports what its search strategy (a bounded grid of point queries against a
third-party Places API) actually returned, and is explicit about that via
each response's `searchStrategy.limitations`. `opportunityScore` is this
project's own heuristic metric, based only on competitor count, density and
spatial distribution — it is not a guarantee of business success, not a
complete market census, and not a substitute for real-world due diligence.

## Author

Kelvin Simões — Backend Developer

## License

Portfolio project. No license file has been added; treat the source as
"all rights reserved" unless a `LICENSE` file is later added to this
repository.
