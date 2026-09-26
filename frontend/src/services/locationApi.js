import { apiRequest } from '../api/apiClient.js';

// Kept as re-exports: the analysis code and its tests have always imported these
// from here. The implementation now lives in the shared API client.
export { API_BASE_URL, ApiRequestError } from '../api/apiClient.js';

// Collects parameters, calls the existing /locations/analyze endpoint and
// returns its `data` payload as-is. No analysis logic (grid, score, density,
// ...) is duplicated here — that all stays server-side. The call needs a
// session: the shared client sends the cookie, and a 401 reaches the auth
// layer, which returns the user to the login screen.
export function analyzeLocation({
  location, businessType, radiusKm, keywords,
}) {
  return apiRequest('/api/v1/locations/analyze', {
    query: {
      location, businessType, radius: radiusKm, keywords,
    },
  });
}
