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
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    title: `Billing - Invoice #${invoiceNo}`,
    autoHideMenuBar: true,
    maximizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = isDev
    ? `${loadUrl.replace(/\/$/, '')}/billing-window?invoiceNo=${encodeURIComponent(invoiceNo)}&windowId=${encodeURIComponent(windowId)}`
    : `file://${path.join(process.resourcesPath, 'client', 'dist', 'index.html')}#/billing-window?invoiceNo=${encodeURIComponent(invoiceNo)}&windowId=${encodeURIComponent(windowId)}`;

  bw.loadURL(url);
  bw.on('closed', () => windows.delete(windowId));
  bw.on('focus', () => bw.setTitle(`Billing - Invoice #${invoiceNo}`));

  windows.set(windowId, { bw, invoiceNo, windowId });
  return { ok: true, windowId, invoiceNo };
}

module.exports = { createBillingWindow, windows };
