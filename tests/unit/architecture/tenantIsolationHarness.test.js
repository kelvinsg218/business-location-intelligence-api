'use strict';

// Self-test of the HTTP isolation harness (tests/helpers/tenants.js), on a
// SYNTHETIC in-memory resource: nothing here exists in src/. The harness is what
// the first real user-owned resource will be tested with.

const express = require('express');
const request = require('supertest');
const { requireAuth } = require('../../../src/modules/auth/requireAuth');
const { errorHandler } = require('../../../src/middlewares/errorHandler');
const { ApiError } = require('../../../src/utils/ApiError');
const { assertOwnedResourceIsolation } = require('../../helpers/tenants');

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function buildApp(handler) {
  const things = new Map([['t-1', { id: 't-1', ownerId: USER_A, label: 'A only' }]]);
  const app = express();
  // Stand-in for the session middleware: the "cookie" is just a user id.
  app.use((req, res, next) => {
    const who = req.get('x-test-session');
    req.session = who ? { userId: who } : {};
    next();
  });
  app.get('/things/:id', requireAuth, handler(things));
  app.use(errorHandler);
  return app;
}

const send = (app) => (cookie, path) => {
  const req = request(app).get(path);
  return cookie ? req.set('x-test-session', cookie) : req;
};

const isolation = (app) => ({
  send: send(app),
  existingPath: '/things/t-1',
  missingPath: '/things/does-not-exist',
  ownerCookie: USER_A,
  intruderCookie: USER_B,
});

// Correct: scoped by req.auth.userId, and another user's row looks like no row.
const scopedHandler = (things) => (req, res) => {
  const thing = things.get(req.params.id);
  if (!thing || thing.ownerId !== req.auth.userId) throw new ApiError(404, 'NOT_FOUND', 'Not found.');
  res.json({ success: true, data: thing });
};

describe('assertOwnedResourceIsolation', () => {
  it('passes for a handler that scopes by req.auth.userId and answers 404 for foreign and missing ids alike', async () => {
    await assertOwnedResourceIsolation(isolation(buildApp(scopedHandler)));
  });

  it('fails for a handler that answers 403 for another user (it reveals that the id exists)', async () => {
    const leaky = (things) => (req, res) => {
      const thing = things.get(req.params.id);
      if (!thing) throw new ApiError(404, 'NOT_FOUND', 'Not found.');
      if (thing.ownerId !== req.auth.userId) throw new ApiError(403, 'FORBIDDEN', 'Not yours.');
      res.json({ success: true, data: thing });
    };
    await expect(assertOwnedResourceIsolation(isolation(buildApp(leaky)))).rejects.toThrow();
  });

  it('fails for a handler that forgets the owner check (any signed-in user can read it)', async () => {
    const forgetful = (things) => (req, res) => {
      const thing = things.get(req.params.id);
      if (!thing) throw new ApiError(404, 'NOT_FOUND', 'Not found.');
      res.json({ success: true, data: thing });
    };
    await expect(assertOwnedResourceIsolation(isolation(buildApp(forgetful)))).rejects.toThrow();
  });

  it('fails for a handler whose 404 differs in wording between "foreign" and "missing"', async () => {
    const chatty = (things) => (req, res) => {
      const thing = things.get(req.params.id);
      if (!thing) throw new ApiError(404, 'NOT_FOUND', 'Not found.');
      if (thing.ownerId !== req.auth.userId) throw new ApiError(404, 'NOT_FOUND', 'Exists, but belongs to someone else.');
      res.json({ success: true, data: thing });
    };
    await expect(assertOwnedResourceIsolation(isolation(buildApp(chatty)))).rejects.toThrow();
  });

  it('fails for a handler that trusts a user id sent by the client instead of req.auth', async () => {
    const trusting = (things) => (req, res) => {
      const thing = things.get(req.params.id);
      const claimed = req.get('x-user-id') || req.auth.userId;
      if (!thing || thing.ownerId !== claimed) throw new ApiError(404, 'NOT_FOUND', 'Not found.');
      res.json({ success: true, data: thing });
    };
    const app = buildApp(trusting);
    // the harness itself passes for honest clients...
    await assertOwnedResourceIsolation(isolation(app));
    // ...so the forged header is the extra probe every resource test also runs:
    const forged = await request(app).get('/things/t-1').set('x-test-session', USER_B).set('x-user-id', USER_A);
    expect(forged.status).toBe(200); // this is the hole; the scoped handler below is the fix
    const safe = await request(buildApp(scopedHandler)).get('/things/t-1').set('x-test-session', USER_B).set('x-user-id', USER_A);
    expect(safe.status).toBe(404);
  });

  it('requires authentication before anything else: no session, 401', async () => {
    const app = buildApp(scopedHandler);
    const res = await request(app).get('/things/t-1');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
