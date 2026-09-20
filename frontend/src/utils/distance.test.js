import { describe, it, expect } from 'vitest';
import { haversineDistanceKm } from './distance.js';

describe('haversineDistanceKm', () => {
  it('returns 0 for identical coordinates', () => {
    const point = { lat: -20.3297, lng: -40.2925 };
    expect(haversineDistanceKm(point, point)).toBeCloseTo(0, 6);
  });

  it('computes a plausible distance between two known nearby points', () => {
    // Vitória, ES <-> Vila Velha, ES city centers — a few km apart in a straight line.
    const vitoria = { lat: -20.3155, lng: -40.3128 };
    const vilaVelha = { lat: -20.3297, lng: -40.2925 };

    const distance = haversineDistanceKm(vitoria, vilaVelha);

    expect(distance).toBeGreaterThan(1.5);
    expect(distance).toBeLessThan(4);
  });
});
