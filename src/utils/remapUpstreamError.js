'use strict';

const { ApiError } = require('./ApiError');

// Turns httpClient's vendor-agnostic UPSTREAM_TIMEOUT/UPSTREAM_UNAVAILABLE
// into the caller's own prefixed codes (e.g. GEOCODING_TIMEOUT, PLACES_TIMEOUT),
// matching the error mapping table. Any other error passes through unchanged.
function remapUpstreamError(err, prefix) {
  if (err instanceof ApiError && err.code === 'UPSTREAM_TIMEOUT') {
    return new ApiError(504, `${prefix}_TIMEOUT`, 'The upstream request timed out.');
  }
  if (err instanceof ApiError && err.code === 'UPSTREAM_UNAVAILABLE') {
    return new ApiError(503, `${prefix}_UNAVAILABLE`, 'The upstream service is unavailable.');
  }
  return err;
}

module.exports = { remapUpstreamError };
