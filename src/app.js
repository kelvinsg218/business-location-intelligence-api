'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');
const { createRoutes } = require('./routes');
const { errorHandler } = require('./middlewares/errorHandler');
const { notFound } = require('./middlewares/notFound');
const { createRateLimiter } = require('./middlewares/rateLimiter');
const { requestId, REQUEST_ID_HEADER } = require('./middlewares/requestId');
const { logger } = require('./utils/logger');
const { buildSwaggerSpec } = require('./config/swagger');

const DEFAULT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 100 };

/**
 * Builds the Express app with injected dependencies. Never instantiates a
 * vendor provider, a database pool or an auth module itself — that's
 * server.js's job. This is what lets tests wire in mocks/fakes untouched.
 *
 *   db            pg Pool (or anything with .query); only /ready uses it directly
 *   auth          the object made by createAuthModule(); WITHOUT it every protected
 *                 route answers 401, i.e. the app fails closed
 *   corsOrigins   origins allowed to call the API cross-origin, with credentials.
 *                 Empty (default) = no CORS headers at all: same-origin only,
 *                 which is how both dev (Vite proxy) and production run
 *   trustProxy    hops of reverse proxy to trust for req.ip / secure cookies
 *
 * `rateLimit` and `logger` are optional overrides (mainly for tests).
 */
function createApp({
  rateLimit, logger: appLogger = logger, corsOrigins = [], trustProxy = 0, ...deps
}) {
  const app = express();

  app.set('trust proxy', trustProxy);

  // First, so every response (including rate-limit and 404 ones) carries an id.
  app.use(requestId);
  app.use(helmet());
  if (corsOrigins.length > 0) {
    app.use(cors({ origin: corsOrigins, credentials: true, exposedHeaders: [REQUEST_ID_HEADER] }));
  }
  app.use(pinoHttp({ logger: appLogger }));
  app.use(createRateLimiter({ ...DEFAULT_RATE_LIMIT, ...rateLimit }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(buildSwaggerSpec()));

  app.use(createRoutes(deps));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
