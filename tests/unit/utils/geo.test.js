'use strict';

const {
  haversineDistanceKm,
  destinationPoint,
  generateSearchGrid,
  ABSOLUTE_MAX_SEARCH_POINTS,
} = require('../../../src/utils/geo');

const VILA_VELHA = { lat: -20.3297, lng: -40.2925 };

describe('haversineDistanceKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistanceKm(VILA_VELHA, VILA_VELHA)).toBeCloseTo(0, 6);
  });

  it('returns roughly 111km per degree of latitude near the equator', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 1, lng: 0 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(111.19, 0);
  });
});

describe('destinationPoint', () => {
  it('round-trips: moving X km away and measuring haversine distance back gives ~X km', () => {
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const moved = destinationPoint(VILA_VELHA, 5, bearing);
      expect(haversineDistanceKm(VILA_VELHA, moved)).toBeCloseTo(5, 2);
    }
  });

  it('moving north (bearing 0) increases latitude', () => {
    const moved = destinationPoint(VILA_VELHA, 10, 0);
    expect(moved.lat).toBeGreaterThan(VILA_VELHA.lat);
  });

  it('moving east (bearing 90) increases longitude', () => {
    const moved = destinationPoint(VILA_VELHA, 10, 90);
    expect(moved.lng).toBeGreaterThan(VILA_VELHA.lng);
  });
});

describe('generateSearchGrid', () => {
  const EPSILON_KM = 1e-6;

  function assertInvariant(points, center, radiusKm) {
    points.forEach((point) => {
      const distance = haversineDistanceKm(center, point);
      expect(distance + point.subRadiusKm).toBeLessThanOrEqual(radiusKm + EPSILON_KM);
    });
  }

  it('returns a single point when radius is at or below the grid threshold', () => {
    const points = generateSearchGrid({
      center: VILA_VELHA, radiusKm: 3, maxPoints: 7, gridMinRadiusKm: 3,
    });
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ lat: VILA_VELHA.lat, lng: VILA_VELHA.lng, subRadiusKm: 3 });
  });

  it('returns a single point when maxPoints is 1, regardless of radius', () => {
    const points = generateSearchGrid({
      center: VILA_VELHA, radiusKm: 20, maxPoints: 1, gridMinRadiusKm: 3,
    });
    expect(points).toHaveLength(1);
  });

  it('builds a 7-point hex grid (center + 6-ring) for the balanced default above the threshold', () => {
    const points = generateSearchGrid({
      center: VILA_VELHA, radiusKm: 10, maxPoints: 7, gridMinRadiusKm: 3,
    });
    expect(points).toHaveLength(7);
    assertInvariant(points, VILA_VELHA, 10);
  });

  it('builds a smaller ring when maxPoints is below 7', () => {
    const points = generateSearchGrid({
      center: VILA_VELHA, radiusKm: 10, maxPoints: 4, gridMinRadiusKm: 3,
    });
    expect(points).toHaveLength(4);
    assertInvariant(points, VILA_VELHA, 10);
  });

  it('adds a second ring when maxPoints allows up to 19 points', () => {
    const points = generateSearchGrid({
      center: VILA_VELHA, radiusKm: 20, maxPoints: 19, gridMinRadiusKm: 3,
    });
    expect(points).toHaveLength(19);
    assertInvariant(points, VILA_VELHA, 20);
  });

  it('never exceeds the absolute hard ceiling even if maxPoints is misconfigured higher', () => {
    const points = generateSearchGrid({
      center: VILA_VELHA, radiusKm: 20, maxPoints: 500, gridMinRadiusKm: 3,
    });
    expect(points.length).toBeLessThanOrEqual(ABSOLUTE_MAX_SEARCH_POINTS);
    assertInvariant(points, VILA_VELHA, 20);
  });

  it('holds the geometric invariant across a range of radii and budgets', () => {
    const radii = [3.5, 5, 8, 12, 20];
    const budgets = [2, 3, 7, 10, 19];
    radii.forEach((radiusKm) => {
      budgets.forEach((maxPoints) => {
        const points = generateSearchGrid({
          center: VILA_VELHA, radiusKm, maxPoints, gridMinRadiusKm: 3,
        });
        assertInvariant(points, VILA_VELHA, radiusKm);
      });
    });
  });
});
