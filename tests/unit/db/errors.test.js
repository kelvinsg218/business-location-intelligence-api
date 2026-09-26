'use strict';

const { isDatabaseUnavailableError } = require('../../../src/db/errors');

function withCode(code, message = 'boom') {
  return Object.assign(new Error(message), { code });
}

describe('isDatabaseUnavailableError', () => {
  it.each(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'EHOSTUNREACH'])(
    'treats the network error %s as "database unavailable"',
    (code) => {
      expect(isDatabaseUnavailableError(withCode(code))).toBe(true);
    },
  );

  it.each([
    ['57P01', 'admin_shutdown'],
    ['57P02', 'crash_shutdown'],
    ['57P03', 'cannot_connect_now'],
    ['53300', 'too_many_connections'],
    ['57014', 'statement timeout'],
    ['08006', 'connection_failure (class 08)'],
    ['08001', 'unable to establish connection (class 08)'],
    ['3D000', 'database does not exist'],
    ['28P01', 'invalid password'],
  ])('treats PostgreSQL SQLSTATE %s (%s) as "database unavailable"', (code) => {
    expect(isDatabaseUnavailableError(withCode(code))).toBe(true);
  });

  it.each([
    'timeout exceeded when trying to connect',
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Client has encountered a connection error and is not queryable',
    'Cannot use a pool after calling end on the pool',
  ])('recognizes the code-less pool message "%s"', (message) => {
    expect(isDatabaseUnavailableError(new Error(message))).toBe(true);
  });

  it('looks inside an AggregateError (Node reports one when several addresses are refused)', () => {
    const aggregate = new AggregateError([withCode('ECONNREFUSED'), withCode('ECONNREFUSED')], 'all refused');
    expect(isDatabaseUnavailableError(aggregate)).toBe(true);
  });

  it.each([
    ['unique_violation', '23505'],
    ['check_violation', '23514'],
    ['foreign_key_violation', '23503'],
    ['syntax_error', '42601'],
    ['undefined_table', '42P01'],
  ])('does NOT treat an ordinary query error (%s) as an availability problem', (_name, code) => {
    expect(isDatabaseUnavailableError(withCode(code))).toBe(false);
  });

  it('does not match unrelated errors or non-errors', () => {
    expect(isDatabaseUnavailableError(new Error('something else entirely'))).toBe(false);
    expect(isDatabaseUnavailableError(new TypeError('x is not a function'))).toBe(false);
    expect(isDatabaseUnavailableError(null)).toBe(false);
    expect(isDatabaseUnavailableError(undefined)).toBe(false);
    expect(isDatabaseUnavailableError('ECONNREFUSED')).toBe(false);
  });
});
