'use strict';

const request = require('supertest');
const { createApp } = require('../../src/app');
const { createLogger } = require('../../src/utils/logger');
const { MockGeocodingProvider } = require('../../src/providers/geocoding/mockGeocodingProvider');
const { MockPlacesProvider } = require('../../src/providers/places/mockPlacesProvider');
const { createTestAuth } = require('../helpers/testAuth');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ENDPOINT = '/api/v1/locations/analyze';

function buildApp(overrides = {}) {
  return createApp({
    auth: createTestAuth(),
    geocodingProvider: new MockGeocodingProvider(),
    placesProvider: new MockPlacesProvider(),
    providerNames: { geocoding: 'mock', places: 'mock' },
    maxRadiusKm: 20,
    maxSearchPoints: 7,
    gridMinRadiusKm: 3,
    maxPagesPerPoint: 1,
    enableCommercialEcosystem: true,
    ...overrides,
  });
}

function createCaptureStream() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(chunk);
      return true;
    },
    raw() {
      return chunks.join('');
    },
    getEntries() {
      return chunks.join('').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    },
  };
}

// pino-http writes its access-log line on the response's "finish" event; give it a tick to land.
const flushLogs = () => new Promise((resolve) => { setTimeout(resolve, 10); });

describe('request id', () => {
  it('adds a server-generated UUID X-Request-Id header to a successful response', async () => {
    const response = await request(buildApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toMatch(UUID_V4);
  });

  it('generates a different id for every request', async () => {
    const app = buildApp();
    const first = await request(app).get('/health');
    const second = await request(app).get('/health');

    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('ignores a client-supplied X-Request-Id instead of echoing it', async () => {
    const response = await request(buildApp()).get('/health').set('X-Request-Id', 'forged-by-client');

    expect(response.headers['x-request-id']).not.toBe('forged-by-client');
    expect(response.headers['x-request-id']).toMatch(UUID_V4);
  });

  it('exposes the header to browsers through CORS when a cross-origin front end is configured', async () => {
    const response = await request(buildApp({ corsOrigins: ['http://localhost:5173'] }))
      .get('/health')
      .set('Origin', 'http://localhost:5173');

    expect(response.headers['access-control-expose-headers']).toMatch(/x-request-id/i);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('sends no CORS headers at all by default (same-origin only)', async () => {
    const response = await request(buildApp()).get('/health').set('Origin', 'http://localhost:5173');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('does not grant CORS to an origin that is not configured', async () => {
    const response = await request(buildApp({ corsOrigins: ['http://localhost:5173'] }))
      .get('/health')
      .set('Origin', 'https://evil.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not add requestId to a successful analysis body (existing contract is unchanged)', async () => {
    const response = await request(buildApp())
      .get(ENDPOINT)
      .query({ location: 'Vila Velha, ES', businessType: 'gym', radius: 5 });

    expect(response.status).toBe(200);
    expect(response.body.requestId).toBeUndefined();
    expect(response.body.data.requestId).toBeUndefined();
  });

  describe('error bodies carry the same id as the header', () => {
    it('404 route not found', async () => {
      const response = await request(buildApp()).get('/nope');

      expect(response.status).toBe(404);
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    });

    it('400 validation error', async () => {
      const response = await request(buildApp()).get(ENDPOINT).query({ businessType: 'gym' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    });

    it('404 LOCATION_NOT_FOUND (ApiError from the service)', async () => {
      const response = await request(buildApp())
        .get(ENDPOINT)
        .query({ location: '__notfound__', businessType: 'gym', radius: 5 });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('LOCATION_NOT_FOUND');
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    });

    it('429 rate limited', async () => {
      // /health is exempt from the global limit on purpose, so use a counted route.
      const app = buildApp({ rateLimit: { max: 1 } });
      await request(app).get('/nope');
      const response = await request(app).get('/nope');

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('RATE_LIMITED');
      expect(response.headers['x-request-id']).toMatch(UUID_V4);
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    });

    it('500 unexpected error, without leaking the internal message or stack', async () => {
      const exploding = { geocode: async () => { throw new Error('internal-detail-that-must-not-leak'); } };
      const response = await request(buildApp({ geocodingProvider: exploding }))
        .get(ENDPOINT)
        .query({ location: 'Vila Velha, ES', businessType: 'gym', radius: 5 });

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
      expect(JSON.stringify(response.body)).not.toContain('internal-detail-that-must-not-leak');
    });
  });

  describe('logging', () => {
    it('writes the request id to the access log and never logs the Cookie header', async () => {
      const capture = createCaptureStream();
      const app = buildApp({ logger: createLogger(capture, { level: 'info' }) });

      const response = await request(app)
        .get('/health')
        .set('Cookie', 'sid=session-token-that-must-not-be-logged')
        .set('Authorization', 'Bearer token-that-must-not-be-logged');
      await flushLogs();

      const entries = capture.getEntries();
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some((entry) => entry.req && entry.req.id === response.headers['x-request-id'])).toBe(true);
      expect(capture.raw()).not.toContain('session-token-that-must-not-be-logged');
      expect(capture.raw()).not.toContain('token-that-must-not-be-logged');
    });

    it('logs unexpected errors with the request id so a support report can be traced', async () => {
      const capture = createCaptureStream();
      const exploding = { geocode: async () => { throw new Error('boom'); } };
      const app = buildApp({ geocodingProvider: exploding, logger: createLogger(capture, { level: 'info' }) });

      const response = await request(app)
        .get(ENDPOINT)
        .query({ location: 'Vila Velha, ES', businessType: 'gym', radius: 5 });
      await flushLogs();

      const requestIdHeader = response.headers['x-request-id'];
      const errorEntry = capture.getEntries().find((entry) => entry.msg === 'unhandled error');
      expect(errorEntry).toBeDefined();
      expect(errorEntry.req.id).toBe(requestIdHeader);
    });
  });
});
