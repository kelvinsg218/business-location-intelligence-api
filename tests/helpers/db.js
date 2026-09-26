'use strict';

// Helpers for the suites under tests/db/, which need a real PostgreSQL.
//
// Isolation model: every test uses data that is unique to it (random e-mails)
// and never truncates tables, so test files can run in parallel against the
// same database without stepping on each other.

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const { Pool } = require('pg');

const SAFE_DATABASE_NAME = /_test$/;

// A syntactically valid Argon2id PHC string (not a real hash of anything): enough
// to satisfy the users_password_hash_format CHECK when a test inserts users
// directly and does not care about passwords.
const FAKE_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdC1zYWx0LTEyMzQ$dGVzdC1oYXNoLXRlc3QtaGFzaC10ZXN0LWhhc2gtMTIz';

function databaseNameOf(url) {
  return new URL(url).pathname.replace(/^\//, '');
}

// Refuse to touch anything that is not obviously a throwaway test database.
function assertSafeTestDatabase(url) {
  const name = databaseNameOf(url);
  if (!SAFE_DATABASE_NAME.test(name)) {
    throw new Error(`Refusing to run database tests against "${name}": the database name must end in "_test".`);
  }
}

function getTestDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set, but this suite needs PostgreSQL. '
      + 'Run `npm run db:init` once, put TEST_DATABASE_URL in .env (see .env.example), or run `npm run test:unit` to skip database suites.',
    );
  }
  assertSafeTestDatabase(url);
  return url;
}

function createTestPool(overrides = {}) {
  const pool = new Pool({
    connectionString: getTestDatabaseUrl(), max: 5, connectionTimeoutMillis: 5000, ...overrides,
  });
  // Without a listener an idle-client error would crash the Jest worker.
  pool.on('error', () => {});
  return pool;
}

function uniqueEmail(label = 'user') {
  return `${label}-${crypto.randomUUID()}@example.test`;
}

async function insertUser(pool, { email = uniqueEmail(), name = 'Test User', passwordHash = FAKE_PASSWORD_HASH } = {}) {
  const { rows } = await pool.query(
    'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
    [email, name, passwordHash],
  );
  return rows[0];
}

async function deleteUsers(pool, ids) {
  if (ids.length === 0) return;
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
}

module.exports = {
  FAKE_PASSWORD_HASH,
  assertSafeTestDatabase,
  createTestPool,
  deleteUsers,
  getTestDatabaseUrl,
  insertUser,
  uniqueEmail,
};
