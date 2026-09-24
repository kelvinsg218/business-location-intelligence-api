'use strict';

const commercialEcosystemSearch = require('../../../src/services/commercialEcosystemSearch');
const { MockPlacesProvider } = require('../../../src/providers/places/mockPlacesProvider');
const { haversineDistanceKm } = require('../../../src/utils/geo');

const VILA_VELHA = { lat: -20.3297, lng: -40.2925 };

const BASE_PARAMS = {
  center: VILA_VELHA,
  radiusKm: 5,
  enabled: true,
};

describe('commercialEcosystemSearch.run — gating (no provider calls when not applicable)', () => {
  it('returns null and calls the provider zero times when disabled', async () => {
    let calls = 0;
    const fakeProvider = { searchByTypes: async () => { calls += 1; return { places: [] }; } };

    const result = await commercialEcosystemSearch.run({
      ...BASE_PARAMS, enabled: false, businessType: 'gym', placesProvider: fakeProvider,
    });

    expect(result).toBeNull();
    expect(calls).toBe(0);
  });

  it('returns null and calls the provider zero times for a businessType with no profile in the catalog', async () => {
    let calls = 0;
    const fakeProvider = { searchByTypes: async () => { calls += 1; return { places: [] }; } };

    const result = await commercialEcosystemSearch.run({
      ...BASE_PARAMS, businessType: 'car wash', placesProvider: fakeProvider,
    });

    expect(result).toBeNull();
    expect(calls).toBe(0);
  });
});

describe('commercialEcosystemSearch.run (against MockPlacesProvider)', () => {
  it('resolves a known profile and returns populated, in-radius groups', async () => {
    const provider = new MockPlacesProvider();
    const result = await commercialEcosystemSearch.run({
      ...BASE_PARAMS, businessType: 'gym', placesProvider: provider,
    });

    expect(result.businessProfile).toBe('gym');
    expect(result.complementary.available).toBe(true);
    expect(result.trafficGenerators.available).toBe(true);
    [...result.complementary.results, ...result.trafficGenerators.results].forEach((place) => {
      expect(haversineDistanceKm(VILA_VELHA, place.location)).toBeLessThanOrEqual(BASE_PARAMS.radiusKm + 1e-6);
    });
  });

  it('excludes places marked CLOSED_PERMANENTLY', async () => {
    const provider = new MockPlacesProvider();
    const result = await commercialEcosystemSearch.run({
      ...BASE_PARAMS, radiusKm: 20, businessType: 'gym', placesProvider: provider,
    });

    [...result.complementary.results, ...result.trafficGenerators.results].forEach((place) => {
      expect(place.businessStatus).not.toBe('CLOSED_PERMANENTLY');
    });
  });

  it('includes the required non-guarantee framing note and never implies generated demand', async () => {
    const provider = new MockPlacesProvider();
    const result = await commercialEcosystemSearch.run({
      ...BASE_PARAMS, businessType: 'coffee shop', placesProvider: provider,
    });

    expect(result.notes.some((n) => n.includes('may indicate the presence of a commercially compatible ecosystem'))).toBe(true);
    result.notes.forEach((note) => {
      expect(note).not.toMatch(/will generate customers|vai gerar clientes|guaranteed|garante/i);
    });
  });

  it('includes an explicit coverage-limitation note (single-point, not a complete census)', async () => {
    const provider = new MockPlacesProvider();
    const result = await commercialEcosystemSearch.run({
      ...BASE_PARAMS, businessType: 'gym', placesProvider: provider,
    });

    expect(result.notes.some((n) => /single search|center point/i.test(n) && /not a complete census/i.test(n))).toBe(true);
  });

});

describe('commercialEcosystemSearch.searchGroup — empty type list', () => {
  it('skips the provider call entirely and returns available:true with zero results', async () => {
    let calls = 0;
    const fakeProvider = { searchByTypes: async () => { calls += 1; return { places: [] }; } };

    const result = await commercialEcosystemSearch.searchGroup({
      center: VILA_VELHA, radiusKm: 5, includedTypes: [], placesProvider: fakeProvider,
    });

    expect(result).toEqual({
      categoriesSearched: [], establishmentsFound: 0, results: [], available: true,
    });
    expect(calls).toBe(0);
  });
});

describe('commercialEcosystemSearch.run (against hand-crafted fakes) — graceful degradation', () => {
  it('degrades only the failing group to available:false, without rejecting, when one group fails', async () => {
    const fakeProvider = {
      searchByTypes: async ({ includedTypes }) => {
        if (includedTypes.includes('corporate_office')) {
          throw new Error('simulated upstream failure');
        }
        return {
          places: [{
            placeId: 'ok-1', name: 'Some Store', location: VILA_VELHA, businessStatus: 'OPERATIONAL', primaryType: includedTypes[0],
          }],
        };
      },
    };

    const result = await commercialEcosystemSearch.run({
      ...BASE_PARAMS, businessType: 'gym', placesProvider: fakeProvider,
    });

    expect(result).not.toBeNull();
    expect(result.trafficGenerators.available).toBe(false); // gym's trafficGeneratorTypes includes corporate_office
    expect(result.trafficGenerators.results).toEqual([]);
    expect(result.complementary.available).toBe(true);
    expect(result.complementary.results.length).toBeGreaterThan(0);
    expect(result.notes.some((n) => /temporarily unavailable/i.test(n))).toBe(true);
  });

  it('never rejects even when every group fails — contrast with placesCoverageSearch.run, which propagates total failure', async () => {
    const fakeProvider = {
      searchByTypes: async () => {
        throw new Error('all upstream calls failed');
      },
    };

    const result = await commercialEcosystemSearch.run({
      ...BASE_PARAMS, businessType: 'gym', placesProvider: fakeProvider,
    });

    expect(result).not.toBeNull();
    expect(result.complementary.available).toBe(false);
    expect(result.trafficGenerators.available).toBe(false);
  });

  it('deduplicates places by placeId within a group', async () => {
    const duplicate = {
      placeId: 'dup-1', name: 'Dup Store', location: VILA_VELHA, businessStatus: 'OPERATIONAL', primaryType: 'gym',
    };
    const fakeProvider = {
      searchByTypes: async () => ({ places: [duplicate, { ...duplicate }] }),
    };

    const result = await commercialEcosystemSearch.run({
      ...BASE_PARAMS, businessType: 'fitness clothing store', placesProvider: fakeProvider,
    });

    expect(result.complementary.results.length).toBe(1);
  });

  it('filters out a place outside the requested radius as a defensive safety net', async () => {
    const farAway = {
      placeId: 'far-away', name: 'Too Far Mall', location: { lat: VILA_VELHA.lat + 10, lng: VILA_VELHA.lng }, businessStatus: 'OPERATIONAL',
    };
    const fakeProvider = {
      searchByTypes: async () => ({ places: [farAway] }),
    };

    const result = await commercialEcosystemSearch.run({
      ...BASE_PARAMS, businessType: 'gym', placesProvider: fakeProvider,
    });

    expect(result.complementary.results).toEqual([]);
    expect(result.trafficGenerators.results).toEqual([]);
  });
});
