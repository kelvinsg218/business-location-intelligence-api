'use strict';

// Node network error codes that mean "could not talk to PostgreSQL".
const NETWORK_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH',
]);

// PostgreSQL SQLSTATE classes/codes that mean the database is (temporarily) not
// able to serve the request: class 08 (connection exception), 57P01-57P03
// (admin shutdown, crash shutdown, cannot connect now), 53300 (too many
// connections), 57014 (statement timeout / query canceled), 28xxx/3D000
// (credentials or database misconfigured — equally "unavailable" to a client).
const SQLSTATE_CODES = new Set(['57P01', '57P02', '57P03', '53300', '57014', '3D000', '28P01', '28000']);

// node-postgres / pg-pool errors that carry no code, only a message.
const MESSAGE_PATTERNS = [
  /timeout exceeded when trying to connect/i,
  /connection terminated/i,
  /connection error/i,
  /cannot use a pool after calling end/i,
  /client has encountered a connection error/i,
  /the server closed the connection unexpectedly/i,
];

/**
 * True when `err` says the database could not be reached or could not serve the
 * request. The error handler turns these into a generic 503 DATABASE_UNAVAILABLE
 * — the original error (which can include host, port or user) is only logged.
 * Ordinary query errors (constraint violations, bad SQL) are NOT matched: those
 * are bugs or handled domain errors, not availability problems.
 */
function isDatabaseUnavailableError(err) {
  if (!err || typeof err !== 'object') return false;

  const { code } = err;
  if (typeof code === 'string') {
    if (NETWORK_CODES.has(code) || SQLSTATE_CODES.has(code) || code.startsWith('08')) return true;
  }

  if (err instanceof AggregateError && Array.isArray(err.errors)) {
    return err.errors.some(isDatabaseUnavailableError);
  }

  return typeof err.message === 'string' && MESSAGE_PATTERNS.some((pattern) => pattern.test(err.message));
}

module.exports = { isDatabaseUnavailableError };
