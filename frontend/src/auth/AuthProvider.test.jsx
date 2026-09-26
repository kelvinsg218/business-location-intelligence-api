import { StrictMode } from 'react';
import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import {
  render, screen, fireEvent, waitFor, act,
} from '@testing-library/react';
import { AuthProvider } from './AuthProvider.jsx';
import { useAuth } from './AuthContext.js';
import { apiRequest } from '../api/apiClient.js';
import { installFakeApi, TEST_PASSWORD, TEST_USER } from '../test/fakeApi.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Renders the state and exposes the actions, so the provider is tested directly.
function Probe() {
  const auth = useAuth();
  return (
    <div>
      <p data-testid="status">{auth.status}</p>
      <p data-testid="user">{auth.user ? auth.user.email : 'none'}</p>
      <p data-testid="expired">{String(auth.sessionExpired)}</p>
      <button type="button" onClick={() => auth.login({ email: TEST_USER.email, password: TEST_PASSWORD })}>login</button>
      <button type="button" onClick={() => auth.login({ email: TEST_USER.email, password: 'wrong-password-123' }).catch(() => {})}>bad-login</button>
      <button type="button" onClick={() => auth.logout().catch(() => {})}>logout</button>
      <button type="button" onClick={auth.retry}>retry</button>
    </div>
  );
}

const status = () => screen.getByTestId('status').textContent;

function mount(apiOptions, { strict = false } = {}) {
  const api = installFakeApi(apiOptions);
  const tree = (
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return api;
}

describe('AuthProvider', () => {
  it('starts as "loading" and asks the server once who is signed in', async () => {
    const { callsTo } = mount({ hangSessionCheck: true });

    expect(status()).toBe('loading');
    expect(callsTo('GET', '/api/v1/auth/me')).toHaveLength(1);
  });

  it('becomes "authenticated" with the user when a session exists', async () => {
    mount({ signedIn: true });

    await waitFor(() => expect(status()).toBe('authenticated'));
    expect(screen.getByTestId('user')).toHaveTextContent(TEST_USER.email);
  });

  it('becomes "unauthenticated" on a plain 401', async () => {
    mount({});

    await waitFor(() => expect(status()).toBe('unauthenticated'));
    expect(screen.getByTestId('expired')).toHaveTextContent('false');
  });

  it.each([
    ['the network is down', { down: true }],
    ['the server answers 503', { sessionCheckStatus: 503 }],
  ])('becomes "unavailable" (not "unauthenticated") when %s', async (_label, options) => {
    mount(options);

    await waitFor(() => expect(status()).toBe('unavailable'));
  });

  it('retry() asks again and recovers', async () => {
    const { state } = mount({ down: true });
    await waitFor(() => expect(status()).toBe('unavailable'));

    state.down = false;
    state.session = { ...TEST_USER };
    fireEvent.click(screen.getByText('retry'));

    expect(status()).toBe('loading');
    await waitFor(() => expect(status()).toBe('authenticated'));
  });

  it('survives React StrictMode (effects run twice) without ending up in a wrong state', async () => {
    mount({ signedIn: true }, { strict: true });

    await waitFor(() => expect(status()).toBe('authenticated'));
  });

  it('login() signs in; a failed login() leaves the state untouched and rejects', async () => {
    mount({});
    await waitFor(() => expect(status()).toBe('unauthenticated'));

    fireEvent.click(screen.getByText('bad-login'));
    await waitFor(() => expect(status()).toBe('unauthenticated'));

    fireEvent.click(screen.getByText('login'));
    await waitFor(() => expect(status()).toBe('authenticated'));
  });

  it('logout() signs out only once the server has confirmed it', async () => {
    const { state } = mount({ signedIn: true });
    await waitFor(() => expect(status()).toBe('authenticated'));

    state.logoutFails = true;
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(state.session).not.toBeNull());
    expect(status()).toBe('authenticated');

    state.logoutFails = false;
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(status()).toBe('unauthenticated'));
    expect(screen.getByTestId('expired')).toHaveTextContent('false');
  });

  describe('a protected call answering 401 UNAUTHENTICATED', () => {
    it('signs the user out and flags the session as expired', async () => {
      const { state } = mount({ signedIn: true });
      await waitFor(() => expect(status()).toBe('authenticated'));
      state.session = null;

      await act(async () => {
        await apiRequest('/api/v1/locations/analyze').catch(() => {});
      });

      expect(status()).toBe('unauthenticated');
      expect(screen.getByTestId('expired')).toHaveTextContent('true');
    });

    it('is ignored when nobody was signed in (a visitor is not "expired")', async () => {
      mount({});
      await waitFor(() => expect(status()).toBe('unauthenticated'));

      await act(async () => {
        await apiRequest('/api/v1/locations/analyze').catch(() => {});
      });

      expect(status()).toBe('unauthenticated');
      expect(screen.getByTestId('expired')).toHaveTextContent('false');
    });

    it('a wrong password (401 INVALID_CREDENTIALS) is not a session expiry', async () => {
      mount({});
      await waitFor(() => expect(status()).toBe('unauthenticated'));

      fireEvent.click(screen.getByText('bad-login'));
      await waitFor(() => expect(status()).toBe('unauthenticated'));

      expect(screen.getByTestId('expired')).toHaveTextContent('false');
    });
  });

  it('useAuth outside a provider fails loudly instead of returning a default', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/inside <AuthProvider>/);
    spy.mockRestore();
  });

  it('stores nothing in web storage across the whole lifecycle', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    mount({});
    await waitFor(() => expect(status()).toBe('unauthenticated'));

    fireEvent.click(screen.getByText('login'));
    await waitFor(() => expect(status()).toBe('authenticated'));
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(status()).toBe('unauthenticated'));

    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});
