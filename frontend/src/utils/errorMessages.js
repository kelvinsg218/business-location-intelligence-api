const MESSAGES_BY_CODE = {
  VALIDATION_ERROR: 'Verifique os parâmetros informados no formulário.',
  LOCATION_NOT_FOUND: 'Não foi possível localizar a região informada.',
  RATE_LIMITED: 'Limite de consultas atingido. Tente novamente em alguns instantes.',
  NETWORK_ERROR: 'Não foi possível conectar ao servidor. Verifique se a API está em execução.',
};

const MESSAGES_BY_STATUS = {
  404: 'Não foi possível localizar a região informada.',
  429: 'Limite de consultas atingido. Tente novamente em alguns instantes.',
  503: 'O serviço de análise está temporariamente indisponível.',
  504: 'A análise demorou demais para responder. Tente novamente.',
};

const DEFAULT_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

// Maps an ApiRequestError to a single friendly, non-technical sentence for
// display — never surfaces raw codes, stack traces or internal details.
export function friendlyErrorMessage(error) {
  if (!error) return DEFAULT_MESSAGE;
  return MESSAGES_BY_CODE[error.code] || MESSAGES_BY_STATUS[error.status] || DEFAULT_MESSAGE;
}
