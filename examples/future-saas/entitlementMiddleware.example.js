'use strict';

// EXAMPLE ONLY — NOT USED BY CURRENT APPLICATION
//
// Illustrates how an entitlement check described in
// docs/future-saas/ENTITLEMENTS_EXAMPLE.md could sit in front of the real,
// existing `locations.controller.js` without changing its logic. This file
// is never imported by src/, never registered on any Express app, and does
// not run in any test. It has no database — `getPlanForUser` below is a
// stub that would be replaced by a real lookup (see
// docs/future-saas/SUBSCRIPTION_ARCHITECTURE.md).

const { getEntitlementsForPlan } = require('./planConfig.example');

// Stand-in for a real lookup against the `subscriptions`/`plans` tables.
// Always resolves to 'free' here since there is no auth/subscription
// system in the current application — see docs/future-saas/PLAN_ARCHITECTURE.md.
async function getPlanForUser(_userId) {
  return 'free';
}

// Would be mounted as: router.get('/analyze', requireEntitlements, controller.analyzeLocation)
function requireEntitlements() {
  return async function entitlementMiddleware(req, res, next) {
    const planId = await getPlanForUser(req.user?.id);
    const entitlements = getEntitlementsForPlan(planId);

    const requestedRadiusKm = Number(req.query.radius);
    if (requestedRadiusKm > entitlements.maxRadiusKm) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'PLAN_LIMIT_EXCEEDED',
          message: `Your plan allows a maximum radius of ${entitlements.maxRadiusKm} km.`,
          details: [{ field: 'radius', message: 'exceeds plan limit' }],
        },
      });
    }

    // A real version would also check usage-this-period here — see
    // usageLimit.example.js — before calling next().
    req.entitlements = entitlements;
    return next();
  };
}

module.exports = { requireEntitlements, getPlanForUser };
