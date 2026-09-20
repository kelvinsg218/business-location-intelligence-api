const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat('pt-BR');

export function formatNumber(value, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return numberFormatter.format(value);
}

export function formatInteger(value, fallback = '0') {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return integerFormatter.format(value);
}

export function formatKm(value) {
  const formatted = formatNumber(value);
  return formatted === '—' ? formatted : `${formatted} km`;
}

export function formatKm2(value) {
  const formatted = formatNumber(value);
  return formatted === '—' ? formatted : `${formatted} km²`;
}

export function formatDensity(value) {
  const formatted = formatNumber(value);
  return formatted === '—' ? formatted : `${formatted} / km²`;
}

export function humanizeType(type) {
  if (!type) return '—';
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
