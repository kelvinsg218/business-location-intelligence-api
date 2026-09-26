'use strict';

const { loadEnv } = require('../../../src/config/env');

describe('loadEnv', () => {
  it('applies sane defaults when nothing is set', () => {
    const env = loadEnv({});

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.GOOGLE_MAPS_API_KEY).toBe('');
    expect(env.USE_MOCK_GEOCODING).toBe(true);
    expect(env.USE_MOCK_PLACES).toBe(true);
    expect(env.ENABLE_COMMERCIAL_ECOSYSTEM).toBe(true);
    expect(env.MAX_RADIUS_KM).toBe(20);
    expect(env.GRID_MIN_RADIUS_KM).toBe(3);
    expect(env.MAX_SEARCH_POINTS).toBe(7);
    expect(env.MAX_PAGES_PER_POINT).toBe(1);
    expect(env.HTTP_TIMEOUT_MS).toBe(8000);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('coerces boolean-like strings for USE_MOCK_* flags', () => {
    expect(loadEnv({ USE_MOCK_PLACES: 'false' }).USE_MOCK_PLACES).toBe(false);
    expect(loadEnv({ USE_MOCK_PLACES: 'FALSE' }).USE_MOCK_PLACES).toBe(false);
    expect(loadEnv({ USE_MOCK_PLACES: 'true' }).USE_MOCK_PLACES).toBe(true);
    expect(loadEnv({ USE_MOCK_GEOCODING: 'false', USE_MOCK_PLACES: 'true' }).USE_MOCK_GEOCODING).toBe(false);
    expect(loadEnv({ ENABLE_COMMERCIAL_ECOSYSTEM: 'false' }).ENABLE_COMMERCIAL_ECOSYSTEM).toBe(false);
  });

  it('coerces numeric env vars from strings', () => {
    const env = loadEnv({ PORT: '4000', MAX_RADIUS_KM: '10.5', MAX_SEARCH_POINTS: '3' });
    expect(env.PORT).toBe(4000);
    expect(env.MAX_RADIUS_KM).toBe(10.5);
    expect(env.MAX_SEARCH_POINTS).toBe(3);
  });

  it('throws a descriptive error on invalid config', () => {
    expect(() => loadEnv({ PORT: 'not-a-number' })).toThrow(/Invalid environment configuration/);
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/Invalid environment configuration/);
    expect(() => loadEnv({ MAX_PAGES_PER_POINT: '5' })).toThrow(/Invalid environment configuration/);
  });
});

