'use strict';

const { GeocodingProviderContract } = require('./geocodingProvider.contract');
const { ApiError } = require('../../utils/ApiError');
const httpClient = require('../../utils/httpClient');
const { env } = require('../../config/env');
const { sanitizeUrlForLogging } = require('../../utils/sanitizeUrlForLogging');
const { remapUpstreamError } = require('../../utils/remapUpstreamError');
const { logger } = require('../../utils/logger');

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

class GoogleGeocodingProvider extends GeocodingProviderContract {
  async geocode(locationText) {
    if (!env.GOOGLE_MAPS_API_KEY) {
      throw new ApiError(
        503,
        'CONFIGURATION_ERROR',
        'Server is not configured with a Google Maps API key. Set GOOGLE_MAPS_API_KEY to use this feature.',
      );
    }

    const url = `${GEOCODE_URL}?address=${encodeURIComponent(locationText)}&key=${env.GOOGLE_MAPS_API_KEY}`;

    let result;
    try {
      result = await httpClient.request(url, { method: 'GET', timeoutMs: env.HTTP_TIMEOUT_MS });
    } catch (err) {
      throw remapUpstreamError(err, 'GEOCODING');
    }

    logger.debug({ url: sanitizeUrlForLogging(url), status: result.body && result.body.status }, 'geocoding request completed');

    if (!result.ok || !result.body) {
      throw new ApiError(502, 'GEOCODING_UPSTREAM_ERROR', 'The geocoding provider returned an unexpected response.');
    }

    const { status, results } = result.body;

    switch (status) {
      case 'OK': {
        const first = results[0];
        return {
          formattedAddress: first.formatted_address,
          coordinates: { lat: first.geometry.location.lat, lng: first.geometry.location.lng },
          placeId: first.place_id,
        };
      }
      case 'ZERO_RESULTS':
        return null;
      case 'OVER_QUERY_LIMIT':
        throw new ApiError(429, 'GEOCODING_QUOTA_EXCEEDED', 'Geocoding API quota exceeded.');
      case 'REQUEST_DENIED':
        throw new ApiError(502, 'GEOCODING_CONFIG_ERROR', 'Geocoding API request was denied — check the API key/configuration.');
      case 'INVALID_REQUEST':
        throw new ApiError(400, 'GEOCODING_BAD_REQUEST', 'Geocoding API rejected the request.');
      default:
        throw new ApiError(502, 'GEOCODING_UPSTREAM_ERROR', `Unexpected geocoding status: ${status}`);
    }
  }
}

module.exports = { GoogleGeocodingProvider };
