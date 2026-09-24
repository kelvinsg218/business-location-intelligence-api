'use strict';

// Maps free-text business type synonyms (English + PT-BR) to Google Places'
// canonical "Table A" type enum. Not exhaustive — covers the types called out
// in the product spec. Returns null when there's no confident mapping;
// callers should fall back to free-text-only search in that case.
const SYNONYMS_TO_GOOGLE_TYPE = {
  gym: 'gym',
  academia: 'gym',
  fitness: 'gym',
  crossfit: 'gym',

  restaurant: 'restaurant',
  restaurante: 'restaurant',

  pharmacy: 'pharmacy',
  farmacia: 'pharmacy',
  drugstore: 'pharmacy',

  supermarket: 'supermarket',
  supermercado: 'supermarket',
  grocery: 'supermarket',
  'grocery store': 'supermarket',

  'coffee shop': 'cafe',
  cafe: 'cafe',
  cafeteria: 'cafe',
  coffeehouse: 'cafe',

  'barber shop': 'hair_care',
  barbearia: 'hair_care',
  barbershop: 'hair_care',
  salon: 'hair_care',
  'hair salon': 'hair_care',
  'beauty salon': 'beauty_salon',

  'pet shop': 'pet_store',
  'pet store': 'pet_store',
  petshop: 'pet_store',
  'loja de animais': 'pet_store',
  'loja de pet': 'pet_store',

  'clothing store': 'clothing_store',
  roupas: 'clothing_store',
  'loja de roupas': 'clothing_store',

  bakery: 'bakery',
  padaria: 'bakery',
  confeitaria: 'bakery',

  bar: 'bar',
  pub: 'bar',
  boteco: 'bar',

  'convenience store': 'convenience_store',
  'loja de conveniencia': 'convenience_store',

  'dental clinic': 'dental_clinic',
  dentist: 'dental_clinic',
  dentista: 'dental_clinic',
  'clinica odontologica': 'dental_clinic',

  'medical clinic': 'medical_clinic',
  'clinica medica': 'medical_clinic',
  'consultorio medico': 'medical_clinic',
};

function normalize(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function mapBusinessTypeToGoogleType(businessType) {
  const normalized = normalize(businessType);
  if (!normalized) return null;

  if (SYNONYMS_TO_GOOGLE_TYPE[normalized]) {
    return SYNONYMS_TO_GOOGLE_TYPE[normalized];
  }

  if (normalized.endsWith('s')) {
    const singular = normalized.slice(0, -1);
    if (SYNONYMS_TO_GOOGLE_TYPE[singular]) {
      return SYNONYMS_TO_GOOGLE_TYPE[singular];
    }
  }

  return null;
}

// Stable category key used to bucket business types for the mock provider's
// deterministic synthetic data. Falls back to the normalized raw input when
// there's no known Google type, so unmapped types still get a consistent key.
function categoryKeyForBusinessType(businessType) {
  return mapBusinessTypeToGoogleType(businessType) || normalize(businessType);
}

module.exports = { mapBusinessTypeToGoogleType, categoryKeyForBusinessType, normalize };
