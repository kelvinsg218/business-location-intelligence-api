const GROUP_LABELS = {
  complementary: 'Negócios Complementares',
  trafficGenerators: 'Geradores de Tráfego',
};

export function ecosystemGroupLabel(group) {
  return GROUP_LABELS[group] || group || '—';
}
