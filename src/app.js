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
const { logger } = require('./utils/logger');
const { buildSwaggerSpec } = require('./config/swagger');

const DEFAULT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 100 };

/**
 * Builds the Express app with injected provider dependencies. Never
 * instantiates a vendor provider itself — that's server.js's job, via
 * providerFactory. This is what lets tests wire in mocks/fakes untouched.
 * `rateLimit` is an optional override (mainly for tests); it is not exposed
 * via env, matching the approved plan's minimal env var surface.
 */
function createApp({ rateLimit, ...deps }) {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(pinoHttp({ logger }));
  app.use(createRateLimiter({ ...DEFAULT_RATE_LIMIT, ...rateLimit }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(buildSwaggerSpec()));

  app.use(createRoutes(deps));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
