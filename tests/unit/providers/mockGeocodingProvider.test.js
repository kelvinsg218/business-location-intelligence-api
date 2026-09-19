'use strict';

const { MockGeocodingProvider } = require('../../../src/providers/geocoding/mockGeocodingProvider');

describe('MockGeocodingProvider', () => {
  const provider = new MockGeocodingProvider();

  it('resolves a known example location to realistic coordinates', async () => {
    const result = await provider.geocode('Vila Velha, ES');
    expect(result).not.toBeNull();
    expect(result.coordinates.lat).toBeCloseTo(-20.3297, 3);
    expect(result.coordinates.lng).toBeCloseTo(-40.2925, 3);
    expect(result.formattedAddress).toMatch(/Vila Velha/);
  });

  it('is deterministic for arbitrary text not in the known list', async () => {
    const a = await provider.geocode('Some Random Neighborhood, XX');
    const b = await provider.geocode('Some Random Neighborhood, XX');
    expect(a.coordinates).toEqual(b.coordinates);
  });

  it('returns different coordinates for different arbitrary text', async () => {
    const a = await provider.geocode('Alpha District');
    const b = await provider.geocode('Beta District');
    expect(a.coordinates).not.toEqual(b.coordinates);
  });

  it('returns valid coordinate ranges for arbitrary text', async () => {
    const result = await provider.geocode('Anywhere At All');
    expect(result.coordinates.lat).toBeGreaterThanOrEqual(-85);
    expect(result.coordinates.lat).toBeLessThan(85);
    expect(result.coordinates.lng).toBeGreaterThanOrEqual(-180);
    expect(result.coordinates.lng).toBeLessThan(180);
  });

  it('returns null for the not-found sentinel', async () => {
    expect(await provider.geocode('__notfound__')).toBeNull();
    expect(await provider.geocode('Somewhere __NotFound__ Nowhere')).toBeNull();
  });

  it('returns null for empty input', async () => {
    expect(await provider.geocode('')).toBeNull();
  });
});
