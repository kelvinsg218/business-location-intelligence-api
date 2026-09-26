// Turns the API's stable error codes into Portuguese messages for the auth forms.
// Raw codes, server messages and internals are never shown to the user.

const FIELD_MESSAGES = {
  NAME_REQUIRED: 'Informe seu nome.',
  NAME_TOO_LONG: 'O nome deve ter no máximo 100 caracteres.',
  NAME_INVALID: 'O nome contém caracteres inválidos.',
  EMAIL_REQUIRED: 'Informe seu e-mail.',
  EMAIL_INVALID: 'Informe um e-mail válido.',
  EMAIL_TOO_LONG: 'O e-mail deve ter no máximo 254 caracteres.',
  PASSWORD_REQUIRED: 'Informe sua senha.',
  PASSWORD_TOO_SHORT: 'A senha deve ter pelo menos 12 caracteres.',
  PASSWORD_TOO_LONG: 'A senha deve ter no máximo 128 caracteres.',
  PASSWORD_TOO_COMMON: 'Essa senha é muito comum ou previsível. Escolha outra.',
  PASSWORD_CONTAINS_PERSONAL_INFO: 'A senha não pode ser igual ao seu nome ou e-mail.',
};

const FORM_MESSAGES = {
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  EMAIL_ALREADY_REGISTERED: 'Já existe uma conta com este e-mail. Tente entrar.',
  REGISTRATION_DISABLED: 'O cadastro de novas contas está temporariamente fechado.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  DATABASE_UNAVAILABLE: 'O serviço está temporariamente indisponível. Tente novamente em instantes.',
  NETWORK_ERROR: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
  FORBIDDEN_ORIGIN: 'Não foi possível concluir a solicitação a partir deste endereço.',
  VALIDATION_ERROR: 'Verifique os dados informados e tente novamente.',
};

const DEFAULT_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

export const MESSAGES = { ...FIELD_MESSAGES, ...FORM_MESSAGES };

// One sentence for the form as a whole.
export function authErrorMessage(error) {
  if (!error) return DEFAULT_MESSAGE;
  if (FORM_MESSAGES[error.code]) return FORM_MESSAGES[error.code];
  if (error.status === 503) return FORM_MESSAGES.DATABASE_UNAVAILABLE;
  if (error.status === 429) return FORM_MESSAGES.RATE_LIMITED;
  return DEFAULT_MESSAGE;
}

// Per-field messages from a VALIDATION_ERROR: { name?, email?, password? }.
// Only the first problem of each field is kept.
export function fieldErrorsFrom(error) {
  const fields = {};
  if (!error || error.code !== 'VALIDATION_ERROR' || !Array.isArray(error.details)) return fields;
  error.details.forEach(({ field, code }) => {
    if (field && !fields[field]) fields[field] = FIELD_MESSAGES[code] || FORM_MESSAGES.VALIDATION_ERROR;
  });
  return fields;
}

// Client-side checks that mirror the server's rules, so obvious mistakes are
// caught before a request is made. The server stays the authority.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentialsFields({ name, email, password }, { requireName = false, checkPasswordLength = false } = {}) {
  const errors = {};
  if (requireName) {
    if (!name || name.trim() === '') errors.name = FIELD_MESSAGES.NAME_REQUIRED;
    else if ([...name.trim()].length > 100) errors.name = FIELD_MESSAGES.NAME_TOO_LONG;
  }
  if (!email || email.trim() === '') errors.email = FIELD_MESSAGES.EMAIL_REQUIRED;
  else if (!EMAIL_SHAPE.test(email.trim())) errors.email = FIELD_MESSAGES.EMAIL_INVALID;

  if (!password) errors.password = FIELD_MESSAGES.PASSWORD_REQUIRED;
  else if (checkPasswordLength) {
    const length = [...password.normalize('NFC')].length;
    if (length < 12) errors.password = FIELD_MESSAGES.PASSWORD_TOO_SHORT;
    else if (length > 128) errors.password = FIELD_MESSAGES.PASSWORD_TOO_LONG;
  }
  return errors;
}
