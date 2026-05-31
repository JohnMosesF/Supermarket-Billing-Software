Modern POS billing components

Overview
- `ModernPOSBilling.jsx`: Full-page POS layout (entry row, cart, summary, invoice preview).
- `BillingEntryRow.jsx`: Compact single-line entry optimized for barcode scanners and keyboard entry.
- `BillingTable.jsx`: Dense, spreadsheet-like cart table with keyboard navigation.
- `BillingSummaryPanel.jsx`: Right-side compact totals, discount and payment placeholders.
- `InvoicePreview.jsx`: Live thermal-style preview for printing.
- `KeyboardManager.js` and `POSShortcuts.js`: Global keyboard handling for POS shortcuts.

Integration
- Import and render `ModernPOSBilling` from your POS route or replace `FastBillingEntry` in `CreateBillWindow.jsx`.
  Example: import ModernPOSBilling from './billing/ModernPOSBilling.jsx' and use `<ModernPOSBilling />`.

API
- Uses existing endpoints: `GET /api/products/search?q=...` and `POST /api/bills` (via existing `billingService.js` and `api/http.js`).

Keyboard shortcuts
- `Enter`: Confirm current field / add item when in qty field.
- `Tab`: Move between fields.
- `Ctrl+F`: Focus Product Code.
- `Ctrl+S`: Save bill (hook `save` action into `KeyboardManager` if desired).
- `Ctrl+H`: Hold bill.
- `Ctrl+P`: Print preview.
- `Esc`: Clear current row.
- `Delete`: Remove selected item.

Notes
- Components use Tailwind CSS classes; ensure project builds Tailwind assets.
- This initial implementation focuses on fast keyboard workflow; integrate with existing store/state (billingStore) for persistence and multi-window behavior as needed.
