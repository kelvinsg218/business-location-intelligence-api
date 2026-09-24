'use strict';

const { validateLocationQuery } = require('../validators/locationQuery.schema');
const { ApiError } = require('../utils/ApiError');
const { analyze } = require('../services/locationAnalysis.service');

// Express 5 forwards a rejected promise from an async handler to the error
// middleware automatically, so no manual try/catch + next(err) wrapper is needed here.
function createLocationsController({
  geocodingProvider, placesProvider, providerNames, maxRadiusKm, maxSearchPoints, gridMinRadiusKm, maxPagesPerPoint,
  enableCommercialEcosystem,
}) {
  async function analyzeLocation(req, res) {
    const validation = validateLocationQuery(req.query, maxRadiusKm);
    if (!validation.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'One or more query parameters are invalid.', validation.details);
    }

    const {
      location, businessType, radius, keywords,
    } = validation.data;

    const result = await analyze({
      location,
      businessType,
      radiusKm: radius,
      keywords,
      geocodingProvider,
      placesProvider,
      providerNames,
      maxSearchPoints,
      gridMinRadiusKm,
      maxPagesPerPoint,
      enableCommercialEcosystem,
    });

    res.status(200).json({ success: true, data: result });
  }

  return { analyzeLocation };
}

module.exports = { createLocationsController };
