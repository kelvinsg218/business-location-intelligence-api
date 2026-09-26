import {
  Users, Grid3x3, Route, Gauge, CircleDot,
} from 'lucide-react';
import MetricCard from './MetricCard.jsx';
import Badge from '../common/Badge.jsx';
import {
  formatInteger, formatDensity, formatKm, formatKm2,
} from '../../utils/formatters.js';
import { competitionLevelLabel } from '../../utils/competitionLevel.js';
import styles from './MetricsGrid.module.css';

function MetricsGrid({ analysis }) {
  return (
    <div className={styles.grid}>
      <MetricCard icon={Users} label="Concorrentes encontrados" value={formatInteger(analysis.competitorCount)} />
      <MetricCard icon={Grid3x3} label="Densidade" value={formatDensity(analysis.densityPerKm2)} />
      <MetricCard icon={Route} label="Distância média" value={formatKm(analysis.avgDistanceFromCenterKm)} />
      <MetricCard
        icon={Gauge}
        label="Nível de concorrência"
        value={(
          <Badge tone="neutral">
            {competitionLevelLabel(analysis.competitionLevel)}
          </Badge>
        )}
      />
      <MetricCard icon={CircleDot} label="Área analisada" value={formatKm2(analysis.areaKm2)} />
    </div>
  );
}

export default MetricsGrid;
