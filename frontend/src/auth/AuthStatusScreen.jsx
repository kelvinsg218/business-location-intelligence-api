import styles from './AuthStatusScreen.module.css';

// Full-page notice used while the session is being checked, or when the server
// could not be reached to check it. Same dark background as the login page.
function AuthStatusScreen({ message, actionLabel, onAction }) {
  return (
    <div className={styles.screen}>
      <div className={styles.box} role={onAction ? 'alert' : 'status'}>
        <p className={styles.message}>{message}</p>
        {onAction && (
          <button type="button" className={styles.action} onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default AuthStatusScreen;
