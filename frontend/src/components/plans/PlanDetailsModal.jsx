import Modal from '../common/Modal.jsx';
import Badge from '../common/Badge.jsx';
import styles from './PlanDetailsModal.module.css';

function PlanDetailsModal({ plan, onClose, onPrimaryAction }) {
  const {
    name, audience, price, features, limitations, status, ctaLabel, ctaKind,
  } = plan;

  return (
    <Modal title={`${name} plan`} onClose={onClose}>
      <p className={styles.audience}>{audience}</p>

      <div className={styles.priceRow}>
        <span className={styles.priceAmount}>{price.amount === 0 ? 'Free' : `$${price.amount}`}</span>
        {price.period && <span className={styles.pricePeriod}>{`/${price.period}`}</span>}
      </div>
      <p className={styles.priceNote}>{price.note}</p>

      <h3 className={styles.sectionTitle}>O que está incluso</h3>
      <ul className={styles.list}>
        {features.map((feature) => <li key={feature}>{feature}</li>)}
      </ul>

      {limitations.length > 0 && (
        <>
          <h3 className={styles.sectionTitle}>Limitações</h3>
          <ul className={styles.list}>
            {limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
          </ul>
        </>
      )}

      {status === 'planned' && (
        <p className={styles.plannedNotice}>
          <Badge tone="neutral">Planejado</Badge>
          {' Este plano está no roadmap do produto — ainda não é cobrável e aparece aqui como prévia.'}
        </p>
      )}

      <div className={styles.footer}>
        {ctaKind === 'navigate' ? (
          <button type="button" className={styles.ctaPrimary} onClick={onPrimaryAction}>{ctaLabel}</button>
        ) : (
          <button type="button" className={styles.ctaDisabled} disabled title="Ainda sem sistema de cobrança">
            {ctaLabel}
          </button>
        )}
      </div>
    </Modal>
  );
}

export default PlanDetailsModal;
