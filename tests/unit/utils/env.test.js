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
