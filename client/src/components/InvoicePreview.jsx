import { currency, dateTime } from '../utils/format.js';
import { normalizeInvoiceSale } from '../utils/print.js';

export function InvoicePreview({
  sale,
  settings = {},
  state = {},
  totals = {},
  cart = []
}) {
  const invoice = normalizeInvoiceSale(
    sale || { state, totals, cart },
    settings
  );

  const cgst = invoice.taxTotal / 2;
  const sgst = invoice.taxTotal / 2;

  return (
    <div
      id="invoice-print"
      className="mx-auto bg-white p-2 text-[11px]"
      style={{
        width: '80mm',
        fontFamily: "'Noto Sans Tamil','Latha','Vijaya',monospace"
      }}
    >
      {/* Store Header */}
      <div className="text-center border-b border-black pb-2">
        <div className="text-sm font-bold uppercase">
          {invoice.storeName}
        </div>

        {invoice.storeAddress && (
          <div className="text-[10px]">{invoice.storeAddress}</div>
        )}

        {invoice.storePhone && (
          <div className="text-[10px]">
            Phone : {invoice.storePhone}
          </div>
        )}

        {invoice.gstNumber && (
          <div className="text-[10px]">
            GSTIN : {invoice.gstNumber}
          </div>
        )}
      </div>

      {/* Invoice Details */}
      <div className="py-2 border-b border-black">
        <div className="flex justify-between">
          <span>Inv No :</span>
          <span>{invoice.invoiceNumber}</span>
        </div>

        <div className="flex justify-between">
          <span>Date :</span>
          <span>{dateTime(invoice.invoiceDate)}</span>
        </div>

        <div className="mt-1">
          <div>Customer : {invoice.customerName || 'Cash Customer'}</div>

          {invoice.customerMobile && (
            <div>Mobile : {invoice.customerMobile}</div>
          )}
        </div>
      </div>

      {/* Product Table */}
      <table className="w-full text-[10px] mt-2">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left w-[8%]">#</th>
            <th className="text-left w-[42%]">PRODUCT</th>
            <th className="text-center w-[12%]">QTY</th>
            <th className="text-right w-[18%]">RATE</th>
            <th className="text-right w-[20%]">AMOUNT</th>
          </tr>
        </thead>

        <tbody>
          {invoice.items.map((item, index) => (
            <tr key={item.key}>
              <td>{index + 1}</td>

              <td className="break-words">
                {item.localName ||
                  item.productNameTamil ||
                  item.name}
              </td>

              <td className="text-center">
                {item.quantityText}
              </td>

              <td className="text-right">
                {currency(item.price)}
              </td>

              <td className="text-right font-semibold">
                {currency(item.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="border-t border-black mt-2 pt-1 text-[10px]">
        <div className="flex justify-between">
          <span>Sub Total</span>
          <span>{currency(invoice.subtotal)}</span>
        </div>

        <div className="flex justify-between">
          <span>Discount</span>
          <span>{currency(invoice.discount)}</span>
        </div>

        <div className="flex justify-between">
          <span>CGST</span>
          <span>{currency(cgst)}</span>
        </div>

        <div className="flex justify-between">
          <span>SGST</span>
          <span>{currency(sgst)}</span>
        </div>

        <div className="flex justify-between border-t border-black mt-1 pt-1 font-bold text-sm">
          <span>GRAND TOTAL</span>
          <span>{currency(invoice.total)}</span>
        </div>

        <div className="mt-1">
          Payment : {String(invoice.paymentMethod).toUpperCase()}
        </div>

        {invoice.balanceAmount > 0 && (
          <div className="font-bold">
            Due : {currency(invoice.balanceAmount)}
          </div>
        )}
      </div>

      {/* GST Summary */}
      <div className="border-t border-black mt-2 pt-1">
        <div className="text-center font-bold">
          GST BREAKUP
        </div>

        <table className="w-full text-[9px] mt-1">
          <thead>
            <tr>
              <th className="text-left">Rate</th>
              <th className="text-right">Taxable</th>
              <th className="text-right">CGST</th>
              <th className="text-right">SGST</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>GST</td>
              <td className="text-right">
                {currency(invoice.subtotal)}
              </td>
              <td className="text-right">
                {currency(cgst)}
              </td>
              <td className="text-right">
                {currency(sgst)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-black mt-2 pt-2 text-center text-[10px]">
        <div>{invoice.invoiceFooter}</div>
        <div className="mt-1 font-semibold">
          Thank You... Visit Again
        </div>
      </div>
    </div>
  );
}
