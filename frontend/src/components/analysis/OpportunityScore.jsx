import Badge from '../common/Badge.jsx';
import { competitionLevelLabel } from '../../utils/competitionLevel.js';
import styles from './OpportunityScore.module.css';

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Renders the API field `opportunityScore` (name kept for API compatibility)
// under a neutral, descriptive label: it is a competitor-density indicator,
// not an opportunity rating or a recommendation.
function OpportunityScore({ score, competitionLevel }) {
  const clamped = Math.max(0, Math.min(100, score ?? 0));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <div className={styles.card}>
      <p className={styles.title}>Indicador de concorrência local</p>

      <div className={styles.ringWrap}>
        <svg viewBox="0 0 120 120" className={styles.ring} role="img" aria-label={`Indicador de concorrência local: ${clamped} de 100`}>
          <circle cx="60" cy="60" r={RADIUS} className={styles.track} />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            className={styles.progress}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className={styles.ringLabel}>
          <span className={styles.score}>{clamped}</span>
          <span className={styles.scoreMax}>/ 100</span>
        </div>
      </div>

      <div className={styles.levelRow}>
        <span className={styles.levelLabel}>Nível de concorrência</span>
        <Badge tone="neutral">{competitionLevelLabel(competitionLevel)}</Badge>
      </div>

      <p className={styles.disclaimer}>
        Escala de 0 a 100 baseada na densidade e na distribuição dos concorrentes identificados:
        valores maiores indicam menos concorrentes por km². Não mede demanda, não prevê resultados
        e não é uma recomendação.
      </p>
    </div>
  );
}

export default OpportunityScore;
