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
  // If caller passed resume data, send it to the billing window once it's ready
  if (opts && opts.resumeBill) {
    bw.webContents.once('did-finish-load', () => {
      try {
        bw.webContents.send('resume-bill', opts.resumeBill);
      } catch (err) {
        console.error('Failed to send resume-bill to billing window', err);
      }
    });
  }
  bw.on('closed', () => windows.delete(windowId));
  bw.on('focus', () => bw.setTitle(`Billing - Invoice #${invoiceNo}`));

  windows.set(windowId, { bw, invoiceNo, windowId });
  return { ok: true, windowId, invoiceNo };
}

module.exports = { createBillingWindow, windows };
