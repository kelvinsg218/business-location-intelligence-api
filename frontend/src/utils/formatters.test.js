import { describe, it, expect } from 'vitest';
import {
  formatNumber, formatInteger, formatKm, formatKm2, formatDensity, humanizeType,
} from './formatters.js';

describe('formatNumber', () => {
  it('formats decimals using pt-BR locale (comma separator)', () => {
    expect(formatNumber(3.4444)).toBe('3,44');
    expect(formatNumber(0.1)).toBe('0,1');
  });

  it('falls back to an em dash for null/undefined/NaN', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber(NaN)).toBe('—');
  });
});

describe('formatInteger', () => {
  it('formats with pt-BR thousands separators', () => {
    expect(formatInteger(1000)).toBe('1.000');
  });

  it('falls back to 0 for null/undefined', () => {
    expect(formatInteger(null)).toBe('0');
  });
});

describe('unit formatters', () => {
  it('appends the right unit suffix', () => {
    expect(formatKm(3.44)).toBe('3,44 km');
    expect(formatKm2(78.5)).toBe('78,5 km²');
    expect(formatDensity(0.1)).toBe('0,1 / km²');
  });

  it('leaves the fallback dash unit-less', () => {
    expect(formatKm(null)).toBe('—');
    expect(formatKm2(undefined)).toBe('—');
  });
});

describe('humanizeType', () => {
  it('turns snake_case Google types into title case', () => {
    expect(humanizeType('coffee_shop')).toBe('Coffee Shop');
    expect(humanizeType('gym')).toBe('Gym');
  });

  it('falls back to an em dash when there is no type', () => {
    expect(humanizeType(null)).toBe('—');
    expect(humanizeType('')).toBe('—');
  });
});
