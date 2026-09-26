'use strict';

const { ApiError } = require('../../utils/ApiError');
const { EmailAlreadyRegisteredError } = require('../users/users.repository');
const { PASSWORD_MAX_LENGTH, passwordLength } = require('./password');
const { EMAIL_MAX_LENGTH, validateRegisterBody } = require('./auth.schemas');

/**
 * Account rules, independent of HTTP: no req/res in here.
 *
 * @param {object} deps
 * @param {object} deps.users            users repository
 * @param {object} deps.passwords        password service (Argon2id)
 * @param {boolean} deps.registrationEnabled
 * @param {object} [deps.logger]
 */
function createAuthService({
  users, passwords, registrationEnabled, logger,
}) {
  return {
    /**
     * @throws {ApiError} 403 REGISTRATION_DISABLED, 400 VALIDATION_ERROR, 409 EMAIL_ALREADY_REGISTERED
     * @returns the public user
     */
    async register(body) {
      if (!registrationEnabled) {
        throw new ApiError(403, 'REGISTRATION_DISABLED', 'Registration is currently closed.');
      }

      const validation = validateRegisterBody(body);
      if (!validation.success) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', validation.details);
      }
      const { name, email, password } = validation.data;

      // Hash first, then insert: the duplicate-account path costs the same time
      // as a successful sign-up. (Duplicates are reported as 409 by design.)
      const passwordHash = await passwords.hash(password);

      try {
        return await users.create({ email, name, passwordHash });
      } catch (err) {
        if (err instanceof EmailAlreadyRegisteredError) {
          throw new ApiError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this e-mail already exists.');
        }
        throw err;
      }
    },

    /**
     * @returns the public user, or null when the credentials are wrong. It
     * returns null for an unknown e-mail and for a wrong password alike, after
     * spending the same hashing time in both cases.
     */
    async authenticate({ email, password }) {
      // Inputs the sign-up would never have accepted can not match any account:
      // answer "wrong credentials" without touching the database or the hash.
      const impossible = email.length > EMAIL_MAX_LENGTH || passwordLength(password) > PASSWORD_MAX_LENGTH;
      if (impossible) {
        await passwords.verifyAgainstDummy(password.slice(0, PASSWORD_MAX_LENGTH));
        return null;
      }

      const record = await users.findAuthRecordByEmail(email);
      if (!record) {
        await passwords.verifyAgainstDummy(password);
        return null;
      }

      const { passwordHash, ...user } = record;
      if (!(await passwords.verify(passwordHash, password))) return null;

      // The hash parameters may have been raised since this hash was made.
      if (passwords.needsRehash(passwordHash)) {
        try {
          await users.updatePasswordHash(user.id, await passwords.hash(password));
        } catch (err) {
          // The login itself is fine; the upgrade is retried on the next one.
          if (logger) logger.warn({ err, userId: user.id }, 'could not upgrade the password hash');
        }
      }

      return user;
    },

    getPublicUser(id) {
      return users.findById(id);
    },
  };
}

module.exports = { createAuthService };
