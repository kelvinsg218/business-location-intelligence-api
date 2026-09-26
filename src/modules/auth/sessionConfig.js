'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turns the validated env into the session settings used by the middleware,
 * the store and the logout handler (which must clear the cookie with the very
 * same attributes it was set with).
 *
 * The cookie name follows the Secure flag because the `__Host-` prefix is only
 * valid for Secure cookies (browsers reject it otherwise):
 *   production (Secure)      -> __Host-bli_sid   (host-only, Path=/, no Domain)
 *   local HTTP dev (no TLS)  -> bli_sid
 */
function buildSessionConfig(env) {
  const secure = env.SESSION_COOKIE_SECURE;

  return {
    cookieName: secure ? '__Host-bli_sid' : 'bli_sid',
    secure,
    sameSite: env.SESSION_COOKIE_SAMESITE,
    secrets: env.SESSION_SECRETS,
    idleTtlMs: env.SESSION_IDLE_TTL_DAYS * DAY_MS,
    absoluteTtlMs: env.SESSION_ABSOLUTE_TTL_DAYS * DAY_MS,
  };
}

// Attributes shared by setting and clearing the cookie.
function cookieAttributes(config) {
  return {
    httpOnly: true, secure: config.secure, sameSite: config.sameSite, path: '/',
  };
}

module.exports = { buildSessionConfig, cookieAttributes, DAY_MS };
