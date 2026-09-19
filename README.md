# Business Location Intelligence API

A REST API that analyzes the business competition/opportunity around a
free-text location, without the client ever having to supply latitude or
longitude. You give it a place, a business type and a radius; it geocodes
the place, searches nearby establishments across a small grid of points for
better coverage, deduplicates and filters the results, and returns a
transparent opportunity analysis.

```
GET /api/v1/locations/analyze?location=Vila+Velha,+ES&businessType=gym&radius=5
```

## Quick start (mock mode — no Google API key needed)

```bash
npm install
npm run dev
curl "http://localhost:3000/api/v1/locations/analyze?location=Vila%20Velha,%20ES&businessType=gym&radius=5"
```

The project ships with `USE_MOCK_GEOCODING=true` and `USE_MOCK_PLACES=true`
by default (see `.env.example`), so it runs and returns realistic-looking
data with **zero external calls and zero cost** out of the box. This is the
intended way to develop against and test the API. Mock data is
deterministic — the same request always returns the same result — and is
generated procedurally (not from a fixed fixture file), so any location or
business type you type works.

Useful mock-mode inputs for manual testing:
- `location` containing `__notfound__` → simulates "address not found" (404).
- `businessType=__zero_results__` → simulates a market with zero competitors found (200, not an error).
- The spec's own example locations ("Vila Velha, ES", "Praia do Canto, Vitória", "São Paulo, SP", "Av. Paulista, São Paulo") resolve to their real-world coordinates.

## Switching to the real Google APIs

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

## API

### `GET /api/v1/locations/analyze`

| Query param | Required | Notes |
|---|---|---|
| `location` | yes | Free text: city, neighborhood, address ("Vila Velha, ES", "Av. Paulista, São Paulo"). |
| `businessType` | yes | Free text ("gym", "academia", "coffee shop", "barbearia", ...). |
| `radius` | yes | Kilometers, `0.1`–`MAX_RADIUS_KM` (default cap 20). Converted to meters internally. |
| `keywords` | no | Comma-separated extra terms (e.g. `crossfit,24 horas`). |

Response shape (success):

```json
{
  "success": true,
  "data": {
    "query": { "location": "...", "businessType": "gym", "radiusKm": 5, "radiusMeters": 5000, "keywords": [] },
    "resolvedLocation": { "formattedAddress": "...", "coordinates": { "lat": -20.33, "lng": -40.29 } },
    "places": { "establishmentsFound": 9, "results": [ { "placeId", "name", "address", "location", "types", "primaryType", "businessStatus" } ] },
    "searchStrategy": { "type": "grid", "pointsUsed": 7, "externalQueriesExecuted": 7, "failedQueries": 0, "provider": { "geocoding": "mock", "places": "mock" }, "limitations": ["..."] },
    "analysis": { "competitorCount": 9, "densityPerKm2": 0.11, "avgDistanceFromCenterKm": 3.1, "competitionLevel": "medium", "opportunityScore": 62, "scoreBreakdown": { "...": "..." }, "notes": ["..."] },
    "meta": { "generatedAt": "..." }
  }
}
```

`establishmentsFound` reflects what the search strategy found, not a
guaranteed census of the area — see `searchStrategy.limitations`.
`opportunityScore` (0–100, higher = more opportunity) is an MVP heuristic
based only on competitor count, density and spatial distribution — it
deliberately avoids `rating`/`price`/`opening hours`, which sit in Google's
more expensive Enterprise pricing tier. Errors use
`{ "success": false, "error": { "code", "message", "details" } }`.

### `GET /health`

Liveness check; never touches any provider.

### `GET /api-docs`

Swagger UI for the endpoint above.

## Coverage strategy (why a single Places call isn't enough)

Google's Places API (New) caps a single Text Search at 60 results across 3
pages, and Nearby Search at 20 with no pagination at all — neither
guarantees full coverage of a wide search area. This API compensates with a
small grid of overlapping search points around the geocoded center (1 point
for small radii, up to 7 by default for larger ones), deduplicates results
by Google's place ID, and defensively re-filters by real distance from the
original center. This is an engineering choice, not something Google
documents or guarantees — the response is always explicit about it via
`searchStrategy` and never claims to be exhaustive.

## Cost controls

| Env var | Default | Purpose |
|---|---|---|
| `MAX_RADIUS_KM` | 20 | Hard cap on the radius a client can request. |
| `GRID_MIN_RADIUS_KM` | 3 | Below this radius, a single search point is used instead of a grid. |
| `MAX_SEARCH_POINTS` | 7 | Grid size above the threshold (hard-ceiling of 19 enforced in code regardless of this value). |
| `MAX_PAGES_PER_POINT` | 1 | Pages fetched per grid point (each page is a separate billed call). |
| `HTTP_TIMEOUT_MS` | 8000 | Timeout for each external call. |

There is no automatic retry anywhere — a failed external call is reported
once, never retried, so a transient blip can never silently multiply cost.
The Places field mask requests only Pro-tier fields (id, name, address,
location, type, business status) and deliberately excludes
rating/price/hours (Enterprise tier). Every analysis reports exactly how
many external calls it made (`searchStrategy.externalQueriesExecuted`), both
in the response and in the server logs.

## Environment variables

See `.env.example` for the full list with defaults. `GOOGLE_MAPS_API_KEY` is
never read from anywhere but `process.env` and is never logged (the Places
API key travels in a header, stripped from any logs; the Geocoding API key
in a query string, masked before logging).

## Development

```bash
npm test            # run the full suite (all against mocks/fakes — no network, no cost)
npm run test:watch
npm run lint
npm run dev          # nodemon, mock mode by default
npm start            # plain node
```

Tests are organized under `tests/unit` (pure logic, providers with
`httpClient`/`fetch` mocked) and `tests/integration` (supertest against the
Express app, wired to the mock providers — except `missingApiKey.test.js`,
which wires the real providers with the key removed to prove the
config-error path never touches the network).

## Architecture

```
Client
  → GET /api/v1/locations/analyze
  → locations.routes.js → locations.controller.js   (validates query with zod)
  → locationAnalysis.service.js                      (orchestrates everything)
       → geocodingProvider.geocode(text)             ← Mock or Google, chosen by config/providerFactory.js
       → placesCoverageSearch.run(...)               (grid + pagination + dedup + distance filter — vendor-agnostic)
             → placesProvider.search(...)            ← Mock or Google (Places API New, Text Search), chosen by config/providerFactory.js
       → opportunityScore.calculateBasicOpportunityScore(...)
  → JSON response
```

Providers are injected, never imported directly by the controller/service —
`src/config/providerFactory.js` is the only place that decides Mock vs
Google, based on `USE_MOCK_GEOCODING` / `USE_MOCK_PLACES`. Swapping either
vendor in the future means adding a new provider behind the same contract
(`src/providers/*/*.contract.js`) and adding one branch to the factory.
