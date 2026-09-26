'use strict';

const express = require('express');
const request = require('supertest');
const { createOriginGuard } = require('../../../src/modules/auth/originGuard');
const { errorHandler } = require('../../../src/middlewares/errorHandler');

const ALLOWED = 'http://localhost:5173';

function build() {
  const app = express();
  app.use(createOriginGuard({ allowedOrigins: [ALLOWED, 'https://app.example.com'] }));
  app.all('/resource', (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

const app = build();

async function send(method, headers = {}) {
  let req = request(app)[method]('/resource');
  Object.entries(headers).forEach(([name, value]) => { req = req.set(name, value); });
  return req;
}

function expectForbidden(response) {
  expect(response.status).toBe(403);
  expect(response.body.error.code).toBe('FORBIDDEN_ORIGIN');
  expect(response.body.success).toBe(false);
}

describe('originGuard', () => {
  describe('safe methods are never checked', () => {
    it.each(['get', 'head', 'options'])('%s passes even with a hostile Origin and cross-site fetch metadata', async (method) => {
      const response = await send(method, { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' });
      expect(response.status).toBeLessThan(400);
    });
  });

  describe.each(['post', 'put', 'patch', 'delete'])('state-changing method %s', (method) => {
    it('blocks an Origin that is not on the allowlist', async () => {
      expectForbidden(await send(method, { Origin: 'https://evil.example' }));
    });

    it('blocks the literal "null" origin (sandboxed frames, some redirects)', async () => {
      expectForbidden(await send(method, { Origin: 'null' }));
    });

    it('allows an allowlisted Origin', async () => {
      expect((await send(method, { Origin: ALLOWED })).status).toBe(200);
      expect((await send(method, { Origin: 'https://app.example.com' })).status).toBe(200);
    });

    it('does not accept an origin that merely starts with an allowed one', async () => {
      expectForbidden(await send(method, { Origin: 'http://localhost:5173.evil.example' }));
      expectForbidden(await send(method, { Origin: 'http://localhost:51730' }));
    });

    it('does not accept the right host with the wrong scheme or port', async () => {
      expectForbidden(await send(method, { Origin: 'https://localhost:5173' }));
      expectForbidden(await send(method, { Origin: 'http://localhost:3000' }));
    });

    it('allows Sec-Fetch-Site: same-origin without an Origin header', async () => {
      expect((await send(method, { 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
    });

    it('allows same-origin fetch metadata together with an allowlisted Origin (a normal browser request)', async () => {
      expect((await send(method, { 'Sec-Fetch-Site': 'same-origin', Origin: ALLOWED })).status).toBe(200);
    });

    it('still blocks same-origin fetch metadata when the Origin header is foreign', async () => {
      expectForbidden(await send(method, { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://evil.example' }));
    });

    it.each(['cross-site', 'same-site', 'none'])('blocks Sec-Fetch-Site: %s when there is no allowlisted Origin', async (site) => {
      expectForbidden(await send(method, { 'Sec-Fetch-Site': site }));
    });

    it('allows a non-same-origin fetch only when its Origin is explicitly allowlisted', async () => {
      expect((await send(method, { 'Sec-Fetch-Site': 'same-site', Origin: ALLOWED })).status).toBe(200);
      expect((await send(method, { 'Sec-Fetch-Site': 'cross-site', Origin: ALLOWED })).status).toBe(200);
    });

    it('lets a client without Origin and without fetch metadata through (curl, scripts, tests)', async () => {
      expect((await send(method)).status).toBe(200);
    });
  });

  it('returns the standard error body (with the request id slot)', async () => {
    const response = await send('post', { Origin: 'https://evil.example' });
    expect(response.body).toMatchObject({
      success: false, error: { code: 'FORBIDDEN_ORIGIN', details: [] },
    });
    expect(response.body.error.message).not.toMatch(/evil/);
  });
});
