'use strict';

const express = require('express');
const { ApiError } = require('../utils/ApiError');

const DEFAULT_LIMIT = '10kb';

function hasBody(req) {
  return req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length'] || 0) > 0;
}

// A request that carries a body must declare it as JSON. Anything else
// (form posts, text/plain, multipart) is refused outright: browsers can send
// those cross-site without a CORS preflight, JSON they cannot.
function requireJsonContentType(req, res, next) {
  if (hasBody(req) && !req.is('application/json')) {
    return next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The request body must be JSON (Content-Type: application/json).'));
  }
  return next();
}

/**
 * JSON-only body parsing with a small size cap. Malformed JSON and oversized
 * bodies surface as body-parser errors, which the global error handler turns
 * into 400 INVALID_JSON and 413 PAYLOAD_TOO_LARGE. In Express 5 `req.body` stays
 * `undefined` when there was no body, so consumers must not assume an object.
 */
function jsonBody({ limit = DEFAULT_LIMIT } = {}) {
  return [requireJsonContentType, express.json({ limit, strict: true })];
}

module.exports = { jsonBody, requireJsonContentType };
