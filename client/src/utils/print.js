export async function printInvoice(invoiceHtml) {
  if (window.electronAPI?.printInvoice) {
    return window.electronAPI.printInvoice(invoiceHtml);
  }
  window.print();
  return { ok: true };
}
