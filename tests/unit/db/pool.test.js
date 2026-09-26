'use strict';

const net = require('net');
const { createPool, pingDatabase } = require('../../../src/db/pool');
const { isDatabaseUnavailableError } = require('../../../src/db/errors');

const silentLogger = { error: jest.fn() };

function config(overrides = {}) {
  return {
    DATABASE_URL: 'postgres://user:secret@127.0.0.1:1/nodb',
    DATABASE_POOL_MAX: 3,
    DATABASE_CONNECTION_TIMEOUT_MS: 1000,
    DATABASE_IDLE_TIMEOUT_MS: 1000,
    DATABASE_STATEMENT_TIMEOUT_MS: 1000,
    DATABASE_SSL: 'disable',
    ...overrides,
  };
}

// A port that certainly has nothing listening on it: bind, read the port, close.
function closedPort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

describe('pingDatabase', () => {
  it('resolves true when the database answers', async () => {
    const db = { query: async () => ({ rows: [{ ok: 1 }] }) };
    await expect(pingDatabase(db)).resolves.toBe(true);
  });

  it('resolves false (never rejects) when the query fails, without leaking the error', async () => {
    const db = { query: async () => { throw Object.assign(new Error('password authentication failed for user "bli"'), { code: '28P01' }); } };
    await expect(pingDatabase(db)).resolves.toBe(false);
  });

  it('resolves false within the timeout when the database hangs', async () => {
    const db = { query: () => new Promise(() => {}) };
    const startedAt = Date.now();

    await expect(pingDatabase(db, { timeoutMs: 50 })).resolves.toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('resolves false when the answer is not the expected single row', async () => {
    const db = { query: async () => ({ rows: [] }) };
    await expect(pingDatabase(db)).resolves.toBe(false);
  });
});

describe('createPool', () => {
  it('refuses to be created without DATABASE_URL, with an actionable message', () => {
    expect(() => createPool(config({ DATABASE_URL: undefined }), { logger: silentLogger })).toThrow(/DATABASE_URL is required/);
  });

  it('applies the configured limits (max and connection timeout: pg would otherwise wait forever)', async () => {
    const pool = createPool(config({ DATABASE_POOL_MAX: 4, DATABASE_CONNECTION_TIMEOUT_MS: 1234 }), { logger: silentLogger });
    try {
      expect(pool.options.max).toBe(4);
      expect(pool.options.connectionTimeoutMillis).toBe(1234);
      expect(pool.options.statement_timeout).toBe(1000);
      expect(pool.options.application_name).toBe('bli-api');
    } finally {
      await pool.end();
    }
  });

  it('registers an error listener so a background idle-client failure cannot crash the process', async () => {
    const pool = createPool(config(), { logger: silentLogger });
    try {
      expect(pool.listenerCount('error')).toBeGreaterThan(0);

      const err = new Error('idle client lost its connection');
      expect(() => pool.emit('error', err)).not.toThrow();
      expect(silentLogger.error).toHaveBeenCalledWith({ err }, expect.stringContaining('idle PostgreSQL client'));
    } finally {
      await pool.end();
    }
  });

  it('fails fast with an availability error (never hangs) when the server is unreachable', async () => {
    const port = await closedPort();
    const pool = createPool(config({ DATABASE_URL: `postgres://user:secret@127.0.0.1:${port}/nodb` }), { logger: silentLogger });
    try {
      let caught;
      try {
        await pool.query('SELECT 1');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      expect(isDatabaseUnavailableError(caught)).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it('pingDatabase reports an unreachable server as not ready', async () => {
    const port = await closedPort();
    const pool = createPool(config({ DATABASE_URL: `postgres://user:secret@127.0.0.1:${port}/nodb` }), { logger: silentLogger });
    try {
      await expect(pingDatabase(pool, { timeoutMs: 2000 })).resolves.toBe(false);
    } finally {
      await pool.end();
    }
  });
});
