'use strict';

const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { rateLimitedHandler } = require('../../middlewares/rateLimiter');
const { normalizeEmail } = require('../users/email');

const MINUTE = 60 * 1000;

// Defaults, overridable one by one (tests use tiny limits).
const DEFAULT_LIMITS = {
  register: { windowMs: 60 * MINUTE, limit: 5 }, // 5 sign-ups / hour / IP
  loginPerIp: { windowMs: 15 * MINUTE, limit: 20 }, // 20 failed logins / 15 min / IP
  loginPerIpAndEmail: { windowMs: 15 * MINUTE, limit: 5 }, // 5 failed logins / 15 min / IP + account
  loginPerEmail: { windowMs: 60 * MINUTE, limit: 30 }, // 30 failed logins / hour / account, from any IP
};

// The account is identified by a hash of the normalized e-mail, so the limiter's
// memory never holds an address and a body field can not inject odd keys.
function emailKey(req) {
  const email = req.body && typeof req.body.email === 'string' ? normalizeEmail(req.body.email) : '';
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
}

// ipKeyGenerator groups IPv6 addresses by /56 so one host cannot dodge the limit
// by rotating addresses inside its own block.
function ipKey(req) {
  return ipKeyGenerator(req.ip || '0.0.0.0');
}

function limiter({ windowMs, limit }, keyGenerator, extra = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitedHandler,
    ...extra,
  });
}

/**
 * Rate limits for the authentication endpoints. In-memory (one process); moving
 * to several instances needs a shared store, which is deliberately out of scope.
 *
 * Login limiters only count FAILED attempts (skipSuccessfulRequests): a user who
 * logs in correctly is never slowed down, and an attacker is limited three ways —
 * per source IP, per (IP, account) and per account from any IP (which is what
 * bounds a distributed credential-stuffing run against one account).
 */
function createAuthRateLimits(overrides = {}) {
  const limits = {};
  Object.keys(DEFAULT_LIMITS).forEach((name) => {
    limits[name] = { ...DEFAULT_LIMITS[name], ...(overrides[name] || {}) };
  });

  const ipAndEmailKey = (req) => `${ipKey(req)}|${emailKey(req)}`;

  const loginPerIp = limiter(limits.loginPerIp, ipKey, { skipSuccessfulRequests: true });
  const loginPerIpAndEmail = limiter(limits.loginPerIpAndEmail, ipAndEmailKey, { skipSuccessfulRequests: true });
  const loginPerEmail = limiter(limits.loginPerEmail, emailKey, { skipSuccessfulRequests: true });

  return {
    register: limiter(limits.register, ipKey),
    login: [loginPerIp, loginPerIpAndEmail, loginPerEmail],

    // A correct login clears the failure counters of that account, so earlier
    // typos do not linger against a legitimate user.
    async onLoginSuccess(req) {
      await Promise.all([
        loginPerIpAndEmail.resetKey(ipAndEmailKey(req)),
        loginPerEmail.resetKey(emailKey(req)),
      ]);
    },
  };
}

/**
 * Per-user cap on /analyze (each analysis can cost several billed Google calls).
 * Keyed by the authenticated user, so it must run after requireAuth. Only
 * successful analyses count: a validation error or an unknown location does not
 * eat the user's quota.
 */
function createAnalyzeRateLimiter({ windowMs, limit }) {
  return limiter({ windowMs, limit }, (req) => `user:${req.auth.userId}`, { skipFailedRequests: true });
}

module.exports = {
  createAuthRateLimits, createAnalyzeRateLimiter, DEFAULT_LIMITS, emailKey,
};
