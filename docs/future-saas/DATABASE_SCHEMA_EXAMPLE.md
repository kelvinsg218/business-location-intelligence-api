# Database Schema (Future — Example)

> **FUTURE IMPLEMENTATION**
> **NOT USED IN CURRENT PRODUCTION VERSION**
>
> **Update (v0.3.0):** a PostgreSQL database now exists, with exactly two
> tables — `users` and `sessions` — created by the migrations under
> `db/migrations`. There is still no ORM. The tables below are conceptual
> planning only; where they differ from the real `users` table (for
> example the column set and constraints), the migration is the source of
> truth. Nothing else in this document (plans, subscriptions, usage, ...) is
> built.

> **SUPERSEDED (v0.2.1).** The product direction was refined after this
> document was written: real accounts, projects, candidate locations and
> saved analyses now come before subscriptions and billing, and Google's
> terms restrict which Google content may be stored (see the README's
> "Google Maps Platform terms" section). The plan/subscription/usage-centered
> schema below will **not** be used as-is. It is kept only as historical
> background — see the README's "Planned Features" for the current direction.

## Conceptual tables

### `users`

| Column | Notes |
|---|---|
| `id` | Primary key |
| `email` | Unique, used for login |
| `password_hash` | If email/password auth is used; could instead be an external auth provider's user id |
| `created_at` | |

### `plans`

| Column | Notes |
|---|---|
| `id` | e.g. `free`, `pro`, `business` |
| `name` | Display name |
| `price_cents` | Placeholder — not a final commercial value |
| `entitlements` | JSON — see [`ENTITLEMENTS_EXAMPLE.md`](./ENTITLEMENTS_EXAMPLE.md) |

### `subscriptions`

| Column | Notes |
|---|---|
| `id` | Primary key |
| `user_id` | → `users.id` |
| `plan_id` | → `plans.id` |
| `status` | `trialing` \| `active` \| `past_due` \| `canceled` \| `expired` — see [`SUBSCRIPTION_ARCHITECTURE.md`](./SUBSCRIPTION_ARCHITECTURE.md) |
| `payment_provider_customer_id` | Opaque id from the payment provider — see [`PAYMENT_FLOW_EXAMPLE.md`](./PAYMENT_FLOW_EXAMPLE.md) |
| `current_period_end` | When the current billing period ends |
| `created_at` / `updated_at` | |

### `usage`

Tracks how much of a period's allowance a user has consumed, so it can be
checked against `plans.entitlements.monthlyAnalyses` (see
[`ENTITLEMENTS_EXAMPLE.md`](./ENTITLEMENTS_EXAMPLE.md)).

| Column | Notes |
|---|---|
| `id` | Primary key |
| `user_id` | → `users.id` |
| `period_start` / `period_end` | The billing period this counter applies to |
| `analyses_count` | Incremented once per successful analysis |

### `analyses`

Only relevant once "Analysis History" (a Pro/Business-only, currently
unbuilt feature — see the frontend's Plans page) is implemented. Would
store enough of each request/response to redisplay it later, without
duplicating the core analysis logic that already lives in
`src/services/locationAnalysis.service.js`.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `user_id` | → `users.id` |
| `query` | The request params (location, businessType, radiusKm, keywords) |
| `result` | The response payload this API already returns today |
| `created_at` | |

## Relationships

```
users 1───* subscriptions *───1 plans
users 1───* usage
users 1───* analyses (only if history is enabled for their plan)
```

## What stays unchanged

None of this touches `src/services/locationAnalysis.service.js`,
`placesCoverageSearch.js`, or `opportunityScore.js` — the analysis engine
itself has no persistence dependency today and wouldn't need one for its
own logic; only the surrounding account/plan/usage layer would gain a
database.
