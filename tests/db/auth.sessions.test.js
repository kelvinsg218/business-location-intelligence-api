'use strict';

const { createTestPool, deleteUsers } = require('../helpers/db');
const {
  DAY_MS, api, buildAuthApp, cookiePair, createClock, findSetCookie, parseSetCookie, registerUser, sessionIdOf, signSessionId, sleep,
} = require('../helpers/authApp');
const { hashSessionId } = require('../../src/modules/auth/pgSessionStore');
const { createTestAuth } = require('../helpers/testAuth');

describe('sessions and access to /analyze (real PostgreSQL)', () => {
  let pool;
  const userIds = [];

  const track = (user) => { userIds.push(user.id); return user; };
  const sessionRows = async (userId) => (await pool.query('SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at', [userId])).rows;
  // express-session finishes touching before it ends the response, but leave the
  // pool a beat so the next request in a clock-jumping test sees the result.
  const settle = () => sleep(30);

  beforeAll(() => { pool = createTestPool(); });

  afterAll(async () => {
    await deleteUsers(pool, userIds);
    await pool.end();
  });

  describe('cookie attributes', () => {
    it('local HTTP (dev): bli_sid, HttpOnly, SameSite=Strict, Path=/, no Domain, not Secure, 30-day lifetime', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool });
      const { user, res } = await registerUser(app, cookieName);
      track(user);

      const cookie = parseSetCookie(findSetCookie(res, 'bli_sid'));
      expect(cookie.name).toBe('bli_sid');
      expect(cookie.attributes.httponly).toBe(true);
      expect(cookie.attributes.samesite).toBe('Strict');
      expect(cookie.attributes.path).toBe('/');
      expect(cookie.attributes.domain).toBeUndefined();
      expect(cookie.attributes.secure).toBeUndefined();
      // The cookie lives as long as the ABSOLUTE limit (30 days); the shorter idle
      // limit is enforced by the server. express-session writes it as Expires.
      const lifetimeMs = new Date(cookie.attributes.expires).getTime() - Date.now();
      expect(lifetimeMs).toBeGreaterThan(29.9 * DAY_MS);
      expect(lifetimeMs).toBeLessThanOrEqual(30 * DAY_MS);
      expect(cookie.value.startsWith('s%3A')).toBe(true); // signed
      expect(findSetCookie(res, '__Host-bli_sid')).toBeUndefined();
    });

    it('production over HTTPS: __Host-bli_sid, Secure, HttpOnly, SameSite=Strict, Path=/, no Domain', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool, secure: true, trustProxy: 1 });
      expect(cookieName).toBe('__Host-bli_sid');

      const res = await api.register(
        app,
        { name: 'Maria Souza', email: `prod-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, password: 'Purple-Otter-Runs-Fast-42' },
        { headers: { 'X-Forwarded-Proto': 'https' } },
      );
      track(res.body.data.user);

      expect(res.status).toBe(201);
      const cookie = parseSetCookie(findSetCookie(res, '__Host-bli_sid'));
      expect(cookie.attributes.secure).toBe(true);
      expect(cookie.attributes.httponly).toBe(true);
      expect(cookie.attributes.samesite).toBe('Strict');
      expect(cookie.attributes.path).toBe('/');
      // The three conditions of the __Host- prefix: Secure, Path=/, and no Domain.
      expect(cookie.attributes.domain).toBeUndefined();
      expect(findSetCookie(res, 'bli_sid')).toBeUndefined();
    });

    it('production: logout clears the __Host- cookie with the very same attributes', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool, secure: true, trustProxy: 1 });
      const https = { 'X-Forwarded-Proto': 'https' };
      const reg = await api.register(
        app,
        { name: 'Maria Souza', email: `prodout-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, password: 'Purple-Otter-Runs-Fast-42' },
        { headers: https },
      );
      track(reg.body.data.user);

      const res = await api.logout(app, { cookie: cookiePair(reg, cookieName), headers: https });

      const cleared = parseSetCookie(findSetCookie(res, cookieName));
      expect(cleared.attributes.secure).toBe(true);
      expect(cleared.attributes.httponly).toBe(true);
      expect(cleared.attributes.samesite).toBe('Strict');
      expect(cleared.attributes.path).toBe('/');
      expect(cleared.attributes.domain).toBeUndefined();
      expect(cleared.attributes.expires).toMatch(/1970/);
    });

    it('the cookie value is an opaque random id: no user id, e-mail or role in it', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool });
      const { user, email, cookie } = await registerUser(app, cookieName);
      track(user);

      const value = decodeURIComponent(cookie.split('=')[1]);
      const sid = sessionIdOf(cookie.split('=')[1]);
      expect(sid).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(value).not.toContain(user.id);
      expect(value).not.toContain(email);
      expect(value.startsWith('{') || value.includes('userId')).toBe(false);
    });
  });

  describe('anonymous visitors leave nothing behind', () => {
    // Counting the rows of the whole table would race with the other suites that
    // run in parallel against this same database. What is checked instead is what
    // THIS app sends to the database: anonymous traffic never writes a session.
    function spiedApp() {
      const writes = [];
      const spy = {
        query: (sql, params) => {
          if (/^\s*(INSERT\s+INTO|UPDATE)\s+sessions\b/i.test(sql)) writes.push(sql);
          return pool.query(sql, params);
        },
      };
      return { ...buildAuthApp({ db: spy }), writes };
    }

    it('creates no cookie and no session row for /me, /analyze, a failed login or a rejected sign-up', async () => {
      const { app, cookieName, writes } = spiedApp();

      const responses = [
        await api.me(app),
        await api.analyze(app),
        await api.login(app, { email: 'nobody@example.test', password: 'Whatever-Password-1' }),
        await api.register(app, { name: '', email: 'x', password: 'y' }),
      ];

      responses.forEach((res) => expect(findSetCookie(res, cookieName)).toBeUndefined());
      expect(writes).toEqual([]);
    });

    it('a logout without a session only ever CLEARS the cookie, it never issues one', async () => {
      const { app, cookieName, writes } = spiedApp();

      const res = await api.logout(app);

      expect(res.status).toBe(204);
      expect(parseSetCookie(findSetCookie(res, cookieName)).attributes.expires).toMatch(/1970/);
      expect(writes).toEqual([]);
    });

    it('a request without a cookie does not touch the database at all until something needs it', async () => {
      const queries = [];
      const spy = { query: (sql, params) => { queries.push(sql); return pool.query(sql, params); } };
      const { app } = buildAuthApp({ db: spy });

      expect((await api.me(app)).status).toBe(401);
      expect((await api.analyze(app)).status).toBe(401);

      expect(queries).toEqual([]);
    });
  });

  describe('session fixation', () => {
    it('login replaces the session id: the previous cookie stops working and a new one is issued', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool });
      const account = await registerUser(app, cookieName);
      track(account.user);
      const oldCookie = account.cookie;

      const res = await api.login(app, { email: account.email, password: account.password }, { cookie: oldCookie });

      const newCookie = cookiePair(res, cookieName);
      expect(res.status).toBe(200);
      expect(newCookie).toBeDefined();
      expect(newCookie).not.toBe(oldCookie);
      expect((await api.me(app, { cookie: oldCookie })).status).toBe(401);
      expect((await api.me(app, { cookie: newCookie })).status).toBe(200);
      expect(await sessionRows(account.user.id)).toHaveLength(1);
    });

    it('a session id chosen by an attacker (validly signed, never issued by the server) is never adopted', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool });
      const account = await registerUser(app, cookieName);
      track(account.user);
      const attackerSid = 'attacker-chosen-session-id-0000001';
      const planted = `${cookieName}=${encodeURIComponent(signSessionId(attackerSid))}`;

      const res = await api.login(app, { email: account.email, password: account.password }, { cookie: planted });

      const issued = cookiePair(res, cookieName);
      expect(res.status).toBe(200);
      expect(sessionIdOf(issued.split('=')[1])).not.toBe(attackerSid);
      const attackerRow = await pool.query('SELECT 1 FROM sessions WHERE id_hash = $1', [hashSessionId(attackerSid)]);
      expect(attackerRow.rowCount).toBe(0);
      // the attacker, still holding the planted cookie, is not signed in
      expect((await api.me(app, { cookie: planted })).status).toBe(401);
    });

    it('registering while holding an authenticated cookie also issues a fresh id', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool });
      const first = await registerUser(app, cookieName);
      track(first.user);

      const second = await registerUser(app, cookieName);
      track(second.user);
      const res = await api.register(
        app,
        { name: 'Ana', email: `${second.email.split('@')[0]}-b@example.test`, password: 'Another-Strong-Phrase-19' },
        { cookie: first.cookie },
      );
      track(res.body.data.user);

      expect(cookiePair(res, cookieName)).not.toBe(first.cookie);
      expect((await api.me(app, { cookie: first.cookie })).status).toBe(401);
      expect((await api.me(app, { cookie: cookiePair(res, cookieName) })).body.data.user.email).toBe(res.body.data.user.email);
    });
  });

  describe('expiration', () => {
    it('idle expiry: 7 days without activity ends the session', async () => {
      const clock = createClock();
      const { app, cookieName } = buildAuthApp({ db: pool, clock });
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);

      clock.days(6.9);
      expect((await api.me(app, { cookie })).status).toBe(200);
      await settle();

      // 6.9 days later (idle window was renewed by the request above): still there
      clock.days(6.9);
      expect((await api.me(app, { cookie })).status).toBe(200);
      await settle();

      // 7 days and a bit of silence
      clock.days(7.1);
      const res = await api.me(app, { cookie });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('activity keeps a session alive (the idle window slides)', async () => {
      const clock = createClock();
      const { app, cookieName } = buildAuthApp({ db: pool, clock });
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);

      for (let day = 1; day <= 5; day += 1) {
        clock.days(5);
        expect((await api.me(app, { cookie })).status).toBe(200);
        await settle();
      }
      expect((await sessionRows(user.id))[0].expires_at.getTime()).toBeGreaterThan(clock.ms);
    });

    it('absolute expiry: 30 days after login the session ends even if it was used every day', async () => {
      const clock = createClock();
      const { app, cookieName } = buildAuthApp({ db: pool, clock });
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);
      const startedAt = clock.ms;

      for (let day = 1; day <= 29; day += 1) {
        clock.days(1);
        expect((await api.me(app, { cookie })).status).toBe(200);
        await settle();
      }
      const [row] = await sessionRows(user.id);
      // the sliding idle window has been pushed up against the absolute limit, never past it
      expect(row.expires_at.getTime()).toBeLessThanOrEqual(startedAt + 30 * DAY_MS);
      expect(row.absolute_expires_at.getTime()).toBe(startedAt + 30 * DAY_MS);

      clock.days(1.01);
      const res = await api.me(app, { cookie });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('an expired session can not reach /analyze, and a new login works', async () => {
      const clock = createClock();
      const { app, cookieName } = buildAuthApp({ db: pool, clock });
      const account = await registerUser(app, cookieName);
      track(account.user);
      expect((await api.analyze(app, undefined, { cookie: account.cookie })).status).toBe(200);
      await settle();

      clock.days(8);

      const expired = await api.analyze(app, undefined, { cookie: account.cookie });
      expect(expired.status).toBe(401);
      expect(expired.body.error.code).toBe('UNAUTHENTICATED');

      const again = await api.login(app, { email: account.email, password: account.password });
      expect(again.status).toBe(200);
      expect((await api.analyze(app, undefined, { cookie: cookiePair(again, cookieName) })).status).toBe(200);
    });

    // Cleanup of expired rows (PgSessionStore.prune and the pruning timer) is
    // tested in tests/db/pgSessionStore.test.js. It is deliberately NOT repeated
    // here: prune() deletes every expired row of the table, and with this suite's
    // fake clock it would also delete rows that suites running in parallel are
    // still using.
    it('an expired session is refused even before any cleanup has removed its row', async () => {
      const clock = createClock();
      const { app, cookieName } = buildAuthApp({ db: pool, clock });
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);

      clock.days(8);

      expect((await api.me(app, { cookie })).status).toBe(401);
      expect(await sessionRows(user.id)).toHaveLength(1); // still in the table: refusal does not depend on pruning
    });
  });

  describe('GET /api/v1/locations/analyze', () => {
    it('answers 401 UNAUTHENTICATED without a session and does not run the analysis', async () => {
      const spy = jest.fn(async () => ({ places: [] }));
      const { app } = buildAuthApp({ db: pool, appOverrides: { placesProvider: { search: spy } } });

      const res = await api.analyze(app);

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHENTICATED' } });
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
      expect(spy).not.toHaveBeenCalled();
    });

    it('answers 401 (not 400) for an invalid query without a session: authentication comes first', async () => {
      const { app } = buildAuthApp({ db: pool });
      const res = await api.analyze(app, { businessType: 'gym' });
      expect(res.status).toBe(401);
    });

    it('serves the analysis to a signed-in user, with the same contract as before', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool });
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);

      const query = { location: 'Vila Velha, ES', businessType: 'gym', radius: 5 };
      const res = await api.analyze(app, query, { cookie });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analysis.opportunityScore).toEqual(expect.any(Number));
      expect(res.body.requestId).toBeUndefined();

      // The same answer the un-gated app gives (same deterministic mock providers);
      // only the generation timestamp differs between two calls.
      const ungated = buildAuthApp({ db: pool, appOverrides: { auth: createTestAuth() } }).app;
      const reference = await api.analyze(ungated, query);
      expect(reference.status).toBe(200);
      const withoutTimestamp = (body) => ({ ...body, data: { ...body.data, meta: { ...body.data.meta, generatedAt: undefined } } });
      expect(withoutTimestamp(res.body)).toEqual(withoutTimestamp(reference.body));
    });

    it('a signed-in user still gets the normal 400 for an invalid query', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool });
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);

      const res = await api.analyze(app, { businessType: 'gym' }, { cookie });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('does not authenticate through a query string, a header or a body field', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool });
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);
      const sid = cookie.split('=')[1];

      const attempts = await Promise.all([
        api.analyze(app, { location: 'Vila Velha, ES', businessType: 'gym', radius: 5, [cookieName]: sid, userId: user.id }),
        api.analyze(app, undefined, { headers: { Authorization: `Bearer ${sid}`, 'X-User-Id': user.id, 'X-Session-Id': sid } }),
      ]);
      attempts.forEach((res) => expect(res.status).toBe(401));
    });
  });
});
