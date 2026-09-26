'use strict';

const fs = require('fs');
const path = require('path');
const { findRepositoryViolations, firstParameter } = require('../../helpers/tenants');

const SRC = path.join(__dirname, '..', '..', '..', 'src');
const MODULES = path.join(SRC, 'modules');

// Repositories that are NOT scoped by a user, on purpose. Adding to this list
// needs a real reason: `users` is the root of ownership itself.
const UNSCOPED_REPOSITORIES = ['users'];

// Extra arguments (after userId) for repository methods that need real-looking
// input to reach their SQL, by module name. Empty until user-owned data exists.
const SAMPLES = {};

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

const repositoryFiles = listFiles(MODULES).filter((file) => file.endsWith('.repository.js'));
const moduleOf = (file) => path.relative(MODULES, file).split(path.sep)[0];
const rel = (file) => path.relative(SRC, file).split(path.sep).join('/');

describe('ownership convention: repository(userId, ...)', () => {
  describe('the repositories that exist', () => {
    it('only the unscoped allowlist is exempt, and it is exactly the users repository', () => {
      expect(UNSCOPED_REPOSITORIES).toEqual(['users']);
      UNSCOPED_REPOSITORIES.forEach((name) => {
        expect(repositoryFiles.map(moduleOf)).toContain(name);
      });
    });

    const scoped = repositoryFiles.filter((file) => !UNSCOPED_REPOSITORIES.includes(moduleOf(file)));

    it('finds every repository file (a new one is picked up automatically)', () => {
      expect(repositoryFiles.length).toBeGreaterThanOrEqual(1);
    });

    // No user-owned repository exists yet, so there is nothing to check today.
    // The moment one is added, it is discovered here and must pass.
    if (scoped.length === 0) {
      it('has no user-owned repository yet (v0.3.0 has only users and sessions)', () => {
        expect(scoped).toEqual([]);
      });
    } else {
      it.each(scoped.map((file) => [rel(file), file]))('%s takes userId first and scopes every query by it', async (_name, file) => {
        const exported = require(file);
        const factoryName = Object.keys(exported).find((key) => /^create.*Repository$/.test(key));
        expect(factoryName).toBeDefined();

        const violations = await findRepositoryViolations(exported[factoryName], SAMPLES[moduleOf(file)]);
        expect(violations).toEqual([]);
      });
    }

    it('the users repository never returns a password hash except through the one named auth lookup', async () => {
      const { createUsersRepository } = require('../../../src/modules/users/users.repository');
      const rows = [{
        id: 'id-1', email: 'a@b.co', name: 'A', created_at: new Date(), password_hash: '$argon2id$secret',
      }];
      const db = { query: async () => ({ rows }) };
      const users = createUsersRepository(db);

      const found = await users.findById('id-1');
      const created = await users.create({ email: 'a@b.co', name: 'A', passwordHash: '$argon2id$x' });
      const authRecord = await users.findAuthRecordByEmail('a@b.co');

      expect(JSON.stringify(found)).not.toContain('secret');
      expect(JSON.stringify(created)).not.toContain('secret');
      expect(Object.keys(found).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
      expect(authRecord.passwordHash).toBe('$argon2id$secret');
    });
  });

  describe('userId comes from req.auth, never from the request (source scan)', () => {
    // Comments are removed first: they may legitimately talk about req.auth.
    const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const code = listFiles(SRC)
      .filter((file) => file.endsWith('.js'))
      .map((file) => ({ file, text: stripComments(fs.readFileSync(file, 'utf8')) }));
    const offendersOf = (test) => code.filter(({ text }) => test(text)).map(({ file }) => rel(file));

    it('no source file reads userId from req.body, req.query, req.params or req.headers', () => {
      const fromRequest = /req\.(?:body|query|params|headers)\s*(?:\.|\[\s*['"])user_?id/i;
      const destructured = /\{[^}]*\buser_?id\b[^}]*\}\s*=\s*req\.(?:body|query|params|headers)/i;
      const header = /req\.(?:get|header)\(\s*['"]x-user/i;

      expect(offendersOf((text) => fromRequest.test(text) || destructured.test(text) || header.test(text))).toEqual([]);
    });

    it('req.auth is assigned in exactly one place: requireAuth', () => {
      expect(offendersOf((text) => /\breq\.auth\s*=(?!=)/.test(text))).toEqual(['modules/auth/requireAuth.js']);
    });

    it('no source file passes an interpolated template literal to query() (a second net next to the ESLint rule)', () => {
      expect(offendersOf((text) => /\.query\(\s*`[^`]*\$\{/.test(text))).toEqual([]);
    });
  });

  // The checker must itself be trustworthy: it is tested with SYNTHETIC
  // repositories (nothing in src), some correct and some deliberately wrong.
  describe('the checker (tested on synthetic repositories)', () => {
    const good = (db) => ({
      async list(userId) { return db.query('SELECT id FROM things WHERE user_id = $1', [userId]); },
      async get(userId, id) { return db.query('SELECT id FROM things WHERE user_id = $1 AND id = $2', [userId, id]); },
      async create(userId, data) { return db.query('INSERT INTO things (user_id, label) VALUES ($1, $2)', [userId, data.label]); },
      async update(userId, id, data) { return db.query('UPDATE things SET label = $3 WHERE id = $2 AND user_id = $1', [userId, id, data.label]); },
      async remove(userId, id) { return db.query('DELETE FROM things WHERE user_id = $1 AND id = $2', [userId, id]); },
    });

    const samples = {
      get: ['t1'], create: [{ label: 'x' }], update: ['t1', { label: 'y' }], remove: ['t1'],
    };

    it('accepts a repository that follows the rules', async () => {
      expect(await findRepositoryViolations(good, samples)).toEqual([]);
    });

    it('accepts a transactional repository that checks a client out of the pool', async () => {
      const transactional = (db) => ({
        async move(userId, id) {
          const client = await db.connect();
          try {
            await client.query('BEGIN');
            await client.query('UPDATE things SET moved = true WHERE user_id = $1 AND id = $2', [userId, id]);
            await client.query('COMMIT');
          } finally {
            client.release();
          }
        },
      });
      expect(await findRepositoryViolations(transactional, { move: ['t1'] })).toEqual([]);
    });

    it('flags a method whose first parameter is not userId', async () => {
      const bad = (db) => ({ async get(id, userId) { return db.query('SELECT 1 FROM things WHERE user_id = $2 AND id = $1', [id, userId]); } });
      const violations = await findRepositoryViolations(bad);
      expect(violations.join('\n')).toMatch(/get\(\): the first parameter must be userId/);
    });

    it('flags a query with no user_id filter at all', async () => {
      const bad = (db) => ({ async list(userId) { return db.query('SELECT id FROM things', [userId && undefined]); } });
      expect((await findRepositoryViolations(bad)).join('\n')).toMatch(/list\(\): does not mention user_id/);
    });

    it('flags a query that names user_id but never binds the userId argument', async () => {
      const bad = (db) => ({ async get(userId, id) { return db.query('SELECT id FROM things WHERE user_id = $1', [id]); } });
      expect((await findRepositoryViolations(bad, { get: ['t1'] })).join('\n')).toMatch(/get\(\): does not bind the userId argument/);
    });

    it('flags a filter whose placeholder points at the wrong argument', async () => {
      const bad = (db) => ({ async get(userId, id) { return db.query('SELECT id FROM things WHERE id = $1 AND user_id = $2', [userId, id]); } });
      expect((await findRepositoryViolations(bad, { get: ['t1'] })).join('\n')).toMatch(/placeholder that is not the userId/);
    });

    it('flags a query that filters a different column', async () => {
      const bad = (db) => ({ async list(userId) { return db.query('SELECT id FROM things WHERE owner = $1 /* user_id */', [userId]); } });
      expect((await findRepositoryViolations(bad)).join('\n')).toMatch(/list\(\): has no "user_id = \$n" filter/);
    });

    it('flags an OR that would widen the scope only if the filter is missing (a bare mention is not enough)', async () => {
      const bad = (db) => ({ async list(userId) { return db.query('SELECT id FROM things WHERE shared = true OR $1::uuid IS NOT NULL -- user_id', [userId]); } });
      expect((await findRepositoryViolations(bad)).join('\n')).toMatch(/list\(\)/);
    });

    it('flags a method that runs no SQL, so a repository can not pass by doing nothing', async () => {
      const bad = () => ({ async list(userId) { return userId; } });
      expect((await findRepositoryViolations(bad)).join('\n')).toMatch(/list\(\): ran no SQL/);
    });

    it('flags a repository that exports nothing', async () => {
      expect(await findRepositoryViolations(() => ({}))).toEqual(['exports no functions']);
    });
  });

  describe('firstParameter', () => {
    it.each([
      ['async method shorthand', { async m(userId, x) { return [userId, x]; } }.m, 'userId'],
      ['arrow function', async (userId) => userId, 'userId'],
      ['function with a destructured first parameter', function named({ a, b }, c) { return [a, b, c]; }, '{ a, b }'],
      ['function without parameters', () => 1, ''],
      ['a default value', function withDefault(userId = 1) { return userId; }, 'userId = 1'],
    ])('reads it from a %s', (_label, fn, expected) => {
      expect(firstParameter(fn)).toBe(expected);
    });
  });
});
