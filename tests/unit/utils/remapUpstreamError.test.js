'use strict';

const { remapUpstreamError } = require('../../../src/utils/remapUpstreamError');
const { ApiError } = require('../../../src/utils/ApiError');

describe('remapUpstreamError', () => {
  it('remaps UPSTREAM_TIMEOUT to a prefixed timeout error', () => {
    const err = new ApiError(504, 'UPSTREAM_TIMEOUT', 'timed out');
    expect(remapUpstreamError(err, 'GEOCODING')).toMatchObject({ statusCode: 504, code: 'GEOCODING_TIMEOUT' });
  });

  it('remaps UPSTREAM_UNAVAILABLE to a prefixed unavailable error', () => {
    const err = new ApiError(503, 'UPSTREAM_UNAVAILABLE', 'unavailable');
    expect(remapUpstreamError(err, 'PLACES')).toMatchObject({ statusCode: 503, code: 'PLACES_UNAVAILABLE' });
  });

  it('passes through any other error unchanged', () => {
    const err = new Error('something else');
    expect(remapUpstreamError(err, 'GEOCODING')).toBe(err);
  });
});
