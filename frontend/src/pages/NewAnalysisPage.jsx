import AnalysisForm from '../components/analysis/AnalysisForm.jsx';
import LoadingState from '../components/analysis/LoadingState.jsx';
import EmptyState from '../components/analysis/EmptyState.jsx';
import ErrorState from '../components/analysis/ErrorState.jsx';
import AnalysisDashboard from '../components/analysis/AnalysisDashboard.jsx';
import { useLocationAnalysis } from '../hooks/useLocationAnalysis.js';
import styles from './NewAnalysisPage.module.css';

function DashboardArea({ status, data }) {
  if (status === 'loading') return <LoadingState />;
  if (status === 'success') return <AnalysisDashboard data={data} />;
  return <EmptyState />;
}

function NewAnalysisPage() {
  const {
    status, data, error, runAnalysis,
  } = useLocationAnalysis();

  const isValidationError = error?.code === 'VALIDATION_ERROR';
  const serverValidationErrors = isValidationError ? error.details : [];
  const showErrorBanner = status === 'error' && !isValidationError;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Nova Análise</h1>
        <p>Descubra oportunidades de negócio com dados geográficos e análise de concorrência.</p>
      </header>

      <AnalysisForm
        onSubmit={runAnalysis}
        isLoading={status === 'loading'}
        serverErrors={serverValidationErrors}
      />

      {showErrorBanner && <ErrorState error={error} />}

      <DashboardArea status={status} data={data} />
    </div>
  );
}

export default NewAnalysisPage;
