'use strict';

const { ApiError } = require('../utils/ApiError');
const { logger } = require('../utils/logger');
const { isDatabaseUnavailableError } = require('../db/errors');

// Errors that are not ApiErrors but whose meaning is known, translated into the
// API's own error shape. Only generic, fixed messages leave the server: never the
// original message, which for a database error can include host, port or user.
function translate(err) {
  if (!err || typeof err !== 'object') return null;

  // body-parser (express.json): its errors carry a stable `type`.
  switch (err.type) {
    case 'entity.parse.failed':
      return new ApiError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
    case 'entity.too.large':
      return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The request body encoding is not supported.');
    default:
      break;
  }

  if (isDatabaseUnavailableError(err)) {
    return new ApiError(503, 'DATABASE_UNAVAILABLE', 'The service is temporarily unavailable. Please try again shortly.');
  }

  return null;
}

function send(req, res, apiError) {
  res.status(apiError.statusCode).json({
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      details: apiError.details,
      requestId: req.id,
    },
  });
}

function errorHandler(err, req, res, next) {
  // req.log is pino-http's per-request child logger, so these lines carry the request id.
  const log = req.log || logger;

  // A response that is already on its way can not be replaced by an error body.
  // Log it and hand over to Express, which closes the connection.
  if (res.headersSent) {
    log.error({ err }, 'error after the response had started');
    next(err);
    return;
  }

  if (err instanceof ApiError) {
    send(req, res, err);
    return;
  }

  const translated = translate(err);
  if (translated) {
    // A database being down is an operational event worth a log line (with the
    // real error, server side only). Malformed client input is not.
    if (translated.statusCode >= 500) log.error({ err }, 'request failed: dependency unavailable');
    send(req, res, translated);
    return;
  }

  log.error({ err }, 'unhandled error');
  send(req, res, new ApiError(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.'));
}

module.exports = { errorHandler };
