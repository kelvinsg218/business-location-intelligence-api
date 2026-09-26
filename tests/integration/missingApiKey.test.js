'use strict';

// Force real providers with no key configured, BEFORE requiring anything
// that reads process.env (config/env.js computes its singleton at require
// time), so this test genuinely exercises GoogleGeocodingProvider/
// GooglePlacesProvider, not the mocks.
process.env.USE_MOCK_GEOCODING = 'false';
process.env.USE_MOCK_PLACES = 'false';
delete process.env.GOOGLE_MAPS_API_KEY;

const request = require('supertest');
const { createApp } = require('../../src/app');
const { createProviders } = require('../../src/config/providerFactory');
const { env } = require('../../src/config/env');
const { createTestAuth } = require('../helpers/testAuth');

function buildRealApp() {
  const { geocodingProvider, placesProvider, providerNames } = createProviders(env);
  return createApp({
    auth: createTestAuth(),
    geocodingProvider,
    placesProvider,
    providerNames,
    maxRadiusKm: env.MAX_RADIUS_KM,
    maxSearchPoints: env.MAX_SEARCH_POINTS,
    gridMinRadiusKm: env.GRID_MIN_RADIUS_KM,
    maxPagesPerPoint: env.MAX_PAGES_PER_POINT,
  });
}

describe('real providers with no GOOGLE_MAPS_API_KEY configured', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('still boots and serves /health without touching any provider', async () => {
    const response = await request(buildRealApp()).get('/health');
    expect(response.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 503 CONFIGURATION_ERROR with zero network calls when analyzing', async () => {
    const response = await request(buildRealApp())
      .get('/api/v1/locations/analyze')
      .query({ location: 'Vila Velha, ES', businessType: 'gym', radius: 5 });

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('CONFIGURATION_ERROR');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
