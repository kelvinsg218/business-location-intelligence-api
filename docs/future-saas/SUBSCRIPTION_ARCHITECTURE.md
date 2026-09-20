# Subscription Architecture (Future)

> **FUTURE IMPLEMENTATION**
> **NOT USED IN CURRENT PRODUCTION VERSION**
>
> Nothing described here exists in the running application. There is no
> subscription system, no billing, and no user accounts today.

## Purpose

Describes conceptually how a subscription would be created, kept in sync
with a payment provider, and consulted on every request — without
prescribing a specific vendor (see
[`PAYMENT_FLOW_EXAMPLE.md`](./PAYMENT_FLOW_EXAMPLE.md) for the payment side).

## Subscription states (conceptual)

| State | Meaning |
|---|---|
| `trialing` | In an optional trial period, treated as active for entitlement purposes |
| `active` | Paid and current |
| `past_due` | Payment failed; grace period before downgrade |
| `canceled` | User canceled; access continues until `currentPeriodEnd`, then reverts to Free |
| `expired` | Past `currentPeriodEnd` with no renewal; entitlements reverted to Free |

## Relationship to plan and entitlements

A subscription references exactly one plan at a time. Changing plans
(upgrade/downgrade) would create a new subscription state transition, never
mutate historical usage records. Entitlements are never stored directly on
the subscription — they are derived by looking up the plan's entitlements
at request time (see [`ENTITLEMENTS_EXAMPLE.md`](./ENTITLEMENTS_EXAMPLE.md)),
so changing a plan's limits later doesn't require touching every existing
subscription row.

## Source of truth

The payment provider (e.g. Stripe, Mercado Pago) is the source of truth for
whether a subscription is actually paid. The backend's `subscriptions` table
would be a **cache** of that state, kept in sync via webhooks (see
[`PAYMENT_FLOW_EXAMPLE.md`](./PAYMENT_FLOW_EXAMPLE.md)) — never the other
way around. The backend never marks a subscription active based on
something the frontend claims.

## Reads on every request (conceptual)

```
1. Resolve the authenticated user
2. Look up their current subscription row (cached state, not a live payment-provider call)
3. If subscription is active/trialing → look up its plan's entitlements
4. If subscription is past_due/canceled/expired/missing → fall back to Free plan entitlements
5. Proceed to entitlement + usage checks (see ENTITLEMENTS_EXAMPLE.md)
```

This keeps the request path fast (no live call to the payment provider on
every analysis) while staying correct, because step 2 is only ever updated
by a verified webhook event, never by client input.

## What this project has today instead

None of the above. The current Plans page shows three static tiers with no
backing subscription record anywhere — see
`frontend/src/config/plans.js` and [`PLAN_ARCHITECTURE.md`](./PLAN_ARCHITECTURE.md).
