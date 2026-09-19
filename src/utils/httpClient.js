'use strict';

const { ApiError } = require('./ApiError');

// Thin wrapper over the platform fetch: adds a timeout and normalizes
// network-level failures into ApiError. Deliberately has zero retry logic —
// a failed external call fails once and is reported, never retried
// automatically, so a transient blip can never silently multiply cost.
async function request(url, {
  method = 'GET', headers = {}, body, timeoutMs,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError(504, 'UPSTREAM_TIMEOUT', 'The upstream request timed out.');
    }
    throw new ApiError(503, 'UPSTREAM_UNAVAILABLE', 'The upstream service is unavailable.');
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let parsedBody;
  try {
    parsedBody = text ? JSON.parse(text) : {};
  } catch {
    parsedBody = null;
  }

  return { status: response.status, ok: response.ok, body: parsedBody };
}

module.exports = { request };
