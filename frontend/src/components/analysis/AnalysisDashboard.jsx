import OpportunityScore from './OpportunityScore.jsx';
import MetricsGrid from './MetricsGrid.jsx';
import LocationMap from './LocationMap.jsx';
import PlacesTable from './PlacesTable.jsx';
import Badge from '../common/Badge.jsx';
import styles from './AnalysisDashboard.module.css';

function AnalysisDashboard({ data }) {
  const {
    query, resolvedLocation, places, analysis, searchStrategy,
  } = data;

  const isMockData = searchStrategy?.provider?.geocoding === 'mock'
    || searchStrategy?.provider?.places === 'mock';

  return (
    <div className={styles.dashboard}>
      <p className={styles.summary}>
        <strong>{resolvedLocation.formattedAddress}</strong>
        {' · '}
        {query.businessType}
        {' · raio de '}
        {query.radiusKm}
        {' km'}
        {query.keywords.length > 0 && ` · ${query.keywords.join(', ')}`}
        {isMockData && (
          <>
            {' '}
            <Badge tone="neutral">Mock Mode</Badge>
          </>
        )}
      </p>

      <div className={styles.topRow}>
        <LocationMap
          center={resolvedLocation.coordinates}
          radiusKm={query.radiusKm}
          places={places.results}
          resolvedAddress={resolvedLocation.formattedAddress}
        />
        <OpportunityScore score={analysis.opportunityScore} competitionLevel={analysis.competitionLevel} />
      </div>

      <MetricsGrid analysis={analysis} />

      <section className={styles.resultsSection}>
        <h2 className={styles.resultsTitle}>Estabelecimentos encontrados</h2>
        <p className={styles.resultsCount}>
          {places.establishmentsFound}
          {' '}
          estabelecimento
          {places.establishmentsFound === 1 ? '' : 's'}
          {' '}
          na região analisada
        </p>
        <PlacesTable places={places.results} center={resolvedLocation.coordinates} />
      </section>
    </div>
  );
}

export default AnalysisDashboard;
