'use strict';

const { request } = require('../../../src/utils/httpClient');

describe('httpClient.request', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns status/ok/body for a successful JSON response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ hello: 'world' }),
    });

    const result = await request('https://example.com/api', { timeoutMs: 1000 });
    expect(result).toEqual({ status: 200, ok: true, body: { hello: 'world' } });
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/api', expect.objectContaining({ method: 'GET' }));
  });

  it('returns ok:false with the parsed body for a non-2xx response (does not throw)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 429,
      ok: false,
      text: async () => JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }),
    });

    const result = await request('https://example.com/api', { timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
    expect(result.body.error.status).toBe('RESOURCE_EXHAUSTED');
  });

  it('returns a null body when the response is not valid JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => 'not json',
    });

    const result = await request('https://example.com/api', { timeoutMs: 1000 });
    expect(result.body).toBeNull();
  });

  it('maps an AbortError to a 504 UPSTREAM_TIMEOUT ApiError', async () => {
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    await expect(request('https://example.com/api', { timeoutMs: 10 })).rejects.toMatchObject({
      statusCode: 504, code: 'UPSTREAM_TIMEOUT',
    });
  });

  it('maps a generic network failure to a 503 UPSTREAM_UNAVAILABLE ApiError', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(request('https://example.com/api', { timeoutMs: 1000 })).rejects.toMatchObject({
      statusCode: 503, code: 'UPSTREAM_UNAVAILABLE',
    });
  });

  it('sends a POST body as JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true, text: async () => '{}' });
    await request('https://example.com/api', { method: 'POST', body: { a: 1 }, timeoutMs: 1000 });
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/api', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ a: 1 }),
    }));
  });
});
