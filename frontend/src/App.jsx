import { useState } from 'react';
import AppShell from './components/layout/AppShell.jsx';
import NewAnalysisPage from './pages/NewAnalysisPage.jsx';
import PlansPage from './pages/PlansPage.jsx';

function App() {
  const [view, setView] = useState('analysis');

  return (
    <AppShell activeView={view} onNavigate={setView}>
      {view === 'plans'
        ? <PlansPage onNavigateToAnalysis={() => setView('analysis')} />
        : <NewAnalysisPage />}
    </AppShell>
  );
}

export default App;
