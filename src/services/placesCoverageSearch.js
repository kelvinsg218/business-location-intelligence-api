'use strict';

const { generateSearchGrid, haversineDistanceKm } = require('../utils/geo');
const { kmToMeters } = require('../utils/unitConversion');

const CLOSED_STATUS = 'CLOSED_PERMANENTLY';

async function fetchPagesForPoint(placesProvider, point, params, maxPagesPerPoint) {
  const collected = [];
  let pageToken = null;
  let pagesFetched = 0;

  for (let page = 0; page < maxPagesPerPoint; page += 1) {
    const result = await placesProvider.search({
      lat: point.lat,
      lng: point.lng,
      radiusMeters: kmToMeters(point.subRadiusKm),
      businessType: params.businessType,
      keywords: params.keywords,
      pageToken,
    });
    pagesFetched += 1;
    collected.push(...result.places);

    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }

  return { places: collected, pagesFetched };
}

/**
 * Orchestrates the multi-point grid search: generates the grid, queries the
 * (vendor-agnostic) placesProvider once per point/page, deduplicates by
 * place.id, excludes permanently-closed places, and defensively re-filters
 * by real haversine distance from the original center. Never talks to a
 * specific vendor directly — only depends on the placesProvider contract.
 */
async function run({
  center, radiusKm, businessType, keywords, placesProvider, maxPoints, gridMinRadiusKm, maxPagesPerPoint,
}) {
  const grid = generateSearchGrid({
    center, radiusKm, maxPoints, gridMinRadiusKm,
  });

  const settled = await Promise.allSettled(
    grid.map((point) => fetchPagesForPoint(placesProvider, point, { businessType, keywords }, maxPagesPerPoint)),
  );

  const byPlaceId = new Map();
  let externalQueriesExecuted = 0;
  let failedQueries = 0;

  settled.forEach((outcome) => {
    if (outcome.status === 'rejected') {
      failedQueries += 1;
      externalQueriesExecuted += 1;
      return;
    }

    externalQueriesExecuted += outcome.value.pagesFetched;

    outcome.value.places.forEach((place) => {
      if (place.businessStatus === CLOSED_STATUS) return;
      if (haversineDistanceKm(center, place.location) > radiusKm) return;
      if (!byPlaceId.has(place.placeId)) {
        byPlaceId.set(place.placeId, place);
      }
    });
  });

  if (failedQueries === grid.length) {
    const error = settled.find((outcome) => outcome.status === 'rejected');
    throw error.reason;
  }

  const limitations = [
    'establishmentsFound reflects what the search strategy found, not a guaranteed count of every real establishment in the area.',
    `Each search point returns at most 20 results per page (${maxPagesPerPoint} page(s) requested per point).`,
  ];
  if (failedQueries > 0) {
    limitations.push(`${failedQueries} of ${grid.length} search queries failed and were skipped; coverage may be reduced in that area.`);
  }

  return {
    places: [...byPlaceId.values()],
    searchStrategy: {
      type: grid.length > 1 ? 'grid' : 'single-point',
      pointsUsed: grid.length,
      subRadiusKm: grid[0].subRadiusKm,
      pagesPerPoint: maxPagesPerPoint,
      externalQueriesExecuted,
      failedQueries,
      radiusAnalyzedKm: radiusKm,
      limitations,
    },
  };
}

module.exports = { run };
