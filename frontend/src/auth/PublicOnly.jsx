import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext.js';
import AuthStatusScreen from './AuthStatusScreen.jsx';
import { afterLoginPath } from './redirect.js';

// Layout route for /login and /register: a visitor who is already signed in has
// no business there and is sent on to the app (or to the page they were
// originally trying to open).
function PublicOnly() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <AuthStatusScreen message="Verificando sua sessão…" />;
  if (status === 'authenticated') return <Navigate to={afterLoginPath(location)} replace />;

  // 'unauthenticated' and 'unavailable' both show the form: if the server is
  // down, submitting it reports that clearly.
  return <Outlet />;
}

export default PublicOnly;
