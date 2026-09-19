'use strict';

const { MockGeocodingProvider } = require('../providers/geocoding/mockGeocodingProvider');
const { GoogleGeocodingProvider } = require('../providers/geocoding/googleGeocodingProvider');
const { MockPlacesProvider } = require('../providers/places/mockPlacesProvider');
const { GooglePlacesProvider } = require('../providers/places/googlePlacesProvider');

// The only place in the app that ever instantiates a Google-specific
// provider. Everything downstream (service, controller) only ever sees the
// provider contracts, so a future vendor just means a new branch here.
function createProviders(env) {
  const geocodingProvider = env.USE_MOCK_GEOCODING ? new MockGeocodingProvider() : new GoogleGeocodingProvider();
  const placesProvider = env.USE_MOCK_PLACES ? new MockPlacesProvider() : new GooglePlacesProvider();

  return {
    geocodingProvider,
    placesProvider,
    providerNames: {
      geocoding: env.USE_MOCK_GEOCODING ? 'mock' : 'google',
      places: env.USE_MOCK_PLACES ? 'mock' : 'google',
    },
  };
}

module.exports = { createProviders };
