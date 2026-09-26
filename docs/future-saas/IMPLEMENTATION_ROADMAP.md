# Implementation Roadmap (Future)

> **FUTURE IMPLEMENTATION**
> **NOT USED IN CURRENT PRODUCTION VERSION**
>
> This is a planning document, not a commitment or a timeline. Nothing in
> it is scheduled or funded. It exists so that if this project (or a
> similar client project) ever needs to become a real SaaS, there's a
> sensible order to build it in instead of starting from zero.

> **SUPERSEDED (v0.2.1).** The phase order below (accounts → plans →
> payments → history/export → API access) no longer reflects the direction:
> accounts, projects, candidate locations, saved analyses and demographic
> data now take priority over plans and billing, and the map has to be
> migrated to the Google Maps JavaScript API before Google content can be
> shown publicly. Kept only as historical background — see the README's
> "Planned Features" for the current direction. The "What exists today" list
> below is also out of date (it predates the Business Profiles / Commercial
> Ecosystem work); the README describes the current state.

## What exists today (do not rebuild)

- `GET /api/v1/locations/analyze` and `GET /health` — working, tested REST endpoints
- Mock + Google provider abstraction for geocoding and places search
- Grid search, deduplication, distance filtering, Opportunity Score
- Frontend dashboard (form → analysis → map → metrics) and a visual-only Plans page
- Swagger docs, test suites, rate limiting, structured error handling

None of the phases below touch this — they wrap around it.

## Phase 1 — Accounts & Authentication

> **Delivered in v0.3.0** (as `users` + `sessions` with server-side sessions; see the README's
> "Authentication" section). Note that `/locations/analyze` did **not** stay open, as the last bullet
> below imagined: it now requires a signed-in user.

- Add a `users` table (see [`DATABASE_SCHEMA_EXAMPLE.md`](./DATABASE_SCHEMA_EXAMPLE.md))
- Add login/signup (or delegate to an auth provider — Auth0, Clerk, Supabase Auth, etc.)
- No behavior change to `/locations/analyze` yet — it would remain open, or gain an optional auth header

## Phase 2 — Plans & Entitlements (read-only enforcement)

- Add `plans` table with the entitlement shape from [`ENTITLEMENTS_EXAMPLE.md`](./ENTITLEMENTS_EXAMPLE.md)
- Every authenticated user defaults to the Free plan (no subscriptions table yet)
- Add the entitlement-check middleware in front of the existing controller (radius cap, monthly usage cap)
- Add the `usage` table and increment it on every successful analysis

## Phase 3 — Subscriptions & Payment

- Integrate one payment provider (Stripe or Mercado Pago — pick one, don't build both at once)
- Add `subscriptions` table (see [`SUBSCRIPTION_ARCHITECTURE.md`](./SUBSCRIPTION_ARCHITECTURE.md))
- Add the webhook endpoint described in [`PAYMENT_FLOW_EXAMPLE.md`](./PAYMENT_FLOW_EXAMPLE.md)
- Wire the frontend Plans page's Pro/Business CTAs to the real checkout flow, replacing the current disabled "Coming Soon" buttons

## Phase 4 — Pro/Business features

- Analysis history (`analyses` table, a "Histórico" page — the sidebar link already exists, currently disabled)
- Data export (CSV/JSON of a past analysis)
- Any "more detailed analysis output" beyond what the API already returns

## Phase 5 — API access plan (Business tier)

- API key issuance and management for Business-tier accounts
- Per-key rate limiting (separate from the existing IP-based rate limiter)
- Usage-based or seat-based billing depending on what Business customers actually ask for

## Sequencing notes

- Each phase should ship independently — Phase 2 (limits) is meaningless
  without Phase 1 (accounts), but Phase 4 (history/export) doesn't require
  Phase 5 (API access) to exist first.
- Phase 3 is the highest-risk phase (real money, webhook security, PCI
  scope by proxy) — it should not be started until Phases 1–2 are solid and
  tested.
- At every phase, the core analysis engine
  (`locationAnalysis.service.js`, `placesCoverageSearch.js`,
  `opportunityScore.js`) stays untouched. This roadmap is entirely about
  the access layer wrapped around it.
