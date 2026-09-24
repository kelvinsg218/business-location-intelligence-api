import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommercialEcosystemSection from './CommercialEcosystemSection.jsx';

const PLACE = {
  placeId: 'p1', name: 'Studio X', primaryType: 'yoga_studio', address: 'Rua A, 1',
};

const BASE_ECOSYSTEM = {
  businessProfile: 'gym',
  complementary: {
    categoriesSearched: ['sporting_goods_store', 'yoga_studio'], establishmentsFound: 1, results: [PLACE], available: true,
  },
  trafficGenerators: {
    categoriesSearched: ['corporate_office', 'shopping_mall'], establishmentsFound: 0, results: [], available: true,
  },
  notes: [
    'Businesses that may indicate the presence of a commercially compatible ecosystem — not a guarantee of demand or foot traffic.',
    'Coverage is a single search at the analyzed center point (not the multi-point grid used for competitors) — establishmentsFound is not a complete census of every complementary business or traffic generator within the radius.',
  ],
};

describe('CommercialEcosystemSection', () => {
  it('renders a "not yet available" placeholder instead of nothing when commercialEcosystem is null', () => {
    render(<CommercialEcosystemSection commercialEcosystem={null} />);
    expect(screen.getByText('Ecossistema Comercial')).toBeInTheDocument();
    expect(screen.getByText(/ainda não está disponível para este tipo de negócio/i)).toBeInTheDocument();
  });

  it('renders the humanized business profile and both group headings', () => {
    render(<CommercialEcosystemSection commercialEcosystem={BASE_ECOSYSTEM} />);

    expect(screen.getByText('Gym')).toBeInTheDocument();
    expect(screen.getByText('Negócios Complementares')).toBeInTheDocument();
    expect(screen.getByText('Geradores de Tráfego')).toBeInTheDocument();
    expect(screen.getByText('Studio X')).toBeInTheDocument();
  });

  it('renders the required framing note verbatim', () => {
    render(<CommercialEcosystemSection commercialEcosystem={BASE_ECOSYSTEM} />);
    expect(screen.getByText(/may indicate the presence of a commercially compatible ecosystem/i)).toBeInTheDocument();
  });

  it('shows an empty-group message for a group with available:true and zero results', () => {
    render(<CommercialEcosystemSection commercialEcosystem={BASE_ECOSYSTEM} />);
    expect(screen.getByText('Nada encontrado nas categorias pesquisadas.')).toBeInTheDocument();
  });

  it('distinguishes an unavailable group from a genuine zero-results group', () => {
    const withFailure = {
      ...BASE_ECOSYSTEM,
      trafficGenerators: {
        ...BASE_ECOSYSTEM.trafficGenerators, available: false,
      },
    };
    render(<CommercialEcosystemSection commercialEcosystem={withFailure} />);

    expect(screen.getByText('Dados indisponíveis no momento para este grupo.')).toBeInTheDocument();
    expect(screen.queryByText('Nada encontrado nas categorias pesquisadas.')).not.toBeInTheDocument();
  });
});
