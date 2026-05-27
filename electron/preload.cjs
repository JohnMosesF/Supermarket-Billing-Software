const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printInvoice: (invoiceHtml) => ipcRenderer.invoke('print-invoice', invoiceHtml),
  platform: process.platform
});
