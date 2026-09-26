'use strict';

// The one place e-mails are normalized. The database enforces the same rule with
// a CHECK (email = lower(btrim(email))), so a caller that forgets to normalize
// gets an error instead of a silent duplicate account.
function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

module.exports = { normalizeEmail };
