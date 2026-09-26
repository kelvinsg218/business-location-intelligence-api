import {
  useCallback, useEffect, useMemo, useReducer, useState,
} from 'react';
import { AuthContext } from './AuthContext.js';
import * as authApi from '../api/authApi.js';
import { setUnauthorizedHandler } from '../api/apiClient.js';

// The session lives in an HttpOnly cookie that this code can not read, so the
// only source of truth is the server: on load the provider asks GET /auth/me.
// Nothing about the session — no token, no flag, no user — is written to
// localStorage or sessionStorage.

const INITIAL_STATE = { status: 'loading', user: null, sessionExpired: false };

function reducer(state, action) {
  switch (action.type) {
    case 'checking':
      return { ...INITIAL_STATE };
    case 'authenticated':
      return { status: 'authenticated', user: action.user, sessionExpired: false };
    case 'unauthenticated':
      return { status: 'unauthenticated', user: null, sessionExpired: false };
    case 'unavailable':
      return { status: 'unavailable', user: null, sessionExpired: false };
    // A protected call answered 401 while the user was inside the app.
    case 'expired':
      return state.status === 'authenticated'
        ? { status: 'unauthenticated', user: null, sessionExpired: true }
        : state;
    case 'clearExpired':
      return state.sessionExpired ? { ...state, sessionExpired: false } : state;
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [checkNumber, setCheckNumber] = useState(0);

  // Session recovery: on load, and again whenever retry() is called.
  useEffect(() => {
    const controller = new AbortController();
    authApi.fetchCurrentUser({ signal: controller.signal }).then(
      (user) => dispatch({ type: 'authenticated', user }),
      (error) => {
        if (controller.signal.aborted) return;
        // 401 is the ordinary "nobody is signed in"; anything else (no network,
        // 5xx) means we could not find out, which is not the same thing.
        dispatch({ type: error.status === 401 ? 'unauthenticated' : 'unavailable' });
      },
    );
    return () => controller.abort();
  }, [checkNumber]);

  // The session ended while the app was open (idle/absolute expiry, or signed
  // out from another tab): drop back to the login screen with a notice.
  useEffect(() => setUnauthorizedHandler(() => dispatch({ type: 'expired' })), []);

  const login = useCallback(async (credentials) => {
    const user = await authApi.login(credentials);
    dispatch({ type: 'authenticated', user });
    return user;
  }, []);

  const register = useCallback(async (details) => {
    const user = await authApi.register(details);
    dispatch({ type: 'authenticated', user });
    return user;
  }, []);

  // If the server can not be told, the user is NOT shown as signed out: the
  // cookie (which only the server can clear) would still be valid.
  const logout = useCallback(async () => {
    await authApi.logout();
    dispatch({ type: 'unauthenticated' });
  }, []);

  const retry = useCallback(() => {
    dispatch({ type: 'checking' });
    setCheckNumber((n) => n + 1);
  }, []);

  const clearSessionExpired = useCallback(() => dispatch({ type: 'clearExpired' }), []);

  const value = useMemo(() => ({
    status: state.status,
    user: state.user,
    sessionExpired: state.sessionExpired,
    login,
    register,
    logout,
    retry,
    clearSessionExpired,
  }), [state, login, register, logout, retry, clearSessionExpired]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
