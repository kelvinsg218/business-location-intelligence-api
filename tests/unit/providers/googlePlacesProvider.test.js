'use strict';

jest.mock('../../../src/config/env', () => ({
  env: {
    GOOGLE_MAPS_API_KEY: 'test-key', HTTP_TIMEOUT_MS: 5000, LOG_LEVEL: 'silent',
  },
}));
jest.mock('../../../src/utils/httpClient');

const httpClient = require('../../../src/utils/httpClient');
const { env } = require('../../../src/config/env');
const { GooglePlacesProvider, BASIC_FIELD_MASK, NEARBY_FIELD_MASK } = require('../../../src/providers/places/googlePlacesProvider');
const { ApiError } = require('../../../src/utils/ApiError');
const { destinationPoint } = require('../../../src/utils/geo');

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

  it('builds textQuery from businessType and keywords', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { places: [] } });
    await provider.search({ ...BASE_PARAMS, keywords: ['crossfit', '24 horas'] });

    const [, options] = httpClient.request.mock.calls[0];
    expect(options.body.textQuery).toBe('gym crossfit 24 horas');
  });

  // Text Search (New) only accepts a rectangle as locationRestriction; a circle is
  // only valid for locationBias, which does not restrict results.
  it('restricts the search with a rectangle (the only locationRestriction shape Text Search supports), never a circle', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { places: [] } });
    await provider.search(BASE_PARAMS);

    const [, options] = httpClient.request.mock.calls[0];
    const { locationRestriction } = options.body;
    expect(Object.keys(locationRestriction)).toEqual(['rectangle']);
    expect(locationRestriction).not.toHaveProperty('circle');
    expect(options.body).not.toHaveProperty('locationBias');

    const { low, high } = locationRestriction.rectangle;
    expect(low.latitude).toBeCloseTo(-20.374666, 5);
    expect(low.longitude).toBeCloseTo(-40.340453, 5);
    expect(high.latitude).toBeCloseTo(-20.284734, 5);
    expect(high.longitude).toBeCloseTo(-40.244547, 5);
  });

  it('sends a valid rectangle: low is south-west of high, and the box contains the whole requested circle', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { places: [] } });
    await provider.search(BASE_PARAMS);

    const { low, high } = httpClient.request.mock.calls[0][1].body.locationRestriction.rectangle;
    expect(low.latitude).toBeLessThan(high.latitude);
    expect(low.longitude).toBeLessThan(high.longitude);

    // The box is tight by design, so the circle touches it; allow floating-point noise.
    const EPS = 1e-9;
    for (let bearing = 0; bearing < 360; bearing += 15) {
      const edge = destinationPoint({ lat: BASE_PARAMS.lat, lng: BASE_PARAMS.lng }, BASE_PARAMS.radiusMeters / 1000, bearing);
      expect(edge.lat).toBeGreaterThanOrEqual(low.latitude - EPS);
      expect(edge.lat).toBeLessThanOrEqual(high.latitude + EPS);
      expect(edge.lng).toBeGreaterThanOrEqual(low.longitude - EPS);
      expect(edge.lng).toBeLessThanOrEqual(high.longitude + EPS);
    }
  });

  it('scales the rectangle with the requested radius', async () => {
    httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { places: [] } });
    await provider.search({ ...BASE_PARAMS, radiusMeters: 1000 });
    await provider.search({ ...BASE_PARAMS, radiusMeters: 10000 });

    const heightOf = (call) => {
      const { low, high } = call[1].body.locationRestriction.rectangle;
      return high.latitude - low.latitude;
    };
    const [small, large] = httpClient.request.mock.calls;
    expect(heightOf(large) / heightOf(small)).toBeCloseTo(10, 3);
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

  describe('searchByTypes', () => {
    const NEARBY_PARAMS = {
      lat: -20.3297, lng: -40.2925, radiusMeters: 5000, includedTypes: ['sporting_goods_store', 'yoga_studio'],
    };

    it('throws CONFIGURATION_ERROR without calling httpClient when the key is missing', async () => {
      env.GOOGLE_MAPS_API_KEY = '';
      await expect(provider.searchByTypes(NEARBY_PARAMS)).rejects.toMatchObject({
        statusCode: 503, code: 'CONFIGURATION_ERROR',
      });
      expect(httpClient.request).not.toHaveBeenCalled();
    });

    it('hits the Nearby Search endpoint (not Text Search), sends includedTypes, the Nearby field mask, and the key in a header never the URL', async () => {
      httpClient.request.mockResolvedValue({ ok: true, status: 200, body: { places: [] } });
      await provider.searchByTypes(NEARBY_PARAMS);

      const [url, options] = httpClient.request.mock.calls[0];
      expect(url).toContain('searchNearby');
      expect(url).not.toContain('searchText');
      expect(url).not.toContain('test-key');
      expect(options.headers['X-Goog-Api-Key']).toBe('test-key');
      expect(options.headers['X-Goog-FieldMask']).toBe(NEARBY_FIELD_MASK);
      expect(options.method).toBe('POST');
      expect(options.body.includedTypes).toEqual(['sporting_goods_store', 'yoga_studio']);
      expect(options.body.locationRestriction.circle).toEqual({
        center: { latitude: -20.3297, longitude: -40.2925 }, radius: 5000,
      });
      expect(options.body).not.toHaveProperty('textQuery');
      expect(options.body).not.toHaveProperty('pageToken');
    });

    it('excludes nextPageToken from the Nearby field mask (Nearby Search has no pagination)', () => {
      expect(NEARBY_FIELD_MASK).not.toMatch(/nextPageToken/);
      expect(NEARBY_FIELD_MASK).not.toMatch(/rating|priceLevel|OpeningHours/);
    });

    it('maps a successful response into the places contract shape, with no nextPageToken field', async () => {
      httpClient.request.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          places: [{
            id: 'place2',
            displayName: { text: 'Corporate Tower' },
            formattedAddress: 'Av. Test, 200',
            location: { latitude: -20.33, longitude: -40.29 },
            types: ['corporate_office'],
            primaryType: 'corporate_office',
            businessStatus: 'OPERATIONAL',
          }],
        },
      });

      const result = await provider.searchByTypes(NEARBY_PARAMS);
      expect(result).toEqual({
        places: [{
          placeId: 'place2',
          name: 'Corporate Tower',
          address: 'Av. Test, 200',
          location: { lat: -20.33, lng: -40.29 },
          types: ['corporate_office'],
          primaryType: 'corporate_office',
          businessStatus: 'OPERATIONAL',
        }],
      });
    });

    it('reuses the same error-status mapping as search() (429/502/400/502 default)', async () => {
      httpClient.request.mockResolvedValue({ ok: false, status: 429, body: { error: { status: 'RESOURCE_EXHAUSTED' } } });
      await expect(provider.searchByTypes(NEARBY_PARAMS)).rejects.toMatchObject({ statusCode: 429, code: 'PLACES_QUOTA_EXCEEDED' });
    });

    it('remaps an httpClient timeout to PLACES_TIMEOUT', async () => {
      httpClient.request.mockRejectedValue(new ApiError(504, 'UPSTREAM_TIMEOUT', 'timed out'));
      await expect(provider.searchByTypes(NEARBY_PARAMS)).rejects.toMatchObject({ statusCode: 504, code: 'PLACES_TIMEOUT' });
    });
  });
});
