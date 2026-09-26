import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext.js';
import AuthStatusScreen from './AuthStatusScreen.jsx';

// Layout route for everything that needs a signed-in user. It renders nothing of
// the protected pages until the server has said the session is valid, so a
// protected screen is never flashed to a visitor.
function RequireAuth() {
  const { status, retry } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <AuthStatusScreen message="Verificando sua sessão…" />;

  if (status === 'unavailable') {
    return (
      <AuthStatusScreen
        message="Não foi possível verificar sua sessão. O servidor pode estar indisponível."
        actionLabel="Tentar novamente"
        onAction={retry}
      />
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default RequireAuth;
