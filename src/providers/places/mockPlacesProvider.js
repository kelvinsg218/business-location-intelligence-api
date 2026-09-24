'use strict';

const { PlacesProviderContract } = require('./placesProvider.contract');
const { hashStringToInt } = require('../../utils/mockDeterminism');
const { mapBusinessTypeToGoogleType, categoryKeyForBusinessType } = require('../../utils/businessTypeMapping');
const { haversineDistanceKm } = require('../../utils/geo');

// Any businessType containing this (case/accent-insensitive, via categoryKeyForBusinessType's
// normalization) forces an empty result set, for deterministically testing the
// "zero results" path without depending on luck with the density model below.
const ZERO_RESULTS_SENTINEL = '__zero_results__';

// The world is divided into a fixed grid of ~1km cells. Whether a cell
// "contains" a synthetic establishment of a given category is a pure
// function of (cellId, category) — never of which search request asked.
// That's what makes overlapping grid search points naturally rediscover the
// same synthetic places in their shared area, exercising real deduplication.
const CELL_SIZE_DEG = 0.01;
const PAGE_SIZE = 20;

// Roughly "1 in N cells has a place of this category" — tuned so a ~5km-radius
// search returns a plausible double-digit competitor count for common types,
// and unmapped/rare free-text types still return something, just sparser.
const DENSITY_DIVISOR_BY_CATEGORY = {
  restaurant: 4,
  cafe: 6,
  gym: 8,
  pharmacy: 10,
  supermarket: 12,
  hair_care: 9,
  beauty_salon: 11,
  clothing_store: 6,
  bakery: 7,
  bar: 8,
  convenience_store: 9,
  medical_clinic: 10,
  dental_clinic: 11,
  pet_store: 13,
};
const DEFAULT_DENSITY_DIVISOR = 15;

const BRAND_WORDS = ['Elite', 'Prime', 'Central', 'Express', 'Star', 'Bay', 'City', 'Local', 'Green', 'Sunrise', 'Modern', 'Classic'];

function cellIndexFor(lat, lng) {
  return { row: Math.floor(lat / CELL_SIZE_DEG), col: Math.floor(lng / CELL_SIZE_DEG) };
}

function cellCenter(row, col) {
  return { lat: (row + 0.5) * CELL_SIZE_DEG, lng: (col + 0.5) * CELL_SIZE_DEG };
}

function densityDivisorFor(categoryKey) {
  return DENSITY_DIVISOR_BY_CATEGORY[categoryKey] || DEFAULT_DENSITY_DIVISOR;
}

function titleCase(text) {
  return text.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function synthesizePlace({
  row, col, categoryKey, googleType, center,
}) {
  const cellId = `${row}_${col}`;
  const location = cellCenter(row, col);
  const distanceKm = haversineDistanceKm(center, location);

  const brandIdx = hashStringToInt(`name:${cellId}:${categoryKey}`) % BRAND_WORDS.length;
  const name = `${BRAND_WORDS[brandIdx]} ${titleCase(categoryKey)}`;

  const isClosed = hashStringToInt(`status:${cellId}:${categoryKey}`) % 8 === 0;
  const primaryType = googleType || categoryKey;

  return {
    distanceKm,
    place: {
      placeId: `mock-${categoryKey}-${cellId}`,
      name,
      address: `Mock Street, near ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
      location,
      types: [primaryType, 'point_of_interest', 'establishment'],
      primaryType,
      businessStatus: isClosed ? 'CLOSED_PERMANENTLY' : 'OPERATIONAL',
    },
  };
}

function collectCandidates({
  lat, lng, radiusKm, categoryKey, googleType,
}) {
  const center = { lat, lng };
  const divisor = densityDivisorFor(categoryKey);

  const latDeltaDeg = radiusKm / 111;
  const lngDeltaDeg = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));

  const { row: centerRow, col: centerCol } = cellIndexFor(lat, lng);
  const rowSpan = Math.ceil(latDeltaDeg / CELL_SIZE_DEG) + 1;
  const colSpan = Math.ceil(lngDeltaDeg / CELL_SIZE_DEG) + 1;

  const candidates = [];
  for (let row = centerRow - rowSpan; row <= centerRow + rowSpan; row += 1) {
    for (let col = centerCol - colSpan; col <= centerCol + colSpan; col += 1) {
      const cellId = `${row}_${col}`;
      const hasPlace = hashStringToInt(`cell:${cellId}:${categoryKey}`) % divisor === 0;
      if (!hasPlace) continue;

      const candidate = synthesizePlace({
        row, col, categoryKey, googleType, center,
      });
      if (candidate.distanceKm <= radiusKm) {
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => a.distanceKm - b.distanceKm || a.place.placeId.localeCompare(b.place.placeId));
  return candidates;
}

class MockPlacesProvider extends PlacesProviderContract {
  async search({
    lat, lng, radiusMeters, businessType, pageToken,
  }) {
    const categoryKey = categoryKeyForBusinessType(businessType);

    if (categoryKey === ZERO_RESULTS_SENTINEL) {
      return { places: [], nextPageToken: null };
    }

    const googleType = mapBusinessTypeToGoogleType(businessType);
    const radiusKm = radiusMeters / 1000;

    const candidates = collectCandidates({
      lat, lng, radiusKm, categoryKey, googleType,
    });

    const offset = pageToken ? parseInt(pageToken, 10) : 0;
    const page = candidates.slice(offset, offset + PAGE_SIZE);
    const hasMore = offset + PAGE_SIZE < candidates.length;

    return {
      places: page.map((c) => c.place),
      nextPageToken: hasMore ? String(offset + PAGE_SIZE) : null,
    };
  }

  // Commercial Ecosystem's type-filtered search. Unlike search(), the
  // requested types ARE already real Google types (no free-text mapping
  // needed) — each is queried against the same deterministic cell/hash
  // system as search(), reusing collectCandidates() as-is. Capped at
  // PAGE_SIZE, mirroring Nearby Search's real (pagination-free) result cap.
  async searchByTypes({ lat, lng, radiusMeters, includedTypes }) {
    const radiusKm = radiusMeters / 1000;
    const byPlaceId = new Map();

    (includedTypes || []).forEach((type) => {
      const candidates = collectCandidates({
        lat, lng, radiusKm, categoryKey: type, googleType: type,
      });
      candidates.forEach((candidate) => {
        if (!byPlaceId.has(candidate.place.placeId)) {
          byPlaceId.set(candidate.place.placeId, candidate);
        }
      });
    });

    const sorted = [...byPlaceId.values()]
      .sort((a, b) => a.distanceKm - b.distanceKm || a.place.placeId.localeCompare(b.place.placeId));

    return { places: sorted.slice(0, PAGE_SIZE).map((c) => c.place) };
  }
}

module.exports = { MockPlacesProvider, ZERO_RESULTS_SENTINEL };
