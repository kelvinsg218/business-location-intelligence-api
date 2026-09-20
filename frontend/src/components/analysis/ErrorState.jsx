import { AlertTriangle } from 'lucide-react';
import { friendlyErrorMessage } from '../../utils/errorMessages.js';
import styles from './ErrorState.module.css';

function ErrorState({ error }) {
  return (
    <div className={styles.banner} role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      <p>{friendlyErrorMessage(error)}</p>
    </div>
  );
}

export default ErrorState;
