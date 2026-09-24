'use strict';

const { resolveBusinessProfile, BUSINESS_PROFILES } = require('../../../src/config/businessProfiles');

describe('resolveBusinessProfile', () => {
  it('resolves gym and its synonyms via the existing Google-type mapping', () => {
    expect(resolveBusinessProfile('gym')).toMatchObject({ id: 'gym' });
    expect(resolveBusinessProfile('academia')).toMatchObject({ id: 'gym' });
    expect(resolveBusinessProfile('crossfit')).toMatchObject({ id: 'gym' });
    expect(resolveBusinessProfile('gyms')).toMatchObject({ id: 'gym' });
  });

  it('resolves coffee shop synonyms to the coffee_shop profile via the cafe mapping', () => {
    expect(resolveBusinessProfile('coffee shop')).toMatchObject({ id: 'coffee_shop' });
    expect(resolveBusinessProfile('cafe')).toMatchObject({ id: 'coffee_shop' });
    expect(resolveBusinessProfile('cafeteria')).toMatchObject({ id: 'coffee_shop' });
  });

  it('returns the full profile shape (complementaryTypes/trafficGeneratorTypes)', () => {
    const profile = resolveBusinessProfile('gym');
    expect(profile).toEqual({
      id: 'gym',
      complementaryTypes: BUSINESS_PROFILES.gym.complementaryTypes,
      trafficGeneratorTypes: BUSINESS_PROFILES.gym.trafficGeneratorTypes,
    });
  });

  it('resolves fitness clothing store via its own synonym set, case/accent-insensitively', () => {
    expect(resolveBusinessProfile('fitness clothing store')).toMatchObject({ id: 'fitness_clothing_store' });
    expect(resolveBusinessProfile('Loja de Roupas Fitness')).toMatchObject({ id: 'fitness_clothing_store' });
    expect(resolveBusinessProfile('ROUPAS FITNESS')).toMatchObject({ id: 'fitness_clothing_store' });
  });

  it('resolves a generic clothing store to its own clothing_store profile, distinct from fitness_clothing_store', () => {
    // The spec's own worked example: "fitness clothing store" and a plain
    // "clothing store" both map to Google's 'clothing_store' competitor
    // type, but must not share a Commercial Ecosystem profile.
    const profile = resolveBusinessProfile('clothing store');
    expect(profile).toMatchObject({ id: 'clothing_store' });
    expect(profile.id).not.toBe('fitness_clothing_store');
  });

  it('resolves every expanded-catalog business type to its own profile', () => {
    expect(resolveBusinessProfile('restaurant')).toMatchObject({ id: 'restaurant' });
    expect(resolveBusinessProfile('restaurante')).toMatchObject({ id: 'restaurant' });
    expect(resolveBusinessProfile('pharmacy')).toMatchObject({ id: 'pharmacy' });
    expect(resolveBusinessProfile('farmácia')).toMatchObject({ id: 'pharmacy' });
    expect(resolveBusinessProfile('beauty salon')).toMatchObject({ id: 'beauty_salon' });
    expect(resolveBusinessProfile('pet shop')).toMatchObject({ id: 'pet_shop' });
    expect(resolveBusinessProfile('loja de animais')).toMatchObject({ id: 'pet_shop' });
    expect(resolveBusinessProfile('bakery')).toMatchObject({ id: 'bakery' });
    expect(resolveBusinessProfile('padaria')).toMatchObject({ id: 'bakery' });
    expect(resolveBusinessProfile('bar')).toMatchObject({ id: 'bar' });
    expect(resolveBusinessProfile('supermarket')).toMatchObject({ id: 'supermarket' });
    expect(resolveBusinessProfile('convenience store')).toMatchObject({ id: 'convenience_store' });
    expect(resolveBusinessProfile('dental clinic')).toMatchObject({ id: 'dental_clinic' });
    expect(resolveBusinessProfile('dentista')).toMatchObject({ id: 'dental_clinic' });
    expect(resolveBusinessProfile('medical clinic')).toMatchObject({ id: 'medical_clinic' });
  });

  it('resolves every hair_care synonym (barber shop AND generic salon) to the barber_shop profile', () => {
    // Known, documented limitation: businessTypeMapping.js doesn't
    // distinguish a barbershop from a generic unisex hair salon, so both
    // share this one Commercial Ecosystem profile.
    expect(resolveBusinessProfile('barber shop')).toMatchObject({ id: 'barber_shop' });
    expect(resolveBusinessProfile('barbearia')).toMatchObject({ id: 'barber_shop' });
    expect(resolveBusinessProfile('barbershop')).toMatchObject({ id: 'barber_shop' });
    expect(resolveBusinessProfile('salon')).toMatchObject({ id: 'barber_shop' });
    expect(resolveBusinessProfile('hair salon')).toMatchObject({ id: 'barber_shop' });
  });

  it('resolves supermarket with a deliberately empty trafficGeneratorTypes list', () => {
    const profile = resolveBusinessProfile('supermarket');
    expect(profile.trafficGeneratorTypes).toEqual([]);
    expect(profile.complementaryTypes.length).toBeGreaterThan(0);
  });

  it('returns null for business types with no profile in this catalog', () => {
    expect(resolveBusinessProfile('pet grooming boutique')).toBeNull();
    expect(resolveBusinessProfile('car wash')).toBeNull();
  });

  it('returns null for empty/missing input', () => {
    expect(resolveBusinessProfile('')).toBeNull();
    expect(resolveBusinessProfile(undefined)).toBeNull();
  });
});
