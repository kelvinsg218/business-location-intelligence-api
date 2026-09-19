'use strict';

const { ApiError } = require('../utils/ApiError');
const { logger } = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  logger.error({ err }, 'unhandled error');
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.', details: [] },
  });
}

module.exports = { errorHandler };
