import Badge from '../common/Badge.jsx';
import { competitionLevelLabel, competitionLevelTone } from '../../utils/competitionLevel.js';
import styles from './OpportunityScore.module.css';

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function OpportunityScore({ score, competitionLevel }) {
  const clamped = Math.max(0, Math.min(100, score ?? 0));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <div className={styles.card}>
      <p className={styles.title}>Opportunity Score</p>

      <div className={styles.ringWrap}>
        <svg viewBox="0 0 120 120" className={styles.ring} role="img" aria-label={`Opportunity score: ${clamped} de 100`}>
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
        <Badge tone={competitionLevelTone(competitionLevel)}>{competitionLevelLabel(competitionLevel)}</Badge>
      </div>

      <p className={styles.disclaimer}>
        Indicador calculado a partir da concorrência e distribuição espacial identificadas na análise.
      </p>
    </div>
  );
}

export default OpportunityScore;
