'use strict';

const request = require('supertest');
const { createApp } = require('../../src/app');
const { MockGeocodingProvider } = require('../../src/providers/geocoding/mockGeocodingProvider');
const { MockPlacesProvider } = require('../../src/providers/places/mockPlacesProvider');

const app = createApp({
  geocodingProvider: new MockGeocodingProvider(),
  placesProvider: new MockPlacesProvider(),
  providerNames: { geocoding: 'mock', places: 'mock' },
  maxRadiusKm: 20,
  maxSearchPoints: 7,
  gridMinRadiusKm: 3,
  maxPagesPerPoint: 1,
});

describe('GET /health', () => {
  it('responds 200 without depending on any provider', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('includes helmet security headers', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-dns-prefetch-control']).toBe('off');
  });
});

describe('rate limiting', () => {
  function buildLimitedApp(overrides = {}) {
    return createApp({
      geocodingProvider: new MockGeocodingProvider(),
      placesProvider: new MockPlacesProvider(),
      providerNames: { geocoding: 'mock', places: 'mock' },
      maxRadiusKm: 20,
      maxSearchPoints: 7,
      gridMinRadiusKm: 3,
      maxPagesPerPoint: 1,
      rateLimit: { windowMs: 60_000, max: 2 },
      ...overrides,
    });
  }

  it('returns 429 RATE_LIMITED once the configured request threshold is exceeded', async () => {
    const limitedApp = buildLimitedApp();

    await request(limitedApp).get('/api/v1/nope');
    await request(limitedApp).get('/api/v1/nope');
    const response = await request(limitedApp).get('/api/v1/nope');

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('never rate limits /health, however often it is polled', async () => {
    const limitedApp = buildLimitedApp();

    for (let i = 0; i < 6; i += 1) {
      const response = await request(limitedApp).get('/health');
      expect(response.status).toBe(200);
    }
  });

  it('never rate limits /ready, however often it is polled', async () => {
    const limitedApp = buildLimitedApp();

    for (let i = 0; i < 6; i += 1) {
      const response = await request(limitedApp).get('/ready');
      expect(response.status).not.toBe(429);
    }
  });

  it('does not let probe traffic eat the budget of real requests', async () => {
    const limitedApp = buildLimitedApp();

    await request(limitedApp).get('/health');
    await request(limitedApp).get('/ready');
    await request(limitedApp).get('/health');

    const first = await request(limitedApp).get('/api/v1/nope');
    const second = await request(limitedApp).get('/api/v1/nope');
    const third = await request(limitedApp).get('/api/v1/nope');

    expect([first.status, second.status, third.status]).toEqual([404, 404, 429]);
  });
});

describe('GET /ready', () => {
  it('answers 503 not_ready, with no details, when the app has no database', async () => {
    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready', checks: { database: 'unavailable' } });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('answers 200 ready when the database answers', async () => {
    const readyApp = createApp({ db: { query: async () => ({ rows: [{ ok: 1 }] }) } });
    const response = await request(readyApp).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', checks: { database: 'ok' } });
  });

  it('answers 503 without leaking the reason when the database query fails', async () => {
    const failing = {
      query: async () => { throw new Error('connect ECONNREFUSED 10.9.8.7:5432 user=bli password=hunter2'); },
    };
    const response = await request(createApp({ db: failing })).get('/ready');

    expect(response.status).toBe(503);
    const text = JSON.stringify(response.body);
    ['10.9.8.7', 'hunter2', 'ECONNREFUSED', 'bli'].forEach((secret) => expect(text).not.toContain(secret));
  });

  it('answers 503 (bounded) when the database hangs', async () => {
    const hanging = { query: () => new Promise(() => {}) };
    // pingDatabase's own 2 s bound applies; jest's default timeout is 5 s.
    const response = await request(createApp({ db: hanging })).get('/ready');

    expect(response.status).toBe(503);
  });

  it('stays 200 on /health while /ready is 503', async () => {
    const failing = { query: async () => { throw new Error('down'); } };
    const downApp = createApp({ db: failing });

    expect((await request(downApp).get('/health')).status).toBe(200);
    expect((await request(downApp).get('/ready')).status).toBe(503);
  });
});

describe('GET /api-docs', () => {
  it('serves the Swagger UI page', async () => {
    const response = await request(app).get('/api-docs/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger-ui');
  });
});

describe('unknown routes', () => {
  it('responds 404 NOT_FOUND', async () => {
    const response = await request(app).get('/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
