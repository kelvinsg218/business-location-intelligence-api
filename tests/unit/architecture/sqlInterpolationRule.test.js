'use strict';

const { Linter } = require('eslint');
// The project's real flat config, so this tests the rule exactly as `npm run lint` applies it.
const config = require('../../../eslint.config.js');

const linter = new Linter();

function lint(code) {
  const messages = linter.verify(code, config, { filename: 'src/example.js' });
  return messages.filter((message) => message.ruleId === 'no-restricted-syntax');
}

describe('ESLint rule: no interpolated SQL in .query()', () => {
  it('rejects a template literal with interpolation as the query text', () => {
    const messages = lint('async function f(db, id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }');
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toMatch(/bind parameters/);
  });

  it('rejects SQL built by string concatenation', () => {
    const messages = lint("async function f(db, id) { return db.query('SELECT * FROM users WHERE id = ' + id); }");
    expect(messages).toHaveLength(1);
  });

  it('rejects an interpolated `text` in the object form of a query', () => {
    const messages = lint('async function f(db, id) { return db.query({ text: `SELECT ${id}`, values: [] }); }');
    expect(messages).toHaveLength(1);
  });

  it('also protects pool/client receivers, whatever they are called', () => {
    const messages = lint('async function f(pool, client, id) { await pool.query(`X ${id}`); await client.query(`Y ${id}`); }');
    expect(messages).toHaveLength(2);
  });

  it('allows a constant query with bind parameters', () => {
    const messages = lint("async function f(db, id) { return db.query('SELECT * FROM users WHERE id = $1', [id]); }");
    expect(messages).toHaveLength(0);
  });

  it('allows a template literal WITHOUT interpolation (multi-line constant SQL)', () => {
    const messages = lint('async function f(db, id) { return db.query(`SELECT *\n FROM users\n WHERE id = $1`, [id]); }');
    expect(messages).toHaveLength(0);
  });

  it('allows a constant object form with bind parameters', () => {
    const messages = lint("async function f(db, id) { return db.query({ text: 'SELECT * FROM users WHERE id = $1', values: [id] }); }");
    expect(messages).toHaveLength(0);
  });
});
