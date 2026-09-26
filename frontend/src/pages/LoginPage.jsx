import { useState } from 'react';
import { Link } from 'react-router';
import { MapPinned, LogIn } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.js';
import { authErrorMessage, fieldErrorsFrom, validateCredentialsFields } from '../auth/authMessages.js';
import styles from './LoginPage.module.css';

function LoginPage() {
  const { login, sessionExpired } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const problems = validateCredentialsFields({ email, password });
    setFieldErrors(problems);
    setFormError('');
    if (Object.keys(problems).length > 0) return;

    setSubmitting(true);
    try {
      // On success the auth state changes and <PublicOnly> redirects into the app.
      await login({ email: email.trim(), password });
    } catch (error) {
      setFieldErrors(fieldErrorsFrom(error));
      setFormError(authErrorMessage(error));
      setPassword('');
      setSubmitting(false);
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

        {sessionExpired && (
          <p className={styles.notice} role="status">
            Sua sessão expirou. Entre novamente para continuar.
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              aria-invalid={fieldErrors.email ? 'true' : undefined}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email && <p id="email-error" className={styles.fieldError}>{fieldErrors.email}</p>}
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
            {fieldErrors.password && <p id="password-error" className={styles.fieldError}>{fieldErrors.password}</p>}
          </div>

          {formError && <p className={styles.error} role="alert">{formError}</p>}

          <button type="submit" className={styles.submit} disabled={submitting}>
            <LogIn size={16} aria-hidden="true" />
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className={styles.switch}>
          Ainda não tem conta? <Link to="/register">Criar conta</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
