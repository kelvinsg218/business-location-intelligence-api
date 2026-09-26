'use strict';

const { ApiError } = require('../../utils/ApiError');
const { logger: defaultLogger } = require('../../utils/logger');
const { cookieAttributes } = require('./sessionConfig');
const { validateLoginBody } = require('./auth.schemas');
const { emailKey } = require('./authRateLimits');

// express-session's session methods are callback based.
function callSession(req, method) {
  return new Promise((resolve, reject) => {
    req.session[method]((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * HTTP layer of the auth endpoints. Express 5 forwards a rejected promise from
 * an async handler to the error middleware, so no try/catch/next is needed.
 *
 * @param {object} deps
 * @param {object} deps.service        auth service
 * @param {object} deps.sessionConfig  see sessionConfig.js
 * @param {Function} [deps.onLoginSuccess] called after a successful login (clears rate-limit counters)
 */
function createAuthController({
  service, sessionConfig, onLoginSuccess = async () => {}, logger = defaultLogger,
}) {
  const logFor = (req) => req.log || logger;

  // The session id is ALWAYS replaced when someone becomes authenticated
  // (session fixation): regenerate() destroys whatever session the request came
  // with, an attacker-planted id included, and issues a fresh random one.
  async function establishSession(req, userId) {
    await callSession(req, 'regenerate');
    req.session.userId = userId;
    // Saved explicitly so the row exists before the response (and the cookie) leave.
    await callSession(req, 'save');
  }

  async function register(req, res) {
    const user = await service.register(req.body);
    await establishSession(req, user.id);
    logFor(req).info({ event: 'auth.register', userId: user.id }, 'account created');
    res.status(201).json({ success: true, data: { user } });
  }

  async function login(req, res) {
    const validation = validateLoginBody(req.body);
    if (!validation.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', validation.details);
    }

    const user = await service.authenticate(validation.data);
    if (!user) {
      // Unknown e-mail and wrong password produce this very same answer. Only a
      // hash of the e-mail is logged, never the address and never the password.
      logFor(req).warn({ event: 'auth.login_failed', emailHash: emailKey(req) }, 'login failed');
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid e-mail or password.');
    }

    await establishSession(req, user.id);
    await onLoginSuccess(req);
    logFor(req).info({ event: 'auth.login', userId: user.id }, 'user signed in');
    res.status(200).json({ success: true, data: { user } });
  }

  // Idempotent: signing out without a session is not an error.
  async function logout(req, res) {
    const userId = req.session && req.session.userId;
    await callSession(req, 'destroy');
    // Cleared with the same attributes it was set with, or the browser keeps it.
    res.clearCookie(sessionConfig.cookieName, cookieAttributes(sessionConfig));
    if (userId) logFor(req).info({ event: 'auth.logout', userId }, 'user signed out');
    res.status(204).end();
  }

  async function me(req, res) {
    const user = await service.getPublicUser(req.auth.userId);
    if (!user) {
      // The account is gone but the session survived: treat it as signed out.
      await callSession(req, 'destroy');
      res.clearCookie(sessionConfig.cookieName, cookieAttributes(sessionConfig));
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
    }
    res.status(200).json({ success: true, data: { user } });
  }

  return {
    register, login, logout, me,
  };
}

module.exports = { createAuthController };
