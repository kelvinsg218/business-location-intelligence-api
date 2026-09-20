import { Check } from 'lucide-react';
import Badge from '../common/Badge.jsx';
import styles from './PlanCard.module.css';

function PlanCard({ plan, onViewDetails, onPrimaryAction }) {
  const {
    name, audience, price, highlighted, status, ctaLabel, ctaKind, features,
  } = plan;

  return (
    <div className={`${styles.card} ${highlighted ? styles.highlighted : ''}`}>
      {highlighted && (
        <span className={styles.badgeWrap}>
          <Badge tone="accent">Mais popular</Badge>
        </span>
      )}

      <h3 className={styles.name}>{name}</h3>
      <p className={styles.audience}>{audience}</p>

      <div className={styles.priceRow}>
        <span className={styles.priceAmount}>{price.amount === 0 ? 'Free' : `$${price.amount}`}</span>
        {price.period && <span className={styles.pricePeriod}>{`/${price.period}`}</span>}
      </div>
      <p className={styles.priceNote}>{price.note}</p>

      <ul className={styles.featureList}>
        {features.map((feature) => (
          <li key={feature}>
            <Check size={15} className={styles.checkIcon} aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        <button type="button" className={styles.detailsButton} onClick={() => onViewDetails(plan)}>
          Ver detalhes
        </button>
        {ctaKind === 'navigate' ? (
          <button type="button" className={styles.ctaPrimary} onClick={onPrimaryAction}>
            {ctaLabel}
          </button>
        ) : (
          <button type="button" className={styles.ctaDisabled} disabled title="Ainda sem sistema de cobrança">
            {ctaLabel}
          </button>
        )}
      </div>

      {status === 'planned' && <p className={styles.plannedNote}>Somente prévia — ainda não cobrável.</p>}
    </div>
  );
}

export default PlanCard;
