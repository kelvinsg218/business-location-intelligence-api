'use strict';

const {
  haversineDistanceKm,
  destinationPoint,
  boundingBoxForCircle,
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

describe('boundingBoxForCircle', () => {
  it('matches an independently derived box for a 5km circle in Vila Velha', () => {
    const box = boundingBoxForCircle(VILA_VELHA, 5);

    expect(box.low.lat).toBeCloseTo(-20.374666, 5);
    expect(box.low.lng).toBeCloseTo(-40.340453, 5);
    expect(box.high.lat).toBeCloseTo(-20.284734, 5);
    expect(box.high.lng).toBeCloseTo(-40.244547, 5);
  });

  it('puts low at the south-west corner and high at the north-east corner (the order Google requires)', () => {
    const box = boundingBoxForCircle(VILA_VELHA, 5);

    expect(box.low.lat).toBeLessThan(box.high.lat);
    expect(box.low.lng).toBeLessThan(box.high.lng);
    expect(box.low.lat).toBeLessThan(VILA_VELHA.lat);
    expect(box.high.lat).toBeGreaterThan(VILA_VELHA.lat);
  });

  it('contains every point of the circle, at any bearing, for several radii and latitudes', () => {
    const centers = [VILA_VELHA, { lat: -23.5505, lng: -46.6333 }, { lat: 0, lng: 10 }, { lat: 60, lng: 25 }];
    const EPS = 1e-9;

    centers.forEach((center) => {
      [0.5, 5, 20].forEach((radiusKm) => {
        const box = boundingBoxForCircle(center, radiusKm);
        for (let bearing = 0; bearing < 360; bearing += 5) {
          const edge = destinationPoint(center, radiusKm, bearing);
          expect(edge.lat).toBeGreaterThanOrEqual(box.low.lat - EPS);
          expect(edge.lat).toBeLessThanOrEqual(box.high.lat + EPS);
          expect(edge.lng).toBeGreaterThanOrEqual(box.low.lng - EPS);
          expect(edge.lng).toBeLessThanOrEqual(box.high.lng + EPS);
        }
      });
    });
  });

  it('is tight: its east and west edges sit about one radius from the center', () => {
    const box = boundingBoxForCircle(VILA_VELHA, 5);

    expect(haversineDistanceKm(VILA_VELHA, { lat: VILA_VELHA.lat, lng: box.high.lng })).toBeCloseTo(5, 1);
    expect(haversineDistanceKm(VILA_VELHA, { lat: VILA_VELHA.lat, lng: box.low.lng })).toBeCloseTo(5, 1);
    expect(haversineDistanceKm(VILA_VELHA, { lat: box.high.lat, lng: VILA_VELHA.lng })).toBeCloseTo(5, 1);
    expect(haversineDistanceKm(VILA_VELHA, { lat: box.low.lat, lng: VILA_VELHA.lng })).toBeCloseTo(5, 1);
  });

  it('normalizes longitudes into [-180, 180) when the circle crosses the antimeridian', () => {
    const box = boundingBoxForCircle({ lat: 0, lng: 179.99 }, 5);

    expect(box.low.lng).toBeGreaterThanOrEqual(-180);
    expect(box.high.lng).toBeLessThan(180);
    expect(box.high.lng).toBeLessThan(0);
    expect(box.low.lng).toBeGreaterThan(0);
  });

  it('keeps latitudes within [-90, 90] and the box no wider than 180 degrees near a pole', () => {
    const box = boundingBoxForCircle({ lat: 89.99, lng: 0 }, 20);

    expect(box.high.lat).toBeLessThanOrEqual(90);
    expect(box.low.lat).toBeGreaterThanOrEqual(-90);
    expect(box.high.lng - box.low.lng).toBeLessThanOrEqual(180);
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
