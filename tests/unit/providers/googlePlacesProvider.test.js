'use strict';

jest.mock('../../../src/config/env', () => ({
  env: {
    GOOGLE_MAPS_API_KEY: 'test-key', HTTP_TIMEOUT_MS: 5000, LOG_LEVEL: 'silent',
  },
}));
jest.mock('../../../src/utils/httpClient');

const httpClient = require('../../../src/utils/httpClient');
const { env } = require('../../../src/config/env');
const { GooglePlacesProvider, BASIC_FIELD_MASK } = require('../../../src/providers/places/googlePlacesProvider');
const { ApiError } = require('../../../src/utils/ApiError');

const BASE_PARAMS = {
  lat: -20.3297, lng: -40.2925, radiusMeters: 5000, businessType: 'gym', keywords: [],
};

describe('GooglePlacesProvider', () => {
  const provider = new GooglePlacesProvider();

  beforeEach(() => {
    env.GOOGLE_MAPS_API_KEY = 'test-key';
  });

  it('throws CONFIGURATION_ERROR without calling httpClient when the key is missing', async () => {
    env.GOOGLE_MAPS_API_KEY = '';
    await expect(provider.search(BASE_PARAMS)).rejects.toMatchObject({
      statusCode: 503, code: 'CONFIGURATION_ERROR',
    });
    expect(httpClient.request).not.toHaveBeenCalled();
  });

  it('sends the MVP field mask and the key in a header, never in the URL', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { places: [] } });
    await provider.search(BASE_PARAMS);

    const [url, options] = httpClient.request.mock.calls[0];
    expect(url).not.toContain('test-key');
    expect(options.headers['X-Goog-Api-Key']).toBe('test-key');
    expect(options.headers['X-Goog-FieldMask']).toBe(BASIC_FIELD_MASK);
    expect(options.method).toBe('POST');
  });

  it('excludes Enterprise-tier fields (rating/priceLevel/openingHours) from the field mask', () => {
    expect(BASIC_FIELD_MASK).not.toMatch(/rating|priceLevel|OpeningHours/);
  });

  it('builds textQuery from businessType and keywords, and a circle location restriction', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { places: [] } });
    await provider.search({ ...BASE_PARAMS, keywords: ['crossfit', '24 horas'] });

    const [, options] = httpClient.request.mock.calls[0];
    expect(options.body.textQuery).toBe('gym crossfit 24 horas');
    expect(options.body.locationRestriction.circle).toEqual({
      center: { latitude: -20.3297, longitude: -40.2925 }, radius: 5000,
    });
  });

  it('maps a successful response into the places contract shape', async () => {
    httpClient.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        places: [{
          id: 'place1',
          displayName: { text: 'Smart Fit' },
          formattedAddress: 'Av. Test, 100',
          location: { latitude: -20.33, longitude: -40.29 },
          types: ['gym', 'point_of_interest'],
          primaryType: 'gym',
          businessStatus: 'OPERATIONAL',
        }],
        nextPageToken: 'abc',
      },
    });

    const result = await provider.search(BASE_PARAMS);
    expect(result).toEqual({
      places: [{
        placeId: 'place1',
        name: 'Smart Fit',
        address: 'Av. Test, 100',
        location: { lat: -20.33, lng: -40.29 },
        types: ['gym', 'point_of_interest'],
        primaryType: 'gym',
        businessStatus: 'OPERATIONAL',
      }],
      nextPageToken: 'abc',
    });
  });

  it('throws 429 for RESOURCE_EXHAUSTED', async () => {
    httpClient.request.mockResolvedValue({ ok: false, status: 429, body: { error: { status: 'RESOURCE_EXHAUSTED' } } });
    await expect(provider.search(BASE_PARAMS)).rejects.toMatchObject({ statusCode: 429, code: 'PLACES_QUOTA_EXCEEDED' });
  });

  it('throws 502 for PERMISSION_DENIED', async () => {
    httpClient.request.mockResolvedValue({ ok: false, status: 403, body: { error: { status: 'PERMISSION_DENIED' } } });
    await expect(provider.search(BASE_PARAMS)).rejects.toMatchObject({ statusCode: 502, code: 'PLACES_CONFIG_ERROR' });
  });

  it('throws 400 for INVALID_ARGUMENT', async () => {
    httpClient.request.mockResolvedValue({ ok: false, status: 400, body: { error: { status: 'INVALID_ARGUMENT' } } });
    await expect(provider.search(BASE_PARAMS)).rejects.toMatchObject({ statusCode: 400, code: 'PLACES_BAD_REQUEST' });
  });

  it('throws 502 PLACES_UPSTREAM_ERROR for an unrecognized error', async () => {
    httpClient.request.mockResolvedValue({ ok: false, status: 500, body: {} });
    await expect(provider.search(BASE_PARAMS)).rejects.toMatchObject({ statusCode: 502, code: 'PLACES_UPSTREAM_ERROR' });
  });

  it('remaps an httpClient timeout to PLACES_TIMEOUT', async () => {
    httpClient.request.mockRejectedValue(new ApiError(504, 'UPSTREAM_TIMEOUT', 'timed out'));
    await expect(provider.search(BASE_PARAMS)).rejects.toMatchObject({ statusCode: 504, code: 'PLACES_TIMEOUT' });
  });
});
