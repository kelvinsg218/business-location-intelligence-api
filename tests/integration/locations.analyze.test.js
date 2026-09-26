'use strict';

const request = require('supertest');
const { createApp } = require('../../src/app');
const { MockGeocodingProvider } = require('../../src/providers/geocoding/mockGeocodingProvider');
const { MockPlacesProvider } = require('../../src/providers/places/mockPlacesProvider');
const { ApiError } = require('../../src/utils/ApiError');
const { createTestAuth } = require('../helpers/testAuth');

// Signed-in user stand-in: this suite is about the analysis itself. The
// authentication requirement is covered in tests/integration/analyzeAuth.test.js.
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

const ENDPOINT = '/api/v1/locations/analyze';

describe('GET /api/v1/locations/analyze', () => {
  it('returns a full analysis for a valid request (happy path, grid mode)', async () => {
    const response = await request(buildApp())
      .get(ENDPOINT)
      .query({ location: 'Vila Velha, ES', businessType: 'gym', radius: 10 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.query).toEqual({
      location: 'Vila Velha, ES', businessType: 'gym', radiusKm: 10, radiusMeters: 10000, keywords: [],
    });
    expect(response.body.data.places.establishmentsFound).toBeGreaterThan(0);
    expect(response.body.data.searchStrategy.type).toBe('grid');
    expect(response.body.data.searchStrategy.pointsUsed).toBe(7);
    expect(response.body.data.searchStrategy.provider).toEqual({ geocoding: 'mock', places: 'mock' });
    expect(response.body.data.analysis.competitorCount).toBe(response.body.data.places.establishmentsFound);
  });

  it('returns a single-point analysis for a small radius', async () => {
    const response = await request(buildApp())
      .get(ENDPOINT)
      .query({ location: 'Vila Velha, ES', businessType: 'gym', radius: 2 });

    expect(response.status).toBe(200);
    expect(response.body.data.searchStrategy.type).toBe('single-point');
    expect(response.body.data.searchStrategy.pointsUsed).toBe(1);
  });

  it('parses comma-separated keywords', async () => {
    const response = await request(buildApp())
      .get(ENDPOINT)
      .query({
        location: 'Vila Velha, ES', businessType: 'gym', radius: 5, keywords: 'crossfit, 24 horas',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.query.keywords).toEqual(['crossfit', '24 horas']);
  });

  it('returns 400 VALIDATION_ERROR with field details for missing params', async () => {
    const response = await request(buildApp()).get(ENDPOINT).query({ businessType: 'gym' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const fields = response.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['location', 'radius']));
  });

  it('returns 400 when radius exceeds MAX_RADIUS_KM', async () => {
    const response = await request(buildApp())
      .get(ENDPOINT)
      .query({ location: 'Vila Velha, ES', businessType: 'gym', radius: 999 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 LOCATION_NOT_FOUND for the not-found sentinel', async () => {
    const response = await request(buildApp())
      .get(ENDPOINT)
      .query({ location: '__notfound__', businessType: 'gym', radius: 5 });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('LOCATION_NOT_FOUND');
  });

  it('returns 200 with establishmentsFound 0 for the zero-results sentinel (not an error)', async () => {
    const response = await request(buildApp())
      .get(ENDPOINT)
      .query({ location: 'Vila Velha, ES', businessType: '__zero_results__', radius: 5 });

    expect(response.status).toBe(200);
    expect(response.body.data.places.establishmentsFound).toBe(0);
    expect(response.body.data.analysis.opportunityScore).toBe(100);
  });

  it('returns 429 when the places provider reports a quota error on every grid point', async () => {
    const failingPlacesProvider = {
      search: async () => {
        throw new ApiError(429, 'PLACES_QUOTA_EXCEEDED', 'quota exceeded');
      },
    };

    const response = await request(buildApp({ placesProvider: failingPlacesProvider }))
      .get(ENDPOINT)
      .query({ location: 'Vila Velha, ES', businessType: 'gym', radius: 5 });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('PLACES_QUOTA_EXCEEDED');
  });
});

describe('GET /api/v1/locations/analyze — commercialEcosystem', () => {
  it('populates commercialEcosystem for a recognized Business Profile, with the required careful framing', async () => {
    const response = await request(buildApp())
      .get(ENDPOINT)
      .query({ location: 'Vila Velha, ES', businessType: 'gym', radius: 5 });

    expect(response.status).toBe(200);
    const { commercialEcosystem } = response.body.data;
    expect(commercialEcosystem).not.toBeNull();
    expect(commercialEcosystem.businessProfile).toBe('gym');
    expect(commercialEcosystem.complementary.available).toBe(true);
    expect(commercialEcosystem.trafficGenerators.available).toBe(true);
    expect(commercialEcosystem.notes.join(' ')).toMatch(/may indicate the presence of a commercially compatible ecosystem/i);
    expect(commercialEcosystem.notes.join(' ')).not.toMatch(/will generate customers|vai gerar clientes/i);
  });

  it('returns commercialEcosystem: null for a businessType with no profile in the catalog', async () => {
    const response = await request(buildApp())
      .get(ENDPOINT)
      .query({ location: 'Vila Velha, ES', businessType: 'car wash', radius: 5 });

    expect(response.status).toBe(200);
    expect(response.body.data.commercialEcosystem).toBeNull();
    // Every other field is unaffected by this new subsystem.
    expect(response.body.data.places.establishmentsFound).toBeGreaterThan(0);
  });

  it('returns commercialEcosystem: null when disabled via enableCommercialEcosystem:false, regardless of profile match', async () => {
    const response = await request(buildApp({ enableCommercialEcosystem: false }))
      .get(ENDPOINT)
      .query({ location: 'Vila Velha, ES', businessType: 'gym', radius: 5 });

    expect(response.status).toBe(200);
    expect(response.body.data.commercialEcosystem).toBeNull();
  });
});
