'use strict';

const { randomUUID } = require('crypto');

const REQUEST_ID_HEADER = 'X-Request-Id';

// The id is always generated here, never taken from an incoming header: a
// client-supplied value could be forged or used to inject content into logs.
// pino-http reuses req.id when it is already set, so the same id appears in
// the access log, the response header and any error body.
function requestId(req, res, next) {
  req.id = randomUUID();
  res.setHeader(REQUEST_ID_HEADER, req.id);
  next();
}

module.exports = { requestId, REQUEST_ID_HEADER };
