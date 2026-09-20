'use strict';

const express = require('express');
const { createLocationsRouter } = require('./v1/locations.routes');

function createRoutes(deps) {
  const router = express.Router();

  /**
   * @openapi
   * /health:
   *   get:
   *     summary: Health check
   *     description: Returns 200 when the API process is up and able to respond.
   *     responses:
   *       200:
   *         description: The API is healthy.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status: { type: string, example: ok }
   */
  router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  router.use('/api/v1/locations', createLocationsRouter(deps));

  return router;
}

module.exports = { createRoutes };
