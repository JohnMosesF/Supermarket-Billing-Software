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

function bool(value, fallback = true) {
  return typeof value === 'boolean' ? value : fallback;
}

function formatDateOnly(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString('en-IN');
  return date.toLocaleDateString('en-IN');
}

function formatTimeOnly(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0';
  return parsed.toFixed(3).replace(/\.?0+$/, '');
}

function money(value, symbol = '₹') {
  const amount = number(value, 0);
  const sign = amount < 0 ? '-' : '';
  return `${sign}${symbol}${Math.abs(amount).toFixed(2)}`;
}

function cleanLines(lines) {
  return lines.map((line) => String(line || '').trim()).filter(Boolean);
}

export function getReceiptSettings(settings = {}) {
  const width = String(settings.receiptWidth || settings.thermalPaperWidth || '80mm').trim();
  const normalizedWidth = width === '58mm' ? '58mm' : width === '72mm' ? '72mm' : width === 'A4' ? 'A4' : '80mm';
  const widthMm = normalizedWidth === '58mm' ? 58 : normalizedWidth === '72mm' ? 72 : normalizedWidth === 'A4' ? 210 : 80;
  const marginLeft = number(settings.receiptMarginLeft, normalizedWidth === '58mm' ? 2 : 3);
  const marginRight = number(settings.receiptMarginRight, normalizedWidth === '58mm' ? 2 : 3);
  const printableWidth = normalizedWidth === 'A4' ? 190 : Math.max(widthMm - marginLeft - marginRight, normalizedWidth === '58mm' ? 46 : normalizedWidth === '72mm' ? 60 : 66);


  return {
    receiptWidth: normalizedWidth,
    widthMm,
    printableWidth,
    topMargin: number(settings.receiptTopMargin, 2),
    bottomMargin: number(settings.receiptBottomMargin, 3),
    leftMargin: marginLeft,
    rightMargin: marginRight,
    fontFamily: settings.receiptFontFamily || 'Consolas',
    fontSize: number(settings.receiptFontSize, width === '58mm' ? 10.5 : 11.5),
    lineHeight: number(settings.receiptLineHeight, 1.25),
    printDensity: settings.printDensity || 'normal',
    dividerStyle: settings.dividerStyle || 'dashed',
    centerHeader: bool(settings.centerHeader, true),
    boldStoreName: bool(settings.boldStoreName, true),
    showDividers: bool(settings.showDividers, true),
    paperFeedAfterPrint: number(settings.paperFeedAfterPrint, 8),
    currencySymbol: settings.currencySymbol || (settings.currency === 'INR' || !settings.currency ? '₹' : settings.currency)
  };
}

