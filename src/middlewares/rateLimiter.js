'use strict';

const rateLimit = require('express-rate-limit');

// Factory (not a shared singleton) so each createApp() call gets its own
// limiter instance/state — important for tests that build multiple apps.
function createRateLimiter({ windowMs, max } = {}) {
  return rateLimit({
    windowMs: windowMs || 15 * 60 * 1000,
    max: max || 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.', details: [] },
      });
    },
  });
}

module.exports = { createRateLimiter };
