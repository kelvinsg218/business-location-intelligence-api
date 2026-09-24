'use strict';

const { GeocodingProviderContract } = require('../../../src/providers/geocoding/geocodingProvider.contract');
const { PlacesProviderContract } = require('../../../src/providers/places/placesProvider.contract');

describe('GeocodingProviderContract', () => {
  it('throws if geocode() is not overridden', async () => {
    const contract = new GeocodingProviderContract();
    await expect(contract.geocode('Vila Velha, ES')).rejects.toThrow(/must be implemented/);
  });

  it('allows a subclass to override geocode()', async () => {
    class FakeProvider extends GeocodingProviderContract {
      async geocode(text) {
        return { formattedAddress: text, coordinates: { lat: 0, lng: 0 } };
      }
    }
    const result = await new FakeProvider().geocode('anywhere');
    expect(result.formattedAddress).toBe('anywhere');
  });
});

describe('PlacesProviderContract', () => {
  it('throws if search() is not overridden', async () => {
    const contract = new PlacesProviderContract();
    await expect(contract.search({})).rejects.toThrow(/must be implemented/);
  });

  it('allows a subclass to override search()', async () => {
    class FakeProvider extends PlacesProviderContract {
      async search() {
        return { places: [], nextPageToken: null };
      }
    }
    const result = await new FakeProvider().search({ lat: 0, lng: 0, radiusMeters: 1000, businessType: 'gym' });
    expect(result).toEqual({ places: [], nextPageToken: null });
  });

  it('throws if searchByTypes() is not overridden', async () => {
    const contract = new PlacesProviderContract();
    await expect(contract.searchByTypes({})).rejects.toThrow(/must be implemented/);
  });

  it('allows a subclass to override searchByTypes()', async () => {
    class FakeProvider extends PlacesProviderContract {
      async searchByTypes() {
        return { places: [] };
      }
    }
    const result = await new FakeProvider().searchByTypes({
      lat: 0, lng: 0, radiusMeters: 1000, includedTypes: ['gym'],
    });
    expect(result).toEqual({ places: [] });
  });
});
