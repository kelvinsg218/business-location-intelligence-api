'use strict';

// FNV-1a 32-bit hash: deterministic, fast, good-enough distribution for
// generating mock data. Not cryptographic, not for anything security-related.
function hashStringToInt(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// mulberry32: small, fast, deterministic PRNG. Same seed -> same sequence, always.
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic RNG derived from any string seed.
function createSeededRandom(seedText) {
  return mulberry32(hashStringToInt(seedText));
}

module.exports = { hashStringToInt, mulberry32, createSeededRandom };
