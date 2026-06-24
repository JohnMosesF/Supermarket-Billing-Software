export function currency(value = 0, code = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

export function dateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function compactNumber(value = 0) {
  return new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(Number(value || 0));
}
