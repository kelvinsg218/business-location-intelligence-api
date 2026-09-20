const LABELS = { low: 'Baixa', medium: 'Média', high: 'Alta' };

// "low" competition is good news for an entrant, so it maps to the positive
// tone even though nothing about the word itself says that.
const TONES = { low: 'positive', medium: 'neutral', high: 'negative' };

export function competitionLevelLabel(level) {
  return LABELS[level] || level || '—';
}

export function competitionLevelTone(level) {
  return TONES[level] || 'neutral';
}
