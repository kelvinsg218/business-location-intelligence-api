'use strict';

const { calculateBasicOpportunityScore, DENSITY_SCALE, WEIGHTS } = require('../../../src/services/opportunityScore');
const { destinationPoint, haversineDistanceKm } = require('../../../src/utils/geo');

const CENTER = { lat: -20.3297, lng: -40.2925 };

describe('calculateBasicOpportunityScore', () => {
  it('returns the maximum indicator value (100) when there are zero competitors', () => {
    const result = calculateBasicOpportunityScore({ places: [], center: CENTER, radiusKm: 10 });

    expect(result.competitorCount).toBe(0);
    expect(result.avgDistanceFromCenterKm).toBeNull();
    expect(result.opportunityScore).toBe(100);
    expect(result.competitionLevel).toBe('low');
    expect(result.scoreBreakdown).toEqual({ densityScore: 100, distributionScore: 100, weights: WEIGHTS });
  });

  describe('language stays descriptive (no market/opportunity/recommendation claims)', () => {
    // \bopportunity\b flags the loose word but not the API field name "opportunityScore".
    const FORBIDDEN = /open market|untapped|underserved|\bopportunity\b|recommend|promising|good (location|area|market)|should (open|invest)/i;

    it('explains zero competitors as a valid outcome that says nothing about demand', () => {
      const { notes } = calculateBasicOpportunityScore({ places: [], center: CENTER, radiusKm: 10 });
      const text = notes.join(' ');

      expect(text).toMatch(/valid outcome, not an error/i);
      expect(text).toMatch(/says nothing about demand/i);
      expect(text).not.toMatch(FORBIDDEN);
    });

    it('uses no market/opportunity/recommendation wording in the notes for a non-empty result either', () => {
      const places = [{ location: destinationPoint(CENTER, 3, 0) }];
      const { notes } = calculateBasicOpportunityScore({ places, center: CENTER, radiusKm: 10 });

      expect(notes.join(' ')).not.toMatch(FORBIDDEN);
    });
  });

  it('computes density/distribution/score exactly per the documented formula', () => {
    const radiusKm = 10;
    const place1 = { location: destinationPoint(CENTER, 3, 0) };
    const place2 = { location: destinationPoint(CENTER, 6, 90) };
    const places = [place1, place2];

    const result = calculateBasicOpportunityScore({ places, center: CENTER, radiusKm });

    const areaKm2 = Math.PI * radiusKm * radiusKm;
    const densityPerKm2 = 2 / areaKm2;
    const avgDistanceFromCenterKm = (
      haversineDistanceKm(CENTER, place1.location) + haversineDistanceKm(CENTER, place2.location)
    ) / 2;
    const densityScore = Math.min(100, Math.max(0, 100 - (densityPerKm2 * DENSITY_SCALE)));
    const distributionScore = Math.min(100, Math.max(0, (avgDistanceFromCenterKm / radiusKm) * 100));
    const expectedScore = Math.round((densityScore * WEIGHTS.density) + (distributionScore * WEIGHTS.distribution));

    expect(result.competitorCount).toBe(2);
    expect(result.areaKm2).toBeCloseTo(areaKm2, 6);
    expect(result.densityPerKm2).toBeCloseTo(densityPerKm2, 6);
    expect(result.avgDistanceFromCenterKm).toBeCloseTo(avgDistanceFromCenterKm, 6);
    expect(result.scoreBreakdown.densityScore).toBeCloseTo(densityScore, 6);
    expect(result.scoreBreakdown.distributionScore).toBeCloseTo(distributionScore, 6);
    expect(result.opportunityScore).toBe(expectedScore);
  });

  it('clamps densityScore at 0 for extremely high density', () => {
    const places = Array.from({ length: 1000 }, () => ({ location: CENTER }));
    const result = calculateBasicOpportunityScore({ places, center: CENTER, radiusKm: 1 });
    expect(result.scoreBreakdown.densityScore).toBe(0);
  });

  it('produces the exact expected medium-competition score for a known scenario', () => {
    const places = [{ location: CENTER }, { location: CENTER }];
    const result = calculateBasicOpportunityScore({ places, center: CENTER, radiusKm: 5 });

    expect(result.opportunityScore).toBe(58);
    expect(result.competitionLevel).toBe('medium');
  });

  it('produces a high-competition score when competitors are dense and all at the center', () => {
    const places = Array.from({ length: 1000 }, () => ({ location: CENTER }));
    const result = calculateBasicOpportunityScore({ places, center: CENTER, radiusKm: 1 });

    expect(result.opportunityScore).toBe(0);
    expect(result.competitionLevel).toBe('high');
  });
});
