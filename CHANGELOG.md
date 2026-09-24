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
