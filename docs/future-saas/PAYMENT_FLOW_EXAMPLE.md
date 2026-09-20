# Payment Flow (Future — Example)

> **FUTURE IMPLEMENTATION**
> **NOT USED IN CURRENT PRODUCTION VERSION**
>
> No payment gateway is integrated. No checkout exists. The frontend's Plans
> page CTAs for Pro/Business are disabled buttons labeled "Coming Soon" —
> they submit nothing and charge nothing. This document is conceptual
> planning only, intentionally vendor-agnostic (no Stripe/Mercado Pago SDK
> or credentials are referenced or required by this repository).

## Conceptual flow

```
User
  ↓
Choose Plan               (frontend Plans page — exists today, visual only)
  ↓
Checkout                   (would hand off to the payment provider's hosted checkout)
  ↓
Payment Provider            (Stripe / Mercado Pago / etc. — processes the actual charge)
  ↓
Webhook                      (payment provider notifies the backend asynchronously)
  ↓
Backend validates event       (verifies the webhook signature — never trusts an unsigned call)
  ↓
Subscription updated           (backend's subscriptions table — see SUBSCRIPTION_ARCHITECTURE.md)
  ↓
Entitlements updated             (derived from the new plan on the next request — see ENTITLEMENTS_EXAMPLE.md)
```

## Key principle: the frontend is never the source of truth

The frontend would only ever *initiate* a checkout (redirect the user to a
hosted payment page) and *display* whatever plan/status the backend last
told it about. It would never itself decide "the user paid" — that
decision is made exclusively by:

1. The payment provider actually processing the charge, and
2. The backend receiving and cryptographically verifying a webhook event
   from that provider before touching the `subscriptions` table.

A request that reaches the frontend claiming "I'm on the Pro plan now"
(e.g. a manipulated client, a replayed request, a modified `localStorage`
value) must have **zero effect** on real entitlements — those are only
ever read from the backend's own database, populated only by verified
webhooks.

## Why webhooks, not a client-side "payment succeeded" callback

A client-side success callback fires in the user's browser and can be
skipped, faked, or interrupted (closed tab, network failure) without the
payment actually completing, or conversely without the backend ever
learning about a successful payment. A webhook is a server-to-server call
from the payment provider itself, which:

- Fires reliably even if the user closes their browser mid-checkout.
- Can be cryptographically verified (signature check) so the backend knows
  it's genuinely from the payment provider, not a forged request.
- Is typically retried by the provider if the backend is briefly down.

## What this project has today instead

A Plans page with three static tiers (`frontend/src/config/plans.js`), Free
usable immediately (it's just the existing app), Pro/Business shown with
disabled "Coming Soon" buttons — no checkout link, no payment provider
SDK, no webhook endpoint, no `subscriptions` table.
