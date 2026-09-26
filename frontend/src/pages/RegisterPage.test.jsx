import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import RegisterPage from './RegisterPage.jsx';
import { AuthContext } from '../auth/AuthContext.js';
import { ApiRequestError } from '../api/apiClient.js';

function renderRegister({ register = vi.fn().mockResolvedValue({}) } = {}) {
  render(
    <MemoryRouter>
      <AuthContext.Provider value={{ register }}>
        <RegisterPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  return { register };
}

const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: /criar conta/i }));
const fillValid = () => {
  fill('Nome', '  Ana Lima ');
  fill('E-mail', ' ana@example.com ');
  fill('Senha', 'uma frase bem longa 2026');
};

describe('RegisterPage', () => {
  it('has name, e-mail and password, with new-password hints and the 12-character guidance', () => {
    renderRegister();

    expect(screen.getByLabelText('Nome')).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText(/No mínimo 12 caracteres/)).toBeInTheDocument();
  });

  it('submits trimmed name and e-mail, and the password untouched', async () => {
    const { register } = renderRegister();

    fillValid();
    submit();

    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(register).toHaveBeenCalledWith({ name: 'Ana Lima', email: 'ana@example.com', password: 'uma frase bem longa 2026' });
  });

  it.each([
    ['a blank name', { name: '   ' }, 'Informe seu nome.'],
    ['a name over 100 characters', { name: 'n'.repeat(101) }, 'O nome deve ter no máximo 100 caracteres.'],
    ['an invalid e-mail', { email: 'ana@' }, 'Informe um e-mail válido.'],
    ['a short password', { password: 'onze-chars-' }, 'A senha deve ter pelo menos 12 caracteres.'],
    ['a password over 128 characters', { password: 'x'.repeat(129) }, 'A senha deve ter no máximo 128 caracteres.'],
  ])('rejects %s before calling the server', async (_label, override, message) => {
    const { register } = renderRegister();
    fillValid();
    if (override.name !== undefined) fill('Nome', override.name);
    if (override.email !== undefined) fill('E-mail', override.email);
    if (override.password !== undefined) fill('Senha', override.password);

    submit();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('counts the password in characters, not UTF-16 units (an emoji is one)', async () => {
    const { register } = renderRegister();
    fillValid();
    fill('Senha', '🙂'.repeat(12)); // 12 characters, 24 UTF-16 units

    submit();

    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));
  });

  it('maps server field problems onto the fields, in Portuguese', async () => {
    const register = vi.fn().mockRejectedValue(new ApiRequestError(400, 'VALIDATION_ERROR', 'raw', [
      { field: 'password', code: 'PASSWORD_TOO_COMMON', message: 'raw english' },
      { field: 'email', code: 'EMAIL_INVALID', message: 'raw english' },
      { field: 'name', code: 'SOME_FUTURE_CODE', message: 'raw english' },
    ]));
    renderRegister({ register });
    fillValid();

    submit();

    expect(await screen.findByText('Essa senha é muito comum ou previsível. Escolha outra.')).toBeInTheDocument();
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('Verifique os dados informados e tente novamente.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('raw english');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    ['EMAIL_ALREADY_REGISTERED', 409, 'Já existe uma conta com este e-mail. Tente entrar.'],
    ['REGISTRATION_DISABLED', 403, 'O cadastro de novas contas está temporariamente fechado.'],
    ['RATE_LIMITED', 429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'],
    ['DATABASE_UNAVAILABLE', 503, 'O serviço está temporariamente indisponível. Tente novamente em instantes.'],
  ])('shows a form-level Portuguese message for %s', async (code, status, expected) => {
    const register = vi.fn().mockRejectedValue(new ApiRequestError(status, code, 'raw'));
    renderRegister({ register });
    fillValid();

    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
  });

  it('keeps what was typed after an error, so nothing has to be retyped (except by choice)', async () => {
    const register = vi.fn().mockRejectedValue(new ApiRequestError(409, 'EMAIL_ALREADY_REGISTERED', 'raw'));
    renderRegister({ register });
    fillValid();

    submit();
    await screen.findByRole('alert');

    expect(screen.getByLabelText('Nome')).toHaveValue('  Ana Lima ');
    // (an <input type="email"> trims surrounding spaces by itself)
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@example.com');
    expect(screen.getByLabelText('Senha')).toHaveValue('uma frase bem longa 2026');
  });
});
