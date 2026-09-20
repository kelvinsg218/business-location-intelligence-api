'use strict';

// EXAMPLE ONLY — NOT USED BY CURRENT APPLICATION
//
// Illustrates the usage-tracking step described in
// docs/future-saas/ENTITLEMENTS_EXAMPLE.md and the `usage` table in
// docs/future-saas/DATABASE_SCHEMA_EXAMPLE.md. In-memory only — a real
// implementation replaces the Map below with the `usage` table, scoped to
// the current billing period. Never imported by src/, never run by any test.

const exampleUsageStore = new Map();

async function getUsageThisPeriod(userId) {
  return exampleUsageStore.get(userId) || 0;
}

async function hasRemainingUsage(userId, entitlements) {
  const used = await getUsageThisPeriod(userId);
  return used < entitlements.monthlyAnalyses;
}

// A real implementation increments this in the same transaction as
// recording the analysis (see the `analyses` table in
// docs/future-saas/DATABASE_SCHEMA_EXAMPLE.md), only after the analysis
// actually succeeds — never before, so a failed request doesn't consume
// the user's allowance.
async function recordUsage(userId) {
  const current = await getUsageThisPeriod(userId);
  exampleUsageStore.set(userId, current + 1);
}

module.exports = { getUsageThisPeriod, hasRemainingUsage, recordUsage };
