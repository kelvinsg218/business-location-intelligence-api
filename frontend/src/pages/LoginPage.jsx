import { useState } from 'react';
import { MapPinned, LogIn } from 'lucide-react';
import { attemptLogin } from '../auth/devAuth.js';
import styles from './LoginPage.module.css';

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    if (attemptLogin(username, password)) {
      setError('');
      onLogin();
    } else {
      setError('Usuário ou senha inválidos.');
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <MapPinned size={26} className={styles.brandIcon} aria-hidden="true" />
          <div className={styles.wordmark}>
            <span>Business</span>
            <span>Location</span>
            <span>Intelligence</span>
          </div>
        </div>
        <p className={styles.tagline}>Entenda a região antes de investir nela.</p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="username">Usuário</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <button type="submit" className={styles.submit}>
            <LogIn size={16} aria-hidden="true" />
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
