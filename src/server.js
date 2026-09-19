'use strict';

const { env } = require('./config/env');
const { createApp } = require('./app');
const { createProviders } = require('./config/providerFactory');
const { logger } = require('./utils/logger');

const { geocodingProvider, placesProvider, providerNames } = createProviders(env);

if ((!env.USE_MOCK_GEOCODING || !env.USE_MOCK_PLACES) && !env.GOOGLE_MAPS_API_KEY) {
  logger.warn('GOOGLE_MAPS_API_KEY is not set. /locations/analyze will fail until this is configured.');
}

const app = createApp({
  geocodingProvider,
  placesProvider,
  providerNames,
  maxRadiusKm: env.MAX_RADIUS_KM,
  maxSearchPoints: env.MAX_SEARCH_POINTS,
  gridMinRadiusKm: env.GRID_MIN_RADIUS_KM,
  maxPagesPerPoint: env.MAX_PAGES_PER_POINT,
});

const server = app.listen(env.PORT, () => {
  logger.info(
    `Business Location Intelligence API listening on port ${env.PORT} `
      + `(mock geocoding: ${env.USE_MOCK_GEOCODING}, mock places: ${env.USE_MOCK_PLACES})`,
  );
});

function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };
