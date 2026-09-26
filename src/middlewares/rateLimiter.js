'use strict';

const rateLimit = require('express-rate-limit');

// Liveness and readiness probes come from the platform (a load balancer, an
// orchestrator) at a steady rate from one address. Rate limiting them would
// eventually answer 429 to the very checks that decide whether to restart the
// process, so they are outside the global limit.
const EXEMPT_PATHS = new Set(['/health', '/ready']);

// Shared by every limiter so all 429 responses have the same body shape.
function rateLimitedHandler(req, res) {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMITED', message: 'Too many requests, please try again later.', details: [], requestId: req.id,
    },
  });
}

// Factory (not a shared singleton) so each createApp() call gets its own
// limiter instance/state — important for tests that build multiple apps.
function createRateLimiter({ windowMs, max } = {}) {
  return rateLimit({
    windowMs: windowMs || 15 * 60 * 1000,
    max: max || 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => EXEMPT_PATHS.has(req.path),
    handler: rateLimitedHandler,
  });
}

module.exports = { createRateLimiter, rateLimitedHandler, EXEMPT_PATHS };
