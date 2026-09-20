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
