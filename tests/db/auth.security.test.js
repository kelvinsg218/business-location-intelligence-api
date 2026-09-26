'use strict';

const request = require('supertest');
const { loadEnv } = require('../../src/config/env');
const { createTestPool, deleteUsers, uniqueEmail } = require('../helpers/db');
const {
  ALLOWED_ORIGIN, STRONG_PASSWORD, api, buildAuthApp, cookiePair, findSetCookie, registerUser, sessionIdOf, signSessionId,
} = require('../helpers/authApp');

const EVIL = 'https://evil.example';
const WRONG = 'Definitely-Not-The-Password-7';

describe('HTTP security of the auth endpoints (real PostgreSQL)', () => {
  let pool;
  const userIds = [];

  const track = (user) => { userIds.push(user.id); return user; };
  const userCount = async (email) => Number((await pool.query('SELECT count(*) FROM users WHERE email = $1', [email])).rows[0].count);
  // Always scoped to the account under test: the whole table is shared with suites
  // running in parallel, so global counts would race.
  const sessionCountFor = async (userId) => Number((await pool.query('SELECT count(*) FROM sessions WHERE user_id = $1', [userId])).rows[0].count);
  const fromIp = (n) => ({ 'X-Forwarded-For': `203.0.113.${n}` });

  beforeAll(() => { pool = createTestPool(); });

  afterAll(async () => {
    await deleteUsers(pool, userIds);
    await pool.end();
  });

  describe('origin guard (CSRF)', () => {
    let app;
    let cookieName;

    beforeAll(() => { ({ app, cookieName } = buildAuthApp({ db: pool })); });

    it('blocks a cross-origin sign-up: 403 FORBIDDEN_ORIGIN, no account, no cookie', async () => {
      const email = uniqueEmail('csrf');
      const res = await api.register(app, { name: 'Mallory', email, password: STRONG_PASSWORD }, { headers: { Origin: EVIL } });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ORIGIN');
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
      expect(findSetCookie(res, cookieName)).toBeUndefined();
      expect(await userCount(email)).toBe(0);
    });

    it('blocks a cross-origin login even with the right credentials (login CSRF)', async () => {
      const account = await registerUser(app, cookieName);
      track(account.user);
      expect(await sessionCountFor(account.user.id)).toBe(1);

      const res = await api.login(app, { email: account.email, password: account.password }, { headers: { Origin: EVIL } });

      expect(res.status).toBe(403);
      expect(findSetCookie(res, cookieName)).toBeUndefined();
      expect(await sessionCountFor(account.user.id)).toBe(1); // no second session was created
    });

    it('blocks a cross-origin logout: the victim is NOT signed out', async () => {
      const account = await registerUser(app, cookieName);
      track(account.user);

      const res = await api.logout(app, { cookie: account.cookie, headers: { Origin: EVIL } });

      expect(res.status).toBe(403);
      expect((await api.me(app, { cookie: account.cookie })).status).toBe(200);
    });

    it('blocks fetch metadata that says cross-site / same-site / none when no allowed Origin backs it up', async () => {
      for (const site of ['cross-site', 'same-site', 'none']) {
        const res = await api.login(app, { email: 'a@b.co', password: WRONG }, { headers: { 'Sec-Fetch-Site': site } });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN_ORIGIN');
      }
    });

    it('allows the configured front-end origin, and same-origin fetch metadata', async () => {
      const viaOrigin = await api.register(
        app, { name: 'Maria', email: uniqueEmail('origin'), password: STRONG_PASSWORD }, { headers: { Origin: ALLOWED_ORIGIN } },
      );
      track(viaOrigin.body.data.user);
      const viaMetadata = await api.register(
        app,
        { name: 'Maria', email: uniqueEmail('meta'), password: STRONG_PASSWORD },
        { headers: { 'Sec-Fetch-Site': 'same-origin', Origin: ALLOWED_ORIGIN } },
      );
      track(viaMetadata.body.data.user);

      expect(viaOrigin.status).toBe(201);
      expect(viaMetadata.status).toBe(201);
    });

    it('does not touch safe methods: GET /me works whatever the Origin', async () => {
      const account = await registerUser(app, cookieName);
      track(account.user);

      const res = await api.me(app, { cookie: account.cookie, headers: { Origin: EVIL } });
      expect(res.status).toBe(200);
    });

    it('is enforced before the database is touched: a forbidden origin with a cookie makes no session lookup', async () => {
      const spy = { query: jest.fn(() => Promise.reject(new Error('the database must not be used'))) };
      const { app: guarded } = buildAuthApp({ db: spy });

      const res = await api.logout(guarded, { cookie: 'bli_sid=s%3Aanything.sig', headers: { Origin: EVIL } });

      expect(res.status).toBe(403);
      expect(spy.query).not.toHaveBeenCalled();
    });

    it('sends no CORS headers: a browser on another origin can not read responses', async () => {
      const res = await request(app).options('/api/v1/auth/login').set('Origin', EVIL).set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });

  describe('request bodies', () => {
    let app;
    let cookieName;

    beforeAll(() => { ({ app, cookieName } = buildAuthApp({ db: pool })); });

    it.each([
      ['application/x-www-form-urlencoded', 'name=Mallory&email=m%40example.test&password=Some-Long-Password-1'],
      ['text/plain', '{"name":"Mallory","email":"m@example.test","password":"Some-Long-Password-1"}'],
      ['multipart/form-data; boundary=zz', '--zz\r\nContent-Disposition: form-data; name="email"\r\n\r\nm@example.test\r\n--zz--'],
    ])('refuses a %s body with 415 before touching the database (the classic cross-site form POST)', async (contentType, body) => {
      const queries = [];
      const spy = { query: (sql, params) => { queries.push(sql); return pool.query(sql, params); } };
      const { app: spied } = buildAuthApp({ db: spy });

      const res = await request(spied).post('/api/v1/auth/register').set('Content-Type', contentType).send(body);

      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(findSetCookie(res, cookieName)).toBeUndefined();
      expect(queries).toEqual([]);
    });

    it('answers 400 INVALID_JSON for malformed JSON, on every auth endpoint that reads a body', async () => {
      for (const path of ['/api/v1/auth/register', '/api/v1/auth/login']) {
        const res = await request(app).post(path).set('Content-Type', 'application/json').send('{"email": "a@b.co", ');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_JSON');
      }
    });

    it('answers 413 PAYLOAD_TOO_LARGE for an oversized body, without hashing anything', async () => {
      const res = await api.register(app, {
        name: 'Maria', email: uniqueEmail('big'), password: STRONG_PASSWORD, padding: 'x'.repeat(20 * 1024),
      });

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('is not fooled by SQL in any field: the input is data, and the tables survive', async () => {
      const email = uniqueEmail('sqli');
      const name = "Robert'); DROP TABLE users;--";
      const res = await api.register(app, { name, email, password: STRONG_PASSWORD });
      track(res.body.data.user);

      expect(res.status).toBe(201);
      expect(res.body.data.user.name).toBe(name);

      const attempts = [
        { email: "' OR '1'='1", password: "' OR '1'='1" },
        { email: "admin@example.test' --", password: WRONG },
        { email, password: "' OR '1'='1" },
        { email: `${email}' OR 1=1 --`, password: STRONG_PASSWORD },
      ];
      for (const attempt of attempts) {
        const login = await api.login(app, attempt);
        expect(login.status).toBe(401);
        expect(findSetCookie(login, cookieName)).toBeUndefined();
      }
      // still there, still working
      expect((await api.login(app, { email, password: STRONG_PASSWORD })).status).toBe(200);
      expect((await pool.query("SELECT to_regclass('public.users') AS t")).rows[0].t).toBe('users');
    });

    it('rejects an object where a string is expected (NoSQL-style operator injection)', async () => {
      const res = await api.login(app, { email: { $gt: '' }, password: { $gt: '' } });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('rate limits', () => {
    it('sign-ups are limited per address: the request over the limit gets 429 and creates nothing', async () => {
      const { app } = buildAuthApp({ db: pool, rateLimits: { register: { limit: 2 } } });
      const attempt = () => api.register(app, { name: 'Maria', email: uniqueEmail('rl'), password: STRONG_PASSWORD });

      const [a, b, c] = [await attempt(), await attempt(), await attempt()];
      [a, b].forEach((r) => track(r.body.data.user));

      expect([a.status, b.status, c.status]).toEqual([201, 201, 429]);
      expect(c.body.error.code).toBe('RATE_LIMITED');
      expect(c.body.error.requestId).toBe(c.headers['x-request-id']);
      expect(c.headers.ratelimit || c.headers['ratelimit-limit']).toBeDefined();
    });

    describe('login (failed attempts only)', () => {
      it('per address + account: once over the limit even the CORRECT password is refused, other accounts are unaffected', async () => {
        const { app, cookieName } = buildAuthApp({ db: pool, rateLimits: { loginPerIpAndEmail: { limit: 3 } } });
        const victim = await registerUser(app, cookieName);
        const other = await registerUser(app, cookieName);
        track(victim.user); track(other.user);

        const wrong = [];
        for (let i = 0; i < 3; i += 1) wrong.push((await api.login(app, { email: victim.email, password: WRONG })).status);
        const blocked = await api.login(app, { email: victim.email, password: WRONG });
        const blockedEvenIfCorrect = await api.login(app, { email: victim.email, password: victim.password });
        const otherAccount = await api.login(app, { email: other.email, password: other.password });

        expect(wrong).toEqual([401, 401, 401]);
        expect(blocked.status).toBe(429);
        expect(blocked.body.error.code).toBe('RATE_LIMITED');
        expect(blockedEvenIfCorrect.status).toBe(429);
        expect(findSetCookie(blockedEvenIfCorrect, cookieName)).toBeUndefined();
        expect(otherAccount.status).toBe(200);
      });

      it('successful logins are never counted, however many', async () => {
        const { app, cookieName } = buildAuthApp({
          db: pool, rateLimits: { loginPerIp: { limit: 2 }, loginPerIpAndEmail: { limit: 2 }, loginPerEmail: { limit: 2 } },
        });
        const account = await registerUser(app, cookieName);
        track(account.user);

        const statuses = [];
        for (let i = 0; i < 6; i += 1) statuses.push((await api.login(app, { email: account.email, password: account.password })).status);

        expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
      });

      it('a successful login clears the account\'s failure counters (earlier typos do not linger)', async () => {
        const { app, cookieName } = buildAuthApp({ db: pool, rateLimits: { loginPerIpAndEmail: { limit: 3 }, loginPerEmail: { limit: 3 } } });
        const account = await registerUser(app, cookieName);
        track(account.user);

        await api.login(app, { email: account.email, password: WRONG });
        await api.login(app, { email: account.email, password: WRONG });
        expect((await api.login(app, { email: account.email, password: account.password })).status).toBe(200);

        const after = [];
        for (let i = 0; i < 3; i += 1) after.push((await api.login(app, { email: account.email, password: WRONG })).status);
        expect(after).toEqual([401, 401, 401]);
      });

      it('per account from ANY address: a distributed guessing run against one account is stopped', async () => {
        const { app, cookieName } = buildAuthApp({ db: pool, trustProxy: 1, rateLimits: { loginPerEmail: { limit: 3 } } });
        const victim = await registerUser(app, cookieName);
        const other = await registerUser(app, cookieName);
        track(victim.user); track(other.user);

        const fromManyIps = [];
        for (let n = 1; n <= 3; n += 1) {
          fromManyIps.push((await api.login(app, { email: victim.email, password: WRONG }, { headers: fromIp(n) })).status);
        }
        const fourthNewIp = await api.login(app, { email: victim.email, password: WRONG }, { headers: fromIp(4) });
        const otherAccount = await api.login(app, { email: other.email, password: other.password }, { headers: fromIp(5) });

        expect(fromManyIps).toEqual([401, 401, 401]);
        expect(fourthNewIp.status).toBe(429);
        expect(otherAccount.status).toBe(200);
      });

      it('per address: one source spraying many accounts is stopped', async () => {
        const { app } = buildAuthApp({ db: pool, trustProxy: 1, rateLimits: { loginPerIp: { limit: 3 } } });

        const spray = [];
        for (let i = 0; i < 3; i += 1) spray.push((await api.login(app, { email: uniqueEmail('spray'), password: WRONG }, { headers: fromIp(50) })).status);
        const next = await api.login(app, { email: uniqueEmail('spray'), password: WRONG }, { headers: fromIp(50) });
        const otherSource = await api.login(app, { email: uniqueEmail('spray'), password: WRONG }, { headers: fromIp(51) });

        expect(spray).toEqual([401, 401, 401]);
        expect(next.status).toBe(429);
        expect(otherSource.status).toBe(401);
      });

      it('an unknown e-mail is limited exactly like a known one (the limiter does not reveal accounts)', async () => {
        const { app, cookieName } = buildAuthApp({ db: pool, rateLimits: { loginPerIpAndEmail: { limit: 2 } } });
        const known = await registerUser(app, cookieName);
        track(known.user);
        const unknownEmail = uniqueEmail('ghost');

        const run = async (email) => {
          const statuses = [];
          for (let i = 0; i < 3; i += 1) statuses.push((await api.login(app, { email, password: WRONG })).status);
          return statuses;
        };

        expect(await run(known.email)).toEqual([401, 401, 429]);
        expect(await run(unknownEmail)).toEqual([401, 401, 429]);
      });
    });

    describe('GET /api/v1/locations/analyze (per user)', () => {
      const good = { location: 'Vila Velha, ES', businessType: 'gym', radius: 5 };

      it('caps the analyses of each user separately: the extra one is 429 and other users are unaffected', async () => {
        const { app, cookieName } = buildAuthApp({ db: pool, analyzeRateLimit: { windowMs: 3600000, limit: 2 } });
        const a = await registerUser(app, cookieName);
        const b = await registerUser(app, cookieName);
        track(a.user); track(b.user);

        const asA = [];
        for (let i = 0; i < 3; i += 1) asA.push(await api.analyze(app, good, { cookie: a.cookie }));
        const asB = await api.analyze(app, good, { cookie: b.cookie });

        expect(asA.map((r) => r.status)).toEqual([200, 200, 429]);
        expect(asA[2].body.error.code).toBe('RATE_LIMITED');
        expect(asA[2].body.error.requestId).toBe(asA[2].headers['x-request-id']);
        expect(asB.status).toBe(200);
      });

      it('follows the user, not the address: the same user on another address shares the quota', async () => {
        const { app, cookieName } = buildAuthApp({ db: pool, trustProxy: 1, analyzeRateLimit: { windowMs: 3600000, limit: 2 } });
        const account = await registerUser(app, cookieName);
        track(account.user);

        const statuses = [];
        for (let n = 1; n <= 3; n += 1) statuses.push((await api.analyze(app, good, { cookie: account.cookie, headers: fromIp(n) })).status);

        expect(statuses).toEqual([200, 200, 429]);
      });

      it('does not charge invalid requests to the quota', async () => {
        const { app, cookieName } = buildAuthApp({ db: pool, analyzeRateLimit: { windowMs: 3600000, limit: 2 } });
        const account = await registerUser(app, cookieName);
        track(account.user);

        for (let i = 0; i < 5; i += 1) {
          expect((await api.analyze(app, { businessType: 'gym' }, { cookie: account.cookie })).status).toBe(400);
        }
        const valid = [];
        for (let i = 0; i < 3; i += 1) valid.push((await api.analyze(app, good, { cookie: account.cookie })).status);

        expect(valid).toEqual([200, 200, 429]);
      });

      it('unauthenticated requests get 401 and consume nobody\'s quota', async () => {
        const { app, cookieName } = buildAuthApp({ db: pool, analyzeRateLimit: { windowMs: 3600000, limit: 1 } });
        const account = await registerUser(app, cookieName);
        track(account.user);

        for (let i = 0; i < 4; i += 1) expect((await api.analyze(app, good)).status).toBe(401);

        expect((await api.analyze(app, good, { cookie: account.cookie })).status).toBe(200);
      });

      it('is configured, by default, as 30 analyses per user per hour', () => {
        const env = loadEnv({});

        expect(env.ANALYZE_RATE_LIMIT_MAX).toBe(30);
        expect(env.ANALYZE_RATE_LIMIT_WINDOW_MINUTES).toBe(60);
        expect(loadEnv({ ANALYZE_RATE_LIMIT_MAX: '5', ANALYZE_RATE_LIMIT_WINDOW_MINUTES: '10' })).toMatchObject({
          ANALYZE_RATE_LIMIT_MAX: 5, ANALYZE_RATE_LIMIT_WINDOW_MINUTES: 10,
        });
      });
    });
  });

  describe('cookies as credentials', () => {
    it('a cookie signed with a different secret is rejected even when the session id is real', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool });
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);
      const sid = sessionIdOf(cookie.split('=')[1]);
      const forged = `${cookieName}=${encodeURIComponent(signSessionId(sid, 'some-other-secret-that-the-server-does-not-know'))}`;

      expect((await api.me(app, { cookie })).status).toBe(200);
      expect((await api.me(app, { cookie: forged })).status).toBe(401);
    });

    it('the cookie pair of two logins are different sessions of the same user', async () => {
      const { app, cookieName } = buildAuthApp({ db: pool });
      const account = await registerUser(app, cookieName);
      track(account.user);

      const second = cookiePair(await api.login(app, { email: account.email, password: account.password }), cookieName);

      expect(second).not.toBe(account.cookie);
      expect((await api.me(app, { cookie: account.cookie })).status).toBe(200);
      expect((await api.me(app, { cookie: second })).status).toBe(200);
    });
  });
});
