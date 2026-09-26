'use strict';

const EARTH_RADIUS_KM = 6371;
const ABSOLUTE_MAX_SEARCH_POINTS = 19;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function haversineDistanceKm(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = (sinDLat * sinDLat) + (Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_KM * c;
}

// Point `distanceKm` away from `center` along `bearingDegrees` (0 = north, 90 = east).
function destinationPoint(center, distanceKm, bearingDegrees) {
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(center.lat);
  const lng1 = toRadians(center.lng);

  const lat2 = Math.asin(
    (Math.sin(lat1) * Math.cos(angularDistance))
      + (Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)),
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - (Math.sin(lat1) * Math.sin(lat2)),
  );

  return { lat: toDegrees(lat2), lng: toDegrees(lng2) };
}

// Normalizes a longitude in degrees into [-180, 180).
function normalizeLongitude(degrees) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

// Smallest lat/lng rectangle that contains the circle of `radiusKm` around
// `center`, as { low: south-west corner, high: north-east corner }. Used where
// a provider accepts a rectangle but not a circle as a hard restriction. A
// circle that crosses the antimeridian comes back with low.lng > high.lng (the
// inverted range convention); near a pole the longitude half-width is capped at
// 90 degrees so the box never exceeds 180 degrees of width.
function boundingBoxForCircle(center, radiusKm) {
  const angularDistance = radiusKm / EARTH_RADIUS_KM;
  const latRadians = toRadians(center.lat);

  const deltaLatDegrees = toDegrees(angularDistance);
  const lngRatio = Math.sin(angularDistance) / Math.cos(latRadians);
  const deltaLngDegrees = lngRatio >= 1 ? 90 : toDegrees(Math.asin(lngRatio));

  return {
    low: {
      lat: Math.max(-90, center.lat - deltaLatDegrees),
      lng: normalizeLongitude(center.lng - deltaLngDegrees),
    },
    high: {
      lat: Math.min(90, center.lat + deltaLatDegrees),
      lng: normalizeLongitude(center.lng + deltaLngDegrees),
    },
  };
}

function ring(center, distanceKm, subRadiusKm, count) {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const bearing = (360 / count) * i;
    const point = destinationPoint(center, distanceKm, bearing);
    points.push({ lat: point.lat, lng: point.lng, subRadiusKm });
  }
  return points;
}

// Generates search points covering a circle of `radiusKm` around `center`.
// Invariant enforced for every generated point: distance-from-center +
// subRadiusKm <= radiusKm. This guarantees, by construction, that a search
// within subRadiusKm of any point can never surface a place outside the
// originally requested radius (a haversine post-filter downstream is a
// second line of defense against upstream API quirks, not the only guard).
function generateSearchGrid({ center, radiusKm, maxPoints, gridMinRadiusKm }) {
  const budget = Math.max(1, Math.min(maxPoints, ABSOLUTE_MAX_SEARCH_POINTS));

  if (radiusKm <= gridMinRadiusKm || budget <= 1) {
    return [{ lat: center.lat, lng: center.lng, subRadiusKm: radiusKm }];
  }

  const points = [{ lat: center.lat, lng: center.lng, subRadiusKm: radiusKm / 2 }];

  const ring1Size = Math.min(6, budget - 1);
  points.push(...ring(center, radiusKm / 2, radiusKm / 2, ring1Size));

  const remaining = budget - points.length;
  if (remaining > 0) {
    const ring2Size = Math.min(12, remaining);
    points.push(...ring(center, (2 * radiusKm) / 3, radiusKm / 3, ring2Size));
  }

  return points;
}

module.exports = {
  EARTH_RADIUS_KM,
  ABSOLUTE_MAX_SEARCH_POINTS,
  haversineDistanceKm,
  destinationPoint,
  boundingBoxForCircle,
  generateSearchGrid,
};
