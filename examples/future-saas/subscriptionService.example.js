'use strict';

// EXAMPLE ONLY — NOT USED BY CURRENT APPLICATION
//
// Illustrates the subscription lifecycle described in
// docs/future-saas/SUBSCRIPTION_ARCHITECTURE.md and the webhook step of
// docs/future-saas/PAYMENT_FLOW_EXAMPLE.md. No database, no payment
// provider SDK, no network calls — every "would" comment marks a piece
// that a real implementation would need to add. Never imported by src/,
// never run by any test.

// Would be a row in the `subscriptions` table (see
// docs/future-saas/DATABASE_SCHEMA_EXAMPLE.md), not an in-memory object.
const exampleSubscriptionStore = new Map();

async function getActiveSubscription(userId) {
  // A real implementation queries the database here, e.g.:
  //   SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing')
  return exampleSubscriptionStore.get(userId) || null;
}

// Would be called from a webhook route after verifying the payment
// provider's signature — never called directly from a client request, and
// never trusts a plan/status the client itself supplies.
async function applyVerifiedPaymentEvent(event) {
  // A real implementation would:
  //   1. Verify `event` came from the payment provider (signature check)
  //   2. Map the provider's event type to a subscription status transition
  //   3. Persist the change to the `subscriptions` table
  //   4. Never derive the new plan/status from anything the frontend sent

  if (event.type === 'subscription.activated') {
    exampleSubscriptionStore.set(event.userId, {
      planId: event.planId,
      status: 'active',
      currentPeriodEnd: event.currentPeriodEnd,
    });
  }

  if (event.type === 'subscription.canceled') {
    const existing = exampleSubscriptionStore.get(event.userId);
    if (existing) existing.status = 'canceled';
  }
}

module.exports = { getActiveSubscription, applyVerifiedPaymentEvent };
