'use strict';

const crypto = require('crypto');
const session = require('express-session');

const DEFAULT_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

// Only this digest is stored, never the session id: a copy of the table (a
// backup, a SQL injection, a curious DBA) cannot be turned into working cookies.
function hashSessionId(sid) {
  return crypto.createHash('sha256').update(sid).digest();
}

// express-session speaks callbacks. Calling back on the next tick keeps a throw
// inside the callback an ordinary uncaught error instead of an unhandled promise
// rejection swallowed by the wrapper below.
function settle(promise, callback) {
  promise.then(
    (value) => { process.nextTick(callback, null, value); },
    (err) => { process.nextTick(callback, err); },
  );
}

/**
 * express-session store backed by the `sessions` table.
 *
 * Two clocks govern a session:
 *  - idle expiry: `expires_at`, pushed forward by activity (touch), and
 *  - absolute expiry: `absolute_expires_at`, fixed when the session is created
 *    and never extended, so a stolen or forgotten cookie cannot live forever.
 * `expires_at` is always capped at the absolute expiry, so "is the session
 * valid?" is a single comparison against `expires_at`.
 *
 * Only sessions that belong to a user are persisted; an anonymous session (no
 * userId) is silently not stored, so visitors leave no rows behind.
 *
 * Time is always taken from the injected `now()` (never from the database clock),
 * which is what makes expiry deterministic to test.
 */
class PgSessionStore extends session.Store {
  constructor({
    db, idleTtlMs, absoluteTtlMs, touchIntervalMs = DEFAULT_TOUCH_INTERVAL_MS, now = () => new Date(), logger,
  }) {
    super();
    if (!db) throw new Error('PgSessionStore requires a db (pg Pool)');
    if (!(idleTtlMs > 0) || !(absoluteTtlMs > 0)) throw new Error('PgSessionStore requires positive idleTtlMs and absoluteTtlMs');
    if (idleTtlMs > absoluteTtlMs) throw new Error('idleTtlMs cannot be longer than absoluteTtlMs');

    this.db = db;
    this.idleTtlMs = idleTtlMs;
    this.absoluteTtlMs = absoluteTtlMs;
    this.touchIntervalMs = touchIntervalMs;
    this.now = now;
    this.logger = logger;
  }

  // ----- express-session Store interface (callbacks) -----

  get(sid, callback) {
    settle(this.findSession(sid), callback);
  }

  set(sid, sess, callback) {
    settle(this.saveSession(sid, sess), callback);
  }

  // Best effort. express-session calls this while it is finishing a response that
  // already succeeded, so a failure here must not turn into a request error (or a
  // cut connection): it only means the idle window was not extended this time.
  touch(sid, _sess, callback) {
    settle(
      this.touchSession(sid).catch((err) => {
        if (this.logger) this.logger.warn({ err }, 'could not record session activity');
      }),
      callback,
    );
  }

  destroy(sid, callback) {
    settle(this.deleteSession(sid), callback);
  }

  // ----- promise API (what the interface above wraps, and what tests use) -----

  async findSession(sid) {
    const { rows } = await this.db.query(
      'SELECT data FROM sessions WHERE id_hash = $1 AND expires_at > $2',
      [hashSessionId(sid), this.now()],
    );
    return rows.length === 0 ? null : rows[0].data;
  }

  async saveSession(sid, sess) {
    if (!sess || typeof sess.userId !== 'string') return;

    const nowMs = this.now().getTime();
    await this.db.query(
      `INSERT INTO sessions (id_hash, user_id, data, created_at, last_seen_at, expires_at, absolute_expires_at)
       VALUES ($1, $2, $3::jsonb, $4, $4, $5, $6)
       ON CONFLICT (id_hash) DO UPDATE
         SET data = EXCLUDED.data,
             last_seen_at = EXCLUDED.last_seen_at,
             expires_at = LEAST(EXCLUDED.expires_at, sessions.absolute_expires_at)`,
      [
        hashSessionId(sid),
        sess.userId,
        JSON.stringify(sess),
        new Date(nowMs),
        new Date(nowMs + this.idleTtlMs),
        new Date(nowMs + this.absoluteTtlMs),
      ],
    );
  }

  // Called by express-session on EVERY request of an existing session. Writing to
  // the database each time would be wasteful, so activity is only recorded when
  // the last recorded activity is older than touchIntervalMs.
  async touchSession(sid) {
    const nowMs = this.now().getTime();
    await this.db.query(
      `UPDATE sessions
          SET last_seen_at = $2, expires_at = LEAST($3, absolute_expires_at)
        WHERE id_hash = $1 AND expires_at > $2 AND last_seen_at <= $4`,
      [hashSessionId(sid), new Date(nowMs), new Date(nowMs + this.idleTtlMs), new Date(nowMs - this.touchIntervalMs)],
    );
  }

  async deleteSession(sid) {
    await this.db.query('DELETE FROM sessions WHERE id_hash = $1', [hashSessionId(sid)]);
  }

  // Revokes every session of one user (e.g. after a password change or when
  // an account is disabled). Deleting the user itself does this through the
  // foreign key's ON DELETE CASCADE.
  async destroyAllForUser(userId) {
    const result = await this.db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    return result.rowCount;
  }

  // Removes every session that has expired; returns how many.
  async prune() {
    const result = await this.db.query('DELETE FROM sessions WHERE expires_at <= $1', [this.now()]);
    return result.rowCount;
  }
}

/**
 * Prunes expired sessions on an interval. The timer is unref()'d, so it never
 * keeps the process alive. Returns a function that stops it.
 */
function startSessionPruning({ store, intervalMs = DEFAULT_PRUNE_INTERVAL_MS, logger }) {
  const timer = setInterval(() => {
    store.prune().then(
      (count) => { if (count > 0) logger.info({ count }, 'pruned expired sessions'); },
      (err) => { logger.error({ err }, 'failed to prune expired sessions'); },
    );
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = {
  PgSessionStore, hashSessionId, startSessionPruning, DEFAULT_TOUCH_INTERVAL_MS,
};
