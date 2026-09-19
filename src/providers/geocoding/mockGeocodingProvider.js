'use strict';

const { GeocodingProviderContract } = require('./geocodingProvider.contract');
const { hashStringToInt } = require('../../utils/mockDeterminism');

// Any location text containing this (case/accent-insensitive) resolves to
// "not found", so the 404 LOCATION_NOT_FOUND path can be tested deterministically
// without depending on the real Google API.
const NOT_FOUND_SENTINEL = '__notfound__';

// Real-world coordinates for the product spec's own example locations, so
// manual testing in mock mode looks realistic without needing a real key.
const KNOWN_LOCATIONS = {
  'vila velha, es': { lat: -20.3297, lng: -40.2925, formattedAddress: 'Vila Velha - ES, Brazil' },
  'vila velha, es, brazil': { lat: -20.3297, lng: -40.2925, formattedAddress: 'Vila Velha - ES, Brazil' },
  'praia do canto, vitoria': {
    lat: -20.2887, lng: -40.2938, formattedAddress: 'Praia do Canto, Vitória - ES, Brazil',
  },
  'sao paulo, sp': { lat: -23.5505, lng: -46.6333, formattedAddress: 'São Paulo - SP, Brazil' },
  'av. paulista, sao paulo': {
    lat: -23.5613, lng: -46.656, formattedAddress: 'Av. Paulista, São Paulo - SP, Brazil',
  },
};

function normalizeKey(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Deterministically derives a plausible lat/lng from arbitrary text, so any
// location a developer types resolves consistently across calls and tests.
function hashToCoordinates(normalizedText) {
  const latSeed = hashStringToInt(`lat:${normalizedText}`);
  const lngSeed = hashStringToInt(`lng:${normalizedText}`);
  const lat = ((latSeed % 170000) / 1000) - 85; // [-85, 85) — avoids the poles
  const lng = ((lngSeed % 360000) / 1000) - 180; // [-180, 180)
  return { lat, lng };
}

class MockGeocodingProvider extends GeocodingProviderContract {
  async geocode(locationText) {
    const normalized = normalizeKey(locationText);

    if (!normalized) {
      return null;
    }

    if (normalized.includes(NOT_FOUND_SENTINEL)) {
      return null;
    }

    const known = KNOWN_LOCATIONS[normalized];
    if (known) {
      return {
        formattedAddress: known.formattedAddress,
        coordinates: { lat: known.lat, lng: known.lng },
        placeId: `mock-geo-${hashStringToInt(normalized)}`,
      };
    }

    const coordinates = hashToCoordinates(normalized);
    return {
      formattedAddress: `${locationText.trim()} (mock)`,
      coordinates,
      placeId: `mock-geo-${hashStringToInt(normalized)}`,
    };
  }
}

module.exports = { MockGeocodingProvider, NOT_FOUND_SENTINEL };
