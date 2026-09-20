import styles from './MetricCard.module.css';

function MetricCard({ icon: Icon, label, value }) {
  return (
    <div className={styles.card}>
      <div className={styles.iconWrap}>
        <Icon size={18} aria-hidden="true" />
      </div>
      <div className={styles.body}>
        <p className={styles.label}>{label}</p>
        <div className={styles.value}>{value}</div>
      </div>
    </div>
  );
}

export default MetricCard;
