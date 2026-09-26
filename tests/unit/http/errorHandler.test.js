'use strict';

const express = require('express');
const request = require('supertest');
const pinoHttp = require('pino-http');
const { errorHandler } = require('../../../src/middlewares/errorHandler');
const { requestId } = require('../../../src/middlewares/requestId');
const { createLogger } = require('../../../src/utils/logger');

function capture() {
  const chunks = [];
  return {
    write(chunk) { chunks.push(chunk); return true; },
    entries: () => chunks.join('').split('\n').filter(Boolean).map((line) => JSON.parse(line)),
  };
}

describe('errorHandler when the response has already started', () => {
  it('does not try to write a second response, logs the error, and the server keeps serving', async () => {
    const stream = capture();
    const app = express();
    app.use(requestId);
    app.use(pinoHttp({ logger: createLogger(stream, { level: 'info' }) }));
    app.get('/late', (req, res, next) => {
      res.status(200);
      res.write('partial body');
      next(new Error('failed after the response began'));
    });
    app.get('/ok', (req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    // Express closes the connection: the client sees an aborted response.
    await request(app).get('/late').then(() => {}, () => {});

    const logged = stream.entries().find((entry) => entry.msg === 'error after the response had started');
    expect(logged).toBeDefined();
    expect(logged.err.message).toBe('failed after the response began');
    expect((await request(app).get('/ok')).status).toBe(200);
  });
});
