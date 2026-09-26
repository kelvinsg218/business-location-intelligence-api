'use strict';

// Builds the real app with the real auth module on a real PostgreSQL pool, for
// the suites that test authentication end to end. Cookies are handled by hand
// (not with a supertest agent) so a test can inspect, replay, forge and expire
// them explicitly.

const request = require('supertest');
const signature = require('cookie-signature');
const { createApp } = require('../../src/app');
const { createAuthModule } = require('../../src/modules/auth');
const { buildSessionConfig } = require('../../src/modules/auth/sessionConfig');
const { MockGeocodingProvider } = require('../../src/providers/geocoding/mockGeocodingProvider');
const { MockPlacesProvider } = require('../../src/providers/places/mockPlacesProvider');
const { uniqueEmail } = require('./db');

const TEST_SECRET = 'test-only-session-secret-0123456789-abcdefghijklmnop';
const ALLOWED_ORIGIN = 'http://localhost:5173';
const STRONG_PASSWORD = 'Purple-Otter-Runs-Fast-42';
const DAY_MS = 24 * 60 * 60 * 1000;

const GENEROUS = { limit: 100000 };

function createClock(startIso = '2026-03-01T12:00:00Z') {
  const clock = { ms: Date.parse(startIso) };
  clock.now = () => new Date(clock.ms);
  clock.advance = (ms) => { clock.ms += ms; };
  clock.days = (n) => { clock.ms += n * DAY_MS; };
  return clock;
}

function createCaptureStream() {
  const chunks = [];
  return {
    write(chunk) { chunks.push(chunk); return true; },
    text() { return chunks.join(''); },
    entries() { return chunks.join('').split('\n').filter(Boolean).map((line) => JSON.parse(line)); },
  };
}

/**
 * @param {object} options
 * @param {object} options.db  pg Pool (or a wrapper with .query)
 * @param {boolean} [options.secure=false] production-like cookies (Secure, __Host- prefix)
 */
function buildAuthApp({
  db,
  secure = false,
  clock,
  registrationEnabled = true,
  rateLimits = {},
  analyzeRateLimit = { windowMs: 60 * 60 * 1000, limit: 100000 },
  trustProxy = 0,
  logger,
  allowedOrigins = [ALLOWED_ORIGIN],
  touchIntervalMs,
  maxRadiusKm = 20,
  appOverrides = {},
} = {}) {
  const sessionConfig = buildSessionConfig({
    SESSION_COOKIE_SECURE: secure,
    SESSION_COOKIE_SAMESITE: 'strict',
    SESSION_SECRETS: [TEST_SECRET],
    SESSION_IDLE_TTL_DAYS: 7,
    SESSION_ABSOLUTE_TTL_DAYS: 30,
  });

  const auth = createAuthModule({
    db,
    sessionConfig,
    allowedOrigins,
    registrationEnabled,
    rateLimits: {
      register: GENEROUS,
      loginPerIp: GENEROUS,
      loginPerIpAndEmail: GENEROUS,
      loginPerEmail: GENEROUS,
      ...rateLimits,
    },
    analyzeRateLimit,
    touchIntervalMs,
    now: clock ? clock.now : undefined,
    logger,
  });

  const app = createApp({
    db,
    auth,
    trustProxy,
    ...(logger ? { logger } : {}),
    rateLimit: { max: 1000000 },
    geocodingProvider: new MockGeocodingProvider(),
    placesProvider: new MockPlacesProvider(),
    providerNames: { geocoding: 'mock', places: 'mock' },
    maxRadiusKm,
    maxSearchPoints: 7,
    gridMinRadiusKm: 3,
    maxPagesPerPoint: 1,
    enableCommercialEcosystem: true,
    ...appOverrides,
  });

  return {
    app, auth, sessionConfig, cookieName: sessionConfig.cookieName,
  };
}

// ---- requests -------------------------------------------------------------

function send(app, method, path, { body, cookie, headers = {} } = {}) {
  let req = request(app)[method](path);
  if (cookie) req = req.set('Cookie', cookie);
  Object.entries(headers).forEach(([name, value]) => { req = req.set(name, value); });
  return body === undefined ? req : req.send(body);
}

const api = {
  register: (app, body, opts) => send(app, 'post', '/api/v1/auth/register', { body, ...opts }),
  login: (app, body, opts) => send(app, 'post', '/api/v1/auth/login', { body, ...opts }),
  logout: (app, opts) => send(app, 'post', '/api/v1/auth/logout', opts),
  me: (app, opts) => send(app, 'get', '/api/v1/auth/me', opts),
  analyze: (app, query = { location: 'Vila Velha, ES', businessType: 'gym', radius: 5 }, opts = {}) => send(
    app, 'get', '/api/v1/locations/analyze', opts,
  ).query(query),
};

// ---- cookies --------------------------------------------------------------

function setCookieList(res) {
  const header = res.headers['set-cookie'];
  return header ? [].concat(header) : [];
}

function findSetCookie(res, name) {
  return setCookieList(res).find((line) => line.startsWith(`${name}=`));
}

// "name=value" ready to be replayed in a Cookie header.
function cookiePair(res, name) {
  const line = findSetCookie(res, name);
  return line ? line.split(';')[0] : undefined;
}

function parseSetCookie(line) {
  const [pair, ...attributes] = line.split(';').map((part) => part.trim());
  const eq = pair.indexOf('=');
  const parsed = { name: pair.slice(0, eq), value: pair.slice(eq + 1), attributes: {} };
  attributes.forEach((attribute) => {
    const [key, ...rest] = attribute.split('=');
    parsed.attributes[key.toLowerCase()] = rest.length === 0 ? true : rest.join('=');
  });
  return parsed;
}

// The raw session id inside a signed cookie ("s:<sid>.<signature>").
function sessionIdOf(cookieValue) {
  const decoded = decodeURIComponent(cookieValue);
  return signature.unsign(decoded.slice(2), TEST_SECRET);
}

function signSessionId(sid, secret = TEST_SECRET) {
  return `s:${signature.sign(sid, secret)}`;
}

// ---- accounts -------------------------------------------------------------

async function registerUser(app, cookieName, overrides = {}) {
  const email = overrides.email || uniqueEmail('auth');
  const password = overrides.password || STRONG_PASSWORD;
  const res = await api.register(app, { name: overrides.name || 'Maria Souza', email, password });
  if (res.status !== 201) throw new Error(`test setup: register failed with ${res.status} ${JSON.stringify(res.body)}`);
  return {
    email, password, user: res.body.data.user, cookie: cookiePair(res, cookieName), res,
  };
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

module.exports = {
  ALLOWED_ORIGIN,
  DAY_MS,
  STRONG_PASSWORD,
  TEST_SECRET,
  api,
  buildAuthApp,
  cookiePair,
  createCaptureStream,
  createClock,
  findSetCookie,
  parseSetCookie,
  registerUser,
  send,
  sessionIdOf,
  setCookieList,
  signSessionId,
  sleep,
};
