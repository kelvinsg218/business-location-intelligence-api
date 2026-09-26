'use strict';

const { Pool } = require('pg');
const request = require('supertest');
const { createTestPool, deleteUsers, uniqueEmail } = require('../helpers/db');
const {
  STRONG_PASSWORD, api, buildAuthApp, createCaptureStream, registerUser,
} = require('../helpers/authApp');
const { createLogger } = require('../../src/utils/logger');

const SECRETS = ['127.0.0.1', '5432', 'ECONNREFUSED', 's3cretpw', 'postgres://', 'connect ', 'user=', 'password'];

function expectNoLeak(body) {
  const text = JSON.stringify(body);
  SECRETS.forEach((secret) => expect(text).not.toContain(secret));
}

describe('database unavailable at runtime (real PostgreSQL, then a dead one)', () => {
  let pool;
  const userIds = [];

  beforeAll(() => { pool = createTestPool(); });

  afterAll(async () => {
    await deleteUsers(pool, userIds);
    await pool.end();
  });

  describe('the database goes away and comes back while the app keeps running', () => {
    // A wrapper whose failures look exactly like a dead server: same error a
    // refused connection produces in node-postgres.
    function switchable() {
      const state = { down: false };
      return {
        state,
        query: (...args) => {
          if (state.down) {
            return Promise.reject(Object.assign(
              new Error('connect ECONNREFUSED 127.0.0.1:5432 (user=bli password=s3cretpw)'),
              { code: 'ECONNREFUSED', address: '127.0.0.1', port: 5432 },
            ));
          }
          return pool.query(...args);
        },
      };
    }

    it('answers 503 DATABASE_UNAVAILABLE on database routes, 200 on /health and 503 on /ready, leaks nothing, and recovers', async () => {
      const capture = createCaptureStream();
      const db = switchable();
      const { app, cookieName } = buildAuthApp({ db, logger: createLogger(capture, { level: 'info' }) });
      const account = await registerUser(app, cookieName);
      userIds.push(account.user.id);
      expect((await api.me(app, { cookie: account.cookie })).status).toBe(200);
      expect((await request(app).get('/ready')).status).toBe(200);

      db.state.down = true;

      const responses = {
        me: await api.me(app, { cookie: account.cookie }),
        analyze: await api.analyze(app, undefined, { cookie: account.cookie }),
        login: await api.login(app, { email: account.email, password: account.password }),
        register: await api.register(app, { name: 'Maria', email: uniqueEmail('down'), password: STRONG_PASSWORD }),
        logout: await api.logout(app, { cookie: account.cookie }),
      };
      Object.entries(responses).forEach(([name, res]) => {
        expect([name, res.status]).toEqual([name, 503]);
        expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
        expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
        expectNoLeak(res.body);
      });

      const health = await request(app).get('/health');
      const ready = await request(app).get('/ready');
      expect(health.status).toBe(200);
      expect(health.body).toEqual({ status: 'ok' });
      expect(ready.status).toBe(503);
      expectNoLeak(ready.body);

      // Requests that need no database keep working: no cookie means 401, not 503.
      expect((await api.me(app)).status).toBe(401);
      expect((await api.analyze(app)).status).toBe(401);

      // The real cause is logged on the server, with the request id...
      const logged = capture.entries().filter((e) => e.msg === 'request failed: dependency unavailable');
      expect(logged.length).toBeGreaterThanOrEqual(1);
      expect(logged[0].err.message).toContain('ECONNREFUSED');

      // ... and when the database is back, the very same cookie works again.
      db.state.down = false;
      expect((await api.me(app, { cookie: account.cookie })).status).toBe(200);
      expect((await api.analyze(app, undefined, { cookie: account.cookie })).status).toBe(200);
      expect((await request(app).get('/ready')).status).toBe(200);
    });

    it('a failing "touch" (activity bookkeeping) never breaks a request that had already succeeded', async () => {
      const capture = createCaptureStream();
      const db = switchable();
      // touchIntervalMs 0: every request tries to record activity.
      const { app, cookieName } = buildAuthApp({ db, touchIntervalMs: 0, logger: createLogger(capture, { level: 'warn' }) });
      const account = await registerUser(app, cookieName);
      userIds.push(account.user.id);

      // Let the session lookup succeed, and fail only the UPDATE that touches it.
      const realQuery = db.query;
      db.query = (sql, ...rest) => (typeof sql === 'string' && sql.startsWith('UPDATE sessions')
        ? Promise.reject(new Error('touch failed'))
        : realQuery(sql, ...rest));

      const res = await api.me(app, { cookie: account.cookie });

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(account.user.id);
      expect(capture.entries().some((e) => e.msg === 'could not record session activity')).toBe(true);
    });
  });

  describe('the database was never reachable (nothing listens on the port)', () => {
    let deadPool;
    let capture;
    let app;

    beforeAll(() => {
      deadPool = new Pool({
        connectionString: 'postgres://bli:s3cretpw@127.0.0.1:1/bli_test', connectionTimeoutMillis: 1500, max: 2,
      });
      deadPool.on('error', () => {});
      capture = createCaptureStream();
      ({ app } = buildAuthApp({ db: deadPool, logger: createLogger(capture, { level: 'info' }) }));
    });

    afterAll(async () => { await deadPool.end(); });

    it('boots and serves /health; /ready is 503 with no connection details', async () => {
      const health = await request(app).get('/health');
      const ready = await request(app).get('/ready');

      expect(health.status).toBe(200);
      expect(ready.status).toBe(503);
      expect(ready.body).toEqual({ status: 'not_ready', checks: { database: 'unavailable' } });
    });

    it('answers register and login with 503 DATABASE_UNAVAILABLE, never with host, port, user or password', async () => {
      const register = await api.register(app, { name: 'Maria', email: uniqueEmail('dead'), password: STRONG_PASSWORD });
      const login = await api.login(app, { email: 'someone@example.test', password: STRONG_PASSWORD });

      [register, login].forEach((res) => {
        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
        expectNoLeak(res.body);
        expect(res.headers['set-cookie']).toBeUndefined();
      });
      // the password of the connection string never reaches the log either
      expect(capture.text()).not.toContain('s3cretpw');
    });

    it('is still up afterwards (the process did not crash) and unauthenticated calls still get 401', async () => {
      expect((await request(app).get('/health')).status).toBe(200);
      expect((await api.analyze(app)).status).toBe(401);
    });
  });
});
