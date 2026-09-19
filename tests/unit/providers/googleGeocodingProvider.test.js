'use strict';

jest.mock('../../../src/config/env', () => ({
  env: {
    GOOGLE_MAPS_API_KEY: 'test-key', HTTP_TIMEOUT_MS: 5000, LOG_LEVEL: 'silent',
  },
}));
jest.mock('../../../src/utils/httpClient');

const httpClient = require('../../../src/utils/httpClient');
const { env } = require('../../../src/config/env');
const { GoogleGeocodingProvider } = require('../../../src/providers/geocoding/googleGeocodingProvider');
const { ApiError } = require('../../../src/utils/ApiError');

describe('GoogleGeocodingProvider', () => {
  const provider = new GoogleGeocodingProvider();

  beforeEach(() => {
    env.GOOGLE_MAPS_API_KEY = 'test-key';
  });

  it('throws CONFIGURATION_ERROR without ever calling httpClient when the key is missing', async () => {
    env.GOOGLE_MAPS_API_KEY = '';
    await expect(provider.geocode('Vila Velha, ES')).rejects.toMatchObject({
      statusCode: 503, code: 'CONFIGURATION_ERROR',
    });
    expect(httpClient.request).not.toHaveBeenCalled();
  });

  it('never puts the key in a value that could be logged as a plain address', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { status: 'ZERO_RESULTS', results: [] } });
    await provider.geocode('Vila Velha, ES');
    const [url] = httpClient.request.mock.calls[0];
    expect(url).toContain('key=test-key');
    expect(url).toContain('address=');
  });

  it('returns coordinates for an OK response', async () => {
    httpClient.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        status: 'OK',
        results: [{
          formatted_address: 'Vila Velha - ES, Brazil',
          geometry: { location: { lat: -20.3297, lng: -40.2925 } },
          place_id: 'abc123',
        }],
      },
    });

    const result = await provider.geocode('Vila Velha, ES');
    expect(result).toEqual({
      formattedAddress: 'Vila Velha - ES, Brazil',
      coordinates: { lat: -20.3297, lng: -40.2925 },
      placeId: 'abc123',
    });
  });

  it('returns null for ZERO_RESULTS', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { status: 'ZERO_RESULTS', results: [] } });
    expect(await provider.geocode('nowhere')).toBeNull();
  });

  it('throws 429 for OVER_QUERY_LIMIT', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { status: 'OVER_QUERY_LIMIT', results: [] } });
    await expect(provider.geocode('x')).rejects.toMatchObject({ statusCode: 429, code: 'GEOCODING_QUOTA_EXCEEDED' });
  });

  it('throws 502 for REQUEST_DENIED', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { status: 'REQUEST_DENIED', results: [] } });
    await expect(provider.geocode('x')).rejects.toMatchObject({ statusCode: 502, code: 'GEOCODING_CONFIG_ERROR' });
  });

  it('throws 400 for INVALID_REQUEST', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { status: 'INVALID_REQUEST', results: [] } });
    await expect(provider.geocode('x')).rejects.toMatchObject({ statusCode: 400, code: 'GEOCODING_BAD_REQUEST' });
  });

  it('throws 502 GEOCODING_UPSTREAM_ERROR for an unknown status', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { status: 'SOMETHING_WEIRD', results: [] } });
    await expect(provider.geocode('x')).rejects.toMatchObject({ statusCode: 502, code: 'GEOCODING_UPSTREAM_ERROR' });
  });

  it('throws 502 when the response is not ok', async () => {
    httpClient.request.mockResolvedValue({ ok: false, status: 500, body: null });
    await expect(provider.geocode('x')).rejects.toMatchObject({ statusCode: 502, code: 'GEOCODING_UPSTREAM_ERROR' });
  });

  it('remaps an httpClient timeout to GEOCODING_TIMEOUT', async () => {
    httpClient.request.mockRejectedValue(new ApiError(504, 'UPSTREAM_TIMEOUT', 'timed out'));
    await expect(provider.geocode('x')).rejects.toMatchObject({ statusCode: 504, code: 'GEOCODING_TIMEOUT' });
  });
});
