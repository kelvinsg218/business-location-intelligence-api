#!/usr/bin/env node
'use strict';

// One-time local setup: creates the application role and the two development
// databases (bli_dev for the app, bli_test for the automated tests). Safe to run
// again: whatever already exists is kept (the role's password is re-applied).
//
// It needs a PostgreSQL superuser to connect with, and a password for the new
// role. Neither is stored anywhere and neither is hard-coded: you provide them
// through the environment for this one command.
//
//   PowerShell:
//     $env:PGADMIN_URL = "postgres://postgres:<superuser password>@localhost:5432/postgres"
//     $env:BLI_DB_PASSWORD = "<a password you choose, 12+ characters>"
//     npm run db:init
//
// Afterwards it prints the DATABASE_URL / TEST_DATABASE_URL lines to put in .env.

const { Client } = require('pg');

const ROLE = 'bli';
const DATABASES = ['bli_dev', 'bli_test'];
const MIN_PASSWORD_LENGTH = 12;

function fail(message) {
  console.error(`db:init: ${message}`);
  process.exit(1);
}

async function main() {
  const adminUrl = process.env.PGADMIN_URL;
  const password = process.env.BLI_DB_PASSWORD;

  if (!adminUrl) {
    fail('PGADMIN_URL is not set. Example: postgres://postgres:<superuser password>@localhost:5432/postgres');
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    fail(`BLI_DB_PASSWORD must be set to a password you choose (at least ${MIN_PASSWORD_LENGTH} characters).`);
  }

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();

  try {
    const role = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE]);
    // CREATE/ALTER ROLE and CREATE DATABASE cannot take bind parameters. The names
    // are constants of this file and the password is quoted with the driver's own
    // escapeLiteral(), so nothing here is attacker-controlled.
    const passwordLiteral = admin.escapeLiteral(password);
    const roleSql = role.rowCount === 0
      ? `CREATE ROLE ${ROLE} LOGIN PASSWORD ${passwordLiteral}`
      : `ALTER ROLE ${ROLE} WITH LOGIN PASSWORD ${passwordLiteral}`;
    await admin.query(roleSql);
    console.log(`role "${ROLE}": ${role.rowCount === 0 ? 'created' : 'already existed (password re-applied)'}`);

    for (const database of DATABASES) {
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
      if (exists.rowCount === 0) {
        const createSql = `CREATE DATABASE ${database} OWNER ${ROLE}`;
        await admin.query(createSql);
      }
      console.log(`database "${database}": ${exists.rowCount === 0 ? 'created' : 'already existed'}`);
    }
  } finally {
    await admin.end();
  }

  const { hostname, port } = new URL(adminUrl);
  const where = `${hostname}:${port || '5432'}`;
  console.log('\nAdd these lines to your .env (replace <password> with the password you chose):\n');
  console.log(`DATABASE_URL=postgres://${ROLE}:<password>@${where}/bli_dev`);
  console.log(`TEST_DATABASE_URL=postgres://${ROLE}:<password>@${where}/bli_test`);
  console.log('\nThen run: npm run db:migrate   (and npm run db:migrate:test for the test database)');
}

main().catch((err) => {
  // Never print the connection string: it contains the superuser password.
  fail(err.message);
});
