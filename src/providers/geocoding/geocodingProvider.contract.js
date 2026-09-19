'use strict';

/**
 * @typedef {Object} GeocodeResult
 * @property {string} formattedAddress
 * @property {{ lat: number, lng: number }} coordinates
 * @property {string} [placeId]
 */

/**
 * Vendor-agnostic contract for resolving a free-text location into
 * coordinates. Implementations (Google, mock, or any future vendor) extend
 * this and override `geocode`. Everything above this layer (the service,
 * the controller) only ever depends on this shape, never on a vendor.
 */
class GeocodingProviderContract {
  /**
   * @param {string} _locationText
   * @returns {Promise<GeocodeResult|null>} null means "no match found" (the
   *   caller maps that to a 404 LOCATION_NOT_FOUND, not a thrown error).
   */
  async geocode(_locationText) {
    throw new Error('geocode() must be implemented by a GeocodingProviderContract subclass');
  }
}

module.exports = { GeocodingProviderContract };