export function normalizeInvoiceSale(input = {}, settings = {}) {
  const raw = input.sale || input;
  const state = raw.state || {};
  const totals = raw.totals || {};
  const cart = raw.cart || state.cart || raw.items || [];

  const items = cart.map((item, index) => {
    const quantity = parseFloat(item.quantity ?? item.qty ?? 0);
    const price = number(item.price ?? item.sellingPrice ?? item.rate ?? 0, 0);
    const gstRate = number(item.taxRate ?? item.gst ?? item.tax ?? 0, 0);
    const discount = number(item.discount, 0);
    const taxable = Math.max(quantity * price - discount, 0);
    const gstAmount = number(item.gstAmount, (taxable * gstRate) / 100);
    const lineTotal = number(item.lineTotal ?? item.netAmount ?? item.total ?? item.amount, taxable + gstAmount);

    return {
      key: item._id || item.product || item.productId || item.sku || index,
      name: item.name || item.productName || item.itemName || 'Item',
      sku: item.sku || item.code || item.productCode || item.productId || '',
      productId: item.productIdNumber ?? item.productIdValue ?? item.productId ?? item._id ?? '',
      productCode: item.productCode || item.code || item.sku || '',
      hsn: item.hsn || item.hsnCode || '',
      quantity,
      unit: item.unit || 'pcs',
      quantityText: formatQuantity(quantity),
      price,
      gstRate,
      gstAmount,
      discount,
      taxable,
      lineTotal
    };
  });

  const computedSubtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const computedTax = items.reduce((sum, item) => sum + item.gstAmount, 0);
  const computedDiscount = items.reduce((sum, item) => sum + item.discount, 0);
  const subtotal = number(raw.subtotal ?? raw.subTotal ?? totals.subtotal, computedSubtotal);
  const taxTotal = number(raw.taxTotal ?? raw.taxAmount ?? raw.tax ?? totals.taxTotal ?? totals.gst, computedTax);
  const discount = number(raw.discount ?? totals.discount, computedDiscount);
  const total = number(raw.total ?? raw.grandTotal ?? raw.totalAmount ?? totals.total ?? totals.grandTotal, subtotal + taxTotal - discount);
  const roundOff = number(raw.roundOff ?? totals.roundOff, total - (subtotal + taxTotal - discount));
  const paidAmount = number(raw.paidAmount ?? raw.paid, total);

  return {
    storeName: settings.storeName || raw.storeName || 'StoreDesk POS',
    branchName: settings.branchName || raw.branchName || '',
    addressLine1: settings.addressLine1 || settings.address || raw.storeAddress || '',
    addressLine2: settings.addressLine2 || '',
    city: settings.city || '',
    state: settings.state || '',
    pincode: settings.pincode || '',
    storePhone: settings.phone || raw.storePhone || '',
    whatsapp: settings.whatsapp || '',
    gstNumber: settings.gstNumber || settings.gstin || raw.gstNumber || '',
    fssaiNumber: settings.fssaiNumber || '',
    email: settings.email || '',
    website: settings.website || '',
    logoUrl: settings.logoUrl || '',
    invoiceNumber: raw.invoiceNumber || raw.invoiceNo || state.invoiceNumber || 'AUTO',
    invoiceDate: raw.invoiceDate || raw.invoiceAt || raw.createdAt || state.invoiceAt || new Date(),
    cashier: raw.cashierName || raw.cashier || state.cashier || raw.user?.name || 'Admin',
    customerName: raw.customerName || state.customerName || raw.customer?.name || 'Walk-in Customer',
    customerMobile: raw.customerMobile || state.customerMobile || raw.customer?.mobile || '',
    customerGst: raw.customerGst || raw.customerGST || raw.customer?.gstNumber || '',
    paymentMethod: raw.paymentMethod || state.paymentMethod || 'cash',
    paidAmount,
    balanceAmount: number(raw.balanceAmount ?? raw.dueAmount, Math.max(total - paidAmount, 0)),
    savings: number(raw.savings ?? totals.savings, discount),
    items,
    subtotal,
    taxTotal,
    discount,
    roundOff,
    total,
    invoiceFooter: settings.invoiceFooter || settings.thankYouMessage || 'Thank you for shopping with us.'
  };
}

function showField(settings, key, fallback = true) {
  return bool(settings[`show${key}`], fallback);
}

function dividerMarkup(settings, className = '') {
  if (!settings.showDividers) return '';
  return `<div class="divider divider-${escapeHtml(settings.dividerStyle)} ${escapeHtml(className)}"></div>`;
}

