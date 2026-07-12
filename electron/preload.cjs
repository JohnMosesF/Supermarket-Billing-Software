const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printInvoice: (invoiceHtml, options) => ipcRenderer.invoke('print-invoice', invoiceHtml, options),
  createBillingWindow: (opts) => ipcRenderer.invoke('create-billing-window', opts),
  setWindowCartState: (hasItems) => ipcRenderer.send('window-cart-state', !!hasItems),
  sendBillingEvent: (channel, payload) => ipcRenderer.send(channel, payload),
  onBillingEvent: (channel, cb) => {
    const listener = (e, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onForceLogout: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('electron-force-logout', listener);
    return () => ipcRenderer.removeListener('electron-force-logout', listener);
  },
  platform: process.platform
});

