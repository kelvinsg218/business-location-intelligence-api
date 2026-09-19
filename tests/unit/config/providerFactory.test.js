'use strict';

const { createProviders } = require('../../../src/config/providerFactory');
const { MockGeocodingProvider } = require('../../../src/providers/geocoding/mockGeocodingProvider');
const { GoogleGeocodingProvider } = require('../../../src/providers/geocoding/googleGeocodingProvider');
const { MockPlacesProvider } = require('../../../src/providers/places/mockPlacesProvider');
const { GooglePlacesProvider } = require('../../../src/providers/places/googlePlacesProvider');

describe('createProviders', () => {
  it('selects mock providers when both USE_MOCK_* flags are true', () => {
    const { geocodingProvider, placesProvider, providerNames } = createProviders({
      USE_MOCK_GEOCODING: true, USE_MOCK_PLACES: true,
    });
    expect(geocodingProvider).toBeInstanceOf(MockGeocodingProvider);
    expect(placesProvider).toBeInstanceOf(MockPlacesProvider);
    expect(providerNames).toEqual({ geocoding: 'mock', places: 'mock' });
  });

  it('selects real Google providers when both USE_MOCK_* flags are false', () => {
    const { geocodingProvider, placesProvider, providerNames } = createProviders({
      USE_MOCK_GEOCODING: false, USE_MOCK_PLACES: false,
    });
    expect(geocodingProvider).toBeInstanceOf(GoogleGeocodingProvider);
    expect(placesProvider).toBeInstanceOf(GooglePlacesProvider);
    expect(providerNames).toEqual({ geocoding: 'google', places: 'google' });
  });

  it('allows independently mixing mock and real providers', () => {
    const { geocodingProvider, placesProvider } = createProviders({
      USE_MOCK_GEOCODING: true, USE_MOCK_PLACES: false,
    });
    expect(geocodingProvider).toBeInstanceOf(MockGeocodingProvider);
    expect(placesProvider).toBeInstanceOf(GooglePlacesProvider);
  });
});
