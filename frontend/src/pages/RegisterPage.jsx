import { useState } from 'react';
import { Link } from 'react-router';
import { MapPinned, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.js';
import { authErrorMessage, fieldErrorsFrom, validateCredentialsFields } from '../auth/authMessages.js';
// Same card, fields and buttons as the login page: one stylesheet for both.
import styles from './LoginPage.module.css';

function RegisterPage() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const problems = validateCredentialsFields(
      { name, email, password },
      { requireName: true, checkPasswordLength: true },
    );
    setFieldErrors(problems);
    setFormError('');
    if (Object.keys(problems).length > 0) return;

    setSubmitting(true);
    try {
      // On success the auth state changes and <PublicOnly> redirects into the app.
      await register({ name: name.trim(), email: email.trim(), password });
    } catch (error) {
      const fromServer = fieldErrorsFrom(error);
      setFieldErrors(fromServer);
      // Field messages already explain a validation error; the banner is for the rest.
      setFormError(Object.keys(fromServer).length > 0 ? '' : authErrorMessage(error));
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
        <p className={styles.tagline}>Crie sua conta para analisar a concorrência ao redor de qualquer ponto.</p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="name">Nome</label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              aria-invalid={fieldErrors.name ? 'true' : undefined}
              aria-describedby={fieldErrors.name ? 'name-error' : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {fieldErrors.name && <p id="name-error" className={styles.fieldError}>{fieldErrors.name}</p>}
          </div>

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
              autoComplete="new-password"
              value={password}
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p id="password-hint" className={styles.hint}>
              No mínimo 12 caracteres. Uma frase longa funciona bem.
            </p>
            {fieldErrors.password && <p id="password-error" className={styles.fieldError}>{fieldErrors.password}</p>}
          </div>

          {formError && <p className={styles.error} role="alert">{formError}</p>}

          <button type="submit" className={styles.submit} disabled={submitting}>
            <UserPlus size={16} aria-hidden="true" />
            {submitting ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>

        <p className={styles.switch}>
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
