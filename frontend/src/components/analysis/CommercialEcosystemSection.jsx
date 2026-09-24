import { Sparkles } from 'lucide-react';
import { humanizeType } from '../../utils/formatters.js';
import { ecosystemGroupLabel } from '../../utils/ecosystemCategory.js';
import styles from './CommercialEcosystemSection.module.css';

function EcosystemGroup({ groupKey, group }) {
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>
        {ecosystemGroupLabel(groupKey)}
        <span className={styles.groupCount}>{group.results.length}</span>
      </h3>

      {!group.available && (
        <p className={styles.unavailable}>Dados indisponíveis no momento para este grupo.</p>
      )}

      {group.available && group.results.length === 0 && (
        <p className={styles.empty}>Nada encontrado nas categorias pesquisadas.</p>
      )}

      {group.available && group.results.length > 0 && (
        <ul className={styles.list}>
          {group.results.map((place) => (
            <li key={place.placeId}>
              <span className={styles.placeName}>{place.name}</span>
              <span className={styles.placeType}>{humanizeType(place.primaryType)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommercialEcosystemSection({ commercialEcosystem }) {
  if (!commercialEcosystem) {
    return (
      <section className={styles.section}>
        <h2 className={styles.title}>Ecossistema Comercial</h2>
        <div className={styles.notAvailable}>
          <Sparkles size={18} aria-hidden="true" />
          <p>Análise de ecossistema comercial ainda não está disponível para este tipo de negócio.</p>
        </div>
      </section>
    );
  }

  const {
    businessProfile, complementary, trafficGenerators, notes,
  } = commercialEcosystem;

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Ecossistema Comercial</h2>
      <p className={styles.subtitle}>
        {'Perfil de negócio identificado: '}
        <strong>{humanizeType(businessProfile)}</strong>
      </p>

      <div className={styles.groups}>
        <EcosystemGroup groupKey="complementary" group={complementary} />
        <EcosystemGroup groupKey="trafficGenerators" group={trafficGenerators} />
      </div>

      <ul className={styles.notes}>
        {notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </section>
  );
}

export default CommercialEcosystemSection;
