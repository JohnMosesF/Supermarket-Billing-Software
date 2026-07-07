import { printInvoice } from './print.js';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export async function printReturnDocument(entry, kind, paperWidth = '80mm') {
  const sales = kind === 'sales';
  const title = sales ? 'SALES RETURN' : 'PURCHASE RETURN NOTE';
  const amountKey = sales ? 'refundAmount' : 'returnAmount';
  const party = sales ? entry.customerName : entry.supplierName;
  const rows = (entry.items || []).map((item) => `<tr><td>${escape(item.productName)}</td><td>${escape(item.quantity)} ${escape(item.unit)}</td><td>${Number(item.gstRate || 0).toFixed(2)}%</td><td>${Number(item[amountKey] || 0).toFixed(2)}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${paperWidth === 'A4' ? 'A4' : `${paperWidth} auto`};margin:4mm}body{font-family:Arial,sans-serif;font-size:12px;color:#111}h1{text-align:center;font-size:18px}table{width:100%;border-collapse:collapse}th,td{padding:5px;border-bottom:1px dashed #777;text-align:left}th:last-child,td:last-child{text-align:right}.total{text-align:right;font-size:16px;font-weight:bold;margin-top:12px}</style></head><body><h1>${title}</h1><p><b>Return No:</b> ${escape(entry.returnNo)}<br><b>Original Invoice:</b> ${escape(entry.originalInvoiceNo)}<br><b>${sales ? 'Customer' : 'Supplier'}:</b> ${escape(party || '-')}<br><b>Date:</b> ${escape(new Date(entry.returnDate || entry.createdAt).toLocaleString())}<br><b>Reason:</b> ${escape(entry.reason)}</p><table><thead><tr><th>Item</th><th>Qty</th><th>GST</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><p>GST: ₹${Number(entry.gstAmount || 0).toFixed(2)}</p><div class="total">${sales ? 'Refund' : 'Return Value'}: ₹${Number(entry[amountKey] || 0).toFixed(2)}</div></body></html>`;
  return printInvoice(html, { silent: false, printBackground: true, paperWidth });
}
