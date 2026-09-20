import { Check, Minus, Clock } from 'lucide-react';
import { PLANS, FEATURE_MATRIX } from '../../config/plans.js';
import styles from './FeatureMatrix.module.css';

function Cell({ value }) {
  if (value === true) return <Check size={16} className={styles.yes} aria-label="Disponível agora" />;
  if (value === 'planned') return <Clock size={16} className={styles.planned} aria-label="Planejado" />;
  return <Minus size={16} className={styles.no} aria-label="Não incluso" />;
}

function FeatureMatrix() {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Recurso</th>
            {PLANS.map((plan) => <th key={plan.id} scope="col">{plan.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {FEATURE_MATRIX.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {PLANS.map((plan) => (
                <td key={plan.id}>
                  <Cell value={row.values[plan.id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className={styles.legend}>
        <span>
          <Check size={13} className={styles.yes} aria-hidden="true" />
          {' Disponível agora'}
        </span>
        <span>
          <Clock size={13} className={styles.planned} aria-hidden="true" />
          {' Planejado'}
        </span>
        <span>
          <Minus size={13} className={styles.no} aria-hidden="true" />
          {' Não incluso'}
        </span>
      </p>
    </div>
  );
}

export default FeatureMatrix;
