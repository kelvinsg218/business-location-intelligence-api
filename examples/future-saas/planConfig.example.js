'use strict';

// EXAMPLE ONLY — NOT USED BY CURRENT APPLICATION
//
// Illustrates the entitlement shape described in
// docs/future-saas/ENTITLEMENTS_EXAMPLE.md as plain JS instead of JSON.
// Not imported anywhere in src/, not covered by any test, not part of the
// build. Values are placeholders, not final commercial limits.

const PLAN_ENTITLEMENTS = {
  free: {
    maxRadiusKm: 5,
    monthlyAnalyses: 20,
    historyEnabled: false,
    exportEnabled: false,
    apiAccess: false,
  },
  pro: {
    maxRadiusKm: 20,
    monthlyAnalyses: 300,
    historyEnabled: true,
    exportEnabled: true,
    apiAccess: false,
  },
  business: {
    maxRadiusKm: 20,
    monthlyAnalyses: 3000,
    historyEnabled: true,
    exportEnabled: true,
    apiAccess: true,
  },
};

// A real implementation would look this up from the `plans` table
// (see docs/future-saas/DATABASE_SCHEMA_EXAMPLE.md) instead of a static
// object, so entitlements can be changed without a deploy.
function getEntitlementsForPlan(planId) {
  return PLAN_ENTITLEMENTS[planId] || PLAN_ENTITLEMENTS.free;
}

module.exports = { PLAN_ENTITLEMENTS, getEntitlementsForPlan };
