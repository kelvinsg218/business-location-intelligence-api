'use strict';

const { buildSessionConfig, cookieAttributes, DAY_MS } = require('../../../src/modules/auth/sessionConfig');
const { loadEnv } = require('../../../src/config/env');

const SECRET = 'a-production-grade-secret-that-is-at-least-32-chars';

describe('buildSessionConfig', () => {
  it('production: __Host-bli_sid, Secure, Strict, 7 days idle / 30 days absolute', () => {
    const env = loadEnv({
      NODE_ENV: 'production', SESSION_SECRET: SECRET, ALLOWED_ORIGINS: 'https://app.example.com',
    });
    const config = buildSessionConfig(env);

    expect(config.cookieName).toBe('__Host-bli_sid');
    expect(config.secure).toBe(true);
    expect(config.sameSite).toBe('strict');
    expect(config.idleTtlMs).toBe(7 * DAY_MS);
    expect(config.absoluteTtlMs).toBe(30 * DAY_MS);
    expect(config.secrets).toEqual([SECRET]);
    expect(cookieAttributes(config)).toEqual({
      httpOnly: true, secure: true, sameSite: 'strict', path: '/',
    });
  });

  it('local HTTP development: bli_sid, explicitly not Secure', () => {
    const config = buildSessionConfig(loadEnv({ SESSION_COOKIE_SECURE: 'false' }));

    expect(config.cookieName).toBe('bli_sid');
    expect(config.secure).toBe(false);
    expect(cookieAttributes(config)).toEqual({
      httpOnly: true, secure: false, sameSite: 'strict', path: '/',
    });
  });

  it('never sets a Domain (host-only cookie), so it can not leak to sibling subdomains', () => {
    [loadEnv({ SESSION_COOKIE_SECURE: 'false' }), loadEnv({ SESSION_COOKIE_SECURE: 'true' })].forEach((env) => {
      expect(cookieAttributes(buildSessionConfig(env))).not.toHaveProperty('domain');
    });
  });

  it('is Secure by default: forgetting the variable can never produce an insecure cookie', () => {
    expect(buildSessionConfig(loadEnv({})).secure).toBe(true);
  });

  it('takes the TTLs from the environment', () => {
    const config = buildSessionConfig(loadEnv({ SESSION_IDLE_TTL_DAYS: '1', SESSION_ABSOLUTE_TTL_DAYS: '2' }));
    expect(config.idleTtlMs).toBe(DAY_MS);
    expect(config.absoluteTtlMs).toBe(2 * DAY_MS);
  });

  it('supports rotating secrets: the first signs, the others still verify', () => {
    const other = 'another-secret-that-is-also-at-least-32-chars-long';
    const config = buildSessionConfig(loadEnv({ SESSION_SECRET: `${SECRET}, ${other}` }));
    expect(config.secrets).toEqual([SECRET, other]);
  });
});
