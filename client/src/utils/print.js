function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function makeInvoiceHtmlFromSale(sale = {}, settings = {}) {
  const items = sale.items || [];
  const lines = items.map((it) => {
    const name = escapeHtml(it.name || it.productName || '');
    const qty = Number(it.quantity || it.qty || 0);
    const rate = Number(it.price || it.sellingPrice || it.rate || 0);
    const lineTotal = Number(it.lineTotal ?? it.total ?? (qty * rate));
    return `<div style="display:flex;justify-content:space-between;font-family:monospace;font-size:12px;margin-bottom:4px"><div style="flex:1">${name} <span style=\"color:#666;font-size:11px\">(${escapeHtml(it.sku||it.code||'')})</span></div><div style=\"width:60px;text-align:right\">${qty}×${rate.toFixed(2)}</div><div style=\"width:70px;text-align:right\">${lineTotal.toFixed(2)}</div></div>`;
  }).join('');

  const subtotal = Number(sale.subtotal || sale.subTotal || 0);
  const tax = Number(sale.taxTotal || sale.tax || 0);
  const discount = Number(sale.discount || 0);
  const total = Number(sale.total || sale.grandTotal || sale.totalAmount || 0);

  const header = `
    <div style="font-family:monospace;font-size:13px;text-align:center;font-weight:700">${escapeHtml(settings?.storeName || 'StoreDesk POS')}</div>
    <div style="font-family:monospace;font-size:11px;text-align:center;color:#333">Invoice: ${escapeHtml(sale.invoiceNumber || sale.invoiceNo || '')}</div>
    <div style="font-family:monospace;font-size:11px;text-align:center;color:#333">Date: ${escapeHtml(new Date(sale.createdAt || sale.invoiceAt || Date.now()).toLocaleString())}</div>
    <div style="margin:6px 0;border-top:1px dashed #000"></div>
  `;

  const footer = `
    <div style="margin-top:8px;border-top:1px dashed #000;padding-top:6px;font-family:monospace;font-size:12px">
      <div style="display:flex;justify-content:space-between"><div>Subtotal</div><div>${subtotal.toFixed(2)}</div></div>
      <div style="display:flex;justify-content:space-between"><div>Tax</div><div>${tax.toFixed(2)}</div></div>
      <div style="display:flex;justify-content:space-between"><div>Discount</div><div>${discount.toFixed(2)}</div></div>
      <div style="display:flex;justify-content:space-between;font-weight:700;margin-top:6px"><div>Total</div><div>${total.toFixed(2)}</div></div>
    </div>
  `;

  return `<div>${header}${lines}${footer}</div>`;
}

export async function printInvoice(invoiceHtmlOrSale, options = {}) {
  // If passed a sale object, generate HTML
  let html = invoiceHtmlOrSale;
  if (typeof invoiceHtmlOrSale === 'object') {
    html = makeInvoiceHtmlFromSale(invoiceHtmlOrSale.sale || invoiceHtmlOrSale, invoiceHtmlOrSale.settings || options.settings || {});
  }

  if (window.electronAPI?.printInvoice) {
    return window.electronAPI.printInvoice(html, options);
  }
  // Fallback to browser print
  const w = window.open('about:blank', '_blank');
  if (!w) return { ok: false, error: 'popup_blocked' };
  w.document.write(html);
  w.document.close();
  w.print();
  w.close();
  return { ok: true };
}
