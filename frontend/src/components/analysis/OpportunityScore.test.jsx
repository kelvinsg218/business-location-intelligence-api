import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OpportunityScore from './OpportunityScore.jsx';
import MetricsGrid from './MetricsGrid.jsx';
import EmptyState from './EmptyState.jsx';
import { PLANS, FEATURE_MATRIX } from '../../config/plans.js';

const ANALYSIS = {
  competitorCount: 14,
  densityPerKm2: 0.18,
  avgDistanceFromCenterKm: 2.9,
  areaKm2: 78.5,
  competitionLevel: 'low',
};

// The card renders the API field `opportunityScore` (unchanged for compatibility)
// under a neutral, descriptive name. Nothing here may present a low competitor
// count as good news, or the score as an opportunity/recommendation.
describe('competition indicator language', () => {
  it('shows the neutral name "Indicador de concorrência local" instead of "Opportunity Score"', () => {
    render(<OpportunityScore score={62} competitionLevel="medium" />);

    expect(screen.getByText('Indicador de concorrência local')).toBeInTheDocument();
    expect(screen.queryByText(/opportunity/i)).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /indicador de concorrência local: 62 de 100/i })).toBeInTheDocument();
  });

  it('explains which way the scale reads and that it is not a demand measure or a recommendation', () => {
    render(<OpportunityScore score={62} competitionLevel="medium" />);

    expect(screen.getByText(/valores maiores indicam menos concorrentes por km²/i)).toBeInTheDocument();
    expect(screen.getByText(/não mede demanda, não prevê resultados e não é uma recomendação/i)).toBeInTheDocument();
  });

  it.each([
    ['low', 'Baixa'],
    ['medium', 'Média'],
    ['high', 'Alta'],
  ])('renders competition level "%s" as a neutral badge, never green (good) or red (bad)', (level, label) => {
    render(<OpportunityScore score={50} competitionLevel={level} />);

    const badge = screen.getByText(label);
    expect(badge.className).toMatch(/neutral/);
    expect(badge.className).not.toMatch(/positive|negative/);
  });

  it('renders the metrics-grid competition level as a neutral badge too', () => {
    render(<MetricsGrid analysis={ANALYSIS} />);

    const badge = screen.getByText('Baixa');
    expect(badge.className).toMatch(/neutral/);
    expect(badge.className).not.toMatch(/positive|negative/);
  });

  it('does not promise opportunities in the empty state', () => {
    render(<EmptyState />);

    expect(screen.queryByText(/opportunity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/oportunidade/i)).not.toBeInTheDocument();
    expect(screen.getByText(/indicador de concorrência local/i)).toBeInTheDocument();
  });

  it('does not use the old name in the plans copy or the feature matrix', () => {
    const planFeatureText = PLANS.flatMap((plan) => plan.features).join(' ');
    const matrixLabels = FEATURE_MATRIX.map((row) => row.label).join(' ');

    expect(`${planFeatureText} ${matrixLabels}`).not.toMatch(/opportunity/i);
    expect(matrixLabels).toMatch(/Indicador de Concorrência Local/);
  });
});
