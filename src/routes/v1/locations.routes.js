'use strict';

const express = require('express');
const { createLocationsController } = require('../../controllers/locations.controller');

function createLocationsRouter({ requireAuth, analyzeRateLimiter, ...deps }) {
  const router = express.Router();
  const controller = createLocationsController(deps);

  // Everything under /locations needs a signed-in user, including routes added
  // later. The user comes from the session (req.auth), never from the request.
  router.use(requireAuth);

  /**
   * @openapi
   * /api/v1/locations/analyze:
   *   get:
   *     tags: [Locations]
   *     summary: Analyze business competition around a location
   *     description: >
   *       Resolves a free-text location to coordinates, searches nearby
   *       establishments of the given business type within the requested
   *       radius using a multi-point coverage strategy, and returns a
   *       competitor analysis with a 0-100 competitor-density indicator
   *       (the `analysis.opportunityScore` field — the name is kept for API
   *       compatibility; higher means fewer competitors per km², and it is
   *       descriptive only, not a measure of demand or a recommendation).
   *       When businessType
   *       resolves to a known Business Profile, the response also includes
   *       a `commercialEcosystem` field categorizing nearby complementary
   *       businesses and potential traffic generators (single-point
   *       coverage, not a complete census); it is `null` for unmapped
   *       business types or when disabled via ENABLE_COMMERCIAL_ECOSYSTEM.
   *
   *       Requires a signed-in user (session cookie) and is limited per user
   *       (`ANALYZE_RATE_LIMIT_MAX` successful analyses per
   *       `ANALYZE_RATE_LIMIT_WINDOW_MINUTES`, 30 per hour by default).
   *     security:
   *       - cookieAuth: []
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
   *       401:
   *         description: Not signed in, or the session expired (`UNAUTHENTICATED`).
   *       404:
   *         description: The location could not be resolved to coordinates.
   *       429:
   *         description: Rate limited (global or per-user analysis quota) or upstream Google API quota exceeded.
   *       503:
   *         description: The server is not configured with a Google Maps API key, or the database is unavailable (`DATABASE_UNAVAILABLE`).
   */
  router.get('/analyze', analyzeRateLimiter, controller.analyzeLocation);

  return router;
}

module.exports = { createLocationsRouter };
