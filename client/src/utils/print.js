import { normalizeBillItem } from './normalizeBillItem.js';

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

function formatQuantityWithUnit(quantityText, unit) {
  const normalizedUnit = String(unit || 'pcs').trim();
  return normalizedUnit ? `${quantityText} ${normalizedUnit}` : quantityText;
}

function money(value, symbol = '₹') {
  const amount = number(value, 0);
  const sign = amount < 0 ? '-' : '';
  return `${sign}${symbol}${Math.abs(amount).toFixed(2)}`;
}

function amountToWords(value) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDigits = (num) => (num < 20 ? ones[num] : `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ''}`);
  const words = (num) => {
    if (num <= 0) return '';
    if (num < 100) return twoDigits(num);
    if (num < 1000) return `${ones[Math.floor(num / 100)]} Hundred${num % 100 ? ` ${words(num % 100)}` : ''}`;
    if (num < 100000) return `${words(Math.floor(num / 1000))} Thousand${num % 1000 ? ` ${words(num % 1000)}` : ''}`;
    if (num < 10000000) return `${words(Math.floor(num / 100000))} Lakh${num % 100000 ? ` ${words(num % 100000)}` : ''}`;
    return `${words(Math.floor(num / 10000000))} Crore${num % 10000000 ? ` ${words(num % 10000000)}` : ''}`;
  };
  const amount = number(value, 0);
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  return `${words(rupees) || 'Zero'} Rupees${paise ? ` and ${words(paise)} Paise` : ''} Only`;
}

function cleanLines(lines) {
  return lines.map((line) => String(line || '').trim()).filter(Boolean);
}

function normalizeCurrencySymbol(value, fallback = '₹') {
  const symbol = String(value || '').trim();
  if (!symbol || symbol === 'â‚¹' || symbol === '&#8377;') return fallback;
  return symbol;
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
    currencySymbol: normalizeCurrencySymbol(settings.currencySymbol, settings.currency === 'INR' || !settings.currency ? '₹' : settings.currency)
  };
}

