'use strict';

const { z } = require('zod');
const { normalizeEmail } = require('../users/email');
const { validatePasswordPolicy } = require('./password');

const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;

// Deliberately not a per-field message soup: every problem is `{ field, code, message }`.
// The `code` is stable and machine-readable (the front end maps it to a pt-BR
// message); the `message` is a fallback for API consumers.
const emailFormat = z.email();

function issue(field, code, message) {
  return { field, code, message };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const bodyRequired = () => [issue('body', 'BODY_REQUIRED', 'A JSON object body is required.')];

function checkName(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return { issues: [issue('name', 'NAME_REQUIRED', 'The name is required.')] };
  }
  const name = value.trim();
  if ([...name].length > NAME_MAX_LENGTH) {
    return { issues: [issue('name', 'NAME_TOO_LONG', `The name must have at most ${NAME_MAX_LENGTH} characters.`)] };
  }
  // Control characters (newlines, NULs, ...) have no business in a display name.
  if (/\p{Cc}/u.test(name)) {
    return { issues: [issue('name', 'NAME_INVALID', 'The name contains invalid characters.')] };
  }
  return { value: name, issues: [] };
}

function checkEmail(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return { issues: [issue('email', 'EMAIL_REQUIRED', 'The e-mail is required.')] };
  }
  const email = normalizeEmail(value);
  if (email.length > EMAIL_MAX_LENGTH) {
    return { issues: [issue('email', 'EMAIL_TOO_LONG', `The e-mail must have at most ${EMAIL_MAX_LENGTH} characters.`)] };
  }
  if (!emailFormat.safeParse(email).success) {
    return { issues: [issue('email', 'EMAIL_INVALID', 'The e-mail is not valid.')] };
  }
  return { value: email, issues: [] };
}

function checkPasswordPresent(value) {
  if (typeof value !== 'string' || value === '') {
    return [issue('password', 'PASSWORD_REQUIRED', 'The password is required.')];
  }
  return [];
}

/**
 * Sign-up body. Reports every problem at once (name, e-mail and password policy),
 * so the form can show them together.
 */
function validateRegisterBody(body) {
  if (!isPlainObject(body)) return { success: false, details: bodyRequired() };

  const name = checkName(body.name);
  const email = checkEmail(body.email);
  const passwordIssues = checkPasswordPresent(body.password);

  const details = [...name.issues, ...email.issues, ...passwordIssues];

  if (passwordIssues.length === 0) {
    // The policy can compare the password with the account's own name/e-mail.
    validatePasswordPolicy(body.password, { email: email.value, name: name.value })
      .forEach((found) => details.push(issue('password', found.code, found.message)));
  }

  if (details.length > 0) return { success: false, details };
  return {
    success: true,
    data: { name: name.value, email: email.value, password: body.password },
  };
}

/**
 * Login body. Only presence and type are checked here: how a wrong e-mail or a
 * wrong password looks is decided by the service, and it must be identical for
 * both (no format rules leak which addresses could exist).
 */
function validateLoginBody(body) {
  if (!isPlainObject(body)) return { success: false, details: bodyRequired() };

  const details = [];
  if (typeof body.email !== 'string' || body.email.trim() === '') {
    details.push(issue('email', 'EMAIL_REQUIRED', 'The e-mail is required.'));
  }
  details.push(...checkPasswordPresent(body.password));

  if (details.length > 0) return { success: false, details };
  return { success: true, data: { email: normalizeEmail(body.email), password: body.password } };
}

module.exports = {
  validateRegisterBody, validateLoginBody, NAME_MAX_LENGTH, EMAIL_MAX_LENGTH,
};
