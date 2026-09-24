'use strict';

// Phase 1 scope note: this schema intentionally covers only what
// Commercial Ecosystem analysis consumes today (complementary + traffic
// generator type lists). It is expected to evolve in later phases (e.g.
// competitor types, per-profile scoring weights for Location Score 2.0,
// demographic/accessibility relevance) — those fields are deliberately
// NOT stubbed in here ahead of a real consumer; add them when something
// actually reads them.
//
// Type strings are real Google Places API (New) "Table A" values, spot
// checked against Google's docs — re-verify before adding new ones.

const { mapBusinessTypeToGoogleType, normalize } = require('../utils/businessTypeMapping');

const BUSINESS_PROFILES = {
  gym: {
    complementaryTypes: ['sporting_goods_store', 'yoga_studio'],
    trafficGeneratorTypes: ['corporate_office', 'shopping_mall'],
  },
  coffee_shop: {
    complementaryTypes: ['bakery', 'coworking_space'],
    trafficGeneratorTypes: ['corporate_office', 'university'],
  },
  fitness_clothing_store: {
    complementaryTypes: ['gym', 'yoga_studio'],
    trafficGeneratorTypes: ['shopping_mall'],
  },
  restaurant: {
    complementaryTypes: ['bar'],
    trafficGeneratorTypes: ['corporate_office', 'hotel'],
  },
  pharmacy: {
    complementaryTypes: ['medical_clinic'],
    trafficGeneratorTypes: ['supermarket', 'shopping_mall'],
  },
  beauty_salon: {
    complementaryTypes: ['clothing_store'],
    trafficGeneratorTypes: ['shopping_mall'],
  },
  pet_shop: {
    complementaryTypes: ['veterinary_care'],
    trafficGeneratorTypes: ['park', 'shopping_mall'],
  },
  clothing_store: {
    complementaryTypes: ['shoe_store'],
    trafficGeneratorTypes: ['shopping_mall'],
  },
  bakery: {
    complementaryTypes: ['cafe'],
    trafficGeneratorTypes: ['corporate_office', 'school'],
  },
  bar: {
    complementaryTypes: ['restaurant'],
    trafficGeneratorTypes: ['night_club', 'hotel'],
  },
  // No defensible Places type represents "residential density" — the real
  // driver of supermarket traffic — and inventing a stand-in would be
  // exactly the fabrication the product principles forbid. Left empty
  // deliberately (exercises the empty-includedTypes path in
  // commercialEcosystemSearch.js, not a bug).
  supermarket: {
    complementaryTypes: ['pharmacy', 'bakery'],
    trafficGeneratorTypes: [],
  },
  convenience_store: {
    complementaryTypes: ['gas_station'],
    trafficGeneratorTypes: ['transit_station'],
  },
  // Keyed off the existing 'hair_care' competitor type (see
  // GOOGLE_TYPE_TO_PROFILE_ID below) — businessTypeMapping.js doesn't
  // distinguish a barbershop from a generic unisex hair salon, and
  // changing that would break an already-passing test, so this profile
  // covers both under one name. Known limitation, not hidden.
  barber_shop: {
    complementaryTypes: ['clothing_store'],
    trafficGeneratorTypes: ['shopping_mall'],
  },
  dental_clinic: {
    complementaryTypes: ['pharmacy'],
    trafficGeneratorTypes: ['hospital', 'corporate_office'],
  },
  medical_clinic: {
    complementaryTypes: ['pharmacy'],
    trafficGeneratorTypes: ['hospital', 'corporate_office'],
  },
};

// A profile can be coarser or finer than businessTypeMapping.js's Google-type
// mapping (e.g. "fitness clothing store" and a generic "clothing store" both
// map to the Google competitor type 'clothing_store', but only the former
// has a Commercial Ecosystem profile) — so profile resolution reuses that
// mapping where the granularity matches, and falls back to its own small
// synonym set where it doesn't, instead of maintaining a parallel synonym
// table for every profile.
const GOOGLE_TYPE_TO_PROFILE_ID = {
  gym: 'gym',
  cafe: 'coffee_shop',
  restaurant: 'restaurant',
  pharmacy: 'pharmacy',
  beauty_salon: 'beauty_salon',
  pet_store: 'pet_shop',
  clothing_store: 'clothing_store',
  bakery: 'bakery',
  bar: 'bar',
  supermarket: 'supermarket',
  convenience_store: 'convenience_store',
  hair_care: 'barber_shop',
  dental_clinic: 'dental_clinic',
  medical_clinic: 'medical_clinic',
};

const FITNESS_CLOTHING_STORE_SYNONYMS = new Set([
  'fitness clothing store',
  'fitness apparel store',
  'activewear store',
  'roupas fitness',
  'loja de roupas fitness',
  'moda fitness',
]);

function resolveBusinessProfile(businessType) {
  const googleType = mapBusinessTypeToGoogleType(businessType);
  const profileIdFromGoogleType = googleType && GOOGLE_TYPE_TO_PROFILE_ID[googleType];
  if (profileIdFromGoogleType) {
    return { id: profileIdFromGoogleType, ...BUSINESS_PROFILES[profileIdFromGoogleType] };
  }

  const normalized = normalize(businessType);
  if (FITNESS_CLOTHING_STORE_SYNONYMS.has(normalized)) {
    return { id: 'fitness_clothing_store', ...BUSINESS_PROFILES.fitness_clothing_store };
  }

  return null;
}

module.exports = { BUSINESS_PROFILES, resolveBusinessProfile };
