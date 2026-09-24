'use strict';

const { PlacesProviderContract } = require('./placesProvider.contract');
const { ApiError } = require('../../utils/ApiError');
const httpClient = require('../../utils/httpClient');
const { env } = require('../../config/env');
const { remapUpstreamError } = require('../../utils/remapUpstreamError');
const { logger } = require('../../utils/logger');

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const SEARCH_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';

// MVP field mask: every field here is Pro-tier or cheaper, never Enterprise
// (no rating/userRatingCount/priceLevel/openingHours). Named as a constant so
// a future ADVANCED_FIELD_MASK can be added alongside it without touching
// the request-building code below (see the plan's "analysisLevel" prep note).
const BASIC_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.types',
  'places.primaryType',
  'places.businessStatus',
  'nextPageToken',
].join(',');

// Same Pro-tier-only fields as BASIC_FIELD_MASK, minus nextPageToken —
// Nearby Search (New) has no pagination at all, so there's nothing to mask.
const NEARBY_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.types',
  'places.primaryType',
  'places.businessStatus',
].join(',');

function buildTextQuery(businessType, keywords) {
  return [businessType, ...(keywords || [])].filter(Boolean).join(' ');
}

function assertConfigured() {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw new ApiError(
      503,
      'CONFIGURATION_ERROR',
      'Server is not configured with a Google Maps API key. Set GOOGLE_MAPS_API_KEY to use this feature.',
    );
  }
}

function mapPlacesErrorStatus(errorStatus, fallbackStatus) {
  switch (errorStatus) {
    case 'RESOURCE_EXHAUSTED':
      return new ApiError(429, 'PLACES_QUOTA_EXCEEDED', 'Places API quota exceeded.');
    case 'PERMISSION_DENIED':
      return new ApiError(502, 'PLACES_CONFIG_ERROR', 'Places API request was denied — check the API key/configuration.');
    case 'INVALID_ARGUMENT':
      return new ApiError(400, 'PLACES_BAD_REQUEST', 'Places API rejected the request.');
    default:
      return new ApiError(502, 'PLACES_UPSTREAM_ERROR', `Unexpected Places API error: ${errorStatus || fallbackStatus}`);
  }
}

// Shared by search() and searchByTypes(): performs the POST, remaps
// transport-level failures (timeout/network), and turns a non-ok Google
// response into the same ApiError taxonomy for both request shapes.
async function performPlacesRequest(url, { headers, body }) {
  let result;
  try {
    result = await httpClient.request(url, {
      method: 'POST',
      headers,
      body,
      timeoutMs: env.HTTP_TIMEOUT_MS,
    });
  } catch (err) {
    throw remapUpstreamError(err, 'PLACES');
  }

  logger.debug({ status: result.status }, 'places search request completed');

  if (result.ok && result.body) {
    return result.body;
  }

  const errorStatus = result.body && result.body.error && result.body.error.status;
  throw mapPlacesErrorStatus(errorStatus, result.status);
}

function mapPlace(raw) {
  return {
    placeId: raw.id,
    name: (raw.displayName && raw.displayName.text) || '',
    address: raw.formattedAddress || '',
    location: { lat: raw.location.latitude, lng: raw.location.longitude },
    types: raw.types || [],
    primaryType: raw.primaryType || (raw.types && raw.types[0]) || null,
    businessStatus: raw.businessStatus || 'OPERATIONAL',
  };
}

class GooglePlacesProvider extends PlacesProviderContract {
  async search({
    lat, lng, radiusMeters, businessType, keywords, pageToken,
  }) {
    assertConfigured();

    const body = {
      textQuery: buildTextQuery(businessType, keywords),
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      maxResultCount: 20,
      ...(pageToken ? { pageToken } : {}),
    };

    const responseBody = await performPlacesRequest(SEARCH_TEXT_URL, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': BASIC_FIELD_MASK,
      },
      body,
    });

    const places = (responseBody.places || []).map(mapPlace);
    return { places, nextPageToken: responseBody.nextPageToken || null };
  }

  // Commercial Ecosystem's type-filtered search — Nearby Search (New), a
  // single call with a real `includedTypes` list, no pagination. Kept as a
  // separate method from search() (Text Search) rather than a parameterized
  // branch: the two hit different Google endpoints with different bodies
  // and no pagination concept in common.
  async searchByTypes({ lat, lng, radiusMeters, includedTypes }) {
    assertConfigured();

    const body = {
      includedTypes,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
    };

    const responseBody = await performPlacesRequest(SEARCH_NEARBY_URL, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': NEARBY_FIELD_MASK,
      },
      body,
    });

    const places = (responseBody.places || []).map(mapPlace);
    return { places };
  }
}

module.exports = { GooglePlacesProvider, BASIC_FIELD_MASK, NEARBY_FIELD_MASK };
