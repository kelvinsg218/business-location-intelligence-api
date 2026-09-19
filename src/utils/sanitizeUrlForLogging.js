'use strict';

// Strips the `key` query param (used by the legacy Geocoding API) before a
// URL is ever passed to the logger. The Places (New) API key travels in a
// header instead, which we simply never log.
function sanitizeUrlForLogging(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('key')) {
      parsed.searchParams.set('key', '***');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

module.exports = { sanitizeUrlForLogging };
