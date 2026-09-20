// Presentation-only configuration for the Plans page.
//
// CURRENT STATE: only the Free tier reflects the app as it actually works
// today — there is no authentication, no billing and no enforced usage
// limits yet. Pro and Business are shown as a preview of the product
// roadmap (status: 'planned') so the page communicates direction without
// claiming those tiers are purchasable or functionally differentiated.
//
// Prices, radii and analysis counts below are PLACEHOLDERS for visual
// composition — not final commercial values.
//
// This file intentionally holds only display data (no real entitlement
// enforcement). See docs/future-saas/ for how plan limits would actually
// be modeled and enforced server-side in a future version.

export const PLAN_IDS = {
  FREE: 'free',
  PRO: 'pro',
  BUSINESS: 'business',
};

export const PLANS = [
  {
    id: PLAN_IDS.FREE,
    name: 'Free',
    audience: 'Para quem quer experimentar o produto ou fazer análises pontuais.',
    price: { amount: 0, period: null, note: 'Sem cartão necessário' },
    highlighted: false,
    status: 'available',
    ctaLabel: 'Usar agora',
    ctaKind: 'navigate',
    features: [
      'Análise de localização com Opportunity Score',
      'Mapa interativo de concorrentes',
      'Métricas essenciais (densidade, distância, nível de concorrência)',
      'Raio de busca limitado (placeholder)',
      'Quantidade limitada de análises por dia (placeholder)',
    ],
    limitations: [
      'Sem histórico de análises salvo',
      'Sem exportação de dados',
      'Sem acesso à API',
    ],
  },
  {
    id: PLAN_IDS.PRO,
    name: 'Pro',
    audience: 'Para quem faz análises com frequência e precisa de mais profundidade.',
    price: { amount: 19, period: 'mês', note: 'Preço provisório — não definitivo' },
    highlighted: true,
    status: 'planned',
    ctaLabel: 'Em breve',
    ctaKind: 'disabled',
    features: [
      'Tudo do Free',
      'Raio de busca maior (planejado)',
      'Mais análises por mês (planejado)',
      'Histórico de análises (planejado)',
      'Saída de análise mais detalhada (planejado)',
      'Exportação de dados (planejado)',
      'Prioridade de processamento (planejado)',
    ],
    limitations: [],
  },
  {
    id: PLAN_IDS.BUSINESS,
    name: 'Business',
    audience: 'Para empresas e times que integram o serviço a outros produtos.',
    price: { amount: 79, period: 'mês', note: 'Preço provisório — não definitivo' },
    highlighted: false,
    status: 'planned',
    ctaLabel: 'Em breve',
    ctaKind: 'disabled',
    features: [
      'Tudo do Pro',
      'Acesso à API (planejado)',
      'Limites de uso maiores (planejado)',
      'Integrações com sistemas externos (planejado)',
      'Ferramentas de exportação em lote (planejado)',
      'Suporte prioritário (planejado)',
    ],
    limitations: [],
  },
];

// Each row's `values` is keyed by plan id so column order always follows
// PLANS, and a plan can never silently read another plan's cell.
// Cell values: true = available now, 'planned' = on the roadmap, false = not offered.
export const FEATURE_MATRIX = [
  { label: 'Análise de Localização', values: { free: true, pro: true, business: true } },
  { label: 'Opportunity Score', values: { free: true, pro: true, business: true } },
  { label: 'Mapa Interativo', values: { free: true, pro: true, business: true } },
  { label: 'Raio Maior', values: { free: false, pro: 'planned', business: 'planned' } },
  { label: 'Histórico de Análises', values: { free: false, pro: 'planned', business: 'planned' } },
  { label: 'Análise Avançada', values: { free: false, pro: 'planned', business: 'planned' } },
  { label: 'Exportação de Dados', values: { free: false, pro: 'planned', business: 'planned' } },
  { label: 'Acesso à API', values: { free: false, pro: false, business: 'planned' } },
  { label: 'Integrações Empresariais', values: { free: false, pro: false, business: 'planned' } },
];
