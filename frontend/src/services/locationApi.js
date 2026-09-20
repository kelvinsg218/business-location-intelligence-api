export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Thin wrapper over the backend's { success:false, error:{code,message,details} }
// shape, plus a NETWORK_ERROR case for when the API can't be reached at all.
export class ApiRequestError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildAnalyzeUrl({
  location, businessType, radiusKm, keywords,
}) {
  const params = new URLSearchParams({
    location,
    businessType,
    radius: String(radiusKm),
  });
  if (keywords) params.set('keywords', keywords);
  return `${API_BASE_URL}/api/v1/locations/analyze?${params.toString()}`;
}

// Collects parameters, calls the existing /locations/analyze endpoint and
// returns its `data` payload as-is. No analysis logic (grid, score, density,
// ...) is duplicated here — that all stays server-side.
export async function analyzeLocation(params) {
  let response;
  try {
    response = await fetch(buildAnalyzeUrl(params));
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Não foi possível conectar ao servidor de análise.');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiRequestError(response.status, 'UNEXPECTED_RESPONSE', 'Resposta inesperada do servidor.');
  }

  if (!response.ok || !body.success) {
    const { code, message, details } = body.error || {};
    throw new ApiRequestError(
      response.status,
      code || 'UNKNOWN_ERROR',
      message || 'Ocorreu um erro inesperado.',
      details || [],
    );
  }

  return body.data;
}
