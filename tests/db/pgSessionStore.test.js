'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const { PgSessionStore, hashSessionId, startSessionPruning } = require('../../src/modules/auth/pgSessionStore');
const {
  createTestPool, deleteUsers, insertUser,
} = require('../helpers/db');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const IDLE = 7 * DAY;
const ABSOLUTE = 30 * DAY;
const TOUCH_INTERVAL = 5 * 60 * 1000;

describe('PgSessionStore (real PostgreSQL)', () => {
  let pool;
  let store;
  let clockMs;
  let user;
  const userIds = [];

  const newSid = () => crypto.randomBytes(24).toString('base64url');
  const sessionFor = (userId, extra = {}) => ({
    cookie: {
      originalMaxAge: ABSOLUTE, expires: new Date(clockMs + ABSOLUTE).toISOString(), httpOnly: true, path: '/', sameSite: 'strict',
    },
    userId,
    ...extra,
  });
  const rowFor = async (sid) => (await pool.query('SELECT * FROM sessions WHERE id_hash = $1', [hashSessionId(sid)])).rows[0];
  const advance = (ms) => { clockMs += ms; };

  beforeAll(async () => {
    pool = createTestPool();
    user = await insertUser(pool);
    userIds.push(user.id);
  });

  beforeEach(() => {
    clockMs = Date.parse('2026-01-01T00:00:00Z');
    store = new PgSessionStore({
      db: pool, idleTtlMs: IDLE, absoluteTtlMs: ABSOLUTE, touchIntervalMs: TOUCH_INTERVAL, now: () => new Date(clockMs),
    });
  });

  afterAll(async () => {
    await deleteUsers(pool, userIds);
    await pool.end();
  });

  describe('construction', () => {
    it('validates its configuration', () => {
      expect(() => new PgSessionStore({ idleTtlMs: 1, absoluteTtlMs: 2 })).toThrow(/db/);
      expect(() => new PgSessionStore({ db: pool, idleTtlMs: 0, absoluteTtlMs: 2 })).toThrow(/positive/);
      expect(() => new PgSessionStore({ db: pool, idleTtlMs: 5, absoluteTtlMs: 2 })).toThrow(/longer/);
    });
  });

  describe('storage', () => {
    it('stores only sha256(sid) as the key, never the session id itself', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));

      const row = await rowFor(sid);
      expect(row.id_hash).toEqual(crypto.createHash('sha256').update(sid).digest());
      expect(row.id_hash).toHaveLength(32);
      const everything = await pool.query('SELECT id_hash::text AS h, data::text AS d FROM sessions WHERE user_id = $1', [user.id]);
      expect(JSON.stringify(everything.rows)).not.toContain(sid);
    });

    it('round-trips the session payload and records the owner in user_id', async () => {
      const sid = newSid();
      const sess = sessionFor(user.id, { custom: 'value' });
      await store.saveSession(sid, sess);

      await expect(store.findSession(sid)).resolves.toEqual(sess);
      expect((await rowFor(sid)).user_id).toBe(user.id);
    });

    it('sets idle expiry = now + 7 days and absolute expiry = now + 30 days', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));

      const row = await rowFor(sid);
      expect(row.expires_at.getTime()).toBe(clockMs + IDLE);
      expect(row.absolute_expires_at.getTime()).toBe(clockMs + ABSOLUTE);
      expect(row.created_at.getTime()).toBe(clockMs);
    });

    it('does not persist an anonymous session (no userId): visitors leave no rows behind', async () => {
      const sid = newSid();
      await store.saveSession(sid, { cookie: { originalMaxAge: 1 } });
      await store.saveSession(newSid(), null);

      expect(await rowFor(sid)).toBeUndefined();
    });

    it('rejects a session whose owner does not exist (foreign key)', async () => {
      await expect(store.saveSession(newSid(), sessionFor('00000000-0000-4000-8000-000000000000'))).rejects.toMatchObject({ code: '23503' });
    });

    it('updating a session keeps the original absolute expiry and never lets the idle expiry pass it', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));
      const created = await rowFor(sid);

      advance(29 * DAY); // one day before the absolute limit
      await store.saveSession(sid, sessionFor(user.id, { changed: true }));

      const updated = await rowFor(sid);
      expect(updated.absolute_expires_at.getTime()).toBe(created.absolute_expires_at.getTime());
      expect(updated.expires_at.getTime()).toBe(created.absolute_expires_at.getTime()); // capped, not now + 7 days
      expect(updated.data.changed).toBe(true);
    });

    it('cannot re-bind an existing session to a different user', async () => {
      const other = await insertUser(pool);
      userIds.push(other.id);
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));

      await store.saveSession(sid, sessionFor(other.id));

      expect((await rowFor(sid)).user_id).toBe(user.id);
    });
  });

  describe('idle expiration', () => {
    it('serves the session while it is within 7 days of inactivity and drops it after', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));

      advance(IDLE - 1000);
      await expect(store.findSession(sid)).resolves.not.toBeNull();

      advance(2000); // now 7 days + 1s of inactivity
      await expect(store.findSession(sid)).resolves.toBeNull();
    });

    it('treats a session as expired exactly at its expiry instant', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));

      advance(IDLE);
      await expect(store.findSession(sid)).resolves.toBeNull();
    });

    it('activity (touch) after the throttle interval slides the idle window forward', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));

      advance(3 * DAY);
      await store.touchSession(sid);
      advance(6 * DAY); // 9 days after creation, but only 6 after the touch
      await expect(store.findSession(sid)).resolves.not.toBeNull();

      const row = await rowFor(sid);
      expect(row.last_seen_at.getTime()).toBe(Date.parse('2026-01-01T00:00:00Z') + 3 * DAY);
    });

    it('does not resurrect a session that already expired (touch is ignored)', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));

      advance(IDLE + HOUR);
      await store.touchSession(sid);

      await expect(store.findSession(sid)).resolves.toBeNull();
    });
  });

  describe('touch throttling', () => {
    it('skips the database write when activity was already recorded less than 5 minutes ago', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));
      const before = await rowFor(sid);

      advance(TOUCH_INTERVAL - 1000);
      await store.touchSession(sid);

      const after = await rowFor(sid);
      expect(after.last_seen_at.getTime()).toBe(before.last_seen_at.getTime());
      expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
    });

    it('records activity once 5 minutes have passed', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));

      advance(TOUCH_INTERVAL);
      await store.touchSession(sid);

      const row = await rowFor(sid);
      expect(row.last_seen_at.getTime()).toBe(clockMs);
      expect(row.expires_at.getTime()).toBe(clockMs + IDLE);
    });
  });

  describe('absolute expiration', () => {
    it('ends the session at 30 days no matter how active it is', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));

      // Touch every 6 days: the idle window (7 days) is never exceeded.
      for (let day = 6; day < 30; day += 6) {
        advance(6 * DAY);
        await store.touchSession(sid);
        await expect(store.findSession(sid)).resolves.not.toBeNull();
      }

      advance(6 * DAY); // day 30: absolute limit reached
      await store.touchSession(sid);
      await expect(store.findSession(sid)).resolves.toBeNull();
    });

    it('caps the effective expiry at the absolute expiry when a touch would go past it', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));
      const { absolute_expires_at: absolute } = await rowFor(sid);

      // Keep the session alive (touch every 6 days, inside the 7-day idle window).
      for (let day = 6; day <= 24; day += 6) {
        advance(6 * DAY);
        await store.touchSession(sid);
      }
      // Day 24: a plain "now + 7 days" would be day 31, past the absolute limit (day 30).

      expect((await rowFor(sid)).expires_at.getTime()).toBe(absolute.getTime());
    });
  });

  describe('destroy and revocation', () => {
    it('destroy removes the session; destroying a missing one is not an error', async () => {
      const sid = newSid();
      await store.saveSession(sid, sessionFor(user.id));

      await store.deleteSession(sid);
      expect(await rowFor(sid)).toBeUndefined();
      await expect(store.deleteSession(sid)).resolves.toBeUndefined();
    });

    it('destroyAllForUser revokes every session of that user and leaves other users alone', async () => {
      const other = await insertUser(pool);
      userIds.push(other.id);
      const [a1, a2, b1] = [newSid(), newSid(), newSid()];
      await store.saveSession(a1, sessionFor(user.id));
      await store.saveSession(a2, sessionFor(user.id));
      await store.saveSession(b1, sessionFor(other.id));

      const removed = await store.destroyAllForUser(user.id);

      expect(removed).toBeGreaterThanOrEqual(2);
      expect(await rowFor(a1)).toBeUndefined();
      expect(await rowFor(a2)).toBeUndefined();
      expect(await rowFor(b1)).toBeDefined();
    });

    it('deleting the user removes their sessions too (ON DELETE CASCADE)', async () => {
      const doomed = await insertUser(pool);
      const sid = newSid();
      await store.saveSession(sid, sessionFor(doomed.id));

      await pool.query('DELETE FROM users WHERE id = $1', [doomed.id]);

      expect(await rowFor(sid)).toBeUndefined();
    });
  });

  describe('pruning', () => {
    it('removes only expired sessions and reports how many', async () => {
      const [fresh, idleExpired] = [newSid(), newSid()];
      await store.saveSession(idleExpired, sessionFor(user.id));
      advance(IDLE + DAY);
      await store.saveSession(fresh, sessionFor(user.id));

      const removed = await store.prune();

      expect(removed).toBeGreaterThanOrEqual(1);
      expect(await rowFor(idleExpired)).toBeUndefined();
      expect(await rowFor(fresh)).toBeDefined();
    });

    it('startSessionPruning runs prune on an interval, logs failures, and can be stopped', async () => {
      jest.useFakeTimers();
      try {
        const fakeStore = { prune: jest.fn().mockResolvedValueOnce(3).mockRejectedValueOnce(new Error('db down')).mockResolvedValue(0) };
        const logger = { info: jest.fn(), error: jest.fn() };

        const stop = startSessionPruning({ store: fakeStore, intervalMs: 1000, logger });
        await jest.advanceTimersByTimeAsync(1000);
        expect(logger.info).toHaveBeenCalledWith({ count: 3 }, 'pruned expired sessions');

        await jest.advanceTimersByTimeAsync(1000);
        expect(logger.error).toHaveBeenCalledWith({ err: expect.any(Error) }, 'failed to prune expired sessions');

        stop();
        await jest.advanceTimersByTimeAsync(5000);
        expect(fakeStore.prune).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('express-session callback interface', () => {
    it('get/set/touch/destroy work through callbacks', async () => {
      const sid = newSid();
      const sess = sessionFor(user.id);

      await promisify(store.set.bind(store))(sid, sess);
      await expect(promisify(store.get.bind(store))(sid)).resolves.toEqual(sess);
      await promisify(store.touch.bind(store))(sid, sess);
      await promisify(store.destroy.bind(store))(sid);
      await expect(promisify(store.get.bind(store))(sid)).resolves.toBeNull();
    });

    it('reports a database failure to the callback (so express-session can pass it to the error handler)', async () => {
      const broken = new PgSessionStore({
        db: { query: async () => { throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }); } },
        idleTtlMs: IDLE,
        absoluteTtlMs: ABSOLUTE,
      });

      await expect(promisify(broken.get.bind(broken))(newSid())).rejects.toMatchObject({ code: 'ECONNREFUSED' });
      await expect(promisify(broken.set.bind(broken))(newSid(), sessionFor(user.id))).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    });
  });
});
