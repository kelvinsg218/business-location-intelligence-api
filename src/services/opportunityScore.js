'use strict';

const { haversineDistanceKm } = require('../utils/geo');

// Heuristic constants — deliberately simple and documented, not scientifically
// calibrated. Easy to retune later, or to swap out entirely behind a future
// calculateAdvancedOpportunityScore that also weighs rating/price/hours.
const DENSITY_SCALE = 150;
const WEIGHTS = { density: 0.6, distribution: 0.4 };

const NOTE_METHODOLOGY = 'opportunityScore considers only count, density and spatial distribution of competitors '
  + 'in the MVP (no rating/price/hours, which require the pricier Enterprise Places SKU tier).';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function competitionLevelFor(score) {
  if (score >= 66) return 'low';
  if (score >= 33) return 'medium';
  return 'high';
}

/**
 * MVP opportunity scoring, kept in its own module (not inlined into
 * locationAnalysis.service.js) so a future calculateAdvancedOpportunityScore
 * can be added alongside it and selected by config, without redesigning the
 * service. 0-100, higher = more opportunity (less saturated market).
 */
function calculateBasicOpportunityScore({ places, center, radiusKm }) {
  const competitorCount = places.length;
  const areaKm2 = Math.PI * radiusKm * radiusKm;
  const densityPerKm2 = competitorCount / areaKm2;

  if (competitorCount === 0) {
    return {
      competitorCount,
      areaKm2,
      densityPerKm2,
      avgDistanceFromCenterKm: null,
      competitionLevel: 'low',
      opportunityScore: 100,
      scoreBreakdown: { densityScore: 100, distributionScore: 100, weights: WEIGHTS },
      notes: [
        NOTE_METHODOLOGY,
        'No competitors were found by the search strategy — a valid outcome, not an error, suggesting an open market for this category in this area.',
      ],
    };
  }

  const avgDistanceFromCenterKm = places.reduce(
    (sum, place) => sum + haversineDistanceKm(center, place.location),
    0,
  ) / competitorCount;

  const densityScore = clamp(100 - (densityPerKm2 * DENSITY_SCALE), 0, 100);
  const distributionScore = clamp((avgDistanceFromCenterKm / radiusKm) * 100, 0, 100);
  const opportunityScore = Math.round((densityScore * WEIGHTS.density) + (distributionScore * WEIGHTS.distribution));

  return {
    competitorCount,
    areaKm2,
    densityPerKm2,
    avgDistanceFromCenterKm,
    competitionLevel: competitionLevelFor(opportunityScore),
    opportunityScore,
    scoreBreakdown: { densityScore, distributionScore, weights: WEIGHTS },
    notes: [
      NOTE_METHODOLOGY,
      'Not a guarantee of business outcome, nor a complete census of the area — see searchStrategy.limitations.',
    ],
  };
}

module.exports = { calculateBasicOpportunityScore, DENSITY_SCALE, WEIGHTS };