export function normalizeInvoiceSale(input = {}, settings = {}) {
  const raw = input.sale || input;
  const state = raw.state || {};
  const totals = raw.totals || {};
  const cart = raw.cart || state.cart || raw.items || [];

  const items = cart.map((item, index) => {
    const normalized = normalizeBillItem(item);
    const { quantity, price, discount, taxableAmount: taxable, gstAmount, netAmount: lineTotal } = normalized;

    return {
      key: normalized.mongoId || normalized.productId || normalized.sku || index,
      name: normalized.productName || 'Item',
      localName: normalized.localName,
      displayName: getItemDisplayName(normalized, settings),
      sku: normalized.sku,
      productId: normalized.productId,
      productCode: normalized.sku,
      hsn: normalized.hsnCode,
      quantity,
      unit: normalized.unit,
      quantityText: formatQuantity(quantity),
      price,
      gstRate: normalized.gstRate,
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
  const paidAmount = number(raw.paidAmount ?? raw.amountPaid ?? raw.paid, total);
  const balanceAmount = Math.max(total - paidAmount, 0);
  const paymentDetails = Array.isArray(raw.paymentDetails)
    ? raw.paymentDetails.map((entry) => ({
      method: entry.method || entry.paymentMethod || '',
      amount: number(entry.amount, 0),
      reference: entry.reference || ''
    })).filter((entry) => entry.amount > 0)
    : [];

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
    paymentDetails,
    paidAmount,
    balanceAmount,
    amountInWords: raw.amountInWords || amountToWords(total),
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

function getItemDisplayName(item, settings = {}) {
  const language = String(settings.invoiceLanguage || '').trim().toLowerCase();
  if (language === 'local language' || language === 'local') return item.localName || item.productName || item.name || 'Item';
  return item.productName || item.name || 'Item';
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

  const itemRows = invoice.items.map((item) => {
    const hsnText = item.hsn ? ` HSN:${item.hsn}` : '';
    return `<div class="item-row">
      <span class="item-rate">${escapeHtml(money(item.price, settings.currencySymbol))}</span>
      <span class="item-name">${escapeHtml(`${item.displayName || item.name || 'Item'}${hsnText}`)}</span>
      <span class="item-qty">${escapeHtml(formatQuantityWithUnit(item.quantityText, item.unit))}</span>
      <span class="item-amount">${escapeHtml(money(item.lineTotal, settings.currencySymbol))}</span>
    </div>`;
  }).join('');
  const totalQty = invoice.items.reduce((sum, item) => sum + number(item.quantity, 0), 0);
  const itemSummary = `<div class="summary-divider"></div><div class="item-summary"><span>Items : ${escapeHtml(formatQuantity(invoice.items.length))}</span><span>Qty : ${escapeHtml(formatQuantity(totalQty))}</span></div>`;
  const itemHeader = `<div class="item-row item-header">
      <span class="item-rate">Rate</span>
      <span class="item-name">Product</span>
      <span class="item-qty">Qty</span>
      <span class="item-amount">Amount</span>
    </div>`;

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
  const amountWords = showField(rawSettings, 'AmountInWords', true)
    ? `<div class="amount-words"><b>Amount in words:</b> ${escapeHtml(invoice.amountInWords)}</div>`
    : '';
  const splitPaymentRows = invoice.paymentDetails.length > 1
    ? `${dividerMarkup(settings)}<div class="section-title">PAYMENT SPLIT</div>${invoice.paymentDetails.map((entry) => infoRow(String(entry.method).toUpperCase(), money(entry.amount, settings.currencySymbol))).join('')}`
    : '';
  const qrPlaceholder = rawSettings.showQrPlaceholder === false ? '' : '<div class="qr-placeholder">QR</div>';

  return `<div class="receipt receipt-${escapeHtml(settings.receiptWidth.replace('mm', ''))}">
    <header class="receipt-header ${settings.centerHeader ? 'center' : ''}">
      ${invoice.logoUrl ? `<img class="store-logo" src="${escapeHtml(invoice.logoUrl)}" alt="" />` : ''}
      <div class="store-name ${settings.boldStoreName ? 'bold' : ''}">${escapeHtml(invoice.storeName)}</div>
      ${addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
    </header>

    ${dividerMarkup(settings)}

    <section class="invoice-info">
      ${showField(rawSettings, 'InvoiceNumber', true) ? infoRow('Invoice', invoice.invoiceNumber) : ''}
      ${showField(rawSettings, 'Date', true) || showField(rawSettings, 'Time', true) ? ` <div class="date-time-row">
      ${showField(rawSettings, 'Date', true) ? `<span>Date : ${escapeHtml(formatDateOnly(invoice.invoiceDate))}</span>` : '<span></span>' }
      ${showField(rawSettings, 'Time', true) ? `<span>Time : ${escapeHtml(formatTimeOnly(invoice.invoiceDate))}</span>` : ''} </div> ` : '' }
      ${showField(rawSettings, 'Cashier', true) ? infoRow('Cashier', invoice.cashier) : ''}
      ${showField(rawSettings, 'CustomerName', true) ? infoRow('Customer', invoice.customerName) : ''}
      ${showField(rawSettings, 'CustomerMobile', true) ? infoRow('Mobile', invoice.customerMobile) : ''}
      ${showField(rawSettings, 'CustomerGST', false) ? infoRow('Cust GST', invoice.customerGst) : ''}
      ${showField(rawSettings, 'PaymentMethod', true) ? infoRow('Payment', String(invoice.paymentMethod).toUpperCase()) : ''}
    </section>

    ${dividerMarkup(settings)}

    <section class="items">
      ${itemHeader}
      ${itemRows || '<div class="empty">No items</div>'}
    </section>

    ${itemSummary}

    ${dividerMarkup(settings)}

    <section class="totals">
      ${totalsOrder.map((key) => totalMap[key] || '').join('')}
      ${dividerMarkup(settings, 'strong-line')}
      ${showField(rawSettings, 'GrandTotal', true) ? totalRow('GRAND TOTAL', invoice.total, settings, 'grand-total') : ''}
      ${dividerMarkup(settings, 'strong-line')}
      ${showField(rawSettings, 'Paid', true) ? totalRow('Paid', invoice.paidAmount, settings) : ''}
      ${showField(rawSettings, 'Balance', true) ? totalRow('BALANCE', invoice.balanceAmount, settings, 'grand-total') : ''}
    </section>

    ${amountWords}
    ${splitPaymentRows}
    ${taxSummary}
    ${qrPlaceholder}

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
    .item-row { display: grid; grid-template-columns: 16% 48% 16% 20%; column-gap: 0; width: 100%; align-items: center; min-height: ${settings.fontSize * settings.lineHeight}px; padding: ${0.45 * density}mm 0; break-inside: avoid; page-break-inside: avoid; }
    .item-header { padding-top: 0; padding-bottom: 0.9mm; font-size: ${Math.max(settings.fontSize - 1, 8)}px; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #000; margin-bottom: 0.8mm; }
    .item-row > span { display: block; min-width: 0; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: ${settings.lineHeight}; }
    .item-rate { padding-right: 0.8mm; text-align: left; }
    .item-name { padding-right: 0.8mm; font-weight: 600; }
    .item-qty { padding-right: 0.8mm; text-align: right; }
    .item-amount { text-align: right; }
    .item-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; text-align: left; padding: 0.5mm 0; font-weight: 700; }
    .item-summary span:last-child { text-align: right; }
    .summary-divider { width: 100%; height: 0; margin: 1mm 0; border-top: 1px dashed #000; }
    .empty { padding: 5mm 0; text-align: center; }
    .totals { break-inside: avoid; }
    .total-row { grid-template-columns: 1fr auto; margin: 0.75mm 0; }
    .grand-total { font-size: ${Math.round(settings.fontSize * 1.28)}px; font-weight: 700; line-height: 1.35; text-transform: uppercase; }
    .section-title { text-align: center; font-weight: 700; margin-bottom: 1mm; }
    .tax-summary { width: 100%; border-collapse: collapse; font-size: ${Math.max(settings.fontSize - 1.5, 8)}px; }
    .tax-summary th, .tax-summary td { padding: 0.75mm 0; text-align: left; }
    .tax-summary .num, .tax-summary th.num { text-align: right; }
    .amount-words { margin: 1.5mm 0; font-size: ${Math.max(settings.fontSize - 1, 8)}px; overflow-wrap: anywhere; }
    .qr-placeholder { width: 18mm; height: 18mm; border: 1px dashed #000; margin: 2mm auto; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: ${Math.max(settings.fontSize - 2, 8)}px; }
    .receipt-footer { text-align: center; break-inside: avoid; }
    .receipt-footer div { margin: 1mm 0; overflow-wrap: anywhere; }
    .signature { margin-top: 8mm !important; padding-top: 1mm; border-top: 1px solid #000; text-align: right; }
    .date-time-row{
        display:flex;
        justify-content:space-between;
        align-items:center;
        width:100%;
        margin:0.5mm 0;
        font-weight:600;
    }

    .date-time-row span:first-child{
        text-align:left;
    }

    .date-time-row span:last-child{
        text-align:right;
    }
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
