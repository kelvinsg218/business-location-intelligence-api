import { MapPin } from 'lucide-react';
import styles from './PlaceholderState.module.css';

function EmptyState() {
  return (
    <div className={styles.container}>
      <div className={styles.iconWrap}>
        <MapPin size={28} aria-hidden="true" />
      </div>
      <h2 className={styles.title}>Nenhuma análise realizada ainda</h2>
      <p className={styles.text}>
        Preencha os parâmetros acima e clique em &quot;Analisar&quot; para visualizar o mapa,
        o indicador de concorrência local, os concorrentes encontrados e as métricas da região.
      </p>
    </div>
  );
}

export default EmptyState;
