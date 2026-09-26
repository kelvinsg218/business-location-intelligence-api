// The one place that talks to the backend.
//
// Authentication is a server-side session in an HttpOnly cookie: JavaScript can
// not read it, so there is nothing to store and nothing to attach by hand. What
// this client must do is ask the browser to send the cookie (`credentials:
// 'include'`) and never keep a token anywhere (no localStorage, no
// sessionStorage, no in-memory bearer token).
//
// The base URL is empty by default, so requests go to the SAME origin as the
// page ("/api/..."): in development the Vite dev server proxies "/api" to the
// backend, in production one origin serves both. VITE_API_BASE_URL exists only
// for a deployment that really puts the API on another origin (it then also
// needs CORS_ORIGINS on the backend).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

// Thin wrapper over the backend's { success:false, error:{code,message,details,requestId} }
// shape, plus a NETWORK_ERROR case for when the API can't be reached at all.
export class ApiRequestError extends Error {
  constructor(status, code, message, details = [], requestId = undefined) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

// AuthContext registers itself here to learn that the session ended while the
// user was using the app (a protected call answered 401 UNAUTHENTICATED).
let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

function buildUrl(path, query) {
  const url = `${API_BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

/**
 * @param {string} path  e.g. "/api/v1/auth/me"
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {object} [options.query]   becomes the query string (empty values are dropped)
 * @param {object} [options.body]    sent as JSON
 * @param {boolean} [options.notifyUnauthorized=true]  set false for calls where a
 *   401 is an expected answer (checking whether a session exists at all)
 * @returns the response's `data` (null for 204)
 * @throws {ApiRequestError}
 */
export async function apiRequest(path, {
  method = 'GET', query, body, signal, notifyUnauthorized = true,
} = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Não foi possível conectar ao servidor.');
  }

  if (response.status === 204) return null;

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError(response.status, 'UNEXPECTED_RESPONSE', 'Resposta inesperada do servidor.');
  }

  if (!response.ok || !payload.success) {
    const {
      code, message, details, requestId,
    } = payload.error || {};
    const error = new ApiRequestError(
      response.status,
      code || 'UNKNOWN_ERROR',
      message || 'Ocorreu um erro inesperado.',
      details || [],
      requestId,
    );
    if (notifyUnauthorized && response.status === 401 && error.code === 'UNAUTHENTICATED' && unauthorizedHandler) {
      unauthorizedHandler(error);
    }
    throw error;
  }

  return payload.data;
}
