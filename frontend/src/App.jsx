import { Navigate, Route, Routes } from 'react-router';
import AppShell from './components/layout/AppShell.jsx';
import NewAnalysisPage from './pages/NewAnalysisPage.jsx';
import PlansPage from './pages/PlansPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import PublicOnly from './auth/PublicOnly.jsx';

// Routes (the router and the auth provider are mounted in main.jsx):
//   /login, /register   public, and closed to a signed-in visitor (-> /app)
//   /app, /app/plans    protected: need a session, otherwise -> /login
//   /                   -> /app
function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />

      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<NewAnalysisPage />} />
          <Route path="plans" element={<PlansPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

export default App;
