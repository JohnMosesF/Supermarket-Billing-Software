import { currency, dateTime } from '../utils/format.js';

export function InvoicePreview({ sale, settings }) {
  if (!sale) return null;

  return (
    <div id="invoice-print" className="invoice-print mx-auto p-4 text-xs">
      <div className="text-center">
        <h2 className="text-base font-bold">{settings?.storeName || 'Supermarket'}</h2>
        <p>{settings?.address}</p>
        <p>{settings?.phone}</p>
        {settings?.gstNumber ? <p>GST: {settings.gstNumber}</p> : null}
      </div>
      <div className="my-2 border-y border-dashed border-black py-1">
        <p>Invoice: {sale.invoiceNumber}</p>
        <p>Date: {dateTime(sale.createdAt || new Date())}</p>
        <p>Customer: {sale.customerName || sale.customerMobile || 'Walk-in'}</p>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Amt</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((item) => (
            <tr key={`${item.product}-${item.name}`}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>{currency(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 border-t border-dashed border-black pt-2">
        <p className="flex justify-between"><span>Subtotal</span><span>{currency(sale.subtotal)}</span></p>
        <p className="flex justify-between"><span>Tax</span><span>{currency(sale.taxTotal)}</span></p>
        <p className="flex justify-between"><span>Discount</span><span>{currency(sale.discount)}</span></p>
        <p className="mt-1 flex justify-between text-sm font-bold"><span>Total</span><span>{currency(sale.total)}</span></p>
        <p>Payment: {sale.paymentMethod?.toUpperCase()}</p>
      </div>
      <p className="mt-3 text-center">{settings?.invoiceFooter || 'Thank you for shopping with us.'}</p>
    </div>
  );
}
