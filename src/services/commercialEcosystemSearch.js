'use strict';

const { haversineDistanceKm } = require('../utils/geo');
const { kmToMeters } = require('../utils/unitConversion');
const { resolveBusinessProfile } = require('../config/businessProfiles');

const CLOSED_STATUS = 'CLOSED_PERMANENTLY';

const REQUIRED_FRAMING_NOTE = 'Businesses that may indicate the presence of a commercially compatible ecosystem — not a guarantee of demand or foot traffic.';
const COVERAGE_LIMITATION_NOTE = 'Coverage is a single search at the analyzed center point (not the multi-point grid used for competitors) — establishmentsFound is not a complete census of every complementary business or traffic generator within the radius.';

/**
 * Phase 1 coverage strategy: query once, at the analyzed center point, to
 * keep Commercial Ecosystem cost bounded and independent of the competitor
 * grid's size. Deliberately isolated in its own function (rather than
 * inlined into searchGroup) so a future grid- or adaptive-coverage strategy
 * can be introduced later — if real usage ever justifies the added cost —
 * by changing only this function, not the response contract, the provider
 * contract, or any call site.
 */
function resolveSearchPoints({ center }) {
  return [center];
}

// Same dedup-by-placeId + CLOSED_PERMANENTLY exclusion + defensive distance
// re-filter as placesCoverageSearch.js's run(), copied rather than shared so
// that file (and the existing competitor search it powers) stays untouched.
function dedupeAndFilter(rawPlaces, { center, radiusKm }) {
  const byPlaceId = new Map();

  rawPlaces.forEach((place) => {
    if (place.businessStatus === CLOSED_STATUS) return;
    if (haversineDistanceKm(center, place.location) > radiusKm) return;
    if (!byPlaceId.has(place.placeId)) {
      byPlaceId.set(place.placeId, place);
    }
  });

  return [...byPlaceId.values()];
}

/**
 * Searches one ecosystem group (complementary OR traffic generators).
 * Never throws: a failure in this new, optional subsystem must never turn
 * an otherwise-successful competitor analysis into a failed /analyze
 * request — this is a deliberate divergence from placesCoverageSearch's
 * all-points-failed-rethrows behavior.
 */
async function searchGroup({
  center, radiusKm, includedTypes, placesProvider,
}) {
  if (!includedTypes || includedTypes.length === 0) {
    return {
      categoriesSearched: [], establishmentsFound: 0, results: [], available: true,
    };
  }

  try {
    const points = resolveSearchPoints({ center, radiusKm });
    const perPointResults = await Promise.all(points.map((point) => placesProvider.searchByTypes({
      lat: point.lat,
      lng: point.lng,
      radiusMeters: kmToMeters(radiusKm),
      includedTypes,
    })));

    const rawPlaces = perPointResults.flatMap((result) => result.places);
    const results = dedupeAndFilter(rawPlaces, { center, radiusKm });

    return {
      categoriesSearched: includedTypes, establishmentsFound: results.length, results, available: true,
    };
  } catch {
    return {
      categoriesSearched: includedTypes, establishmentsFound: 0, results: [], available: false,
    };
  }
}

/**
 * Commercial Ecosystem analysis: categorizes nearby places (relative to the
 * given businessType's Business Profile) into complementary businesses and
 * potential traffic generators — distinct from, and never interfering with,
 * the existing competitor search. Returns null (not an empty object) when
 * disabled or when businessType has no Phase 1 profile, so callers need
 * exactly one null-check regardless of which reason applies.
 */
async function run({
  center, radiusKm, businessType, placesProvider, enabled,
}) {
  if (!enabled) return null;

  const profile = resolveBusinessProfile(businessType);
  if (!profile) return null;

  const [complementary, trafficGenerators] = await Promise.all([
    searchGroup({
      center, radiusKm, includedTypes: profile.complementaryTypes, placesProvider,
    }),
    searchGroup({
      center, radiusKm, includedTypes: profile.trafficGeneratorTypes, placesProvider,
    }),
  ]);

  const notes = [REQUIRED_FRAMING_NOTE, COVERAGE_LIMITATION_NOTE];
  if (!complementary.available) {
    notes.push('Complementary business data was temporarily unavailable for this analysis.');
  }
  if (!trafficGenerators.available) {
    notes.push('Potential traffic generator data was temporarily unavailable for this analysis.');
  }

  return {
    businessProfile: profile.id,
    complementary,
    trafficGenerators,
    notes,
  };
}

// searchGroup is exported alongside run() (unlike placesCoverageSearch.js,
// which keeps its per-point helper internal-only) because its
// empty-includedTypes branch has no current Business Profile that reaches
// it — direct testing is the honest way to cover that path today.
module.exports = { run, searchGroup };
