'use strict';

const { ApiError } = require('../../utils/ApiError');

/**
 * Gate for every route that needs a signed-in user. It is the ONLY place that
 * sets `req.auth`, and it derives the user exclusively from the server-side
 * session. Handlers and repositories must take the user id from `req.auth`,
 * never from the body, the query string, the URL or a header.
 */
function requireAuth(req, res, next) {
  const userId = req.session && req.session.userId;
  if (typeof userId !== 'string' || userId === '') {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
  }
  req.auth = Object.freeze({ userId });
  return next();
}

// What an app that was built without an auth module uses: nothing is ever
// authenticated, so protected routes fail closed instead of open.
function denyAll(req, res, next) {
  next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
}

module.exports = { requireAuth, denyAll };
