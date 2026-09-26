import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PLANS } from '../config/plans.js';
import PlanCard from '../components/plans/PlanCard.jsx';
import FeatureMatrix from '../components/plans/FeatureMatrix.jsx';
import PlanDetailsModal from '../components/plans/PlanDetailsModal.jsx';
import styles from './PlansPage.module.css';

function PlansPage() {
  const navigate = useNavigate();
  const [detailsPlan, setDetailsPlan] = useState(null);
  const onNavigateToAnalysis = () => navigate('/app');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Planos</h1>
        <p>
          A análise de localização já está disponível hoje no plano Free.
          Pro e Business fazem parte do roadmap do produto e são mostrados aqui
          como prévia — ainda não existe cobrança nem troca de plano.
        </p>
      </header>

      <div className={styles.grid}>
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onViewDetails={setDetailsPlan}
            onPrimaryAction={onNavigateToAnalysis}
          />
        ))}
      </div>

      <section className={styles.matrixSection}>
        <h2>Comparar planos</h2>
        <FeatureMatrix />
      </section>

      <p className={styles.disclaimer}>
        Preços e limites acima são placeholders para composição visual e não são valores comerciais definitivos.
      </p>

      {detailsPlan && (
        <PlanDetailsModal
          plan={detailsPlan}
          onClose={() => setDetailsPlan(null)}
          onPrimaryAction={() => {
            setDetailsPlan(null);
            onNavigateToAnalysis();
          }}
        />
      )}
    </div>
  );
}

export default PlansPage;
