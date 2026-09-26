'use strict';

const express = require('express');
const { jsonBody } = require('../../middlewares/jsonBody');

function noStore(req, res, next) {
  // Credentials and identity never belong in a browser or proxy cache.
  res.set('Cache-Control', 'no-store');
  next();
}

/**
 * @param {object} deps
 * @param {object} deps.controller
 * @param {Function} deps.requireAuth
 * @param {{ register: Function, login: Function[] }} deps.limits  rate limiters
 */
function createAuthRouter({ controller, requireAuth, limits }) {
  const router = express.Router();
  router.use(noStore);

  // Body first, so the login limiters can key on the (hashed) e-mail. The
  // sign-up limiter is per IP only, so it runs before any parsing.

  /**
   * @openapi
   * /api/v1/auth/register:
   *   post:
   *     tags: [Auth]
   *     summary: Create an account and sign in
   *     description: >
   *       Creates the account and, in the same response, starts a session (the
   *       session cookie is set). The body must be `application/json`. The
   *       password needs 12 to 128 characters and must not be trivially weak;
   *       there are no composition rules. Answers 409 when the e-mail is already
   *       registered and 403 when registration is closed
   *       (`REGISTRATION_ENABLED=false`).
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, email, password]
   *             properties:
   *               name: { type: string, maxLength: 100, example: Maria Souza }
   *               email: { type: string, format: email, example: maria@example.com }
   *               password: { type: string, minLength: 12, maxLength: 128, format: password }
   *     responses:
   *       201:
   *         description: Account created; the session cookie is set.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success: { type: boolean, example: true }
   *                 data:
   *                   type: object
   *                   properties:
   *                     user: { $ref: '#/components/schemas/PublicUser' }
   *       400:
   *         description: Invalid field (`VALIDATION_ERROR`, with per-field `details`) or malformed JSON (`INVALID_JSON`).
   *       403:
   *         description: Origin not allowed (`FORBIDDEN_ORIGIN`) or registration closed (`REGISTRATION_DISABLED`).
   *       409:
   *         description: An account with this e-mail already exists (`EMAIL_ALREADY_REGISTERED`).
   *       413:
   *         description: Body too large (`PAYLOAD_TOO_LARGE`).
   *       415:
   *         description: The body is not JSON (`UNSUPPORTED_MEDIA_TYPE`).
   *       429:
   *         description: Too many sign-ups from this address.
   *       503:
   *         description: The database is unavailable (`DATABASE_UNAVAILABLE`).
   */
  router.post('/register', limits.register, ...jsonBody(), controller.register);

  /**
   * @openapi
   * /api/v1/auth/login:
   *   post:
   *     tags: [Auth]
   *     summary: Sign in
   *     description: >
   *       Starts a session (the session cookie is set; any previous session id is
   *       replaced). An unknown e-mail and a wrong password get the same
   *       `401 INVALID_CREDENTIALS`. Failed attempts are rate limited per address,
   *       per address + account and per account.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password]
   *             properties:
   *               email: { type: string, format: email, example: maria@example.com }
   *               password: { type: string, format: password }
   *     responses:
   *       200:
   *         description: Signed in; the session cookie is set.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success: { type: boolean, example: true }
   *                 data:
   *                   type: object
   *                   properties:
   *                     user: { $ref: '#/components/schemas/PublicUser' }
   *       400:
   *         description: A required field is missing (`VALIDATION_ERROR`) or malformed JSON (`INVALID_JSON`).
   *       401:
   *         description: Wrong e-mail or password (`INVALID_CREDENTIALS`).
   *       403:
   *         description: Origin not allowed (`FORBIDDEN_ORIGIN`).
   *       429:
   *         description: Too many failed attempts.
   *       503:
   *         description: The database is unavailable (`DATABASE_UNAVAILABLE`).
   */
  router.post('/login', ...jsonBody(), ...limits.login, controller.login);

  /**
   * @openapi
   * /api/v1/auth/logout:
   *   post:
   *     tags: [Auth]
   *     summary: Sign out
   *     description: >
   *       Destroys the server-side session and clears the cookie. Idempotent:
   *       answers 204 even when there was no session.
   *     responses:
   *       204:
   *         description: Signed out.
   *       403:
   *         description: Origin not allowed (`FORBIDDEN_ORIGIN`).
   *       503:
   *         description: The database is unavailable (`DATABASE_UNAVAILABLE`).
   */
  router.post('/logout', ...jsonBody(), controller.logout);

  /**
   * @openapi
   * /api/v1/auth/me:
   *   get:
   *     tags: [Auth]
   *     summary: The signed-in user
   *     description: Used by the front end to recover the session after a reload.
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: The current user.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success: { type: boolean, example: true }
   *                 data:
   *                   type: object
   *                   properties:
   *                     user: { $ref: '#/components/schemas/PublicUser' }
   *       401:
   *         description: Not signed in, or the session expired (`UNAUTHENTICATED`).
   *       503:
   *         description: The database is unavailable (`DATABASE_UNAVAILABLE`).
   */
  router.get('/me', requireAuth, controller.me);

  return router;
}

module.exports = { createAuthRouter };
