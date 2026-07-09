import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReceiptBodyHtml, makeReceiptCss } from '../../client/src/utils/print.js';

test('invoice renderer uses the configured language and shows item totals', () => {
  const html = makeReceiptBodyHtml({
    invoiceNumber: 'INV1001',
    invoiceDate: '2026-07-08T10:00:00.000Z',
    customerName: 'John Doe',
    paymentMethod: 'credit',
    paidAmount: 1000,
    balanceAmount: 1550,
    items: [
      {
        productName: 'PP BAGS',
        localName: 'பிபி பைகள்',
        quantity: 1,
        price: 210,
        gstRate: 0,
        discount: 0,
        lineTotal: 210,
        unit: 'pcs'
      },
      {
        productName: 'Rice',
        localName: 'அரிசி',
        quantity: 2,
        price: 150,
        gstRate: 0,
        discount: 0,
        lineTotal: 300,
        unit: 'kg'
      }
    ],
    subtotal: 510,
    taxTotal: 0,
    discount: 0,
    roundOff: 0,
    total: 510
  }, {
    invoiceLanguage: 'Local Language',
    receiptWidth: '80mm',
    showDividers: false,
    showInvoiceNumber: true,
    showDate: true,
    showCustomerName: true,
    showPaymentMethod: true,
    showUnit: true,
    showGSTPercent: true,
    showSubtotal: true,
    showDiscount: true,
    showTax: true,
    showRoundOff: true,
    showGrandTotal: true,
    showPaid: true,
    showBalance: true,
    currencySymbol: '₹'
  });

  assert.match(html, /Items : 2/);
  assert.match(html, /Qty : 3/);
  assert.match(html, /1 pcs/);
  assert.match(html, /2 kg/);
  assert.match(html, /பிபி பைகள்/);
  assert.doesNotMatch(html, /\b1\.\s/);
});

test('invoice renderer fixes item columns for thermal receipts', () => {
  const css = makeReceiptCss({ receiptWidth: '80mm' });

  assert.match(css, /\.item-row \{[^}]*grid-template-columns: 16% 48% 16% 20%/);
  assert.match(css, /\.item-row > span \{[^}]*white-space: nowrap/);
  assert.match(css, /\.item-row > span \{[^}]*overflow: hidden/);
  assert.match(css, /\.item-row > span \{[^}]*text-overflow: ellipsis/);
  assert.doesNotMatch(css, /\.item-name \{[^}]*overflow-wrap: anywhere/);
});
