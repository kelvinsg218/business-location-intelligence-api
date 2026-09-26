const LABELS = { low: 'Baixa', medium: 'Média', high: 'Alta' };

// The competition level only describes how many competitors were found. It is
// deliberately not mapped to a good/bad color: a low count can mean an
// underserved area or simply no demand, and this data cannot tell which.
export function competitionLevelLabel(level) {
  return LABELS[level] || level || '—';
}
