'use strict';

// Runs once before the whole Jest run. When TEST_DATABASE_URL is configured it
// applies the migrations to the test database, so `npm test` is a single command
// on any machine. Applying them is idempotent (already-applied migrations are
// skipped), which is also what the CI relies on.
//
// When TEST_DATABASE_URL is not set nothing happens here: the suites under
// tests/db/ fail on their own with an explanatory message, and everything else
// (`npm run test:unit`) keeps working without a database.

require('dotenv').config({ quiet: true });
const path = require('path');
const { execFileSync } = require('child_process');
const { assertSafeTestDatabase } = require('./helpers/db');

module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;

  assertSafeTestDatabase(url);

  const cli = path.join(__dirname, '..', 'node_modules', 'node-pg-migrate', 'bin', 'node-pg-migrate.js');
  try {
    execFileSync(
      process.execPath,
      [cli, 'up', '--migrations-dir', 'db/migrations', '--database-url-var', 'TEST_DATABASE_URL'],
      { cwd: path.join(__dirname, '..'), env: process.env, stdio: 'pipe' },
    );
  } catch (err) {
    const output = `${err.stdout || ''}${err.stderr || ''}`.trim();
    throw new Error(`Could not apply migrations to the test database.\n${output || err.message}`);
  }
};
