'use strict';

const { ApiError } = require('../utils/ApiError');
const { kmToMeters } = require('../utils/unitConversion');
const placesCoverageSearch = require('./placesCoverageSearch');
const { calculateBasicOpportunityScore } = require('./opportunityScore');

/**
 * Orchestrates the full analysis: geocode -> multi-point coverage search ->
 * opportunity score -> response shape. Only ever depends on the geocoding
 * and places provider contracts (never a vendor directly), so swapping
 * mock/real/future providers never touches this function.
 */
async function analyze({
  location,
  businessType,
  radiusKm,
  keywords,
  geocodingProvider,
  placesProvider,
  providerNames,
  maxSearchPoints,
  gridMinRadiusKm,
  maxPagesPerPoint,
}) {
  const geocoded = await geocodingProvider.geocode(location);
  if (!geocoded) {
    throw new ApiError(404, 'LOCATION_NOT_FOUND', `No address could be resolved for "${location}"`);
  }

  const center = geocoded.coordinates;

  const { places, searchStrategy } = await placesCoverageSearch.run({
    center,
    radiusKm,
    businessType,
    keywords,
    placesProvider,
    maxPoints: maxSearchPoints,
    gridMinRadiusKm,
    maxPagesPerPoint,
  });

  const analysis = calculateBasicOpportunityScore({ places, center, radiusKm });

  return {
    query: {
      location, businessType, radiusKm, radiusMeters: kmToMeters(radiusKm), keywords,
    },
    resolvedLocation: {
      formattedAddress: geocoded.formattedAddress,
      coordinates: center,
    },
    places: {
      establishmentsFound: places.length,
      results: places,
    },
    searchStrategy: {
      ...searchStrategy,
      provider: providerNames,
    },
    analysis,
    meta: { generatedAt: new Date().toISOString() },
  };
}

module.exports = { analyze };