describe('loadEnv — database, session and auth settings', () => {
  const PROD = {
    NODE_ENV: 'production',
    SESSION_SECRET: 's'.repeat(32),
    ALLOWED_ORIGINS: 'https://app.example.com',
  };

  it('has safe, documented defaults', () => {
    const env = loadEnv({});

    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DATABASE_POOL_MAX).toBe(10);
    expect(env.DATABASE_CONNECTION_TIMEOUT_MS).toBe(5000);
    expect(env.DATABASE_IDLE_TIMEOUT_MS).toBe(10000);
    expect(env.DATABASE_STATEMENT_TIMEOUT_MS).toBe(10000);
    expect(env.DATABASE_SSL).toBe('disable');
    expect(env.SESSION_IDLE_TTL_DAYS).toBe(7);
    expect(env.SESSION_ABSOLUTE_TTL_DAYS).toBe(30);
    expect(env.SESSION_COOKIE_SECURE).toBe(true); // secure by default; local HTTP dev opts out explicitly
    expect(env.SESSION_COOKIE_SAMESITE).toBe('strict');
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.REGISTRATION_ENABLED).toBe(true);
    expect(env.ANALYZE_RATE_LIMIT_MAX).toBe(30);
    expect(env.ANALYZE_RATE_LIMIT_WINDOW_MINUTES).toBe(60);
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('allows the dev front end and the API origin by default outside production', () => {
    expect(loadEnv({ PORT: '3100' }).ALLOWED_ORIGINS).toEqual([
      'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3100', 'http://127.0.0.1:3100',
    ]);
  });

  it('uses only the configured origins when ALLOWED_ORIGINS is set, normalized to bare origins', () => {
    const env = loadEnv({ ALLOWED_ORIGINS: 'https://app.example.com/, http://localhost:5173 ' });
    expect(env.ALLOWED_ORIGINS).toEqual(['https://app.example.com', 'http://localhost:5173']);
  });

  it('rejects an origin that is not a URL', () => {
    expect(() => loadEnv({ ALLOWED_ORIGINS: 'not a url' })).toThrow(/ALLOWED_ORIGINS/);
    expect(() => loadEnv({ CORS_ORIGINS: 'nope' })).toThrow(/CORS_ORIGINS/);
  });

  it('never exposes the raw SESSION_SECRET, only the resolved list (with a dev-only fallback outside production)', () => {
    const custom = loadEnv({ SESSION_SECRET: 'a'.repeat(32) });
    expect(custom).not.toHaveProperty('SESSION_SECRET');
    expect(custom.SESSION_SECRETS).toEqual(['a'.repeat(32)]);

    const fallback = loadEnv({});
    expect(fallback.SESSION_SECRETS).toHaveLength(1);
    expect(fallback.SESSION_SECRETS[0].length).toBeGreaterThanOrEqual(32);
  });

  it('supports several comma-separated session secrets for rotation (first one signs)', () => {
    const env = loadEnv({ SESSION_SECRET: `${'n'.repeat(32)}, ${'o'.repeat(32)}` });
    expect(env.SESSION_SECRETS).toEqual(['n'.repeat(32), 'o'.repeat(32)]);
  });

  it('rejects a session secret shorter than 32 characters', () => {
    expect(() => loadEnv({ SESSION_SECRET: 'too-short' })).toThrow(/SESSION_SECRET/);
    expect(() => loadEnv({ SESSION_SECRET: `${'n'.repeat(32)},short` })).toThrow(/SESSION_SECRET/);
  });

  describe('production guards', () => {
    it('accepts a complete production configuration', () => {
      const env = loadEnv(PROD);
      expect(env.NODE_ENV).toBe('production');
      expect(env.ALLOWED_ORIGINS).toEqual(['https://app.example.com']);
      expect(env.SESSION_COOKIE_SECURE).toBe(true);
    });

    it('requires a real session secret', () => {
      expect(() => loadEnv({ ...PROD, SESSION_SECRET: undefined })).toThrow(/SESSION_SECRET/);
      expect(() => loadEnv({ ...PROD, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
    });

    it('requires the public origin(s) for the origin guard', () => {
      expect(() => loadEnv({ ...PROD, ALLOWED_ORIGINS: undefined })).toThrow(/ALLOWED_ORIGINS/);
    });

    it('does not allow Secure cookies to be turned off', () => {
      expect(() => loadEnv({ ...PROD, SESSION_COOKIE_SECURE: 'false' })).toThrow(/SESSION_COOKIE_SECURE/);
    });
  });

  it('requires the idle timeout to be no longer than the absolute timeout', () => {
    expect(() => loadEnv({ SESSION_IDLE_TTL_DAYS: '40', SESSION_ABSOLUTE_TTL_DAYS: '30' })).toThrow(/SESSION_IDLE_TTL_DAYS/);
  });

  it('coerces booleans and numbers for the new settings', () => {
    const env = loadEnv({
      REGISTRATION_ENABLED: 'false', SESSION_COOKIE_SECURE: 'false', TRUST_PROXY: '1', DATABASE_POOL_MAX: '4', ANALYZE_RATE_LIMIT_MAX: '5',
    });
    expect(env.REGISTRATION_ENABLED).toBe(false);
    expect(env.SESSION_COOKIE_SECURE).toBe(false);
    expect(env.TRUST_PROXY).toBe(1);
    expect(env.DATABASE_POOL_MAX).toBe(4);
    expect(env.ANALYZE_RATE_LIMIT_MAX).toBe(5);
  });

  it('rejects out-of-range database and sameSite values', () => {
    expect(() => loadEnv({ DATABASE_POOL_MAX: '0' })).toThrow(/DATABASE_POOL_MAX/);
    expect(() => loadEnv({ DATABASE_SSL: 'maybe' })).toThrow(/DATABASE_SSL/);
    expect(() => loadEnv({ SESSION_COOKIE_SAMESITE: 'none' })).toThrow(/SESSION_COOKIE_SAMESITE/);
  });
});
