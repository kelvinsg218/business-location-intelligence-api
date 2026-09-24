import { useState } from 'react';
import AppShell from './components/layout/AppShell.jsx';
import NewAnalysisPage from './pages/NewAnalysisPage.jsx';
import PlansPage from './pages/PlansPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import { isAuthenticated, logout } from './auth/devAuth.js';

function App() {
  const [view, setView] = useState('analysis');
  const [authenticated, setAuthenticated] = useState(isAuthenticated);

  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }

  function handleLogout() {
    logout();
    setAuthenticated(false);
  }

  return (
    <AppShell activeView={view} onNavigate={setView} onLogout={handleLogout}>
      {view === 'plans'
        ? <PlansPage onNavigateToAnalysis={() => setView('analysis')} />
        : <NewAnalysisPage />}
    </AppShell>
  );
}

export default App;
