'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  createTestPool, deleteUsers, insertUser, uniqueEmail, FAKE_PASSWORD_HASH,
} = require('../helpers/db');

const ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'db', 'migrations');

// Same markers node-pg-migrate looks for.
function sqlSection(sql, direction) {
  const marker = (dir) => new RegExp(`^\\s*--[\\s-]*${dir}\\s+migration`, 'im');
  const upStart = sql.search(marker('up'));
  const downStart = sql.search(marker('down'));
  if (direction === 'up') return sql.slice(upStart, downStart < upStart ? undefined : downStart);
  return sql.slice(downStart, upStart < downStart ? undefined : upStart);
}

describe('database schema (migrations)', () => {
  let pool;
  const createdUsers = [];

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await deleteUsers(pool, createdUsers);
    await pool.end();
  });

  async function newUser(overrides) {
    const user = await insertUser(pool, overrides);
    createdUsers.push(user.id);
    return user;
  }

  describe('applied state', () => {
    it('records both migrations in pgmigrations, in order', async () => {
      const { rows } = await pool.query('SELECT name FROM pgmigrations ORDER BY name');
      expect(rows.map((row) => row.name)).toEqual(['1790442000000_create-users', '1790442060000_create-sessions']);
    });

    it('creates exactly the users and sessions tables (and nothing else of the product yet)', async () => {
      const { rows } = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
      );
      expect(rows.map((row) => row.table_name)).toEqual(['pgmigrations', 'sessions', 'users']);
    });

    it('defines users with the approved columns and types', async () => {
      const { rows } = await pool.query(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'users' ORDER BY column_name",
      );
      expect(rows).toEqual([
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'email', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'name', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'password_hash', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      ]);
    });

    it('defines sessions with the approved columns and types', async () => {
      const { rows } = await pool.query(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'sessions' ORDER BY column_name",
      );
      expect(rows).toEqual([
        { column_name: 'absolute_expires_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'data', data_type: 'jsonb', is_nullable: 'NO' },
        { column_name: 'expires_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'id_hash', data_type: 'bytea', is_nullable: 'NO' },
        { column_name: 'last_seen_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
      ]);
    });

    it('indexes sessions by user_id and by expires_at (for revocation and for pruning)', async () => {
      const { rows } = await pool.query("SELECT indexname FROM pg_indexes WHERE tablename = 'sessions' ORDER BY indexname");
      expect(rows.map((row) => row.indexname)).toEqual(['sessions_expires_at_idx', 'sessions_pkey', 'sessions_user_id_idx']);
    });

    it('cascades session deletion from the user foreign key', async () => {
      const { rows } = await pool.query(
        "SELECT confdeltype FROM pg_constraint WHERE conname = 'sessions_user_id_fkey'",
      );
      expect(rows).toEqual([{ confdeltype: 'c' }]); // 'c' = ON DELETE CASCADE
    });
  });

  describe('users constraints', () => {
    it('generates a UUID id and both timestamps by default', async () => {
      const user = await newUser();
      expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(user.created_at).toBeInstanceOf(Date);
    });

    it('rejects a duplicate e-mail (unique)', async () => {
      const email = uniqueEmail('dup');
      await newUser({ email });
      await expect(insertUser(pool, { email })).rejects.toMatchObject({ code: '23505', constraint: 'users_email_unique' });
    });

    it('rejects an e-mail that is not normalized (upper case or surrounding spaces)', async () => {
      await expect(insertUser(pool, { email: `UPPER-${uniqueEmail()}`.toUpperCase() })).rejects.toMatchObject({
        code: '23514', constraint: 'users_email_normalized',
      });
      await expect(insertUser(pool, { email: ` ${uniqueEmail('spaces')} ` })).rejects.toMatchObject({
        code: '23514', constraint: 'users_email_normalized',
      });
    });

    it('so "A@x" and "a@x" can never coexist', async () => {
      const lower = uniqueEmail('case');
      await newUser({ email: lower });
      await expect(insertUser(pool, { email: lower.toUpperCase() })).rejects.toMatchObject({ code: '23514' });
    });

    it('rejects e-mails outside 3..254 characters', async () => {
      await expect(insertUser(pool, { email: 'ab' })).rejects.toMatchObject({ constraint: 'users_email_length' });
      await expect(insertUser(pool, { email: `${'a'.repeat(250)}@x.co` })).rejects.toMatchObject({ constraint: 'users_email_length' });
    });

    it('rejects an empty or over-long name', async () => {
      await expect(insertUser(pool, { name: '   ' })).rejects.toMatchObject({ constraint: 'users_name_length' });
      await expect(insertUser(pool, { name: 'n'.repeat(101) })).rejects.toMatchObject({ constraint: 'users_name_length' });
    });

    it('rejects a password_hash that is not an Argon2id PHC string (so plaintext cannot be stored)', async () => {
      await expect(insertUser(pool, { passwordHash: 'correct horse battery staple' })).rejects.toMatchObject({
        code: '23514', constraint: 'users_password_hash_format',
      });
      await expect(insertUser(pool, { passwordHash: '$2b$12$notargonbutbcrypthash' })).rejects.toMatchObject({
        constraint: 'users_password_hash_format',
      });
    });

    it('rejects NULLs in every required column', async () => {
      await expect(pool.query('INSERT INTO users (email, name, password_hash) VALUES (NULL, $1, $2)', ['n', FAKE_PASSWORD_HASH]))
        .rejects.toMatchObject({ code: '23502' });
      await expect(pool.query('INSERT INTO users (email, name, password_hash) VALUES ($1, NULL, $2)', [uniqueEmail(), FAKE_PASSWORD_HASH]))
        .rejects.toMatchObject({ code: '23502' });
      await expect(pool.query('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, NULL)', [uniqueEmail(), 'n']))
        .rejects.toMatchObject({ code: '23502' });
    });
  });

  describe('sessions constraints', () => {
    const future = (ms) => new Date(Date.now() + ms);

    function insertSession(userId, overrides = {}) {
      const values = {
        idHash: Buffer.alloc(32, 7), data: { userId }, expiresAt: future(1000), absoluteExpiresAt: future(2000), ...overrides,
      };
      return pool.query(
        'INSERT INTO sessions (id_hash, user_id, data, expires_at, absolute_expires_at) VALUES ($1, $2, $3, $4, $5)',
        [values.idHash, userId, JSON.stringify(values.data), values.expiresAt, values.absoluteExpiresAt],
      );
    }

    it('requires an existing user (foreign key)', async () => {
      await expect(insertSession('00000000-0000-4000-8000-000000000000', { idHash: Buffer.alloc(32, 1) }))
        .rejects.toMatchObject({ code: '23503' });
    });

    it('requires a 32-byte id hash', async () => {
      const user = await newUser();
      await expect(insertSession(user.id, { idHash: Buffer.alloc(16, 2) })).rejects.toMatchObject({ constraint: 'sessions_id_hash_length' });
    });

    it('never allows the effective expiry to exceed the absolute expiry', async () => {
      const user = await newUser();
      await expect(insertSession(user.id, {
        idHash: Buffer.alloc(32, 3), expiresAt: future(5000), absoluteExpiresAt: future(1000),
      })).rejects.toMatchObject({ constraint: 'sessions_expiry_order' });
    });

    it('deletes every session of a user when the user is deleted (ON DELETE CASCADE)', async () => {
      const user = await insertUser(pool);
      await insertSession(user.id, { idHash: Buffer.alloc(32, 4) });
      await insertSession(user.id, { idHash: Buffer.alloc(32, 5) });
      const before = await pool.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [user.id]);
      expect(before.rows[0].n).toBe(2);

      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

      const after = await pool.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [user.id]);
      expect(after.rows[0].n).toBe(0);
    });
  });

  describe('migration files', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();

    it('are plain SQL with explicit Up and Down sections', () => {
      expect(files).toHaveLength(2);
      files.forEach((file) => {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        expect(sqlSection(sql, 'up').length).toBeGreaterThan(0);
        expect(sqlSection(sql, 'down').length).toBeGreaterThan(0);
      });
    });

    it('apply and roll back cleanly (up in order, down in reverse), proven in a transaction that is discarded', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('CREATE SCHEMA migration_check');
        await client.query('SET LOCAL search_path TO migration_check');

        const sqls = files.map((file) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
        for (const sql of sqls) {
          await client.query(sqlSection(sql, 'up'));
        }
        const created = await client.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'migration_check' ORDER BY table_name",
        );
        expect(created.rows.map((row) => row.table_name)).toEqual(['sessions', 'users']);

        for (const sql of [...sqls].reverse()) {
          await client.query(sqlSection(sql, 'down'));
        }
        const remaining = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'migration_check'");
        expect(remaining.rows).toEqual([]);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });

    it('are idempotent: running "up" again is a no-op that succeeds', () => {
      const cli = path.join(ROOT, 'node_modules', 'node-pg-migrate', 'bin', 'node-pg-migrate.js');
      const output = execFileSync(
        process.execPath,
        [cli, 'up', '--migrations-dir', 'db/migrations', '--database-url-var', 'TEST_DATABASE_URL'],
        { cwd: ROOT, env: process.env, encoding: 'utf8' },
      );
      expect(output).toMatch(/No migrations to run/);
    });
  });
});
