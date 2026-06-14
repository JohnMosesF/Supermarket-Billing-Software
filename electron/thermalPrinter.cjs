function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatInvoiceHTML(meta, bodyHtml) {
  if (typeof bodyHtml === 'string' && /<html[\s>]/i.test(bodyHtml)) {
    return bodyHtml;
  }

  const storeName = escapeHtml(meta.storeName || 'StoreDesk POS');
  const gst = escapeHtml(meta.gst || '');
  const invoice = escapeHtml(meta.invoiceNo || '');
  const date = escapeHtml(meta.date || new Date().toLocaleString());

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:monospace;font-size:12px;margin:0;padding:6px;color:#000}
    .wrapper{width:80mm}
    .center{text-align:center}
    .bold{font-weight:700}
    table{width:100%;border-collapse:collapse}
    .line{border-top:1px dashed #000;margin:6px 0}
  </style></head><body>
  <div class="wrapper">
    <div class="center bold">${storeName}</div>
    <div class="center">GST: ${gst}</div>
    <div class="center">Invoice: ${invoice}</div>
    <div class="center">${date}</div>
    <div class="line"></div>
    ${bodyHtml || '<div class="center">No invoice data</div>'}
    <div class="line"></div>
    <div class="center">Thank you for shopping!</div>
  </div>
  </body></html>`;
}

module.exports = { formatInvoiceHTML };
