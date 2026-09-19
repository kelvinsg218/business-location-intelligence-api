'use strict';

const { MockPlacesProvider } = require('../../../src/providers/places/mockPlacesProvider');
const { haversineDistanceKm, destinationPoint } = require('../../../src/utils/geo');

const VILA_VELHA = { lat: -20.3297, lng: -40.2925 };

describe('MockPlacesProvider', () => {
  const provider = new MockPlacesProvider();

  it('only returns places within the requested radius (real lat/lng-based distance)', async () => {
    const radiusKm = 5;
    const result = await provider.search({
      lat: VILA_VELHA.lat, lng: VILA_VELHA.lng, radiusMeters: radiusKm * 1000, businessType: 'gym',
    });

    expect(result.places.length).toBeGreaterThan(0);
    result.places.forEach((place) => {
      expect(haversineDistanceKm(VILA_VELHA, place.location)).toBeLessThanOrEqual(radiusKm + 1e-6);
    });
  });

  it('is deterministic: the same query returns the same places in the same order', async () => {
    const query = {
      lat: VILA_VELHA.lat, lng: VILA_VELHA.lng, radiusMeters: 5000, businessType: 'gym',
    };
    const a = await provider.search(query);
    const b = await provider.search(query);
    expect(a).toEqual(b);
  });

  it('varies results by business type/category', async () => {
    const base = {
      lat: VILA_VELHA.lat, lng: VILA_VELHA.lng, radiusMeters: 20000,
    };
    const gym = await provider.search({ ...base, businessType: 'gym' });
    const pharmacy = await provider.search({ ...base, businessType: 'pharmacy' });

    // Different categories must not resolve to the exact same set of places.
    expect(gym.places.map((p) => p.placeId)).not.toEqual(pharmacy.places.map((p) => p.placeId));
    gym.places.forEach((place) => expect(place.primaryType).toBe('gym'));
    pharmacy.places.forEach((place) => expect(place.primaryType).toBe('pharmacy'));
  });

  it('produces overlapping/duplicate places (by placeId) for nearby overlapping search points', async () => {
    const radiusKm = 5;
    const shifted = destinationPoint(VILA_VELHA, 1, 90); // 1km east — circles overlap heavily

    const first = await provider.search({
      lat: VILA_VELHA.lat, lng: VILA_VELHA.lng, radiusMeters: radiusKm * 1000, businessType: 'gym',
    });
    const second = await provider.search({
      lat: shifted.lat, lng: shifted.lng, radiusMeters: radiusKm * 1000, businessType: 'gym',
    });

    const idsA = new Set(first.places.map((p) => p.placeId));
    const idsB = new Set(second.places.map((p) => p.placeId));
    const overlap = [...idsA].filter((id) => idsB.has(id));

    expect(idsA.size).toBeGreaterThan(0);
    expect(overlap.length).toBeGreaterThan(0);
  });

  it('supports pagination for dense categories/large radii without cross-page duplicates', async () => {
    const firstPage = await provider.search({
      lat: VILA_VELHA.lat, lng: VILA_VELHA.lng, radiusMeters: 20000, businessType: 'restaurant',
    });

    expect(firstPage.places.length).toBe(20);
    expect(firstPage.nextPageToken).toBe('20');

    const secondPage = await provider.search({
      lat: VILA_VELHA.lat, lng: VILA_VELHA.lng, radiusMeters: 20000, businessType: 'restaurant', pageToken: firstPage.nextPageToken,
    });

    expect(secondPage.places.length).toBeGreaterThan(0);
    const firstIds = new Set(firstPage.places.map((p) => p.placeId));
    secondPage.places.forEach((place) => expect(firstIds.has(place.placeId)).toBe(false));
  });

  it('returns an empty result set for the zero-results sentinel', async () => {
    const result = await provider.search({
      lat: VILA_VELHA.lat, lng: VILA_VELHA.lng, radiusMeters: 5000, businessType: '__zero_results__',
    });
    expect(result.places).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });

  it('marks a realistic minority of places as CLOSED_PERMANENTLY, most OPERATIONAL', async () => {
    const result = await provider.search({
      lat: VILA_VELHA.lat, lng: VILA_VELHA.lng, radiusMeters: 20000, businessType: 'pharmacy',
    });

    const statuses = result.places.map((p) => p.businessStatus);
    expect(statuses).toContain('CLOSED_PERMANENTLY');
    expect(statuses).toContain('OPERATIONAL');
  });
});
