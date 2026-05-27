const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printInvoice: (invoiceHtml, options) => ipcRenderer.invoke('print-invoice', invoiceHtml, options),
  createBillingWindow: (opts) => ipcRenderer.invoke('create-billing-window', opts),
  sendBillingEvent: (channel, payload) => ipcRenderer.send(channel, payload),
  onBillingEvent: (channel, cb) => ipcRenderer.on(channel, (e, data) => cb(data)),
  platform: process.platform
});
