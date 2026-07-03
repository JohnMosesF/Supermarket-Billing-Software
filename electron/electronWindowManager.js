const path = require('path');
const { BrowserWindow, dialog } = require('electron');
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

  bw.__hasCartItems = false;
  bw.__closeConfirmed = false;

  const url = isDev
    ? `${loadUrl.replace(/\/$/, '')}/billing-window?invoiceNo=${encodeURIComponent(invoiceNo)}&windowId=${encodeURIComponent(windowId)}`
    : `file://${path.join(process.resourcesPath, 'client', 'dist', 'index.html')}#/billing-window?invoiceNo=${encodeURIComponent(invoiceNo)}&windowId=${encodeURIComponent(windowId)}`;

  bw.loadURL(url);

  const { ipcMain } = require("electron");

  console.log("Listening for", `billing-cart-state-${windowId}`);

  ipcMain.on(`billing-cart-state-${windowId}`, (event, hasItems) => {
      console.log("EVENT RECEIVED", hasItems);

      bw.__hasCartItems = !!hasItems;
  });
  
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

  bw.on('close', async (e) => {
    if (bw.__closeConfirmed || !bw.__hasCartItems) return;

    e.preventDefault();

    const result = await dialog.showMessageBox(bw, {
      type: 'warning',
      buttons: ['Cancel', 'Close Bill'],
      defaultId: 0,
      cancelId: 0,
      title: 'Unsaved Bill',
      message: 'There are items in the cart.',
      detail: 'Closing this bill will lose all items.'
    });

    if (result.response === 1) {
      bw.__closeConfirmed = true;
      bw.destroy();
    }

    console.log(
        "Closing...",
        bw.__hasCartItems,
        bw.__closeConfirmed
    );
  });

  bw.on('closed', () => windows.delete(windowId));
  bw.on('focus', () => bw.setTitle(`Billing - Invoice #${invoiceNo}`));

  windows.set(windowId, { bw, invoiceNo, windowId });
  return { ok: true, windowId, invoiceNo };
}

module.exports = { createBillingWindow, windows };
