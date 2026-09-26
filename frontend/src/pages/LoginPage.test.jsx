import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import LoginPage from './LoginPage.jsx';
import { AuthContext } from '../auth/AuthContext.js';
import { ApiRequestError } from '../api/apiClient.js';

// The page in isolation: the auth layer is replaced by a stub, so this file is
// only about what the form does. (The real provider is exercised in App.test.jsx.)
function renderLogin({ login = vi.fn().mockResolvedValue({}), sessionExpired = false } = {}) {
  render(
    <MemoryRouter>
      <AuthContext.Provider value={{ login, sessionExpired }}>
        <LoginPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  return { login };
}

const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

describe('LoginPage', () => {
  it('has e-mail and password fields, no username', () => {
    renderLogin();

    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
    expect(screen.queryByLabelText('Usuário')).not.toBeInTheDocument();
  });

  it('gives the browser what a password manager needs (autocomplete hints)', () => {
    renderLogin();

    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('submits the trimmed e-mail and the password exactly as typed', async () => {
    const { login } = renderLogin();

    fill('E-mail', '  maria@example.com  ');
    fill('Senha', '  senha com espaços  ');
    submit();

    await vi.waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    expect(login).toHaveBeenCalledWith({ email: 'maria@example.com', password: '  senha com espaços  ' });
  });

  it('does not call login when a field is empty, and says which one', async () => {
    const { login } = renderLogin();

    submit();

    expect(await screen.findByText('Informe seu e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_CREDENTIALS', 401, 'E-mail ou senha incorretos.'],
    ['RATE_LIMITED', 429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'],
    ['DATABASE_UNAVAILABLE', 503, 'O serviço está temporariamente indisponível. Tente novamente em instantes.'],
    ['NETWORK_ERROR', 0, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'],
    ['SOMETHING_NEW', 500, 'Ocorreu um erro inesperado. Tente novamente.'],
  ])('shows a Portuguese message for %s and never the raw code or server text', async (code, status, expected) => {
    const login = vi.fn().mockRejectedValue(new ApiRequestError(status, code, 'raw server text with internals'));
    renderLogin({ login });

    fill('E-mail', 'maria@example.com');
    fill('Senha', 'alguma-senha-longa');
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
    expect(document.body.textContent).not.toContain('raw server text');
    expect(document.body.textContent).not.toContain(code);
  });

  it('clears the password after a failed attempt but keeps the e-mail', async () => {
    const login = vi.fn().mockRejectedValue(new ApiRequestError(401, 'INVALID_CREDENTIALS', 'x'));
    renderLogin({ login });

    fill('E-mail', 'maria@example.com');
    fill('Senha', 'errada-errada-1');
    submit();

    await screen.findByRole('alert');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(screen.getByLabelText('E-mail')).toHaveValue('maria@example.com');
  });

  it('shows the "session expired" notice only when the auth layer says so', () => {
    const { unmount } = render(
      <MemoryRouter>
        <AuthContext.Provider value={{ login: vi.fn(), sessionExpired: true }}>
          <LoginPage />
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Sua sessão expirou. Entre novamente para continuar.');
    unmount();

    renderLogin({ sessionExpired: false });
    expect(screen.queryByText(/sessão expirou/i)).not.toBeInTheDocument();
  });

  it('never writes anything to web storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { login } = renderLogin();

    fill('E-mail', 'maria@example.com');
    fill('Senha', 'alguma-senha-longa');
    submit();
    await vi.waitFor(() => expect(login).toHaveBeenCalled());

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
