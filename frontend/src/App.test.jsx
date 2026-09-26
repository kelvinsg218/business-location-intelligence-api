import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import {
  screen, fireEvent, within, waitFor,
} from '@testing-library/react';
import { renderApp } from './test/renderApp.jsx';
import { TEST_PASSWORD, TEST_USER } from './test/fakeApi.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const heading = (name) => screen.findByRole('heading', { name });

function fill(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function signIn({ email = TEST_USER.email, password = TEST_PASSWORD } = {}) {
  fill('E-mail', email);
  fill('Senha', password);
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
}

describe('initial session check', () => {
  it('shows a loading state while the server is asked who is signed in, and nothing of the app yet', async () => {
    const { path } = renderApp({ route: '/app', hangSessionCheck: true });

    expect(await screen.findByText('Verificando sua sessão…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nova Análise' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
    expect(path()).toBe('/app'); // not bounced to /login before the answer is known
  });

  it('recovers an existing session on load: asks GET /auth/me with the cookie and enters the app', async () => {
    const { callsTo } = renderApp({ route: '/app', signedIn: true });

    expect(await heading('Nova Análise')).toBeInTheDocument();
    const [[url, init]] = callsTo('GET', '/api/v1/auth/me');
    expect(url).toBe('/api/v1/auth/me');
    expect(init.credentials).toBe('include');
  });

  it('a page reload keeps the session (the state is rebuilt from the server, not from storage)', async () => {
    const first = renderApp({ route: '/app', signedIn: true });
    await heading('Nova Análise');
    first.unmount();

    // A brand-new render = a reload; the (fake) server-side session is what survives.
    const again = renderApp({ route: '/app', signedIn: true });
    expect(await heading('Nova Análise')).toBeInTheDocument();
    expect(again.path()).toBe('/app');
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('without a session, /app redirects to /login', async () => {
    const { path } = renderApp({ route: '/app' });

    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(screen.queryByRole('heading', { name: 'Nova Análise' })).not.toBeInTheDocument();
  });

  it('a visitor whose session expired (server says 401) is treated as signed out, not as an error', async () => {
    const { path } = renderApp({ route: '/app/plans' });

    await screen.findByLabelText('Senha');
    expect(path()).toBe('/login');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/sessão expirou/i)).not.toBeInTheDocument();
  });

  it('when the server cannot be reached to check, says so and offers a retry that works once it is back', async () => {
    const { state } = renderApp({ route: '/app', down: true });

    expect(await screen.findByText(/Não foi possível verificar sua sessão/)).toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument(); // not mistaken for "signed out"
    state.down = false;
    state.session = { ...TEST_USER };
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await heading('Nova Análise')).toBeInTheDocument();
  });

  it('a server error (503) while checking is "unavailable", not "signed out"', async () => {
    renderApp({ route: '/app', sessionCheckStatus: 503 });

    expect(await screen.findByText(/Não foi possível verificar sua sessão/)).toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});

describe('routes', () => {
  it('"/" goes to /app for a signed-in visitor', async () => {
    const { path } = renderApp({ route: '/', signedIn: true });

    expect(await heading('Nova Análise')).toBeInTheDocument();
    expect(path()).toBe('/app');
  });

  it('"/" goes to /login for a visitor without a session (via /app)', async () => {
    const { path } = renderApp({ route: '/' });

    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument();
    expect(path()).toBe('/login');
  });

  it('an unknown path falls back to /app', async () => {
    const { path } = renderApp({ route: '/nada/aqui', signedIn: true });

    expect(await heading('Nova Análise')).toBeInTheDocument();
    expect(path()).toBe('/app');
  });

  it.each(['/login', '/register'])('%s is closed to a signed-in visitor: it redirects to /app', async (route) => {
    const { path } = renderApp({ route, signedIn: true });

    expect(await heading('Nova Análise')).toBeInTheDocument();
    expect(path()).toBe('/app');
  });

  it('/login and /register are open to a visitor without a session', async () => {
    const login = renderApp({ route: '/login' });
    expect(await screen.findByRole('button', { name: /entrar/i })).toBeInTheDocument();
    expect(login.path()).toBe('/login');
    login.unmount();

    const register = renderApp({ route: '/register' });
    expect(await screen.findByRole('button', { name: /criar conta/i })).toBeInTheDocument();
    expect(register.path()).toBe('/register');
  });

  it('/app/plans is protected too', async () => {
    const { path } = renderApp({ route: '/app/plans' });

    await screen.findByLabelText('E-mail');
    expect(path()).toBe('/login');
    expect(screen.queryByRole('heading', { name: 'Planos' })).not.toBeInTheDocument();
  });

  it('the login and register pages link to each other', async () => {
    const { path } = renderApp({ route: '/login' });

    fireEvent.click(await screen.findByRole('link', { name: 'Criar conta' }));
    expect(await screen.findByRole('button', { name: /criar conta/i })).toBeInTheDocument();
    expect(path()).toBe('/register');

    fireEvent.click(screen.getByRole('link', { name: 'Entrar' }));
    expect(await screen.findByRole('button', { name: /entrar/i })).toBeInTheDocument();
    expect(path()).toBe('/login');
  });
});

describe('login', () => {
  it('signs in with e-mail and password, sending them once in the request body with credentials included', async () => {
    const { path, callsTo } = renderApp({ route: '/login' });
    await screen.findByLabelText('E-mail');

    await signIn({ email: `  ${TEST_USER.email.toUpperCase()}  ` });

    expect(await heading('Nova Análise')).toBeInTheDocument();
    expect(path()).toBe('/app');
    const [[url, init]] = callsTo('POST', '/api/v1/auth/login');
    expect(url).toBe('/api/v1/auth/login');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ email: TEST_USER.email.toUpperCase(), password: TEST_PASSWORD });
    expect(screen.getByText(TEST_USER.name)).toBeInTheDocument();
  });

  it('keeps no token, user or flag in localStorage or sessionStorage, before, during or after signing in', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderApp({ route: '/login' });
    await screen.findByLabelText('E-mail');

    await signIn();
    await heading('Nova Análise');

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('shows a Portuguese error and stays on /login for wrong credentials, and clears the password field', async () => {
    const { path } = renderApp({ route: '/login' });
    await screen.findByLabelText('E-mail');

    await signIn({ password: 'senha-errada-123456' });

    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(screen.getByLabelText('E-mail')).toHaveValue(TEST_USER.email);
    expect(screen.queryByRole('heading', { name: 'Nova Análise' })).not.toBeInTheDocument();
  });

  it('does not tell an unknown e-mail from a wrong password', async () => {
    renderApp({ route: '/login' });
    await screen.findByLabelText('E-mail');

    await signIn({ email: 'ninguem@example.com', password: 'qualquer-coisa-12345' });

    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
  });

  it('checks for empty fields first, without calling the server', async () => {
    const { callsTo } = renderApp({ route: '/login' });
    await screen.findByLabelText('E-mail');
    const before = callsTo('POST', '/api/v1/auth/login').length;

    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText('Informe seu e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument();
    expect(callsTo('POST', '/api/v1/auth/login').length).toBe(before);
  });

  it('explains a network failure instead of failing silently', async () => {
    const { state } = renderApp({ route: '/login' });
    await screen.findByLabelText('E-mail');
    state.down = true;

    await signIn();

    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeInTheDocument();
  });

  it('after signing in, returns to the protected page that was originally requested', async () => {
    const { path } = renderApp({ route: '/app/plans' });
    await screen.findByLabelText('E-mail');
    expect(path()).toBe('/login');

    await signIn();

    expect(await heading('Planos')).toBeInTheDocument();
    expect(path()).toBe('/app/plans');
  });

  it('disables the button while the request is running (no double submit)', async () => {
    const { fetchMock } = renderApp({ route: '/login' });
    await screen.findByLabelText('E-mail');
    let release;
    const original = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) => (url === '/api/v1/auth/login'
      ? new Promise((resolve) => { release = () => resolve(original(url, init)); })
      : original(url, init)));

    await signIn();

    const button = await screen.findByRole('button', { name: /entrando/i });
    expect(button).toBeDisabled();
    release();
    expect(await heading('Nova Análise')).toBeInTheDocument();
  });
});

describe('register', () => {
  const fillRegister = ({
    name = 'Ana Lima', email = 'ana@example.com', password = 'uma frase bem longa 2026',
  } = {}) => {
    fill('Nome', name);
    fill('E-mail', email);
    fill('Senha', password);
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }));
  };

  it('creates the account and enters the app signed in as the new user', async () => {
    const { path, callsTo } = renderApp({ route: '/register' });
    await screen.findByLabelText('Nome');

    fillRegister();

    expect(await heading('Nova Análise')).toBeInTheDocument();
    expect(path()).toBe('/app');
    expect(screen.getByText('Ana Lima')).toBeInTheDocument();
    const [[, init]] = callsTo('POST', '/api/v1/auth/register');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ name: 'Ana Lima', email: 'ana@example.com', password: 'uma frase bem longa 2026' });
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('validates before calling the server: name, e-mail shape and the 12-character minimum', async () => {
    const { callsTo } = renderApp({ route: '/register' });
    await screen.findByLabelText('Nome');

    fillRegister({ name: '  ', email: 'sem-arroba', password: 'curta' });

    expect(await screen.findByText('Informe seu nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('A senha deve ter pelo menos 12 caracteres.')).toBeInTheDocument();
    expect(callsTo('POST', '/api/v1/auth/register')).toHaveLength(0);
  });

  it('shows the server\'s per-field problem in Portuguese under the field', async () => {
    renderApp({ route: '/register' });
    await screen.findByLabelText('Nome');

    fillRegister({ password: 'password1234' });

    expect(await screen.findByText('Essa senha é muito comum ou previsível. Escolha outra.')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true');
  });

  it('says clearly that the e-mail is already registered', async () => {
    renderApp({ route: '/register' });
    await screen.findByLabelText('Nome');

    fillRegister({ email: TEST_USER.email });

    expect(await screen.findByText('Já existe uma conta com este e-mail. Tente entrar.')).toBeInTheDocument();
  });

  it('says clearly that registration is closed', async () => {
    renderApp({ route: '/register', registrationOpen: false });
    await screen.findByLabelText('Nome');

    fillRegister();

    expect(await screen.findByText('O cadastro de novas contas está temporariamente fechado.')).toBeInTheDocument();
  });
});

describe('logout', () => {
  it('calls POST /auth/logout with the cookie, returns to /login and closes the protected area', async () => {
    const { path, state, callsTo } = renderApp({ route: '/app', signedIn: true });
    await heading('Nova Análise');

    fireEvent.click(screen.getByRole('button', { name: /sair/i }));

    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(state.session).toBeNull();
    const [[url, init]] = callsTo('POST', '/api/v1/auth/logout');
    expect(url).toBe('/api/v1/auth/logout');
    expect(init.credentials).toBe('include');
    expect(screen.queryByRole('heading', { name: 'Nova Análise' })).not.toBeInTheDocument();
    expect(screen.queryByText(/sessão expirou/i)).not.toBeInTheDocument(); // signing out is not "expiring"
  });

  it('after signing out, protected routes redirect to /login again', async () => {
    const first = renderApp({ route: '/app', signedIn: true });
    await heading('Nova Análise');
    fireEvent.click(screen.getByRole('button', { name: /sair/i }));
    await screen.findByLabelText('E-mail');
    first.unmount();

    // (the fake server-side session is gone, so a new page load finds nobody)
    const reopened = renderApp({ route: '/app/plans' });
    await screen.findByLabelText('E-mail');
    expect(reopened.path()).toBe('/login');
  });

  it('if the server can not be told, the user is NOT shown as signed out, and is told why', async () => {
    const { state, path } = renderApp({ route: '/app', signedIn: true });
    await heading('Nova Análise');
    state.logoutFails = true;

    fireEvent.click(screen.getByRole('button', { name: /sair/i }));

    expect(await screen.findByText('Não foi possível sair agora. Tente novamente.')).toBeInTheDocument();
    expect(path()).toBe('/app');
    expect(screen.getByRole('heading', { name: 'Nova Análise' })).toBeInTheDocument();
    expect(state.session).not.toBeNull();
    // and it can be retried
    state.logoutFails = false;
    fireEvent.click(screen.getByRole('button', { name: /sair/i }));
    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument();
  });
});

describe('a session that ends while the app is open', () => {
  async function submitAnalysis() {
    fill('Localização', 'Vila Velha, ES');
    fill('Tipo de negócio', 'gym');
    fireEvent.click(screen.getByRole('button', { name: 'Analisar' }));
  }

  it('sends the visitor to /login with an "expired" notice when a protected call answers 401', async () => {
    const { state, path, callsTo } = renderApp({ route: '/app', signedIn: true });
    await heading('Nova Análise');
    state.session = null; // idle/absolute expiry on the server

    await submitAnalysis();

    expect(await screen.findByText('Sua sessão expirou. Entre novamente para continuar.')).toBeInTheDocument();
    expect(path()).toBe('/login');
    const [[, init]] = callsTo('GET', '/api/v1/locations/analyze');
    expect(init.credentials).toBe('include');
    expect(screen.queryByRole('heading', { name: 'Nova Análise' })).not.toBeInTheDocument();
  });

  it('the notice goes away after signing in again, which lands back in the app', async () => {
    const { state } = renderApp({ route: '/app', signedIn: true });
    await heading('Nova Análise');
    state.session = null;
    await submitAnalysis();
    await screen.findByText('Sua sessão expirou. Entre novamente para continuar.');

    await signIn();

    expect(await heading('Nova Análise')).toBeInTheDocument();
    expect(screen.queryByText(/sessão expirou/i)).not.toBeInTheDocument();
  });
});

describe('navigation (authenticated)', () => {
  it('starts on the analysis page and shows the empty state', async () => {
    renderApp({ route: '/app', signedIn: true });

    expect(await heading('Nova Análise')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma análise realizada ainda')).toBeInTheDocument();
    // The page copy describes what the analysis shows, without promising opportunities.
    expect(screen.queryByText(/oportunidade/i)).not.toBeInTheDocument();
  });

  it('shows who is signed in', async () => {
    renderApp({ route: '/app', signedIn: true });

    await heading('Nova Análise');
    expect(screen.getByText(TEST_USER.name)).toBeInTheDocument();
  });

  it('navigates to the Plans page via the sidebar link and back via a plan CTA, through real routes', async () => {
    const { path } = renderApp({ route: '/app', signedIn: true });
    await heading('Nova Análise');

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    fireEvent.click(within(nav).getByRole('link', { name: /Planos/i }));

    expect(await heading('Planos')).toBeInTheDocument();
    expect(path()).toBe('/app/plans');
    expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pro' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Business' })).toBeInTheDocument();

    // Pro/Business must never look purchasable.
    const comingSoonButtons = screen.getAllByRole('button', { name: 'Em breve' });
    expect(comingSoonButtons.length).toBeGreaterThanOrEqual(2);
    comingSoonButtons.forEach((button) => expect(button).toBeDisabled());

    // Free's CTA is real and takes the user back to the working app.
    fireEvent.click(screen.getByRole('button', { name: 'Usar agora' }));
    expect(await heading('Nova Análise')).toBeInTheDocument();
    expect(path()).toBe('/app');
  });

  it('marks the active sidebar link with aria-current', async () => {
    renderApp({ route: '/app/plans', signedIn: true });
    await heading('Planos');

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getByRole('link', { name: /Planos/i })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: /Nova Análise/i })).not.toHaveAttribute('aria-current');
  });

  it('the "Ver planos" button in the sidebar opens /app/plans', async () => {
    const { path } = renderApp({ route: '/app', signedIn: true });
    await heading('Nova Análise');

    fireEvent.click(screen.getByRole('button', { name: 'Ver planos' }));

    expect(await heading('Planos')).toBeInTheDocument();
    expect(path()).toBe('/app/plans');
  });

  it('keeps the unbuilt sections disabled, with a "soon" badge', async () => {
    renderApp({ route: '/app', signedIn: true });
    await heading('Nova Análise');

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getByRole('button', { name: /Histórico/i })).toBeDisabled();
    expect(within(nav).getByRole('button', { name: /Explorar/i })).toBeDisabled();
  });

  it('opens and closes the plan details modal without navigating away', async () => {
    const { path } = renderApp({ route: '/app/plans', signedIn: true });
    await heading('Planos');

    const [firstDetailsButton] = screen.getAllByRole('button', { name: 'Ver detalhes' });
    fireEvent.click(firstDetailsButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('O que está incluso')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(path()).toBe('/app/plans');
  });

  it('the feature matrix marks unbuilt features as planned, never as available', async () => {
    renderApp({ route: '/app/plans', signedIn: true });
    await heading('Planos');

    expect(screen.getAllByLabelText('Planejado').length).toBeGreaterThan(0);
  });

  it('the Plans page no longer says accounts do not exist, and still says billing does not', async () => {
    renderApp({ route: '/app/plans', signedIn: true });
    await heading('Planos');

    expect(screen.queryByText(/não existe sistema de conta/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ainda não existe cobrança/i)).toBeInTheDocument();
  });
});

describe('the old development login is gone', () => {
  it('the login form has no "Usuário" field and root/1 does nothing', async () => {
    renderApp({ route: '/login' });
    await screen.findByLabelText('E-mail');

    expect(screen.queryByLabelText('Usuário')).not.toBeInTheDocument();
    fill('E-mail', 'root');
    fill('Senha', '1');
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Nova Análise' })).not.toBeInTheDocument());
  });
});
