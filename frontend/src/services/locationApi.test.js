import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { analyzeLocation, ApiRequestError } from './locationApi.js';

describe('analyzeLocation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns data.data on a successful response and builds the query string', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { analysis: { opportunityScore: 78 } } }),
    });

    const result = await analyzeLocation({
      location: 'Vila Velha, ES', businessType: 'gym', radiusKm: 5, keywords: '',
    });

    expect(result).toEqual({ analysis: { opportunityScore: 78 } });

    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/v1/locations/analyze');
    expect(calledUrl).toContain('location=Vila+Velha%2C+ES');
    expect(calledUrl).toContain('businessType=gym');
    expect(calledUrl).toContain('radius=5');
  });

  it('is a same-origin call that carries the session cookie, and no token of its own', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    await analyzeLocation({ location: 'Vila Velha, ES', businessType: 'gym', radiusKm: 5 });

    const [url, init] = fetch.mock.calls[0];
    expect(url.startsWith('/api/v1/locations/analyze?')).toBe(true);
    expect(init.credentials).toBe('include');
    expect(Object.keys(init.headers).map((name) => name.toLowerCase())).not.toContain('authorization');
  });

  it('surfaces a 401 UNAUTHENTICATED as an ApiRequestError the auth layer can react to', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.', details: [] } }),
    });

    await expect(analyzeLocation({ location: 'x y', businessType: 'gym', radiusKm: 5 }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('omits the keywords param entirely when not provided', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    await analyzeLocation({ location: 'Vitória, ES', businessType: 'gym', radiusKm: 3 });

    expect(fetch.mock.calls[0][0]).not.toContain('keywords=');
  });

  it('throws an ApiRequestError carrying the backend error code on a non-success response', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        success: false,
        error: { code: 'LOCATION_NOT_FOUND', message: 'No address found', details: [] },
      }),
    });

    const promise = analyzeLocation({ location: '__notfound__', businessType: 'gym', radiusKm: 5 });

    await expect(promise).rejects.toBeInstanceOf(ApiRequestError);
    await expect(promise).rejects.toMatchObject({ status: 404, code: 'LOCATION_NOT_FOUND' });
  });

  it('throws a NETWORK_ERROR ApiRequestError when fetch itself fails', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const promise = analyzeLocation({ location: 'Vila Velha, ES', businessType: 'gym', radiusKm: 5 });

    await expect(promise).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
