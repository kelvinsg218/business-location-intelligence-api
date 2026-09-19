'use strict';

/**
 * @typedef {Object} PlaceResult
 * @property {string} placeId
 * @property {string} name
 * @property {string} [address]
 * @property {{ lat: number, lng: number }} location
 * @property {string[]} [types]
 * @property {string} [primaryType]
 * @property {string} [businessStatus]
 */

/**
 * @typedef {Object} PlacesSearchResult
 * @property {PlaceResult[]} places
 * @property {string|null} nextPageToken
 */

/**
 * Vendor-agnostic contract for a single, page-at-a-time search around a
 * point. Grid generation, pagination across pages/points, deduplication and
 * distance filtering all live one layer up (placesCoverageSearch) and never
 * inside a provider implementation — a provider only ever answers one query.
 */
class PlacesProviderContract {
  /**
   * @param {Object} params
   * @param {number} params.lat
   * @param {number} params.lng
   * @param {number} params.radiusMeters
   * @param {string} params.businessType
   * @param {string[]} [params.keywords]
   * @param {string|null} [params.pageToken]
   * @returns {Promise<PlacesSearchResult>}
   */
  async search(_params) {
    throw new Error('search() must be implemented by a PlacesProviderContract subclass');
  }
}

module.exports = { PlacesProviderContract };
