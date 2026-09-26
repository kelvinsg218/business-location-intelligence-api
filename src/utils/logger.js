'use strict';

const pino = require('pino');
const { env } = require('../config/env');

// Defense-in-depth: even though providers are expected to never log secrets directly,
// this ensures any accidental logging of a header/apiKey object never leaks the key.
// The same goes for credentials: a password, its hash, or a session cookie never
// reaches the log output, whatever object it happens to be attached to.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-goog-api-key"]',
  'res.headers["set-cookie"]',
  'headers["x-goog-api-key"]',
  'apiKey',
  '*.apiKey',
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'password_hash',
  '*.password_hash',
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
