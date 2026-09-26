'use strict';

const express = require('express');
const { createLocationsRouter } = require('./v1/locations.routes');
const { pingDatabase } = require('../db/pool');
const { denyAll } = require('../modules/auth/requireAuth');

const passthrough = (req, res, next) => next();

function createRoutes({ db, auth, ...deps }) {
  const router = express.Router();

  /**
   * @openapi
   * /health:
   *   get:
   *     tags: [Operations]
   *     summary: Liveness check
   *     description: >
   *       Returns 200 while the API process is up and able to respond. It does
   *       not touch the database, so a database outage never makes an
   *       orchestrator restart a healthy process. Not rate limited.
   *     responses:
   *       200:
   *         description: The process is alive.
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

  /**
   * @openapi
   * /ready:
   *   get:
   *     tags: [Operations]
   *     summary: Readiness check
   *     description: >
   *       Returns 200 when the API can serve requests, i.e. PostgreSQL answers a
   *       trivial query within 2 seconds; 503 otherwise. The body never carries
   *       connection details. Not rate limited.
   *     responses:
   *       200:
   *         description: Ready.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status: { type: string, example: ready }
   *                 checks:
   *                   type: object
   *                   properties:
   *                     database: { type: string, example: ok }
   *       503:
   *         description: Not ready (the database is unreachable).
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status: { type: string, example: not_ready }
   *                 checks:
   *                   type: object
   *                   properties:
   *                     database: { type: string, example: unavailable }
   */
  router.get('/ready', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    // No database handed to the app means it can not do its job: not ready.
    const databaseUp = db ? await pingDatabase(db) : false;
    res.status(databaseUp ? 200 : 503).json({
      status: databaseUp ? 'ready' : 'not_ready',
      checks: { database: databaseUp ? 'ok' : 'unavailable' },
    });
  });

  const api = express.Router();
  if (auth) {
    // Origin guard, then session: a forbidden origin is rejected before any
    // session lookup touches the database.
    auth.middlewares.forEach((middleware) => api.use(middleware));
    api.use('/auth', auth.router);
  }
  api.use('/locations', createLocationsRouter({
    ...deps,
    requireAuth: auth ? auth.requireAuth : denyAll,
    analyzeRateLimiter: auth ? auth.analyzeRateLimiter : passthrough,
  }));
  router.use('/api/v1', api);

  return router;
}

module.exports = { createRoutes };
