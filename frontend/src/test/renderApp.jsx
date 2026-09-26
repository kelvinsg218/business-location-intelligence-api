import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import App from '../App.jsx';
import { AuthProvider } from '../auth/AuthProvider.jsx';
import { installFakeApi } from './fakeApi.js';

// Exposes the current router path so tests can assert where the app ended up.
function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="path">{pathname}</div>;
}

/**
 * Renders the real App (router + auth provider + pages) against the in-memory
 * fake backend. `route` is where the browser "starts".
 */
export function renderApp({ route = '/', ...apiOptions } = {}) {
  const api = installFakeApi(apiOptions);
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <App />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  );
  const path = () => utils.getByTestId('path').textContent;
  return { ...api, ...utils, path };
}
