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
   competition level) and an Opportunity Score.
5. Returns everything as one structured JSON response, paired with a React
   dashboard that visualizes it on an interactive map.

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

## Opportunity Score

A 0–100 heuristic combining a density score (competitors per km² relative
to the analyzed area) and a distribution score (how spread out or
clustered competitors are), weighted and blended into a single number. It
is explicitly scoped as an MVP indicator — it does not incorporate
rating, price or popularity data — and every response carries a `notes`
field explaining exactly what it does and doesn't account for, so it's
never presented as more authoritative than it is.

## Error Handling

Every failure path — invalid input, an unresolvable location, a rate-limit
hit, an upstream Google error, an upstream timeout, a missing API key —
maps to a typed `ApiError` with a stable `code`, a human-readable
`message`, and an appropriate HTTP status. The global error handler never
leaks a stack trace or a raw upstream error body to the client, and a
dedicated log redaction list keeps the API key out of logs even if a
future code path accidentally tried to log a request URL or header
containing it.

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
and Testing Library.

## Frontend Integration

The dashboard is a separate React application that only ever talks to this
API's public HTTP endpoint — it never receives or references a Google API
key. It renders four distinct states (idle, loading, success, error), an
interactive Leaflet map with the search radius and every competitor found,
an Opportunity Score ring, metric cards, and a results table. When the
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
multi-tenant SaaS product: accounts, subscriptions, per-plan entitlements,
usage tracking, and a real payment integration. The current version
deliberately stops short of that scope to stay a focused, honestly-scoped
portfolio piece.
