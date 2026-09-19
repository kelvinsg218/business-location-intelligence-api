'use strict';

const { kmToMeters } = require('../../../src/utils/unitConversion');

describe('kmToMeters', () => {
  it('converts whole kilometers', () => {
    expect(kmToMeters(5)).toBe(5000);
    expect(kmToMeters(10)).toBe(10000);
  });

  it('converts fractional kilometers', () => {
    expect(kmToMeters(0.1)).toBeCloseTo(100);
    expect(kmToMeters(2.5)).toBeCloseTo(2500);
  });

  it('converts zero', () => {
    expect(kmToMeters(0)).toBe(0);
  });
});
