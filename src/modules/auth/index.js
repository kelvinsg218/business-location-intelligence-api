'use strict';

const { createUsersRepository } = require('../users/users.repository');
const { createPasswordService } = require('./password');
const { PgSessionStore } = require('./pgSessionStore');
const { createSessionMiddleware } = require('./sessionMiddleware');
const { createOriginGuard } = require('./originGuard');
const { createAuthRateLimits, createAnalyzeRateLimiter } = require('./authRateLimits');
const { createAuthService } = require('./auth.service');
const { createAuthController } = require('./auth.controller');
const { createAuthRouter } = require('./auth.routes');
const { requireAuth } = require('./requireAuth');

const HOUR_MS = 60 * 60 * 1000;

/**
 * Assembles everything authentication needs, from a database handle and the
 * session settings (see sessionConfig.js). The result is what createApp() takes
 * as `auth`:
 *
 *   middlewares          origin guard + session, mounted once on /api/v1
 *   router               /auth/register, /login, /logout, /me
 *   requireAuth          gate for protected routes; sets req.auth = { userId }
 *   analyzeRateLimiter   per-user cap for /locations/analyze
 *   store                the PgSessionStore (server.js prunes and closes over it)
 */
function createAuthModule({
  db,
  sessionConfig,
  allowedOrigins,
  registrationEnabled = true,
  rateLimits,
  analyzeRateLimit = { windowMs: HOUR_MS, limit: 30 },
  passwords = createPasswordService(),
  touchIntervalMs,
  now,
  logger,
}) {
  const store = new PgSessionStore({
    db,
    idleTtlMs: sessionConfig.idleTtlMs,
    absoluteTtlMs: sessionConfig.absoluteTtlMs,
    touchIntervalMs,
    now,
    logger,
  });

  const users = createUsersRepository(db);
  const service = createAuthService({
    users, passwords, registrationEnabled, logger,
  });
  const limits = createAuthRateLimits(rateLimits);
  const controller = createAuthController({
    service, sessionConfig, onLoginSuccess: limits.onLoginSuccess, logger,
  });

  return {
    store,
    users,
    passwords,
    middlewares: [
      createOriginGuard({ allowedOrigins }),
      createSessionMiddleware({ store, config: sessionConfig }),
    ],
    router: createAuthRouter({ controller, requireAuth, limits }),
    requireAuth,
    analyzeRateLimiter: createAnalyzeRateLimiter(analyzeRateLimit),
  };
}

module.exports = { createAuthModule };
