'use strict';

const express = require('express');

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';

const passthrough = (req, res, next) => next();

/**
 * A stand-in for the object createAuthModule() returns, for tests that are
 * about something else (analysis logic, request ids, ...) and just need a
 * signed-in user without a database. Same shape, so createApp() is wired
 * exactly as in production; `requireAuth` sets `req.auth` like the real one.
 *
 * Real authentication (cookies, sessions, PostgreSQL) is exercised by the
 * suites under tests/db/ and tests/integration/auth*.
 */
function createTestAuth({ userId = TEST_USER_ID } = {}) {
  return {
    store: null,
    middlewares: [],
    router: express.Router(),
    requireAuth(req, res, next) {
      req.auth = Object.freeze({ userId });
      next();
    },
    analyzeRateLimiter: passthrough,
  };
}

module.exports = { createTestAuth, TEST_USER_ID };