function infoRow(label, value) {
  if (value == null || value === '') return '';
  return `<div class="info-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
}

function totalRow(label, value, settings, className = '') {
  return `<div class="total-row ${escapeHtml(className)}"><span>${escapeHtml(label)}</span><b>${escapeHtml(money(value, settings.currencySymbol))}</b></div>`;
}

function footerLines(invoice, settings) {
  return cleanLines([
    settings.thankYouMessage || invoice.invoiceFooter,
    settings.returnPolicy,
    settings.footerLine1,
    settings.footerLine2,
    settings.footerLine3
  ]);
}

function taxSummaryRows(invoice, settings) {
  const byRate = new Map();
  for (const item of invoice.items) {
    const current = byRate.get(item.gstRate) || { taxable: 0, tax: 0 };
    current.taxable += item.taxable;
    current.tax += item.gstAmount;
    byRate.set(item.gstRate, current);
  }

  return Array.from(byRate.entries()).map(([rate, row]) => {
    const cgstSgst = settings.gstMode !== 'igst';
    return `<tr>
      <td>${escapeHtml(`${rate}%`)}</td>
      <td class="num">${escapeHtml(money(row.taxable, settings.currencySymbol))}</td>
      ${cgstSgst ? `<td class="num">${escapeHtml(money(row.tax / 2, settings.currencySymbol))}</td><td class="num">${escapeHtml(money(row.tax / 2, settings.currencySymbol))}</td>` : `<td class="num">${escapeHtml(money(row.tax, settings.currencySymbol))}</td>`}
    </tr>`;
  }).join('');
}

export function makeReceiptBodyHtml(sale = {}, rawSettings = {}) {
  const settings = getReceiptSettings(rawSettings);
  const invoice = normalizeInvoiceSale(sale, rawSettings);
  const addressLines = cleanLines([
    invoice.branchName,
    invoice.addressLine1,
    invoice.addressLine2,
    cleanLines([invoice.city, invoice.state, invoice.pincode]).join(', '),
    invoice.storePhone ? `Phone: ${invoice.storePhone}` : '',
    invoice.whatsapp ? `WhatsApp: ${invoice.whatsapp}` : '',
    invoice.gstNumber ? `GSTIN: ${invoice.gstNumber}` : '',
    invoice.fssaiNumber ? `FSSAI: ${invoice.fssaiNumber}` : '',
    invoice.email,
    invoice.website
  ]);

  const itemRows = invoice.items.map((item, index) => {
    const meta = cleanLines([
      showField(rawSettings, 'ProductID', false) && item.productId ? `PID: ${item.productId}` : '',
      showField(rawSettings, 'SKU', false) && item.sku ? `SKU: ${item.sku}` : '',
      showField(rawSettings, 'ProductCode', false) && item.productCode ? `Code: ${item.productCode}` : '',
      showField(rawSettings, 'HSN', false) && item.hsn ? `HSN: ${item.hsn}` : ''
    ]);

    return `<div class="item">
      <div class="item-title"><span>${index + 1}. ${escapeHtml(item.name)}</span><b>${escapeHtml(money(item.lineTotal, settings.currencySymbol))}</b></div>
      ${meta.length ? `<div class="item-meta">${escapeHtml(meta.join(' | '))}</div>` : ''}
      <div class="item-grid">
        <span>${escapeHtml(item.quantityText)}</span>
        <span>${showField(rawSettings, 'Unit', true) ? escapeHtml(item.unit) : ''}</span>
        <span>${escapeHtml(money(item.price, settings.currencySymbol))}</span>
        <span>${showField(rawSettings, 'GSTPercent', true) ? escapeHtml(`${item.gstRate.toFixed(2).replace(/\.00$/, '')}%`) : ''}</span>
        <strong>${escapeHtml(money(item.lineTotal, settings.currencySymbol))}</strong>
      </div>
    </div>`;
  }).join('');

  const totalsOrder = Array.isArray(rawSettings.totalsOrder) && rawSettings.totalsOrder.length
    ? rawSettings.totalsOrder
    : ['Subtotal', 'Discount', 'Tax', 'RoundOff'];
  const totalMap = {
    Subtotal: showField(rawSettings, 'Subtotal', true) ? totalRow('Subtotal', invoice.subtotal, settings) : '',
    Discount: showField(rawSettings, 'Discount', true) ? totalRow('Discount', invoice.discount, settings) : '',
    Tax: showField(rawSettings, 'Tax', true) ? totalRow('Tax', invoice.taxTotal, settings) : '',
    RoundOff: showField(rawSettings, 'RoundOff', true) ? totalRow('Round Off', invoice.roundOff, settings) : '',
    Savings: showField(rawSettings, 'Savings', false) ? totalRow('Savings', invoice.savings, settings) : ''
  };

  const footer = footerLines(invoice, rawSettings);
  const feed = settings.paperFeedAfterPrint > 0 ? `<div style="height:${settings.paperFeedAfterPrint}mm"></div>` : '';
  const taxSummary = showField(rawSettings, 'TaxSummary', false) && invoice.taxTotal
    ? `${dividerMarkup(settings)}<div class="section-title">TAX SUMMARY</div><table class="tax-summary"><thead><tr><th>GST</th><th class="num">Taxable</th>${rawSettings.gstMode === 'igst' ? '<th class="num">IGST</th>' : '<th class="num">CGST</th><th class="num">SGST</th>'}</tr></thead><tbody>${taxSummaryRows(invoice, rawSettings)}</tbody></table>`
    : '';

  return `<div class="receipt receipt-${escapeHtml(settings.receiptWidth.replace('mm', ''))}">
    <header class="receipt-header ${settings.centerHeader ? 'center' : ''}">
      ${invoice.logoUrl ? `<img class="store-logo" src="${escapeHtml(invoice.logoUrl)}" alt="" />` : ''}
      <div class="store-name ${settings.boldStoreName ? 'bold' : ''}">${escapeHtml(invoice.storeName)}</div>
      ${addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
    </header>

    ${dividerMarkup(settings)}

    <section class="invoice-info">
      ${showField(rawSettings, 'InvoiceNumber', true) ? infoRow('Invoice', invoice.invoiceNumber) : ''}
      ${showField(rawSettings, 'Date', true) ? infoRow('Date', formatDateOnly(invoice.invoiceDate)) : ''}
      ${showField(rawSettings, 'Time', true) ? infoRow('Time', formatTimeOnly(invoice.invoiceDate)) : ''}
      ${showField(rawSettings, 'Cashier', true) ? infoRow('Cashier', invoice.cashier) : ''}
      ${showField(rawSettings, 'CustomerName', true) ? infoRow('Customer', invoice.customerName) : ''}
      ${showField(rawSettings, 'CustomerMobile', true) ? infoRow('Mobile', invoice.customerMobile) : ''}
      ${showField(rawSettings, 'CustomerGST', false) ? infoRow('Cust GST', invoice.customerGst) : ''}
      ${showField(rawSettings, 'PaymentMethod', true) ? infoRow('Payment', String(invoice.paymentMethod).toUpperCase()) : ''}
    </section>

    ${dividerMarkup(settings)}

    <section class="items">
      <div class="item-grid item-head"><span>Qty</span><span>Unit</span><span>Rate</span><span>GST</span><strong>Amount</strong></div>
      ${itemRows || '<div class="empty">No items</div>'}
    </section>

    ${dividerMarkup(settings)}

    <section class="totals">
      ${totalsOrder.map((key) => totalMap[key] || '').join('')}
      ${dividerMarkup(settings, 'strong-line')}
      ${showField(rawSettings, 'GrandTotal', true) ? totalRow('GRAND TOTAL', invoice.total, settings, 'grand-total') : ''}
      ${dividerMarkup(settings, 'strong-line')}
      ${showField(rawSettings, 'Paid', true) ? totalRow('Paid', invoice.paidAmount, settings) : ''}
      ${showField(rawSettings, 'Balance', true) ? totalRow('Balance', invoice.balanceAmount, settings) : ''}
    </section>

    ${taxSummary}

    ${footer.length || rawSettings.signatureLine ? dividerMarkup(settings) : ''}
    <footer class="receipt-footer">
      ${footer.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
      ${rawSettings.signatureLine ? '<div class="signature">Signature</div>' : ''}
    </footer>
    ${feed}
  </div>`;
}

export function makeReceiptCss(rawSettings = {}, options = {}) {
  const settings = getReceiptSettings(rawSettings);
  const isA4 = settings.receiptWidth === 'A4';
  const fontStack = `"${settings.fontFamily}", "Roboto Mono", "IBM Plex Mono", "Courier New", monospace`;
  const bodyPadding = `${settings.topMargin}mm ${settings.rightMargin}mm ${settings.bottomMargin}mm ${settings.leftMargin}mm`;
  const density = settings.printDensity === 'compact' ? 0.75 : settings.printDensity === 'bold' ? 1.2 : 1;

  const pageRules = options.preview ? '' : `
    @page { size: ${isA4 ? 'A4' : `${settings.widthMm}mm auto`}; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { padding: ${bodyPadding}; font-family: ${fontStack}; font-size: ${settings.fontSize}px; line-height: ${settings.lineHeight}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  `;

  return `
    ${pageRules}
    * { box-sizing: border-box; }
    .receipt { width: ${isA4 ? '190mm' : `${settings.printableWidth}mm`}; max-width: 100%; margin: 0 auto; }
    ${options.preview ? `.receipt { padding: ${bodyPadding}; font-family: ${fontStack}; font-size: ${settings.fontSize}px; line-height: ${settings.lineHeight}; color: #000; background: #fff; }` : ''}
    .center { text-align: center; }
    .bold, b, strong { font-weight: 700; }
    .store-logo { display: block; max-width: ${settings.receiptWidth === '58mm' ? 22 : 28}mm; max-height: 18mm; object-fit: contain; margin: 0 auto 1.5mm; }
    .store-name { font-size: ${Math.round(settings.fontSize * 1.45)}px; line-height: 1.08; text-transform: uppercase; margin-bottom: 1mm; }
    .receipt-header div { margin: 0.25mm 0; overflow-wrap: anywhere; }
    .divider { width: 100%; height: 0; margin: ${2.2 * density}mm 0; border: 0; }
    .divider-solid { border-top: 1px solid #000; }
    .divider-dashed { border-top: 1px dashed #000; }
    .divider-double { border-top: 2px double #000; }
    .strong-line { margin: ${1.5 * density}mm 0; border-top-style: solid; }
    .info-row, .total-row { display: grid; grid-template-columns: minmax(17mm, auto) 1fr; gap: 2mm; align-items: baseline; min-height: ${settings.fontSize * settings.lineHeight}px; }
    .info-row span::after { content: " :"; }
    .info-row b, .total-row b { text-align: right; overflow-wrap: anywhere; }
    .items { break-inside: auto; }
    .item { padding: ${1.15 * density}mm 0; border-bottom: 1px dotted #999; break-inside: avoid; }
    .item:last-child { border-bottom: 0; }
    .item-title { display: grid; grid-template-columns: 1fr auto; gap: 2mm; font-weight: 700; }
    .item-title span { overflow-wrap: anywhere; word-break: break-word; }
    .item-meta { font-size: ${Math.max(settings.fontSize - 2, 8)}px; margin-top: 0.5mm; color: #111; overflow-wrap: anywhere; }
    .item-grid { display: grid; grid-template-columns: 11mm 10mm 1fr 10mm 1.15fr; gap: 1mm; align-items: baseline; margin-top: 0.75mm; }
    .receipt-58 .item-grid { grid-template-columns: 8mm 8mm 1fr 8mm 1.1fr; gap: 0.75mm; }
    .item-grid > * { min-width: 0; text-align: right; white-space: nowrap; }
    .item-grid > *:first-child, .item-grid > *:nth-child(2) { text-align: left; }
    .item-head { margin: 0 0 1mm; padding-bottom: 1mm; border-bottom: 1px solid #000; font-size: ${Math.max(settings.fontSize - 1.5, 8)}px; font-weight: 700; }
    .empty { padding: 5mm 0; text-align: center; }
    .totals { break-inside: avoid; }
    .total-row { grid-template-columns: 1fr auto; margin: 0.75mm 0; }
    .grand-total { font-size: ${Math.round(settings.fontSize * 1.28)}px; line-height: 1.35; text-transform: uppercase; }
    .section-title { text-align: center; font-weight: 700; margin-bottom: 1mm; }
    .tax-summary { width: 100%; border-collapse: collapse; font-size: ${Math.max(settings.fontSize - 1.5, 8)}px; }
    .tax-summary th, .tax-summary td { padding: 0.75mm 0; text-align: left; }
    .tax-summary .num, .tax-summary th.num { text-align: right; }
    .receipt-footer { text-align: center; break-inside: avoid; }
    .receipt-footer div { margin: 1mm 0; overflow-wrap: anywhere; }
    .signature { margin-top: 8mm !important; padding-top: 1mm; border-top: 1px solid #000; text-align: right; }
    @media print {
      ${options.preview ? '' : `body { padding: ${bodyPadding}; }`}
      .receipt { box-shadow: none; }
    }
  `;
}

export function makeInvoiceHtmlFromSale(sale = {}, settings = {}) {
  const receiptSettings = getReceiptSettings(settings);
  return `<!doctype html>
<html data-paper-width="${escapeHtml(receiptSettings.receiptWidth)}">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(normalizeInvoiceSale(sale, settings).invoiceNumber)}</title>
  <style>${makeReceiptCss(settings)}</style>
</head>
<body>
  ${makeReceiptBodyHtml(sale, settings)}
</body>
</html>`;
}

function pageSizeFromHtml(html, options = {}) {
  if (options.pageSize) return options.pageSize;
  const match = String(html || '').match(/data-paper-width="([^"]+)"/);
  const width = match?.[1] || options.receiptWidth || '80mm';
  if (width === '58mm') return { width: 58000, height: 210000 };
  if (width === '72mm') return { width: 72000, height: 210000 };
  if (width === '80mm') return { width: 80000, height: 210000 };
  return undefined;
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
      ...options,
      pageSize: pageSizeFromHtml(html, options)
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
