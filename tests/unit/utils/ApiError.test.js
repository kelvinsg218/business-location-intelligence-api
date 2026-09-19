'use strict';

const { ApiError } = require('../../../src/utils/ApiError');

describe('ApiError', () => {
  it('sets statusCode, code, message and details', () => {
    const error = new ApiError(404, 'LOCATION_NOT_FOUND', 'no address found', [{ field: 'location' }]);

    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('LOCATION_NOT_FOUND');
    expect(error.message).toBe('no address found');
    expect(error.details).toEqual([{ field: 'location' }]);
    expect(error.name).toBe('ApiError');
  });

  it('defaults details to an empty array', () => {
    const error = new ApiError(500, 'INTERNAL_SERVER_ERROR', 'boom');
    expect(error.details).toEqual([]);
  });
});
