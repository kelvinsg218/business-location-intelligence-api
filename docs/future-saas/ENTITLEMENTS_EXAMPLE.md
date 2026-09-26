# Entitlements (Future — Example)

> **FUTURE IMPLEMENTATION**
> **NOT USED IN CURRENT PRODUCTION VERSION**
>
> No entitlement is enforced anywhere in the current codebase. Every user
> of the running application gets the same, unrestricted access to
> `GET /api/v1/locations/analyze`. Values below are illustrative
> placeholders, not final commercial limits.

## What an entitlement is

A concrete, per-plan limit or feature flag, derived from the user's plan,
that the backend checks **before** running an analysis. Entitlements are
never trusted from the client — they are looked up server-side from the
plan the user's active subscription references (see
[`SUBSCRIPTION_ARCHITECTURE.md`](./SUBSCRIPTION_ARCHITECTURE.md)).

## Example shape (illustrative, not final)

```jsonc
{
  "free": {
    "maxRadiusKm": 5,
    "monthlyAnalyses": 20,
    "historyEnabled": false,
    "exportEnabled": false,
    "apiAccess": false
  },
  "pro": {
    "maxRadiusKm": 20,
    "monthlyAnalyses": 300,
    "historyEnabled": true,
    "exportEnabled": true,
    "apiAccess": false
  },
  "business": {
    "maxRadiusKm": 20,
    "monthlyAnalyses": 3000,
    "historyEnabled": true,
    "exportEnabled": true,
    "apiAccess": true
  }
}
```

A runnable version of this shape (still example-only, never imported by the
app) lives at `examples/future-saas/planConfig.example.js`.

## Where it would plug in

Conceptually, one middleware would sit in front of the existing
`locations.controller.js`:

```
Request
  → resolve user + plan (see SUBSCRIPTION_ARCHITECTURE.md)
  → look up entitlements for that plan
  → check requested radius <= entitlements.maxRadiusKm
       → over limit? reject with a typed error (mirrors the existing
         ApiError('VALIDATION_ERROR', ...) pattern already used today)
  → check usage-this-period < entitlements.monthlyAnalyses
       → over limit? reject with a typed error (e.g. 'USAGE_LIMIT_EXCEEDED')
  → allow request through to the existing, unchanged analyzeLocation controller
  → on success, record one unit of usage (see DATABASE_SCHEMA_EXAMPLE.md's `usage` table — that schema is superseded, see the notice there)
```

An illustrative (non-imported) version of this middleware lives at
`examples/future-saas/entitlementMiddleware.example.js`.

## Design principles for whenever this is actually built

1. **Backend is always the source of truth.** The frontend Plans page can
   render whatever it wants for marketing purposes; it must never be relied
   on to decide what a request is allowed to do.
2. **Fail closed, not open.** If a user's subscription/plan can't be
   resolved for any reason, they get Free-tier entitlements, not unlimited
   access.
3. **Entitlements are looked up per-request, not cached forever**, so an
   admin change to a plan's limits (or a user's downgrade) takes effect
   quickly.
4. **Existing analysis logic is untouched.** Entitlement checks happen
   strictly before the existing `analyzeLocation` controller runs — the
   grid search, dedup, distance filter and Opportunity Score logic that
   exist today would not change at all.
