import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import styles from './AnalysisForm.module.css';

const RADIUS_MIN = 0.1;
const RADIUS_MAX = 20;

const LOCATION_SUGGESTIONS = ['Vila Velha, ES', 'Vitória, ES', 'Praia do Canto, Vitória'];
const BUSINESS_TYPE_SUGGESTIONS = ['gym', 'restaurant', 'pharmacy', 'coffee shop', 'barber shop'];

function validate({ location, businessType, radius }) {
  const errors = {};
  if (!location || location.trim().length < 2) {
    errors.location = 'Informe uma localização válida (mínimo 2 caracteres).';
  }
  if (!businessType || businessType.trim().length < 2) {
    errors.businessType = 'Informe o tipo de negócio.';
  }
  const radiusValue = Number(radius);
  if (radius === '' || Number.isNaN(radiusValue)) {
    errors.radius = 'Informe um raio em km.';
  } else if (radiusValue < RADIUS_MIN || radiusValue > RADIUS_MAX) {
    errors.radius = `O raio deve estar entre ${RADIUS_MIN} e ${RADIUS_MAX} km.`;
  }
  return errors;
}

// Merges server-side VALIDATION_ERROR details (field/message pairs from the
// API) with client-side pre-checks, so both surface the same way.
function serverErrorsByField(serverErrors) {
  const map = {};
  (serverErrors || []).forEach((issue) => {
    if (issue.field) map[issue.field] = issue.message;
  });
  return map;
}

function AnalysisForm({ onSubmit, isLoading, serverErrors }) {
  const [values, setValues] = useState({
    location: '', businessType: '', radius: '5', keywords: '',
  });
  const [clientErrors, setClientErrors] = useState({});

  const serverFieldErrors = serverErrorsByField(serverErrors);

  function handleChange(field) {
    return (event) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
    };
  }

  function handleSubmit(event) {
    event.preventDefault();
    const errors = validate(values);
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;

    onSubmit({
      location: values.location.trim(),
      businessType: values.businessType.trim(),
      radiusKm: Number(values.radius),
      keywords: values.keywords.trim(),
    });
  }

  function fieldError(field) {
    return clientErrors[field] || serverFieldErrors[field];
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor="location">Localização</label>
          <input
            id="location"
            name="location"
            type="text"
            list="location-suggestions"
            placeholder="Vila Velha, ES"
            value={values.location}
            onChange={handleChange('location')}
            aria-invalid={Boolean(fieldError('location'))}
            aria-describedby={fieldError('location') ? 'location-error' : undefined}
          />
          <datalist id="location-suggestions">
            {LOCATION_SUGGESTIONS.map((item) => <option key={item} value={item} />)}
          </datalist>
          {fieldError('location') && <p id="location-error" className={styles.error}>{fieldError('location')}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor="businessType">Tipo de negócio</label>
          <input
            id="businessType"
            name="businessType"
            type="text"
            list="business-type-suggestions"
            placeholder="gym"
            value={values.businessType}
            onChange={handleChange('businessType')}
            aria-invalid={Boolean(fieldError('businessType'))}
            aria-describedby={fieldError('businessType') ? 'businessType-error' : undefined}
          />
          <datalist id="business-type-suggestions">
            {BUSINESS_TYPE_SUGGESTIONS.map((item) => <option key={item} value={item} />)}
          </datalist>
          {fieldError('businessType') && (
            <p id="businessType-error" className={styles.error}>{fieldError('businessType')}</p>
          )}
        </div>

        <div className={`${styles.field} ${styles.fieldNarrow}`}>
          <label htmlFor="radius">Raio</label>
          <div className={styles.unitInput}>
            <input
              id="radius"
              name="radius"
              type="number"
              min={RADIUS_MIN}
              max={RADIUS_MAX}
              step="0.1"
              value={values.radius}
              onChange={handleChange('radius')}
              aria-invalid={Boolean(fieldError('radius'))}
              aria-describedby={fieldError('radius') ? 'radius-error' : undefined}
            />
            <span className={styles.unit}>km</span>
          </div>
          {fieldError('radius') && <p id="radius-error" className={styles.error}>{fieldError('radius')}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor="keywords">Palavras-chave <span className={styles.optional}>(opcional)</span></label>
          <input
            id="keywords"
            name="keywords"
            type="text"
            placeholder="crossfit, 24 horas"
            value={values.keywords}
            onChange={handleChange('keywords')}
          />
        </div>

        <button type="submit" className={styles.submit} disabled={isLoading}>
          {isLoading ? <Loader2 size={18} className={styles.spinner} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
          {isLoading ? 'Analisando…' : 'Analisar'}
        </button>
      </div>
    </form>
  );
}

export default AnalysisForm;
