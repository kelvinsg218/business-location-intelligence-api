'use strict';

const { hashStringToInt, createSeededRandom } = require('../../../src/utils/mockDeterminism');

describe('hashStringToInt', () => {
  it('is deterministic for the same input', () => {
    expect(hashStringToInt('Vila Velha, ES')).toBe(hashStringToInt('Vila Velha, ES'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashStringToInt('gym')).not.toBe(hashStringToInt('restaurant'));
  });

  it('returns a non-negative 32-bit integer', () => {
    const hash = hashStringToInt('anything');
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(2 ** 32);
  });
});

describe('createSeededRandom', () => {
  it('produces an identical sequence for the same seed', () => {
    const rngA = createSeededRandom('cell:10_20:gym');
    const rngB = createSeededRandom('cell:10_20:gym');
    const sequenceA = Array.from({ length: 5 }, () => rngA());
    const sequenceB = Array.from({ length: 5 }, () => rngB());
    expect(sequenceA).toEqual(sequenceB);
  });

  it('produces different sequences for different seeds', () => {
    const rngA = createSeededRandom('seed-one');
    const rngB = createSeededRandom('seed-two');
    expect(rngA()).not.toBe(rngB());
  });

  it('produces numbers within [0, 1)', () => {
    const rng = createSeededRandom('range-check');
    for (let i = 0; i < 20; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
