function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toLocaleString() : date.toLocaleString();
}

export function normalizeInvoiceSale(input = {}, settings = {}) {
  const raw = input.sale || input;
  const state = raw.state || {};
  const totals = raw.totals || {};
  const cart = raw.cart || state.cart || raw.items || [];

  const items = cart.map((item, index) => {
    const quantity = parseFloat(item.quantity ?? item.qty, 0);
    const price = number(item.price ?? item.rate ?? item.sellingPrice, 0);
    const gstRate = number(item.taxRate ?? item.gst ?? item.tax, 0);
    const discount = number(item.discount, 0);
    const taxable = Math.max(quantity * price - discount, 0);
    const gstAmount = number(item.gstAmount, (taxable * gstRate) / 100);
    const lineTotal = number(item.lineTotal ?? item.total ?? item.amount, taxable + gstAmount);

    return {
      key: item._id || item.product || item.productId || item.sku || index,
      name: item.name || item.productName || item.itemName || 'Item',
      sku: item.sku || item.code || item.productCode || item.productId || '',
      quantity,
      price,
      gstRate,
      gstAmount,
      discount,
      lineTotal
    };
  });

  const computedSubtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const computedTax = items.reduce((sum, item) => sum + item.gstAmount, 0);
  const computedDiscount = items.reduce((sum, item) => sum + item.discount, 0);
  const subtotal = number(raw.subtotal ?? raw.subTotal ?? totals.subtotal, computedSubtotal);
  const taxTotal = number(raw.taxTotal ?? raw.taxAmount ?? raw.tax ?? totals.taxTotal, computedTax);
  const discount = number(raw.discount ?? totals.discount, computedDiscount);
  const total = number(raw.total ?? raw.grandTotal ?? raw.totalAmount ?? totals.total ?? totals.grandTotal, subtotal + taxTotal - discount);

  return {
    storeName: settings.storeName || raw.storeName || 'StoreDesk POS',
    storeAddress: settings.address || raw.storeAddress || '',
    storePhone: settings.phone || raw.storePhone || '',
    gstNumber: settings.gstNumber || raw.gstNumber || '',
    invoiceNumber: raw.invoiceNumber || raw.invoiceNo || state.invoiceNumber || 'AUTO',
    invoiceDate: raw.invoiceDate || raw.invoiceAt || raw.createdAt || state.invoiceAt || new Date(),
    customerName: raw.customerName || state.customerName || raw.customer?.name || 'Walk-in Customer',
    customerMobile: raw.customerMobile || state.customerMobile || raw.customer?.mobile || '',
    paymentMethod: raw.paymentMethod || state.paymentMethod || 'cash',
    paidAmount: number(raw.paidAmount, total),
    balanceAmount: number(raw.balanceAmount ?? raw.dueAmount, Math.max(total - number(raw.paidAmount, total), 0)),
    items,
    subtotal,
    taxTotal,
    discount,
    total,
    invoiceFooter: settings.invoiceFooter || 'Thank you for shopping!'
  };
}

export function makeInvoiceHtmlFromSale(sale = {}, settings = {}) {
  const invoice = normalizeInvoiceSale(sale, settings);
  const itemRows = invoice.items.map((item) => `
    <tr>
      <td>
        <div class="item-name">${escapeHtml(item.name)}</div>
        ${item.sku ? `<div class="muted">${escapeHtml(item.sku)}</div>` : ''}
      </td>
      <td class="num">${item.quantity}</td>
      <td class="num">${item.price.toFixed(2)}</td>
      <td class="num">${item.gstRate.toFixed(2)}%</td>
      <td class="num">${item.lineTotal.toFixed(2)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 4mm; color: #000; background: #fff; font-family: "Courier New", monospace; font-size: 12px; }
    .receipt { width: 72mm; }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .muted { color: #444; font-size: 10px; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th { border-bottom: 1px dashed #000; font-size: 10px; text-align: left; padding: 3px 0; }
    td { padding: 3px 0; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .item-name { font-weight: 700; max-width: 34mm; word-break: break-word; }
    .total { font-size: 15px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center bold">${escapeHtml(invoice.storeName)}</div>
    ${invoice.storeAddress ? `<div class="center muted">${escapeHtml(invoice.storeAddress)}</div>` : ''}
    ${invoice.storePhone ? `<div class="center muted">Phone: ${escapeHtml(invoice.storePhone)}</div>` : ''}
    ${invoice.gstNumber ? `<div class="center muted">GST: ${escapeHtml(invoice.gstNumber)}</div>` : ''}
    <div class="line"></div>
    <div class="row"><span>Invoice</span><span>${escapeHtml(invoice.invoiceNumber)}</span></div>
    <div class="row"><span>Date</span><span>${escapeHtml(formatDate(invoice.invoiceDate))}</span></div>
    <div class="row"><span>Customer</span><span>${escapeHtml(invoice.customerName)}</span></div>
    ${invoice.customerMobile ? `<div class="row"><span>Mobile</span><span>${escapeHtml(invoice.customerMobile)}</span></div>` : ''}
    <div class="line"></div>
    <table>
      <thead>
        <tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">GST</th><th class="num">Amt</th></tr>
      </thead>
      <tbody>${itemRows || '<tr><td colspan="5" class="center muted">No items</td></tr>'}</tbody>
    </table>
    <div class="line"></div>
    <div class="row"><span>Subtotal</span><span>${invoice.subtotal.toFixed(2)}</span></div>
    <div class="row"><span>Discount</span><span>${invoice.discount.toFixed(2)}</span></div>
    <div class="row"><span>Tax</span><span>${invoice.taxTotal.toFixed(2)}</span></div>
    <div class="row total"><span>Grand Total</span><span>${invoice.total.toFixed(2)}</span></div>
    <div class="row"><span>Payment</span><span>${escapeHtml(String(invoice.paymentMethod).toUpperCase())}</span></div>
    <div class="row"><span>Paid</span><span>${invoice.paidAmount.toFixed(2)}</span></div>
    ${invoice.balanceAmount > 0 ? `<div class="row"><span>Due</span><span>${invoice.balanceAmount.toFixed(2)}</span></div>` : ''}
    <div class="line"></div>
    <div class="center muted">${escapeHtml(invoice.invoiceFooter)}</div>
  </div>
</body>
</html>`;
}

export async function printInvoice(invoiceHtmlOrSale, options = {}) {
  let html = invoiceHtmlOrSale;
  if (typeof invoiceHtmlOrSale === 'object') {
    html = makeInvoiceHtmlFromSale(invoiceHtmlOrSale.sale || invoiceHtmlOrSale, invoiceHtmlOrSale.settings || options.settings || {});
  }

  if (!html || typeof html !== 'string' || html.trim().length < 50) {
    return { ok: false, error: 'Invoice HTML is empty. Nothing was sent to the printer.' };
  }

  if (window.electronAPI?.printInvoice) {
    return window.electronAPI.printInvoice(html, {
      silent: true,
      printBackground: true,
      ...options
    });
  }

  const win = window.open('about:blank', '_blank');
  if (!win) return { ok: false, error: 'popup_blocked' };
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  win.close();
  return { ok: true };
}
