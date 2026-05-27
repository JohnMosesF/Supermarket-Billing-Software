export function makeInvoiceNumber(count = 0) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `INV-${date}-${String(count + 1).padStart(5, '0')}`;
}

export function makeSku(name = 'PRD', count = 0) {
  const prefix = name.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'PRD';
  return `${prefix}-${String(count + 1).padStart(5, '0')}`;
}
