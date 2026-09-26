'use strict';

const crypto = require('crypto');
const argon2 = require('argon2');
const { isCommonPassword, compact } = require('./commonPasswords');

// Policy (no composition rules; length is what matters, per NIST SP 800-63B).
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

// Argon2id at OWASP's minimum recommended configuration (19 MiB, 2 iterations,
// 1 lane). The parameters live inside every stored PHC string, so they can be
// raised later without a migration: needsRehash() flags old hashes and login
// upgrades them transparently.
const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

// Passwords are compared and hashed in Unicode NFC, so the same visible password
// typed on different systems (composed vs decomposed accents) always matches.
function normalizePassword(password) {
  return password.normalize('NFC');
}

// Length is measured in Unicode code points, not UTF-16 units: an emoji is one character.
function passwordLength(password) {
  return [...password].length;
}

// Tokens taken from the account itself that must not BE the password.
function personalTokens({ email, name }) {
  const tokens = [];
  if (email) {
    const address = compact(email);
    const local = compact(String(email).split('@')[0]);
    if (address.length >= 4) tokens.push(address);
    if (local.length >= 4) tokens.push(local);
  }
  if (name) {
    const fullName = compact(name);
    if (fullName.length >= 4) tokens.push(fullName);
  }
  return tokens;
}

function containsPersonalInfo(password, account) {
  const compacted = compact(password);
  const lettersOnly = compacted.replace(/[0-9]/g, '');
  return personalTokens(account).some((token) => compacted === token || lettersOnly === token);
}

/**
 * Checks a candidate password against the policy.
 * @returns {{ code: string, message: string }[]} empty when acceptable.
 */
function validatePasswordPolicy(password, account = {}) {
  const normalized = normalizePassword(password);
  const length = passwordLength(normalized);

  if (length < PASSWORD_MIN_LENGTH) {
    return [{ code: 'PASSWORD_TOO_SHORT', message: `The password must have at least ${PASSWORD_MIN_LENGTH} characters.` }];
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return [{ code: 'PASSWORD_TOO_LONG', message: `The password must have at most ${PASSWORD_MAX_LENGTH} characters.` }];
  }

  const issues = [];
  if (containsPersonalInfo(normalized, account)) {
    issues.push({ code: 'PASSWORD_CONTAINS_PERSONAL_INFO', message: 'The password must not be your name or e-mail.' });
  } else if (isCommonPassword(normalized)) {
    issues.push({ code: 'PASSWORD_TOO_COMMON', message: 'This password is too common or predictable.' });
  }
  return issues;
}

function createPasswordService({ options = ARGON2_OPTIONS } = {}) {
  let dummyHash;

  // A real hash of a random value, computed once. Used to spend the same time
  // verifying when the account does not exist, so login timing does not reveal
  // which e-mails are registered.
  async function getDummyHash() {
    dummyHash = dummyHash || argon2.hash(crypto.randomBytes(16).toString('hex'), options);
    return dummyHash;
  }

  return {
    options,
    normalize: normalizePassword,
    validatePolicy: validatePasswordPolicy,

    hash(password) {
      return argon2.hash(normalizePassword(password), options);
    },

    // false (never throws) for a wrong password AND for a malformed stored hash.
    async verify(hash, password) {
      try {
        return await argon2.verify(hash, normalizePassword(password));
      } catch {
        return false;
      }
    },

    needsRehash(hash) {
      return argon2.needsRehash(hash, options);
    },

    async verifyAgainstDummy(password) {
      try {
        await argon2.verify(await getDummyHash(), normalizePassword(password));
      } catch {
        // the outcome is irrelevant: only the time spent matters
      }
    },
  };
}

module.exports = {
  ARGON2_OPTIONS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  createPasswordService,
  normalizePassword,
  passwordLength,
  validatePasswordPolicy,
};
