'use strict';

const { PlacesProviderContract } = require('./placesProvider.contract');
const { ApiError } = require('../../utils/ApiError');
const httpClient = require('../../utils/httpClient');
const { env } = require('../../config/env');
const { remapUpstreamError } = require('../../utils/remapUpstreamError');
const { logger } = require('../../utils/logger');

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

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

function buildTextQuery(businessType, keywords) {
  return [businessType, ...(keywords || [])].filter(Boolean).join(' ');
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
    if (!env.GOOGLE_MAPS_API_KEY) {
      throw new ApiError(
        503,
        'CONFIGURATION_ERROR',
        'Server is not configured with a Google Maps API key. Set GOOGLE_MAPS_API_KEY to use this feature.',
      );
    }

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

    let result;
    try {
      result = await httpClient.request(SEARCH_TEXT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': BASIC_FIELD_MASK,
        },
        body,
        timeoutMs: env.HTTP_TIMEOUT_MS,
      });
    } catch (err) {
      throw remapUpstreamError(err, 'PLACES');
    }

    logger.debug({ status: result.status }, 'places search request completed');

    if (result.ok && result.body) {
      const places = (result.body.places || []).map(mapPlace);
      return { places, nextPageToken: result.body.nextPageToken || null };
    }

    const errorStatus = result.body && result.body.error && result.body.error.status;
    switch (errorStatus) {
      case 'RESOURCE_EXHAUSTED':
        throw new ApiError(429, 'PLACES_QUOTA_EXCEEDED', 'Places API quota exceeded.');
      case 'PERMISSION_DENIED':
        throw new ApiError(502, 'PLACES_CONFIG_ERROR', 'Places API request was denied — check the API key/configuration.');
      case 'INVALID_ARGUMENT':
        throw new ApiError(400, 'PLACES_BAD_REQUEST', 'Places API rejected the request.');
      default:
        throw new ApiError(502, 'PLACES_UPSTREAM_ERROR', `Unexpected Places API error: ${errorStatus || result.status}`);
    }
  }
}

module.exports = { GooglePlacesProvider, BASIC_FIELD_MASK };
