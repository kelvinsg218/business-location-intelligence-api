# Plan Architecture (Future)

> **FUTURE IMPLEMENTATION**
> **NOT USED IN CURRENT PRODUCTION VERSION**
>
> Nothing described here exists in the running application. This is a
> conceptual design for a possible future SaaS evolution of the Business
> Location Intelligence API. No accounts, subscriptions, or entitlement
> enforcement are implemented today — see the main [README](../../README.md)
> for what actually works right now.

## Purpose

If this project evolves into a real SaaS product, access would need to be
tiered by plan (Free / Pro / Business) and enforced **server-side**, never
trusting the frontend. This document describes the conceptual request
lifecycle that would make that possible.

## Conceptual flow

```
User
  ↓
Authentication        (who is making this request?)
  ↓
Subscription           (what plan are they currently paying for, and is it active?)
  ↓
Plan                    (what does that plan entitle them to?)
  ↓
Entitlements             (the concrete limits/flags derived from the plan)
  ↓
Usage Tracking            (how much of their allowance have they already used?)
  ↓
Location Analysis API      (the endpoint that exists today)
```

Each layer only exists to answer one question before the request is allowed
to reach the actual analysis logic:

| Layer | Question it answers |
|---|---|
| Authentication | Is this a known, logged-in user? |
| Subscription | Do they have an active (non-expired, non-canceled) subscription? |
| Plan | Which plan does that subscription reference? |
| Entitlements | What are the concrete limits for that plan (max radius, monthly analyses, history, export, API access)? |
| Usage Tracking | Have they already exceeded this period's allowance? |
| Location Analysis API | The existing, working endpoint — unchanged by all of the above |

## Why this stays server-side

The frontend Plans page (in the current version) is a **visual preview
only** — it renders plan cards and a feature comparison from a static
config file, with no real user, no real subscription, and no enforcement.
In a real implementation, none of the layers above could live in the
frontend: a client can always be modified or bypassed. The backend would be
the only source of truth for "what is this user allowed to do right now."

## Plan tiers (conceptual, not final)

See [`ENTITLEMENTS_EXAMPLE.md`](./ENTITLEMENTS_EXAMPLE.md) for the concrete
shape each plan's entitlements would take. Naming (Free/Pro/Business) and
example limits mirror what's already shown, as placeholders, on the
frontend's Plans page (`frontend/src/config/plans.js`) — but that file is
presentation-only and holds no real enforcement logic.

## Where this would plug into the existing codebase

The existing `locations.controller.js` → `locationAnalysis.service.js` flow
would gain one new step before validation: an entitlement check middleware
(see [`ENTITLEMENTS_EXAMPLE.md`](./ENTITLEMENTS_EXAMPLE.md) and
`examples/future-saas/entitlementMiddleware.example.js`) that reads the
authenticated user's plan and either allows the request through or rejects
it with a clear, typed error (mirroring the existing `ApiError` pattern
already used for validation errors) — no change to the analysis logic
itself.
