import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { apiRequest, ApiRequestError, setUnauthorizedHandler } from './apiClient.js';

const ok = (data) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const fail = (status, code, extra = {}) => ({
  ok: false, status, json: async () => ({ success: false, error: { code, message: `msg ${code}`, ...extra } }),
});

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
  });

  it('always asks the browser to send the session cookie (credentials: include)', async () => {
    fetch.mockResolvedValue(ok({}));

    await apiRequest('/api/v1/auth/me');

    expect(fetch.mock.calls[0][1].credentials).toBe('include');
  });

  it('calls a same-origin relative URL by default (the dev proxy / single origin), never an absolute localhost URL', async () => {
    fetch.mockResolvedValue(ok({}));

    await apiRequest('/api/v1/auth/me');

    expect(fetch.mock.calls[0][0]).toBe('/api/v1/auth/me');
    expect(String(fetch.mock.calls[0][0])).not.toMatch(/^https?:\/\//);
  });

  it('uses VITE_API_BASE_URL as a prefix only when it is explicitly set (trailing slash trimmed)', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/');
    vi.resetModules();
    const fresh = await import('./apiClient.js');
    fetch.mockResolvedValue(ok({}));

    await fresh.apiRequest('/api/v1/auth/me');

    expect(fresh.API_BASE_URL).toBe('https://api.example.com');
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.com/api/v1/auth/me');
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
    vi.unstubAllEnvs();
  });

  it('sends a JSON body with the JSON content type, and no body header otherwise', async () => {
    fetch.mockResolvedValue(ok({}));

    await apiRequest('/api/v1/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' } });
    await apiRequest('/api/v1/auth/me');

    const [, withBody] = fetch.mock.calls[0];
    expect(withBody.method).toBe('POST');
    expect(withBody.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(withBody.body)).toEqual({ email: 'a@b.co', password: 'x' });
    const [, withoutBody] = fetch.mock.calls[1];
    expect(withoutBody.body).toBeUndefined();
    expect(withoutBody.headers['Content-Type']).toBeUndefined();
  });

  it('never attaches an Authorization header or any token of its own', async () => {
    fetch.mockResolvedValue(ok({}));

    await apiRequest('/api/v1/locations/analyze', { query: { location: 'x' } });

    const headers = fetch.mock.calls[0][1].headers;
    expect(Object.keys(headers).map((h) => h.toLowerCase())).toEqual(['accept']);
  });

  it('builds the query string and drops empty values', async () => {
    fetch.mockResolvedValue(ok({}));

    await apiRequest('/x', { query: { a: 'b c', n: 5, empty: '', missing: undefined, nothing: null } });

    expect(fetch.mock.calls[0][0]).toBe('/x?a=b+c&n=5');
  });

  it('returns the data payload, and null for 204', async () => {
    fetch.mockResolvedValueOnce(ok({ user: { id: '1' } }));
    fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => { throw new SyntaxError('empty'); } });

    await expect(apiRequest('/a')).resolves.toEqual({ user: { id: '1' } });
    await expect(apiRequest('/b', { method: 'POST' })).resolves.toBeNull();
  });

  it('throws an ApiRequestError with status, code, details and request id from the backend error shape', async () => {
    fetch.mockResolvedValue(fail(400, 'VALIDATION_ERROR', { details: [{ field: 'email', code: 'EMAIL_INVALID' }], requestId: 'abc' }));

    const promise = apiRequest('/x');

    await expect(promise).rejects.toBeInstanceOf(ApiRequestError);
    await expect(promise).rejects.toMatchObject({
      status: 400, code: 'VALIDATION_ERROR', details: [{ field: 'email', code: 'EMAIL_INVALID' }], requestId: 'abc',
    });
  });

  it('turns a failed fetch into NETWORK_ERROR and an unparsable body into UNEXPECTED_RESPONSE', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetch.mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new SyntaxError('<html>'); } });

    await expect(apiRequest('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    await expect(apiRequest('/x')).rejects.toMatchObject({ status: 502, code: 'UNEXPECTED_RESPONSE' });
  });

  it('lets an AbortError through untouched (a cancelled request is not a network failure)', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetch.mockRejectedValue(abort);

    await expect(apiRequest('/x')).rejects.toBe(abort);
  });

  describe('session-ended signal', () => {
    it('notifies the registered handler on 401 UNAUTHENTICATED', async () => {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      fetch.mockResolvedValue(fail(401, 'UNAUTHENTICATED'));

      await expect(apiRequest('/api/v1/locations/analyze')).rejects.toBeInstanceOf(ApiRequestError);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does NOT notify for a wrong password (401 INVALID_CREDENTIALS) or any other error', async () => {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      fetch.mockResolvedValueOnce(fail(401, 'INVALID_CREDENTIALS'));
      fetch.mockResolvedValueOnce(fail(403, 'FORBIDDEN_ORIGIN'));
      fetch.mockResolvedValueOnce(fail(503, 'DATABASE_UNAVAILABLE'));

      await apiRequest('/login', { method: 'POST' }).catch(() => {});
      await apiRequest('/x').catch(() => {});
      await apiRequest('/y').catch(() => {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not notify when the caller says a 401 is the expected answer', async () => {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      fetch.mockResolvedValue(fail(401, 'UNAUTHENTICATED'));

      await apiRequest('/api/v1/auth/me', { notifyUnauthorized: false }).catch(() => {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('the returned function unregisters the handler', async () => {
      const handler = vi.fn();
      const unregister = setUnauthorizedHandler(handler);
      unregister();
      fetch.mockResolvedValue(fail(401, 'UNAUTHENTICATED'));

      await apiRequest('/x').catch(() => {});

      expect(handler).not.toHaveBeenCalled();
    });
  });

  it('never touches localStorage or sessionStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    fetch.mockResolvedValue(ok({ user: { id: '1' } }));

    await apiRequest('/api/v1/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'secret-password-1' } });

    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    setItem.mockRestore();
    getItem.mockRestore();
  });
});
