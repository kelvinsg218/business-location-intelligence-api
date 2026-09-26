'use strict';

const { env, DEV_SESSION_SECRET } = require('./config/env');
const { createApp } = require('./app');
const { createProviders } = require('./config/providerFactory');
const { logger } = require('./utils/logger');
const { createPool } = require('./db/pool');
const { createAuthModule } = require('./modules/auth');
const { buildSessionConfig } = require('./modules/auth/sessionConfig');
const { startSessionPruning } = require('./modules/auth/pgSessionStore');

const { geocodingProvider, placesProvider, providerNames } = createProviders(env);

if ((!env.USE_MOCK_GEOCODING || !env.USE_MOCK_PLACES) && !env.GOOGLE_MAPS_API_KEY) {
  logger.warn('GOOGLE_MAPS_API_KEY is not set. /locations/analyze will fail until this is configured.');
}

// Fails fast (with an actionable message) when DATABASE_URL is missing. A pool
// does not connect until first use, so an unreachable database at boot does not
// stop the server: /health stays 200, /ready and the database routes answer 503.
const db = createPool(env, { logger });

const sessionConfig = buildSessionConfig(env);

const auth = createAuthModule({
  db,
  sessionConfig,
  allowedOrigins: env.ALLOWED_ORIGINS,
  registrationEnabled: env.REGISTRATION_ENABLED,
  analyzeRateLimit: {
    windowMs: env.ANALYZE_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    limit: env.ANALYZE_RATE_LIMIT_MAX,
  },
  logger,
});

if (!sessionConfig.secure) {
  logger.warn('SESSION_COOKIE_SECURE=false: the session cookie is sent over plain HTTP. Local development only.');
}
if (sessionConfig.secrets.includes(DEV_SESSION_SECRET)) {
  logger.warn('SESSION_SECRET is not set: using the insecure built-in development secret. Local development only.');
}

const app = createApp({
  db,
  auth,
  corsOrigins: env.CORS_ORIGINS,
  trustProxy: env.TRUST_PROXY,
  geocodingProvider,
  placesProvider,
  providerNames,
  maxRadiusKm: env.MAX_RADIUS_KM,
  maxSearchPoints: env.MAX_SEARCH_POINTS,
  gridMinRadiusKm: env.GRID_MIN_RADIUS_KM,
  maxPagesPerPoint: env.MAX_PAGES_PER_POINT,
  enableCommercialEcosystem: env.ENABLE_COMMERCIAL_ECOSYSTEM,
});

const stopPruning = startSessionPruning({ store: auth.store, logger });

const server = app.listen(env.PORT, () => {
  logger.info(
    `Business Location Intelligence API listening on port ${env.PORT} `
      + `(mock geocoding: ${env.USE_MOCK_GEOCODING}, mock places: ${env.USE_MOCK_PLACES})`,
  );
});

let shuttingDown = false;

// Stop taking connections first, then let in-flight requests finish, then close
// the pool (closing it earlier would fail the requests still running).
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully`);
  stopPruning();
  server.close(async () => {
    logger.info('Server closed');
    try {
      await db.end();
    } catch (err) {
      logger.error({ err }, 'error while closing the database pool');
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };
