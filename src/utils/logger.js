'use strict';

const pino = require('pino');
const { env } = require('../config/env');

// Defense-in-depth: even though providers are expected to never log secrets directly,
// this ensures any accidental logging of a header/apiKey object never leaks the key.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-goog-api-key"]',
  'headers["x-goog-api-key"]',
  'apiKey',
  '*.apiKey',
];

function createLogger(destination, { level } = {}) {
  return pino(
    {
      level: level || env.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, remove: true },
    },
    destination,
  );
}

const logger = createLogger();

module.exports = { logger, createLogger, REDACT_PATHS };
