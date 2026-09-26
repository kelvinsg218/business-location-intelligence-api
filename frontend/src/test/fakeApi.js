import { vi } from 'vitest';

// A tiny in-memory stand-in for the backend, behind a fetch mock, so tests can
// exercise the real client + auth layer + routes end to end. It models only what
// the front end depends on: the auth endpoints, their error codes, and a
// session that a protected call can lose.

export const TEST_PASSWORD = 'frase-longa-e-segura-42';

export const TEST_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Maria Souza',
  email: 'maria@example.com',
  createdAt: '2026-03-01T12:00:00.000Z',
};

function respond(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
  };
}

const failure = (status, code, message = code, details = []) => respond(status, {
  success: false, error: { code, message, details, requestId: 'req-test' },
});

/**
 * @param {object} [options]
 * @param {boolean} [options.signedIn]   start with a valid session (cookie present)
 * @param {boolean} [options.down]       every call fails as if the server were unreachable
 * @param {boolean} [options.registrationOpen]
 * @param {boolean} [options.hangSessionCheck]  GET /auth/me never answers
 * @param {number} [options.sessionCheckStatus]  GET /auth/me fails with this HTTP status (e.g. 503)
 */
export function installFakeApi({
  signedIn = false, down = false, registrationOpen = true, hangSessionCheck = false, sessionCheckStatus = null,
} = {}) {
  const state = {
    session: signedIn ? { ...TEST_USER } : null,
    accounts: [{ ...TEST_USER, password: TEST_PASSWORD }],
    down,
    registrationOpen,
    logoutFails: false,
    hangSessionCheck,
    serverError: sessionCheckStatus,
  };

  const handlers = {
    'GET /api/v1/auth/me': () => (state.session
      ? respond(200, { success: true, data: { user: state.session } })
      : failure(401, 'UNAUTHENTICATED', 'Authentication is required.')),

    'POST /api/v1/auth/login': ({ body }) => {
      const account = state.accounts.find((a) => a.email === String(body.email).trim().toLowerCase());
      if (!account || account.password !== body.password) return failure(401, 'INVALID_CREDENTIALS', 'Invalid e-mail or password.');
      const user = {
        id: account.id, name: account.name, email: account.email, createdAt: account.createdAt,
      };
      state.session = user;
      return respond(200, { success: true, data: { user } });
    },

    'POST /api/v1/auth/register': ({ body }) => {
      if (!state.registrationOpen) return failure(403, 'REGISTRATION_DISABLED');
      const details = [];
      if (!body.name || !String(body.name).trim()) details.push({ field: 'name', code: 'NAME_REQUIRED' });
      if (!body.password || body.password.length < 12) details.push({ field: 'password', code: 'PASSWORD_TOO_SHORT' });
      else if (body.password === 'password1234') details.push({ field: 'password', code: 'PASSWORD_TOO_COMMON' });
      if (details.length > 0) return failure(400, 'VALIDATION_ERROR', 'invalid', details);
      if (state.accounts.some((a) => a.email === body.email.trim().toLowerCase())) return failure(409, 'EMAIL_ALREADY_REGISTERED');
      const user = {
        id: '22222222-2222-4222-8222-222222222222', name: body.name.trim(), email: body.email.trim().toLowerCase(), createdAt: '2026-03-02T09:00:00.000Z',
      };
      state.accounts.push({ ...user, password: body.password });
      state.session = user;
      return respond(201, { success: true, data: { user } });
    },

    'POST /api/v1/auth/logout': () => {
      if (state.logoutFails) return failure(503, 'DATABASE_UNAVAILABLE');
      state.session = null;
      return respond(204);
    },

    'GET /api/v1/locations/analyze': () => (state.session
      ? respond(200, { success: true, data: {} })
      : failure(401, 'UNAUTHENTICATED', 'Authentication is required.')),
  };

  const fetchMock = vi.fn(async (url, init = {}) => {
    if (state.down) throw new TypeError('Failed to fetch');
    const { pathname } = new URL(url, 'http://localhost');
    const method = (init.method || 'GET').toUpperCase();
    const handler = handlers[`${method} ${pathname}`];
    if (!handler) return failure(404, 'NOT_FOUND');
    if (pathname === '/api/v1/auth/me') {
      if (state.hangSessionCheck) return new Promise(() => {});
      if (state.serverError) return failure(state.serverError, 'DATABASE_UNAVAILABLE');
    }
    const body = init.body ? JSON.parse(init.body) : undefined;
    return handler({ body, init });
  });

  vi.stubGlobal('fetch', fetchMock);

  const callsTo = (method, path) => fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method || 'GET').toUpperCase() === method && new URL(url, 'http://localhost').pathname === path,
  );

  return { state, fetchMock, callsTo };
}
