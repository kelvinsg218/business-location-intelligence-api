'use strict';

const { ApiError } = require('../../utils/ApiError');

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence for requests that change state, layered on top of the
 * SameSite=Strict cookie (OWASP CSRF Prevention Cheat Sheet: verify Origin and
 * use Fetch Metadata). Safe methods (GET/HEAD/OPTIONS) are never touched.
 *
 *  1. If an Origin header is present it MUST be in the allowlist.
 *  2. If Sec-Fetch-Site is present:
 *       same-origin                    -> allowed (Origin, if any, passed rule 1)
 *       same-site / cross-site / none  -> allowed only when Origin is allowlisted
 *  3. No Origin and no Sec-Fetch-Site  -> a non-browser client (curl, a script, a
 *     test). A browser always sends at least one of them on a state-changing
 *     request, and only a browser holds the victim's session cookie.
 */
function createOriginGuard({ allowedOrigins }) {
  const allowed = new Set(allowedOrigins);

  return function originGuard(req, res, next) {
    if (!STATE_CHANGING_METHODS.has(req.method)) return next();

    const origin = req.get('origin');
    const site = req.get('sec-fetch-site');
    const originAllowed = origin !== undefined && allowed.has(origin);

    const reject = () => next(new ApiError(403, 'FORBIDDEN_ORIGIN', 'This request was not made from an allowed origin.'));

    if (origin !== undefined && !originAllowed) return reject();

    if (site !== undefined && site !== 'same-origin' && !originAllowed) return reject();

    return next();
  };
}

module.exports = { createOriginGuard, STATE_CHANGING_METHODS };
