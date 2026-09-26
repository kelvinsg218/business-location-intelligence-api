'use strict';

const { Pool } = require('pg');

/**
 * Builds the shared PostgreSQL pool from the validated env config.
 *
 * - `pool.on('error')` is mandatory: an idle client can fail in the background
 *   (server restart, network drop) and, without a listener, node-postgres lets
 *   that crash the whole process. With it, the process stays up and the next
 *   query simply opens a fresh connection (or fails with a 503).
 * - connectionTimeoutMillis is set explicitly: pg's default is "wait forever".
 */
function createPool(config, { logger }) {
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Set it in .env (see .env.example) before starting the server.');
  }

  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT_MS,
    statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
    application_name: 'bli-api',
    ssl: config.DATABASE_SSL === 'require' ? { rejectUnauthorized: true } : false,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'unexpected error on an idle PostgreSQL client');
  });

  return pool;
}

/**
 * Resolves true when the database answers a trivial query within `timeoutMs`,
 * false otherwise. Never rejects and never leaks the underlying error: it feeds
 * /ready, which must be cheap, bounded and free of connection details.
 */
async function pingDatabase(db, { timeoutMs = 2000 } = {}) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const query = db
    .query('SELECT 1 AS ok')
    .then((result) => result.rows.length === 1)
    .catch(() => false);

  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { createPool, pingDatabase };
