import { Loader2 } from 'lucide-react';
import styles from './PlaceholderState.module.css';

function LoadingState() {
  return (
    <div className={styles.container} role="status" aria-live="polite">
      <Loader2 size={28} className={styles.spinnerIcon} aria-hidden="true" />
      <p className={styles.text}>Analisando a região selecionada…</p>
    </div>
  );
}

export default LoadingState;
