import { describe, it, expect } from 'vitest';
import {
  authErrorMessage, fieldErrorsFrom, validateCredentialsFields, MESSAGES,
} from './authMessages.js';
import { ApiRequestError } from '../api/apiClient.js';
import { afterLoginPath } from './redirect.js';

const error = (status, code, details) => new ApiRequestError(status, code, 'raw', details);

describe('authErrorMessage', () => {
  it.each([
    [error(401, 'INVALID_CREDENTIALS'), 'E-mail ou senha incorretos.'],
    [error(409, 'EMAIL_ALREADY_REGISTERED'), 'Já existe uma conta com este e-mail. Tente entrar.'],
    [error(403, 'REGISTRATION_DISABLED'), 'O cadastro de novas contas está temporariamente fechado.'],
    [error(0, 'NETWORK_ERROR'), 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'],
  ])('%#: maps a known code to Portuguese', (input, expected) => {
    expect(authErrorMessage(input)).toBe(expected);
  });

  it('falls back on the HTTP status for codes it does not know', () => {
    expect(authErrorMessage(error(429, 'SOMETHING'))).toBe(MESSAGES.RATE_LIMITED);
    expect(authErrorMessage(error(503, 'SOMETHING'))).toBe(MESSAGES.DATABASE_UNAVAILABLE);
    expect(authErrorMessage(error(500, 'SOMETHING'))).toBe('Ocorreu um erro inesperado. Tente novamente.');
    expect(authErrorMessage(undefined)).toBe('Ocorreu um erro inesperado. Tente novamente.');
  });

  it('every message is Portuguese: no raw code names, no English sentences', () => {
    Object.values(MESSAGES).forEach((message) => {
      expect(message).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
      expect(message).not.toMatch(/\b(invalid|required|error|failed)\b/i);
    });
  });
});

describe('fieldErrorsFrom', () => {
  it('keeps the first problem of each field', () => {
    const fields = fieldErrorsFrom(error(400, 'VALIDATION_ERROR', [
      { field: 'password', code: 'PASSWORD_TOO_SHORT' },
      { field: 'password', code: 'PASSWORD_TOO_COMMON' },
      { field: 'email', code: 'EMAIL_INVALID' },
    ]));

    expect(fields).toEqual({
      password: 'A senha deve ter pelo menos 12 caracteres.',
      email: 'Informe um e-mail válido.',
    });
  });

  it('returns nothing for other errors or malformed details', () => {
    expect(fieldErrorsFrom(error(401, 'INVALID_CREDENTIALS'))).toEqual({});
    expect(fieldErrorsFrom(error(400, 'VALIDATION_ERROR', 'not-an-array'))).toEqual({});
    expect(fieldErrorsFrom(undefined)).toEqual({});
  });
});

describe('validateCredentialsFields', () => {
  it('login: only presence and e-mail shape are checked, never the password length', () => {
    expect(validateCredentialsFields({ email: 'a@b.co', password: 'x' })).toEqual({});
    expect(validateCredentialsFields({ email: '', password: '' })).toEqual({
      email: 'Informe seu e-mail.', password: 'Informe sua senha.',
    });
  });

  it('register: also checks the name and the 12..128 password length (NFC, in characters)', () => {
    const options = { requireName: true, checkPasswordLength: true };
    expect(validateCredentialsFields({ name: 'Ana', email: 'a@b.co', password: 'x'.repeat(12) }, options)).toEqual({});
    expect(validateCredentialsFields({ name: 'Ana', email: 'a@b.co', password: 'x'.repeat(11) }, options).password).toMatch(/12/);
    expect(validateCredentialsFields({ name: 'Ana', email: 'a@b.co', password: 'x'.repeat(129) }, options).password).toMatch(/128/);
    // "é" typed as e + combining accent is still one character after NFC
    expect(validateCredentialsFields({ name: 'Ana', email: 'a@b.co', password: 'é'.repeat(12) }, options)).toEqual({});
  });
});

describe('afterLoginPath', () => {
  const at = (pathname, extra = {}) => ({ state: { from: { pathname, ...extra } } });

  it('goes back to the protected page that was requested, with its query and hash', () => {
    expect(afterLoginPath(at('/app/plans'))).toBe('/app/plans');
    expect(afterLoginPath(at('/app', { search: '?a=1', hash: '#x' }))).toBe('/app?a=1#x');
  });

  it.each([
    ['nothing', undefined],
    ['no state', {}],
    ['a foreign path', at('/somewhere-else')],
    ['a look-alike prefix', at('/application')],
    ['an absolute URL smuggled in', at('https://evil.example/app')],
    ['a protocol-relative URL', at('//evil.example/app')],
    ['a non-string path', { state: { from: { pathname: 42 } } }],
  ])('falls back to /app for %s', (_label, location) => {
    expect(afterLoginPath(location)).toBe('/app');
  });
});
