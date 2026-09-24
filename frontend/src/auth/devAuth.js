// TEMPORARY DEV-ONLY AUTH — NOT PRODUCTION SECURITY.
//
// This exists only to give the app a real entry flow for local testing and
// demos before the actual multi-user architecture (accounts, sessions,
// real authentication) is built. It is entirely client-side: the backend
// API is not protected by this and never was — logging in here changes
// nothing about what the API accepts. Replace this whole module wholesale
// when real authentication is introduced; nothing else in the app should
// need to change beyond how `isAuthenticated`/`attemptLogin`/`logout` are
// implemented.

const SESSION_KEY = 'bli_dev_authenticated';

// Local dev credentials only. Never sent over the network, never logged.
const DEV_USERNAME = 'root';
const DEV_PASSWORD = '1';

export function attemptLogin(username, password) {
  const ok = username === DEV_USERNAME && password === DEV_PASSWORD;
  if (ok) {
    try {
      sessionStorage.setItem(SESSION_KEY, 'true');
    } catch {
      // sessionStorage can be unavailable (e.g. some private-browsing
      // modes); the login still succeeds for the current in-memory state.
    }
  }
  return ok;
}

export function isAuthenticated() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function logout() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // no-op
  }
}
