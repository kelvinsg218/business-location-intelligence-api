'use strict';

const express = require('express');
const { createLocationsRouter } = require('./v1/locations.routes');

function createRoutes(deps) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  router.use('/api/v1/locations', createLocationsRouter(deps));

  return router;
}

module.exports = { createRoutes };
