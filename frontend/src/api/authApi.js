import { apiRequest } from './apiClient.js';

const AUTH = '/api/v1/auth';

// Each call returns the public user ({ id, name, email, createdAt }) or nothing.
// The password is sent once, in the request body, and is never kept by the app.

export async function register({ name, email, password }) {
  const data = await apiRequest(`${AUTH}/register`, { method: 'POST', body: { name, email, password } });
  return data.user;
}

export async function login({ email, password }) {
  const data = await apiRequest(`${AUTH}/login`, { method: 'POST', body: { email, password } });
  return data.user;
}

export async function logout() {
  await apiRequest(`${AUTH}/logout`, { method: 'POST' });
}

// Asks the server who the session belongs to. A 401 here is the normal answer
// for a visitor who is not signed in, not "a session that ended", so it must
// not raise the app-wide session-expired signal.
export async function fetchCurrentUser({ signal } = {}) {
  const data = await apiRequest(`${AUTH}/me`, { signal, notifyUnauthorized: false });
  return data.user;
}
