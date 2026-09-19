'use strict';

const { sanitizeUrlForLogging } = require('../../../src/utils/sanitizeUrlForLogging');

describe('sanitizeUrlForLogging', () => {
  it('masks the key query param', () => {
    const result = sanitizeUrlForLogging('https://maps.googleapis.com/maps/api/geocode/json?address=x&key=SECRET123');
    expect(result).not.toContain('SECRET123');
    expect(result).toContain('key=***');
  });

  it('returns the url unchanged if there is no key param', () => {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=x';
    expect(sanitizeUrlForLogging(url)).toBe(url);
  });

  it('does not throw on an invalid url, returning it as-is', () => {
    expect(sanitizeUrlForLogging('not a url')).toBe('not a url');
  });
});
