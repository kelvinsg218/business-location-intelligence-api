'use strict';

const { analyze } = require('../../../src/services/locationAnalysis.service');
const { MockGeocodingProvider } = require('../../../src/providers/geocoding/mockGeocodingProvider');
const { MockPlacesProvider } = require('../../../src/providers/places/mockPlacesProvider');
const { ApiError } = require('../../../src/utils/ApiError');

const DEFAULT_DEPS = {
  maxSearchPoints: 7,
  gridMinRadiusKm: 3,
  maxPagesPerPoint: 1,
  providerNames: { geocoding: 'mock', places: 'mock' },
};

describe('locationAnalysis.service.analyze (against mocks)', () => {
  it('returns a fully-shaped response for a happy path', async () => {
    const result = await analyze({
      location: 'Vila Velha, ES',
      businessType: 'gym',
      radiusKm: 5,
      keywords: [],
      geocodingProvider: new MockGeocodingProvider(),
      placesProvider: new MockPlacesProvider(),
      ...DEFAULT_DEPS,
    });

    expect(result.query).toEqual({
      location: 'Vila Velha, ES', businessType: 'gym', radiusKm: 5, radiusMeters: 5000, keywords: [],
    });
    expect(result.resolvedLocation.coordinates.lat).toBeCloseTo(-20.3297, 3);
    expect(result.resolvedLocation.coordinates.lng).toBeCloseTo(-40.2925, 3);
    expect(result.places.establishmentsFound).toBe(result.places.results.length);
    expect(result.places.establishmentsFound).toBeGreaterThan(0);
    expect(result.searchStrategy.provider).toEqual({ geocoding: 'mock', places: 'mock' });
    expect(result.analysis.competitorCount).toBe(result.places.establishmentsFound);
    expect(new Date(result.meta.generatedAt).toString()).not.toBe('Invalid Date');
  });

  it('reports zero establishments as a valid (not error) outcome, with max opportunity score', async () => {
    const result = await analyze({
      location: 'Vila Velha, ES',
      businessType: '__zero_results__',
      radiusKm: 5,
      keywords: [],
      geocodingProvider: new MockGeocodingProvider(),
      placesProvider: new MockPlacesProvider(),
      ...DEFAULT_DEPS,
    });

    expect(result.places.establishmentsFound).toBe(0);
    expect(result.analysis.opportunityScore).toBe(100);
  });

  it('throws a 404 LOCATION_NOT_FOUND ApiError when geocoding finds nothing', async () => {
    await expect(analyze({
      location: '__notfound__',
      businessType: 'gym',
      radiusKm: 5,
      keywords: [],
      geocodingProvider: new MockGeocodingProvider(),
      placesProvider: new MockPlacesProvider(),
      ...DEFAULT_DEPS,
    })).rejects.toMatchObject({ statusCode: 404, code: 'LOCATION_NOT_FOUND' });
  });
});

describe('locationAnalysis.service.analyze (error propagation with fakes)', () => {
  it('propagates a geocoding provider ApiError unchanged', async () => {
    const fakeGeocoding = {
      geocode: async () => {
        throw new ApiError(429, 'GEOCODING_QUOTA_EXCEEDED', 'quota exceeded');
      },
    };

    await expect(analyze({
      location: 'anywhere',
      businessType: 'gym',
      radiusKm: 5,
      keywords: [],
      geocodingProvider: fakeGeocoding,
      placesProvider: new MockPlacesProvider(),
      ...DEFAULT_DEPS,
    })).rejects.toMatchObject({ statusCode: 429, code: 'GEOCODING_QUOTA_EXCEEDED' });
  });

  it('propagates a places provider error when every grid point fails', async () => {
    const fakePlaces = {
      search: async () => {
        throw new ApiError(429, 'PLACES_QUOTA_EXCEEDED', 'quota exceeded');
      },
    };

    await expect(analyze({
      location: 'Vila Velha, ES',
      businessType: 'gym',
      radiusKm: 5,
      keywords: [],
      geocodingProvider: new MockGeocodingProvider(),
      placesProvider: fakePlaces,
      ...DEFAULT_DEPS,
    })).rejects.toMatchObject({ statusCode: 429, code: 'PLACES_QUOTA_EXCEEDED' });
  });
});
