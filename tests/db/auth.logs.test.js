'use strict';

const { createTestPool, deleteUsers, uniqueEmail } = require('../helpers/db');
const {
  STRONG_PASSWORD, api, buildAuthApp, cookiePair, createCaptureStream, sessionIdOf, sleep,
} = require('../helpers/authApp');
const { createLogger } = require('../../src/utils/logger');

describe('what the logs contain during authentication (real PostgreSQL)', () => {
  let pool;
  const userIds = [];

  beforeAll(() => { pool = createTestPool(); });

  afterAll(async () => {
    await deleteUsers(pool, userIds);
    await pool.end();
  });

  it('never contains a password, a password hash, a session cookie or a session id', async () => {
    const capture = createCaptureStream();
    const { app, cookieName } = buildAuthApp({ db: pool, logger: createLogger(capture, { level: 'info' }) });
    const email = uniqueEmail('logs');
    const wrongPassword = 'Wrong-Password-That-Was-Typed-3';

    const registered = await api.register(app, { name: 'Maria Souza', email, password: STRONG_PASSWORD });
    userIds.push(registered.body.data.user.id);
    const registerCookie = cookiePair(registered, cookieName);
    const failed = await api.login(app, { email, password: wrongPassword });
    const login = await api.login(app, { email, password: STRONG_PASSWORD }, { cookie: registerCookie });
    const loginCookie = cookiePair(login, cookieName);
    await api.me(app, { cookie: loginCookie });
    await api.analyze(app, undefined, { cookie: loginCookie });
    await api.logout(app, { cookie: loginCookie });
    await api.me(app, { cookie: loginCookie }); // now 401
    await sleep(50); // pino-http writes on the response's "finish"

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [registered.body.data.user.id]);
    const text = capture.text();
    const forbidden = {
      'the password': STRONG_PASSWORD,
      'a wrong password': wrongPassword,
      'the stored hash': rows[0].password_hash,
      'the hash body': rows[0].password_hash.split('$').pop(),
      'the register cookie value': registerCookie.split('=')[1],
      'the login cookie value': loginCookie.split('=')[1],
      'the register session id': sessionIdOf(registerCookie.split('=')[1]),
      'the login session id': sessionIdOf(loginCookie.split('=')[1]),
      'the decoded login cookie': decodeURIComponent(loginCookie.split('=')[1]),
    };
    Object.entries(forbidden).forEach(([label, secret]) => {
      expect([label, text.includes(secret)]).toEqual([label, false]);
    });
    expect(failed.status).toBe(401);
  });

  it('records who did what with ids and hashes, never with addresses: register, login, failed login, logout', async () => {
    const capture = createCaptureStream();
    const { app, cookieName } = buildAuthApp({ db: pool, logger: createLogger(capture, { level: 'info' }) });
    const email = uniqueEmail('events');

    const registered = await api.register(app, { name: 'Maria Souza', email, password: STRONG_PASSWORD });
    const userId = registered.body.data.user.id;
    userIds.push(userId);
    await api.login(app, { email, password: 'Wrong-Password-That-Was-Typed-3' });
    const login = await api.login(app, { email, password: STRONG_PASSWORD });
    await api.logout(app, { cookie: cookiePair(login, cookieName) });
    await sleep(50);

    const events = capture.entries().filter((entry) => entry.event);
    expect(events.map((e) => e.event)).toEqual(['auth.register', 'auth.login_failed', 'auth.login', 'auth.logout']);
    expect(events[0].userId).toBe(userId);
    expect(events[2].userId).toBe(userId);
    expect(events[3].userId).toBe(userId);
    expect(events[1].emailHash).toMatch(/^[0-9a-f]{24}$/);
    expect(events[1].userId).toBeUndefined();

    // the address itself appears nowhere in the log (it only travels in the request body)
    expect(capture.text()).not.toContain(email);
  });

  it('control: WITHOUT the redaction rules the same traffic does leak the cookie (so the checks above can fail)', async () => {
    const pino = require('pino');
    const capture = createCaptureStream();
    const { app, cookieName } = buildAuthApp({ db: pool, logger: pino({ level: 'info' }, capture) });

    const registered = await api.register(app, { name: 'Maria Souza', email: uniqueEmail('control'), password: STRONG_PASSWORD });
    userIds.push(registered.body.data.user.id);
    const cookie = cookiePair(registered, cookieName);
    await api.me(app, { cookie });
    await sleep(50);

    expect(capture.text()).toContain(cookie.split('=')[1]);
  });

  it('redacts credential-looking fields even if some code logged them by mistake', () => {
    const capture = createCaptureStream();
    const logger = createLogger(capture, { level: 'info' });

    logger.info({ password: 'plain-1', passwordHash: 'hash-1', user: { password: 'plain-2', password_hash: 'hash-2', passwordHash: 'hash-3' } }, 'oops');

    const text = capture.text();
    ['plain-1', 'plain-2', 'hash-1', 'hash-2', 'hash-3'].forEach((secret) => expect(text).not.toContain(secret));
  });
});
