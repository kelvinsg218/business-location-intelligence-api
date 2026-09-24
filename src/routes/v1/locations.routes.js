'use strict';

const express = require('express');
const { createLocationsController } = require('../../controllers/locations.controller');

function createLocationsRouter(deps) {
  const router = express.Router();
  const controller = createLocationsController(deps);

  /**
   * @openapi
   * /api/v1/locations/analyze:
   *   get:
   *     summary: Analyze business competition/opportunity around a location
   *     description: >
   *       Resolves a free-text location to coordinates, searches nearby
   *       establishments of the given business type within the requested
   *       radius using a multi-point coverage strategy, and returns a
   *       competitor analysis with an opportunity score. When businessType
   *       resolves to a known Business Profile, the response also includes
   *       a `commercialEcosystem` field categorizing nearby complementary
   *       businesses and potential traffic generators (single-point
   *       coverage, not a complete census); it is `null` for unmapped
   *       business types or when disabled via ENABLE_COMMERCIAL_ECOSYSTEM.
   *     parameters:
   *       - in: query
   *         name: location
   *         required: true
   *         schema: { type: string }
   *         example: Vila Velha, ES
   *       - in: query
   *         name: businessType
   *         required: true
   *         schema: { type: string }
   *         example: gym
   *       - in: query
   *         name: radius
   *         required: true
   *         schema: { type: number }
   *         description: Search radius in kilometers.
   *         example: 5
   *       - in: query
   *         name: keywords
   *         required: false
   *         schema: { type: string }
   *         description: Comma-separated free-text keywords.
   *         example: crossfit,24 horas
   *     responses:
   *       200:
   *         description: Analysis completed successfully.
   *       400:
   *         description: Invalid query parameters.
   *       404:
   *         description: The location could not be resolved to coordinates.
   *       429:
   *         description: Rate limited or upstream Google API quota exceeded.
   *       503:
   *         description: The server is not configured with a Google Maps API key.
   */
  router.get('/analyze', controller.analyzeLocation);

  return router;
}

module.exports = { createLocationsRouter };
