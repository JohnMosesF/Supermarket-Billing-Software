import { currency, dateTime } from '../utils/format.js';
import { normalizeInvoiceSale } from '../utils/print.js';

export function InvoicePreview({ sale, settings = {}, state = {}, totals = {}, cart = [] }) {
  const invoice = normalizeInvoiceSale(sale || { state, totals, cart }, settings);

  return (
    <div id="invoice-print" className="invoice-print mx-auto p-4 text-xs">
      <div className="text-center">
        <h2 className="text-base font-bold">{invoice.storeName}</h2>
        {invoice.storeAddress ? <p>{invoice.storeAddress}</p> : null}
        {invoice.storePhone ? <p>{invoice.storePhone}</p> : null}
        {invoice.gstNumber ? <p>GST: {invoice.gstNumber}</p> : null}
      </div>
      <div className="my-2 border-y border-dashed border-black py-1">
        <p>Invoice: {invoice.invoiceNumber}</p>
        <p>Date: {dateTime(invoice.invoiceDate)}</p>
        <p>Customer: {invoice.customerName}</p>
        {invoice.customerMobile ? <p>Mobile: {invoice.customerMobile}</p> : null}
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>GST</th>
            <th>Amt</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.key}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>{currency(item.price)}</td>
              <td>{item.gstRate}%</td>
              <td>{currency(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 border-t border-dashed border-black pt-2">
        <p className="flex justify-between"><span>Subtotal</span><span>{currency(invoice.subtotal)}</span></p>
        <p className="flex justify-between"><span>Discount</span><span>{currency(invoice.discount)}</span></p>
        <p className="flex justify-between"><span>Tax</span><span>{currency(invoice.taxTotal)}</span></p>
        <p className="mt-1 flex justify-between text-sm font-bold"><span>Grand Total</span><span>{currency(invoice.total)}</span></p>
        <p>Payment: {String(invoice.paymentMethod).toUpperCase()}</p>
        {invoice.balanceAmount > 0 ? <p>Due: {currency(invoice.balanceAmount)}</p> : null}
      </div>
      <p className="mt-3 text-center">{invoice.invoiceFooter}</p>
    </div>
  );
}
