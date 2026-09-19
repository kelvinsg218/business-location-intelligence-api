'use strict';

const { mapBusinessTypeToGoogleType, categoryKeyForBusinessType } = require('../../../src/utils/businessTypeMapping');

describe('mapBusinessTypeToGoogleType', () => {
  it('maps known English business types', () => {
    expect(mapBusinessTypeToGoogleType('gym')).toBe('gym');
    expect(mapBusinessTypeToGoogleType('restaurant')).toBe('restaurant');
    expect(mapBusinessTypeToGoogleType('pharmacy')).toBe('pharmacy');
    expect(mapBusinessTypeToGoogleType('supermarket')).toBe('supermarket');
    expect(mapBusinessTypeToGoogleType('coffee shop')).toBe('cafe');
    expect(mapBusinessTypeToGoogleType('barber shop')).toBe('hair_care');
  });

  it('maps PT-BR synonyms', () => {
    expect(mapBusinessTypeToGoogleType('academia')).toBe('gym');
    expect(mapBusinessTypeToGoogleType('farmácia')).toBe('pharmacy');
    expect(mapBusinessTypeToGoogleType('restaurante')).toBe('restaurant');
    expect(mapBusinessTypeToGoogleType('supermercado')).toBe('supermarket');
    expect(mapBusinessTypeToGoogleType('barbearia')).toBe('hair_care');
  });

  it('is case-insensitive and accent-insensitive', () => {
    expect(mapBusinessTypeToGoogleType('GYM')).toBe('gym');
    expect(mapBusinessTypeToGoogleType('  Academia  ')).toBe('gym');
    expect(mapBusinessTypeToGoogleType('FARMACIA')).toBe('pharmacy');
  });

  it('handles simple plurals', () => {
    expect(mapBusinessTypeToGoogleType('gyms')).toBe('gym');
    expect(mapBusinessTypeToGoogleType('restaurants')).toBe('restaurant');
  });

  it('returns null for unmapped free text', () => {
    expect(mapBusinessTypeToGoogleType('pet grooming boutique')).toBeNull();
    expect(mapBusinessTypeToGoogleType('')).toBeNull();
    expect(mapBusinessTypeToGoogleType(undefined)).toBeNull();
  });
});

describe('categoryKeyForBusinessType', () => {
  it('returns the mapped Google type when confident', () => {
    expect(categoryKeyForBusinessType('academia')).toBe('gym');
  });

  it('falls back to the normalized raw text when unmapped', () => {
    expect(categoryKeyForBusinessType('Pet Grooming Boutique')).toBe('pet grooming boutique');
  });
});
