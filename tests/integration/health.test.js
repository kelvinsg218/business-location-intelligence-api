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
  it('returns 429 RATE_LIMITED once the configured request threshold is exceeded', async () => {
    const limitedApp = createApp({
      geocodingProvider: new MockGeocodingProvider(),
      placesProvider: new MockPlacesProvider(),
      providerNames: { geocoding: 'mock', places: 'mock' },
      maxRadiusKm: 20,
      maxSearchPoints: 7,
      gridMinRadiusKm: 3,
      maxPagesPerPoint: 1,
      rateLimit: { windowMs: 60_000, max: 2 },
    });

    await request(limitedApp).get('/health');
    await request(limitedApp).get('/health');
    const response = await request(limitedApp).get('/health');

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
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
