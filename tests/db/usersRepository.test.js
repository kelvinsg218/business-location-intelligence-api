'use strict';

const { createUsersRepository, EmailAlreadyRegisteredError } = require('../../src/modules/users/users.repository');
const { normalizeEmail } = require('../../src/modules/users/email');
const {
  createTestPool, deleteUsers, uniqueEmail, FAKE_PASSWORD_HASH,
} = require('../helpers/db');

describe('users repository (real PostgreSQL)', () => {
  let pool;
  let users;
  const createdIds = [];

  beforeAll(() => {
    pool = createTestPool();
    users = createUsersRepository(pool);
  });

  afterAll(async () => {
    await deleteUsers(pool, createdIds);
    await pool.end();
  });

  async function create(overrides = {}) {
    const user = await users.create({
      email: uniqueEmail('repo'), name: 'Repo User', passwordHash: FAKE_PASSWORD_HASH, ...overrides,
    });
    createdIds.push(user.id);
    return user;
  }

  it('creates a user and returns only the public fields', async () => {
    const user = await create({ name: 'Ana Souza' });

    expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    expect(user.name).toBe('Ana Souza');
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(JSON.stringify(user)).not.toMatch(/argon2|password/i);
  });

  it('throws EmailAlreadyRegisteredError (a domain error) on a duplicate e-mail', async () => {
    const email = uniqueEmail('dup');
    await create({ email });

    await expect(users.create({ email, name: 'Other', passwordHash: FAKE_PASSWORD_HASH })).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('lets other database errors through untouched (only the e-mail duplicate is translated)', async () => {
    await expect(users.create({ email: uniqueEmail('bad'), name: '', passwordHash: FAKE_PASSWORD_HASH }))
      .rejects.toMatchObject({ constraint: 'users_name_length' });
  });

  it('findById returns the public user, or null when there is none', async () => {
    const user = await create();

    const found = await users.findById(user.id);
    expect(found).toEqual(user);
    expect(found).not.toHaveProperty('passwordHash');
    expect(found).not.toHaveProperty('password_hash');

    await expect(users.findById('00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
  });

  it('findAuthRecordByEmail is the only lookup that exposes the hash, and only under an explicit name', async () => {
    const email = uniqueEmail('auth');
    const user = await create({ email });

    const record = await users.findAuthRecordByEmail(email);
    expect(record.id).toBe(user.id);
    expect(record.passwordHash).toBe(FAKE_PASSWORD_HASH);

    await expect(users.findAuthRecordByEmail(uniqueEmail('nobody'))).resolves.toBeNull();
  });

  it('updatePasswordHash replaces the hash and bumps updated_at', async () => {
    const email = uniqueEmail('rehash');
    const user = await create({ email });
    const before = await pool.query('SELECT updated_at FROM users WHERE id = $1', [user.id]);

    const newHash = '$argon2id$v=19$m=19456,t=2,p=1$bmV3LXNhbHQtMTIzNDU2$bmV3LWhhc2gtbmV3LWhhc2gtbmV3LWhhc2gtMQ';
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    await users.updatePasswordHash(user.id, newHash);

    const record = await users.findAuthRecordByEmail(email);
    expect(record.passwordHash).toBe(newHash);
    const after = await pool.query('SELECT updated_at FROM users WHERE id = $1', [user.id]);
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
  });

  it('treats hostile input as data: SQL metacharacters are stored verbatim and nothing is executed', async () => {
    const evilName = "Robert'); DROP TABLE users;--";
    const evilLookup = "x@example.test' OR '1'='1";
    const user = await create({ name: evilName });

    const stored = await pool.query('SELECT name FROM users WHERE id = $1', [user.id]);
    expect(stored.rows[0].name).toBe(evilName);
    await expect(pool.query('SELECT count(*)::int AS n FROM users')).resolves.toBeDefined(); // table still there

    await expect(users.findAuthRecordByEmail(evilLookup)).resolves.toBeNull(); // no tautology injection
  });

  it('e-mail normalization is a single shared function (trim + lower case)', () => {
    expect(normalizeEmail('  Ana.Souza@Example.COM ')).toBe('ana.souza@example.com');
  });
});
