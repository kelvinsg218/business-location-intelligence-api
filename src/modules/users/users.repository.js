'use strict';

// Persistence for accounts. All SQL is constant text with bind parameters.
//
// This is the ONE repository that is not scoped by a userId: the users table is
// the root of ownership itself. Every repository added for user-owned data in
// later versions must take `userId` as its first argument and filter by it
// (enforced by tests/unit/architecture/repositories.test.js).

class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('An account with this e-mail already exists.');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

// The public shape of a user. password_hash is deliberately not part of it.
function toPublicUser(row) {
  return {
    id: row.id, name: row.name, email: row.email, createdAt: row.created_at,
  };
}

function createUsersRepository(db) {
  return {
    /**
     * Inserts a user. `email` must already be normalized (see ./email.js) and
     * `passwordHash` must be an Argon2id PHC string; the database checks both.
     * @throws {EmailAlreadyRegisteredError} when the e-mail is taken.
     */
    async create({ email, name, passwordHash }) {
      try {
        const { rows } = await db.query(
          'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
          [email, name, passwordHash],
        );
        return toPublicUser(rows[0]);
      } catch (err) {
        if (err.code === '23505' && err.constraint === 'users_email_unique') {
          throw new EmailAlreadyRegisteredError();
        }
        throw err;
      }
    },

    async findById(id) {
      const { rows } = await db.query('SELECT id, email, name, created_at FROM users WHERE id = $1', [id]);
      return rows.length === 0 ? null : toPublicUser(rows[0]);
    },

    /**
     * For authentication ONLY: the one function that returns the password hash,
     * and it is named so that no caller can mistake it for a public lookup.
     */
    async findAuthRecordByEmail(email) {
      const { rows } = await db.query(
        'SELECT id, email, name, created_at, password_hash FROM users WHERE email = $1',
        [email],
      );
      if (rows.length === 0) return null;
      return { ...toPublicUser(rows[0]), passwordHash: rows[0].password_hash };
    },

    async updatePasswordHash(id, passwordHash) {
      await db.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [id, passwordHash]);
    },
  };
}

module.exports = { createUsersRepository, EmailAlreadyRegisteredError };
