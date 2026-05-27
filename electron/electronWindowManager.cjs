const path = require('path');
const { BrowserWindow } = require('electron');

const windows = new Map();

function generateInvoiceNumber() {
  const now = Date.now();
  return `INV${String(now).slice(-6)}`;
}

function createBillingWindow({ isDev, loadUrl, opts = {} }) {
  const invoiceNo = opts.invoiceNo || generateInvoiceNumber();
  const windowId = `bill-${invoiceNo}`;

  const bw = new BrowserWindow({
    width: 1000,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: `Billing - Invoice #${invoiceNo}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const url = isDev
    ? `${loadUrl.replace(/\/$/, '')}/billing/create?invoiceNo=${encodeURIComponent(invoiceNo)}&windowId=${encodeURIComponent(windowId)}`
    : `file://${path.join(process.resourcesPath, 'client', 'dist', 'index.html')}#/billing/create?invoiceNo=${encodeURIComponent(invoiceNo)}&windowId=${encodeURIComponent(windowId)}`;

  bw.loadURL(url);
  bw.on('closed', () => windows.delete(windowId));
  bw.on('focus', () => {
    // ensure window title stays accurate
    bw.setTitle(`Billing - Invoice #${invoiceNo}`);
  });

  windows.set(windowId, { bw, invoiceNo, windowId });
  bw.show();
  bw.maximize();
  return { ok: true, windowId, invoiceNo };
}

module.exports = { createBillingWindow, windows };
