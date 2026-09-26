#!/usr/bin/env node
'use strict';

// Waits until PostgreSQL accepts connections and answers a trivial query, so a
// step that needs the database (migrations, tests) does not start before it is
// ready. Used by CI right after the service container starts; also handy locally.
//
//   node scripts/wait-for-db.js [ENV_VAR_NAME] [TIMEOUT_SECONDS]
//   npm run db:wait                       # waits for TEST_DATABASE_URL, up to 60 s
//
// The connection string is read from the environment variable named by the first
// argument (default TEST_DATABASE_URL) and is never printed.

require('dotenv').config({ quiet: true });
const { Client } = require('pg');

const RETRY_EVERY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function isReady(connectionString) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 2000 });
  client.on('error', () => {});
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const variable = process.argv[2] || 'TEST_DATABASE_URL';
  const timeoutSeconds = Number(process.argv[3] || 60);
  const connectionString = process.env[variable];

  if (!connectionString) {
    console.error(`db:wait: ${variable} is not set.`);
    process.exit(1);
  }

  const deadline = Date.now() + timeoutSeconds * 1000;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    if (await isReady(connectionString)) {
      console.log(`PostgreSQL is ready (${variable}, attempt ${attempts}).`);
      return;
    }
    await sleep(RETRY_EVERY_MS);
  }

  console.error(`db:wait: PostgreSQL did not become ready within ${timeoutSeconds} s (${variable}, ${attempts} attempts).`);
  process.exit(1);
}

main().catch((err) => {
  // Deliberately not printing err.message: it can contain the connection host and user.
  console.error(`db:wait: unexpected failure (${err.code || err.name}).`);
  process.exit(1);
});
