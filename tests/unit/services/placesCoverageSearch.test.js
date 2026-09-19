'use strict';

const placesCoverageSearch = require('../../../src/services/placesCoverageSearch');
const { MockPlacesProvider } = require('../../../src/providers/places/mockPlacesProvider');
const { haversineDistanceKm } = require('../../../src/utils/geo');

const VILA_VELHA = { lat: -20.3297, lng: -40.2925 };

const BASE_PARAMS = {
  center: VILA_VELHA,
  gridMinRadiusKm: 3,
  maxPoints: 7,
  maxPagesPerPoint: 1,
};

describe('placesCoverageSearch.run (against MockPlacesProvider)', () => {
  it('uses a single search point for a small radius and returns only in-radius results', async () => {
    const provider = new MockPlacesProvider();
    const result = await placesCoverageSearch.run({
      ...BASE_PARAMS, radiusKm: 2, businessType: 'gym', keywords: [], placesProvider: provider,
    });

    expect(result.searchStrategy.type).toBe('single-point');
    expect(result.searchStrategy.pointsUsed).toBe(1);
    expect(result.searchStrategy.externalQueriesExecuted).toBe(1);
    expect(result.searchStrategy.failedQueries).toBe(0);
    result.places.forEach((place) => {
      expect(haversineDistanceKm(VILA_VELHA, place.location)).toBeLessThanOrEqual(2 + 1e-6);
    });
  });

  it('uses a 7-point grid above the threshold and issues 7 external queries', async () => {
    const provider = new MockPlacesProvider();
    const result = await placesCoverageSearch.run({
      ...BASE_PARAMS, radiusKm: 10, businessType: 'gym', keywords: [], placesProvider: provider,
    });

    expect(result.searchStrategy.type).toBe('grid');
    expect(result.searchStrategy.pointsUsed).toBe(7);
    expect(result.searchStrategy.externalQueriesExecuted).toBe(7);
    result.places.forEach((place) => {
      expect(haversineDistanceKm(VILA_VELHA, place.location)).toBeLessThanOrEqual(10 + 1e-6);
    });
  });

  it('deduplicates places rediscovered by overlapping grid points', async () => {
    const provider = new MockPlacesProvider();
    const radiusKm = 10;
    const businessType = 'gym';

    const result = await placesCoverageSearch.run({
      ...BASE_PARAMS, radiusKm, businessType, keywords: [], placesProvider: provider,
    });

    const uniqueIds = new Set(result.places.map((p) => p.placeId));
    expect(uniqueIds.size).toBe(result.places.length);

    // Prove overlap actually happened: summing each point's raw finds independently
    // must exceed the deduplicated total, otherwise this test would be vacuous.
    const { generateSearchGrid } = require('../../../src/utils/geo');
    const grid = generateSearchGrid({
      center: VILA_VELHA, radiusKm, maxPoints: 7, gridMinRadiusKm: 3,
    });
    let rawTotal = 0;
    for (const point of grid) {
      const raw = await provider.search({
        lat: point.lat, lng: point.lng, radiusMeters: point.subRadiusKm * 1000, businessType,
      });
      rawTotal += raw.places.length;
    }
    expect(rawTotal).toBeGreaterThan(result.places.length);
  });

  it('excludes places marked CLOSED_PERMANENTLY', async () => {
    const provider = new MockPlacesProvider();
    const result = await placesCoverageSearch.run({
      ...BASE_PARAMS, radiusKm: 20, businessType: 'pharmacy', keywords: [], placesProvider: provider,
    });

    result.places.forEach((place) => expect(place.businessStatus).not.toBe('CLOSED_PERMANENTLY'));
  });

  it('returns zero places (not an error) when nothing is found', async () => {
    const provider = new MockPlacesProvider();
    const result = await placesCoverageSearch.run({
      ...BASE_PARAMS, radiusKm: 5, businessType: '__zero_results__', keywords: [], placesProvider: provider,
    });

    expect(result.places).toEqual([]);
    expect(result.searchStrategy.failedQueries).toBe(0);
  });
});

describe('placesCoverageSearch.run (against hand-crafted fakes)', () => {
  it('filters out a place outside the requested radius as a defensive safety net', async () => {
    const farAway = {
      placeId: 'far-away',
      name: 'Too Far Gym',
      location: { lat: VILA_VELHA.lat + 10, lng: VILA_VELHA.lng },
      businessStatus: 'OPERATIONAL',
    };
    const fakeProvider = {
      search: async () => ({ places: [farAway], nextPageToken: null }),
    };

    const result = await placesCoverageSearch.run({
      ...BASE_PARAMS, radiusKm: 2, businessType: 'gym', keywords: [], placesProvider: fakeProvider,
    });

    expect(result.places).toEqual([]);
  });

  it('continues with partial results when some grid points fail, and reports it', async () => {
    let call = 0;
    const fakeProvider = {
      search: async () => {
        call += 1;
        if (call % 2 === 0) {
          throw new Error('simulated upstream failure');
        }
        return {
          places: [{
            placeId: `ok-${call}`,
            name: 'Some Gym',
            location: VILA_VELHA,
            businessStatus: 'OPERATIONAL',
          }],
          nextPageToken: null,
        };
      },
    };

    const result = await placesCoverageSearch.run({
      ...BASE_PARAMS, radiusKm: 10, businessType: 'gym', keywords: [], placesProvider: fakeProvider,
    });

    expect(result.searchStrategy.failedQueries).toBeGreaterThan(0);
    expect(result.searchStrategy.failedQueries).toBeLessThan(result.searchStrategy.pointsUsed);
    expect(result.places.length).toBeGreaterThan(0);
    expect(result.searchStrategy.limitations.some((l) => l.includes('failed and were skipped'))).toBe(true);
  });

  it('propagates the error when every grid point fails', async () => {
    const fakeProvider = {
      search: async () => {
        throw new Error('all upstream calls failed');
      },
    };

    await expect(placesCoverageSearch.run({
      ...BASE_PARAMS, radiusKm: 10, businessType: 'gym', keywords: [], placesProvider: fakeProvider,
    })).rejects.toThrow('all upstream calls failed');
  });
});
