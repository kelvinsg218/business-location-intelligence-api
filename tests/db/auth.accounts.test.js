'use strict';

const crypto = require('crypto');
const argon2 = require('argon2');
const { createTestPool, deleteUsers, uniqueEmail } = require('../helpers/db');
const {
  STRONG_PASSWORD, api, buildAuthApp, cookiePair, findSetCookie, registerUser, sessionIdOf,
} = require('../helpers/authApp');
const { hashSessionId } = require('../../src/modules/auth/pgSessionStore');

describe('accounts: register, login, me, logout (real PostgreSQL)', () => {
  let pool;
  let app;
  let cookieName;
  const userIds = [];

  const userRow = async (email) => (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
  const sessionCountFor = async (userId) => Number((await pool.query('SELECT count(*) FROM sessions WHERE user_id = $1', [userId])).rows[0].count);
  const track = (user) => { userIds.push(user.id); return user; };

  beforeAll(() => {
    pool = createTestPool();
    ({ app, cookieName } = buildAuthApp({ db: pool }));
  });

  afterAll(async () => {
    await deleteUsers(pool, userIds);
    await pool.end();
  });

  describe('POST /api/v1/auth/register', () => {
    it('creates the account, signs the user in and returns only the public user', async () => {
      const email = uniqueEmail('reg');
      const res = await api.register(app, { name: 'Maria Souza', email, password: STRONG_PASSWORD });
      track(res.body.data.user);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(Object.keys(res.body.data)).toEqual(['user']);
      expect(Object.keys(res.body.data.user).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
      expect(res.body.data.user).toMatchObject({ name: 'Maria Souza', email });
      expect(res.body.data.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(new Date(res.body.data.user.createdAt).toString()).not.toBe('Invalid Date');
      expect(findSetCookie(res, cookieName)).toBeDefined();
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('never returns the password or its hash, in any form', async () => {
      const res = await api.register(app, { name: 'Maria Souza', email: uniqueEmail('reg'), password: STRONG_PASSWORD });
      track(res.body.data.user);

      const text = JSON.stringify(res.body).toLowerCase();
      expect(text).not.toContain('password');
      expect(text).not.toContain('argon2');
      expect(text).not.toContain('hash');
      expect(text).not.toContain(STRONG_PASSWORD.toLowerCase());
    });

    it('stores a normalized e-mail and a trimmed name', async () => {
      const local = `Mixed.Case-${crypto.randomUUID()}`;
      const res = await api.register(app, { name: '  Maria Souza  ', email: `  ${local}@Example.TEST  `, password: STRONG_PASSWORD });
      track(res.body.data.user);

      expect(res.status).toBe(201);
      const expected = `${local}@example.test`.toLowerCase();
      expect(res.body.data.user.email).toBe(expected);
      const row = await userRow(expected);
      expect(row.email).toBe(expected);
      expect(row.name).toBe('Maria Souza');
    });

    it('hashes the password with Argon2id (19456 KiB, 2 passes, 1 lane) and never stores the plaintext', async () => {
      const email = uniqueEmail('hash');
      const res = await api.register(app, { name: 'Maria Souza', email, password: STRONG_PASSWORD });
      track(res.body.data.user);

      const row = await userRow(email);
      // (the argon2 library writes the PHC parameters in the order m, p, t)
      expect(row.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
      expect(row.password_hash).not.toContain(STRONG_PASSWORD);
      await expect(argon2.verify(row.password_hash, STRONG_PASSWORD)).resolves.toBe(true);

      // The plaintext appears in no column of any table that was touched.
      const users = await pool.query('SELECT users::text AS t FROM users WHERE id = $1', [row.id]);
      const sessions = await pool.query('SELECT sessions::text AS t FROM sessions WHERE user_id = $1', [row.id]);
      expect(JSON.stringify([...users.rows, ...sessions.rows])).not.toContain(STRONG_PASSWORD);
    });

    it('gives two users with the same password different hashes (unique salts)', async () => {
      const a = await registerUser(app, cookieName);
      const b = await registerUser(app, cookieName, { password: a.password });
      track(a.user); track(b.user);

      const [rowA, rowB] = await Promise.all([userRow(a.email), userRow(b.email)]);
      expect(rowA.password_hash).not.toBe(rowB.password_hash);
    });

    it('starts a session that is stored under a hash of the id, not the id itself', async () => {
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);

      const sid = sessionIdOf(cookie.split('=')[1]);
      const { rows } = await pool.query('SELECT id_hash, user_id FROM sessions WHERE user_id = $1', [user.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].id_hash).toEqual(hashSessionId(sid));
      expect(rows[0].user_id).toBe(user.id);
    });

    it('ignores an id / userId / createdAt smuggled into the body: the id is generated by the server', async () => {
      const email = uniqueEmail('inject');
      const forgedId = '11111111-1111-4111-8111-111111111111';
      const res = await api.register(app, {
        name: 'Maria Souza', email, password: STRONG_PASSWORD, id: forgedId, userId: forgedId, createdAt: '2001-01-01T00:00:00Z',
      });
      track(res.body.data.user);

      expect(res.status).toBe(201);
      expect(res.body.data.user.id).not.toBe(forgedId);
      expect(res.body.data.user.createdAt).not.toMatch(/^2001/);
    });

    describe('duplicate e-mail', () => {
      it('answers 409 EMAIL_ALREADY_REGISTERED, without a cookie, and keeps a single account', async () => {
        const first = await registerUser(app, cookieName);
        track(first.user);

        const second = await api.register(app, { name: 'Someone Else', email: first.email, password: 'A-Totally-Different-Pass-77' });

        expect(second.status).toBe(409);
        expect(second.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
        expect(findSetCookie(second, cookieName)).toBeUndefined();
        const { rows } = await pool.query('SELECT count(*) FROM users WHERE email = $1', [first.email]);
        expect(Number(rows[0].count)).toBe(1);
        // ... and the first account still has its own password
        expect((await api.login(app, { email: first.email, password: first.password })).status).toBe(200);
      });

      it('treats the e-mail case- and whitespace-insensitively', async () => {
        const first = await registerUser(app, cookieName);
        track(first.user);

        const second = await api.register(app, { name: 'Maria', email: `  ${first.email.toUpperCase()} `, password: STRONG_PASSWORD });
        expect(second.status).toBe(409);
      });

      it('lets exactly one of two simultaneous sign-ups win', async () => {
        const email = uniqueEmail('race');
        const body = { name: 'Maria Souza', email, password: STRONG_PASSWORD };
        const results = await Promise.all([api.register(app, body), api.register(app, body), api.register(app, body)]);

        results.filter((r) => r.status === 201).forEach((r) => track(r.body.data.user));
        expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
        expect(Number((await pool.query('SELECT count(*) FROM users WHERE email = $1', [email])).rows[0].count)).toBe(1);
      });
    });

    describe('validation -> 400 VALIDATION_ERROR with per-field codes', () => {
      const valid = () => ({ name: 'Maria Souza', email: uniqueEmail('val'), password: STRONG_PASSWORD });

      const cases = [
        ['a missing name', (b) => { delete b.name; }, { field: 'name', code: 'NAME_REQUIRED' }],
        ['a blank name', (b) => { b.name = '   '; }, { field: 'name', code: 'NAME_REQUIRED' }],
        ['a non-string name', (b) => { b.name = 42; }, { field: 'name', code: 'NAME_REQUIRED' }],
        ['a name over 100 characters', (b) => { b.name = 'n'.repeat(101); }, { field: 'name', code: 'NAME_TOO_LONG' }],
        ['a name with control characters', (b) => { b.name = 'Maria\nSouza'; }, { field: 'name', code: 'NAME_INVALID' }],
        ['a missing e-mail', (b) => { delete b.email; }, { field: 'email', code: 'EMAIL_REQUIRED' }],
        ['an invalid e-mail', (b) => { b.email = 'not-an-email'; }, { field: 'email', code: 'EMAIL_INVALID' }],
        ['an e-mail without a domain dot', (b) => { b.email = 'maria@localhost'; }, { field: 'email', code: 'EMAIL_INVALID' }],
        ['an e-mail over 254 characters', (b) => { b.email = `${'a'.repeat(250)}@example.test`; }, { field: 'email', code: 'EMAIL_TOO_LONG' }],
        ['a missing password', (b) => { delete b.password; }, { field: 'password', code: 'PASSWORD_REQUIRED' }],
        ['a non-string password', (b) => { b.password = 12345678901234; }, { field: 'password', code: 'PASSWORD_REQUIRED' }],
        ['a password of 11 characters', (b) => { b.password = 'Abcdefgh-12'; }, { field: 'password', code: 'PASSWORD_TOO_SHORT' }],
        ['a password of 129 characters', (b) => { b.password = 'aB3-'.repeat(32) + 'x'; }, { field: 'password', code: 'PASSWORD_TOO_LONG' }],
        ['a very common password', (b) => { b.password = 'password1234'; }, { field: 'password', code: 'PASSWORD_TOO_COMMON' }],
        ['a keyboard-walk password', (b) => { b.password = 'qwertyuiop12'; }, { field: 'password', code: 'PASSWORD_TOO_COMMON' }],
        ['a repeated-character password', (b) => { b.password = 'aaaaaaaaaaaa'; }, { field: 'password', code: 'PASSWORD_TOO_COMMON' }],
        ['a password that is the e-mail', (b) => { b.email = 'mariasouza2024@example.test'; b.password = 'mariasouza2024'; }, { field: 'password', code: 'PASSWORD_CONTAINS_PERSONAL_INFO' }],
      ];

      it.each(cases)('rejects %s', async (_label, mutate, expected) => {
        const body = valid();
        mutate(body);
        const res = await api.register(app, body);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining(expected)]));
        expect(findSetCookie(res, cookieName)).toBeUndefined();
        const created = await pool.query('SELECT count(*) FROM users WHERE email = $1', [String(body.email).trim().toLowerCase()]);
        expect(Number(created.rows[0].count)).toBe(0);
      });

      it('reports every field problem at once', async () => {
        const res = await api.register(app, { name: '', email: 'nope', password: 'short' });

        expect(res.status).toBe(400);
        expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['email', 'name', 'password']);
      });

      it('accepts a 12-character and a 128-character password (the exact bounds)', async () => {
        const at12 = await api.register(app, { name: 'Maria', email: uniqueEmail('b12'), password: 'Zx9-Lmnop-Qr' });
        const at128 = await api.register(app, { name: 'Maria', email: uniqueEmail('b128'), password: `Zx9-${'lmnopqrstuvw'.repeat(11)}${'abcdefgh'.slice(0, 4)}`.slice(0, 128) });
        [at12, at128].forEach((r) => { if (r.status === 201) track(r.body.data.user); });

        expect(at12.status).toBe(201);
        expect(at128.status).toBe(201);
      });

      it('accepts a long passphrase with spaces and no composition (no upper/digit/symbol rules)', async () => {
        const res = await api.register(app, { name: 'Maria', email: uniqueEmail('phrase'), password: 'correct horse battery staple' });
        if (res.status === 201) track(res.body.data.user);
        expect(res.status).toBe(201);
      });

      it('answers 400 (not a crash) for a body that is not a JSON object', async () => {
        const arrayBody = await api.register(app, []);
        const noBody = await api.register(app, undefined);

        [arrayBody, noBody].forEach((res) => {
          expect(res.status).toBe(400);
          expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });
      });
    });

    it('answers 403 REGISTRATION_DISABLED when registration is closed, creating nothing and still allowing login', async () => {
      const existing = await registerUser(app, cookieName);
      track(existing.user);
      const closed = buildAuthApp({ db: pool, registrationEnabled: false }).app;

      const email = uniqueEmail('closed');
      const attempt = await api.register(closed, { name: 'Maria', email, password: STRONG_PASSWORD });

      expect(attempt.status).toBe(403);
      expect(attempt.body.error.code).toBe('REGISTRATION_DISABLED');
      expect(await userRow(email)).toBeUndefined();
      expect((await api.login(closed, { email: existing.email, password: existing.password })).status).toBe(200);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let account;

    beforeAll(async () => {
      account = await registerUser(app, cookieName);
      track(account.user);
    });

    it('signs in with the right credentials and returns the public user', async () => {
      const res = await api.login(app, { email: account.email, password: account.password });

      expect(res.status).toBe(200);
      expect(res.body.data.user).toEqual(account.user);
      expect(findSetCookie(res, cookieName)).toBeDefined();
      expect(JSON.stringify(res.body).toLowerCase()).not.toMatch(/password|argon2|hash/);
    });

    it('matches the e-mail regardless of case and surrounding spaces', async () => {
      const res = await api.login(app, { email: `  ${account.email.toUpperCase()}  `, password: account.password });
      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(account.user.id);
    });

    it('matches the password regardless of Unicode normalization form (NFC vs NFD)', async () => {
      const composed = 'Pão-de-queijo-Mineiro-2024'.normalize('NFC');
      const decomposed = composed.normalize('NFD');
      expect(decomposed).not.toBe(composed);

      const unicode = await registerUser(app, cookieName, { password: composed });
      track(unicode.user);
      const res = await api.login(app, { email: unicode.email, password: decomposed });

      expect(res.status).toBe(200);
    });

    describe('wrong credentials -> the same 401 INVALID_CREDENTIALS', () => {
      const scrub = (body) => {
        const copy = JSON.parse(JSON.stringify(body));
        delete copy.error.requestId;
        return copy;
      };

      it('does not tell a wrong password from an unknown e-mail: identical status, body and headers', async () => {
        const wrongPassword = await api.login(app, { email: account.email, password: 'Wrong-Password-For-Sure-1' });
        const unknownEmail = await api.login(app, { email: uniqueEmail('ghost'), password: 'Wrong-Password-For-Sure-1' });

        expect(wrongPassword.status).toBe(401);
        expect(unknownEmail.status).toBe(401);
        expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
        expect(scrub(wrongPassword.body)).toEqual(scrub(unknownEmail.body));
        expect(findSetCookie(wrongPassword, cookieName)).toBeUndefined();
        expect(findSetCookie(unknownEmail, cookieName)).toBeUndefined();
        expect(wrongPassword.headers['content-length']).toBe(unknownEmail.headers['content-length']);
      });

      it('answers the same for a password beyond the maximum length and an e-mail beyond the maximum length', async () => {
        const tooLongPassword = await api.login(app, { email: account.email, password: 'x'.repeat(500) });
        const tooLongEmail = await api.login(app, { email: `${'a'.repeat(300)}@example.test`, password: account.password });
        const malformedEmail = await api.login(app, { email: 'not-an-email', password: account.password });

        [tooLongPassword, tooLongEmail, malformedEmail].forEach((res) => {
          expect(res.status).toBe(401);
          expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
        });
      });

      it('does not create a session on a failed login', async () => {
        const before = await sessionCountFor(account.user.id);
        await api.login(app, { email: account.email, password: 'Wrong-Password-For-Sure-1' });
        expect(await sessionCountFor(account.user.id)).toBe(before);
      });

      it('spends comparable time on an unknown e-mail and on a wrong password (no account enumeration by timing)', async () => {
        const time = async (email) => {
          const start = process.hrtime.bigint();
          await api.login(app, { email, password: 'Wrong-Password-For-Sure-1' });
          return Number(process.hrtime.bigint() - start) / 1e6;
        };
        // warm up (first Argon2 call, dummy-hash creation)
        await time(uniqueEmail('warm'));
        const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
        const known = []; const unknown = [];
        for (let i = 0; i < 5; i += 1) {
          known.push(await time(account.email));
          unknown.push(await time(uniqueEmail('ghost')));
        }

        // Without the dummy verification an unknown e-mail would be answered
        // in ~1 ms; with it both take one Argon2 verification.
        expect(median(unknown)).toBeGreaterThan(median(known) * 0.5);
      });
    });

    describe('validation', () => {
      it.each([
        ['a missing e-mail', { password: 'x' }, 'email', 'EMAIL_REQUIRED'],
        ['a missing password', { email: 'a@b.co' }, 'password', 'PASSWORD_REQUIRED'],
        ['a non-string e-mail', { email: { $ne: null }, password: 'x' }, 'email', 'EMAIL_REQUIRED'],
        ['a non-string password', { email: 'a@b.co', password: ['x'] }, 'password', 'PASSWORD_REQUIRED'],
      ])('answers 400 for %s', async (_label, body, field, code) => {
        const res = await api.login(app, body);

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field, code })]));
      });
    });

    it('upgrades a hash made with weaker parameters on a successful login', async () => {
      const email = uniqueEmail('rehash');
      const weak = await argon2.hash(STRONG_PASSWORD, {
        type: argon2.argon2id, memoryCost: 8192, timeCost: 1, parallelism: 1,
      });
      const { rows } = await pool.query('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id', [email, 'Old Hash', weak]);
      userIds.push(rows[0].id);
      expect(weak).toContain('m=8192,p=1,t=1');

      const res = await api.login(app, { email, password: STRONG_PASSWORD });

      expect(res.status).toBe(200);
      const upgraded = (await userRow(email)).password_hash;
      expect(upgraded).toMatch(/\$m=19456,p=1,t=2\$/);
      await expect(argon2.verify(upgraded, STRONG_PASSWORD)).resolves.toBe(true);
      expect((await api.login(app, { email, password: STRONG_PASSWORD })).status).toBe(200);
    });

    it('does not sign in with a corrupted stored hash, and does not crash', async () => {
      const email = uniqueEmail('corrupt');
      const { rows } = await pool.query(
        'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [email, 'Corrupt', '$argon2id$v=19$m=19456,t=2,p=1$bm90LWEtcmVhbC1oYXNo$AAAA'],
      );
      userIds.push(rows[0].id);

      const res = await api.login(app, { email, password: STRONG_PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns the signed-in user, uncached', async () => {
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);

      const res = await api.me(app, { cookie });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { user } });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('answers 401 UNAUTHENTICATED without a cookie', async () => {
      const res = await api.me(app);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });

    it('answers 401 for a cookie with a bad signature, a garbage value or an unknown session', async () => {
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);
      const tampered = `${cookie.slice(0, -3)}AAA`;

      const results = await Promise.all([
        api.me(app, { cookie: tampered }),
        api.me(app, { cookie: `${cookieName}=garbage` }),
        api.me(app, { cookie: `${cookieName}=s%3Aunknown-sid.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` }),
      ]);
      results.forEach((res) => {
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      });
    });

    it('answers 401 once the account is deleted (its sessions go with it)', async () => {
      const { user, cookie } = await registerUser(app, cookieName);
      expect((await api.me(app, { cookie })).status).toBe(200);

      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

      expect((await api.me(app, { cookie })).status).toBe(401);
      expect(await sessionCountFor(user.id)).toBe(0);
    });

    it('identifies each user by their own session, never by anything in the request', async () => {
      const a = await registerUser(app, cookieName);
      const b = await registerUser(app, cookieName);
      track(a.user); track(b.user);

      const asA = await api.me(app, { cookie: a.cookie, headers: { 'X-User-Id': b.user.id } });
      const asB = await api.me(app, { cookie: b.cookie });

      expect(asA.body.data.user.id).toBe(a.user.id);
      expect(asB.body.data.user.id).toBe(b.user.id);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('destroys the session, clears the cookie and makes the old cookie useless', async () => {
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);
      expect(await sessionCountFor(user.id)).toBe(1);

      const res = await api.logout(app, { cookie });

      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      const cleared = findSetCookie(res, cookieName);
      expect(cleared).toBeDefined();
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(cleared).toMatch(/HttpOnly/i);
      expect(cleared).toMatch(/Path=\//);
      expect(await sessionCountFor(user.id)).toBe(0);
      expect((await api.me(app, { cookie })).status).toBe(401);
      expect((await api.analyze(app, undefined, { cookie })).status).toBe(401);
    });

    it('only ends the session it was called with: the same user stays signed in elsewhere', async () => {
      const account = await registerUser(app, cookieName);
      track(account.user);
      const otherDevice = cookiePair(await api.login(app, { email: account.email, password: account.password }), cookieName);

      await api.logout(app, { cookie: account.cookie });

      expect((await api.me(app, { cookie: account.cookie })).status).toBe(401);
      expect((await api.me(app, { cookie: otherDevice })).status).toBe(200);
    });

    it('is idempotent: 204 without a session, and twice in a row', async () => {
      const { user, cookie } = await registerUser(app, cookieName);
      track(user);

      expect((await api.logout(app)).status).toBe(204);
      expect((await api.logout(app, { cookie })).status).toBe(204);
      expect((await api.logout(app, { cookie })).status).toBe(204);
    });
  });
});
