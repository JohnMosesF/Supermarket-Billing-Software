import Bill from '../models/Bill.js';
import { Purchase } from '../models/Purchase.js';
import { Customer } from '../models/Customer.js';
import { Supplier } from '../models/Supplier.js';
import { SalesReturn } from '../models/SalesReturn.js';
import { PurchaseReturn } from '../models/PurchaseReturn.js';
import { CustomerReceipt } from '../models/CustomerReceipt.js';
import { SupplierPayment } from '../models/SupplierPayment.js';
import { CustomerLedger } from '../models/CustomerLedger.js';
import { SupplierLedger } from '../models/SupplierLedger.js';
import { OutstandingSnapshot } from '../models/OutstandingSnapshot.js';
import { DayBookEntry } from '../models/DayBookEntry.js';

const dateOf = (value, fallback) => new Date(value || fallback || Date.now());
const byDate = (a, b) => a.transactionDate - b.transactionDate || a.sourceKey.localeCompare(b.sourceKey);

export async function reconcileCustomerAccounting(customerId) {
  if (!customerId) return null;
  const [customer, bills, returns, receipts] = await Promise.all([
    Customer.findById(customerId),
    Bill.find({ customer: customerId, status: { $ne: 'Cancelled' } }).lean(),
    SalesReturn.find({ customer: customerId, status: 'Completed' }).lean(),
    CustomerReceipt.find({ customer: customerId, status: 'Posted' }).lean()
  ]);
  if (!customer) return null;
  const allocatedByBill = new Map();
  receipts.forEach((receipt) => receipt.allocations.forEach((allocation) => allocatedByBill.set(String(allocation.bill), (allocatedByBill.get(String(allocation.bill)) || 0) + Number(allocation.amount || 0))));
  const entries = [];
  bills.forEach((bill) => {
    const initialPaid = Math.max(Number(bill.paidAmount || 0) - (allocatedByBill.get(String(bill._id)) || 0), 0);
    entries.push({ customer: customerId, referenceId: bill._id, sourceModel: 'Bill', sourceKey: `Bill:${bill._id}:invoice`, transactionType: 'Sales Invoice', documentNo: bill.invoiceNo, narration: `Invoice ${bill.invoiceNo}`, amount: bill.total, debit: bill.total, credit: 0, createdBy: bill.staff, transactionDate: dateOf(bill.invoiceAt, bill.createdAt) });
    if (initialPaid > 0) entries.push({ customer: customerId, referenceId: bill._id, sourceModel: 'Bill', sourceKey: `Bill:${bill._id}:initial-payment`, transactionType: 'Invoice Payment', documentNo: bill.invoiceNo, narration: `${bill.paymentMethod} received with invoice`, amount: initialPaid, debit: 0, credit: initialPaid, createdBy: bill.staff, transactionDate: dateOf(bill.invoiceAt, bill.createdAt) });
    if (Number(bill.discount || 0) > 0) entries.push({ customer: customerId, referenceId: bill._id, sourceModel: 'Bill', sourceKey: `Bill:${bill._id}:discount`, transactionType: 'Discount', documentNo: bill.invoiceNo, narration: 'Invoice discount (included in invoice total)', amount: bill.discount, debit: 0, credit: 0, createdBy: bill.staff, transactionDate: dateOf(bill.invoiceAt, bill.createdAt) });
  });
  returns.forEach((entry) => entries.push({ customer: customerId, referenceId: entry._id, sourceModel: 'SalesReturn', sourceKey: `SalesReturn:${entry._id}`, transactionType: 'Sales Return', documentNo: entry.returnNo, narration: `Return against ${entry.originalInvoiceNo}`, amount: entry.refundAmount, debit: 0, credit: entry.originalPaymentMethod === 'Credit' ? entry.refundAmount : 0, createdBy: entry.processedBy, transactionDate: dateOf(entry.returnDate, entry.createdAt) }));
  receipts.forEach((receipt) => entries.push({ customer: customerId, referenceId: receipt._id, sourceModel: 'CustomerReceipt', sourceKey: `CustomerReceipt:${receipt._id}`, transactionType: receipt.allocationType === 'Advance' ? 'Advance Receipt' : 'Receipt', documentNo: receipt.receiptNo, narration: receipt.notes || receipt.paymentMethod, amount: receipt.amount, debit: 0, credit: receipt.amount, createdBy: receipt.createdBy, transactionDate: dateOf(receipt.receiptDate, receipt.createdAt) }));
  entries.sort(byDate);
  let balance = 0;
  entries.forEach((entry) => { balance += Number(entry.debit || 0) - Number(entry.credit || 0); entry.balance = balance; });
  if (entries.length) {
    await CustomerLedger.bulkWrite(entries.map((entry) => ({ updateOne: { filter: { sourceKey: entry.sourceKey }, update: { $set: entry }, upsert: true } })));
    await CustomerLedger.deleteMany({ customer: customerId, sourceKey: { $nin: entries.map((entry) => entry.sourceKey) } });
  } else await CustomerLedger.deleteMany({ customer: customerId });
  const totalSales = bills.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
  const totalReturns = returns.filter((entry) => entry.originalPaymentMethod === 'Credit').reduce((sum, entry) => sum + Number(entry.refundAmount || 0), 0);
  const totalPaid = entries.filter((entry) => ['Invoice Payment', 'Receipt', 'Advance Receipt'].includes(entry.transactionType)).reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
  customer.totalSpent = Math.max(totalSales - returns.reduce((sum, entry) => sum + Number(entry.refundAmount || 0), 0), 0);
  customer.totalPaid = totalPaid;
  customer.totalPaidAmount = totalPaid;
  customer.totalCredit = Math.max(bills.filter((bill) => bill.paymentMethod === 'Credit').reduce((sum, bill) => sum + Number(bill.total || 0), 0) - totalReturns, 0);
  customer.totalCreditSales = customer.totalCredit;
  customer.loyaltyPoints = Math.floor(customer.totalSpent / 100);
  customer.outstandingBalance = Math.max(balance, 0);
  customer.creditBalance = Math.max(balance, 0);
  customer.lastPaymentDate = receipts.length ? new Date(Math.max(...receipts.map((entry) => dateOf(entry.receiptDate, entry.createdAt).getTime()))) : customer.lastPaymentDate;
  await customer.save();
  await OutstandingSnapshot.create({ partyType: 'Customer', party: customerId, balance: Math.max(balance, 0), asOf: new Date(), metadata: { totalSales, totalReturns } });
  return { balance, entries };
}

export async function reconcileSupplierAccounting(supplierId) {
  if (!supplierId) return null;
  const [supplier, purchases, returns, payments] = await Promise.all([
    Supplier.findById(supplierId), Purchase.find({ supplier: supplierId, active: true }).lean(),
    PurchaseReturn.find({ supplier: supplierId, status: 'Completed' }).lean(), SupplierPayment.find({ supplier: supplierId, status: 'Posted' }).lean()
  ]);
  if (!supplier) return null;
  const allocatedByPurchase = new Map();
  payments.forEach((payment) => payment.allocations.forEach((allocation) => allocatedByPurchase.set(String(allocation.purchase), (allocatedByPurchase.get(String(allocation.purchase)) || 0) + Number(allocation.amount || 0))));
  const entries = [];
  purchases.forEach((purchase) => {
    const initialPaid = Math.max(Number(purchase.paidAmount || 0) - (allocatedByPurchase.get(String(purchase._id)) || 0), 0);
    entries.push({ supplier: supplierId, referenceId: purchase._id, sourceModel: 'Purchase', sourceKey: `Purchase:${purchase._id}`, transactionType: 'Purchase', documentNo: purchase.invoiceNumber, narration: `Purchase ${purchase.invoiceNumber || purchase._id}`, amount: purchase.total, debit: purchase.total, credit: 0, createdBy: purchase.user, transactionDate: dateOf(purchase.purchaseDate, purchase.createdAt) });
    if (initialPaid > 0) entries.push({ supplier: supplierId, referenceId: purchase._id, sourceModel: 'Purchase', sourceKey: `Purchase:${purchase._id}:initial-payment`, transactionType: 'Purchase Payment', documentNo: purchase.invoiceNumber, narration: 'Payment recorded with purchase', amount: initialPaid, debit: 0, credit: initialPaid, createdBy: purchase.user, transactionDate: dateOf(purchase.purchaseDate, purchase.createdAt) });
  });
  returns.forEach((entry) => entries.push({ supplier: supplierId, referenceId: entry._id, sourceModel: 'PurchaseReturn', sourceKey: `PurchaseReturn:${entry._id}`, transactionType: 'Purchase Return', documentNo: entry.returnNo, narration: `Return against ${entry.originalInvoiceNo}`, amount: entry.returnAmount, debit: 0, credit: entry.returnAmount, createdBy: entry.processedBy, transactionDate: dateOf(entry.returnDate, entry.createdAt) }));
  payments.forEach((entry) => entries.push({ supplier: supplierId, referenceId: entry._id, sourceModel: 'SupplierPayment', sourceKey: `SupplierPayment:${entry._id}`, transactionType: 'Supplier Payment', documentNo: entry.voucherNo, narration: entry.notes || entry.paymentMethod, amount: entry.amount, debit: 0, credit: entry.amount, createdBy: entry.createdBy, transactionDate: dateOf(entry.paymentDate, entry.createdAt) }));
  entries.sort(byDate); let balance = 0; entries.forEach((entry) => { balance += Number(entry.debit || 0) - Number(entry.credit || 0); entry.balance = balance; });
  if (entries.length) {
    await SupplierLedger.bulkWrite(entries.map((entry) => ({ updateOne: { filter: { sourceKey: entry.sourceKey }, update: { $set: entry }, upsert: true } })));
    await SupplierLedger.deleteMany({ supplier: supplierId, sourceKey: { $nin: entries.map((entry) => entry.sourceKey) } });
  } else await SupplierLedger.deleteMany({ supplier: supplierId });
  supplier.totalPurchases = Math.max(purchases.reduce((sum, entry) => sum + Number(entry.total || 0), 0) - returns.reduce((sum, entry) => sum + Number(entry.returnAmount || 0), 0), 0);
  supplier.totalReturns = returns.reduce((sum, entry) => sum + Number(entry.returnAmount || 0), 0);
  supplier.totalPayments = entries.filter((entry) => ['Purchase Payment', 'Supplier Payment'].includes(entry.transactionType)).reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
  supplier.outstandingBalance = Math.max(balance, 0);
  supplier.lastPaymentDate = payments.length ? new Date(Math.max(...payments.map((entry) => dateOf(entry.paymentDate, entry.createdAt).getTime()))) : supplier.lastPaymentDate;
  supplier.lastPurchaseDate = purchases.length ? new Date(Math.max(...purchases.map((entry) => dateOf(entry.purchaseDate, entry.createdAt).getTime()))) : supplier.lastPurchaseDate;
  await supplier.save();
  await OutstandingSnapshot.create({ partyType: 'Supplier', party: supplierId, balance: Math.max(balance, 0), asOf: new Date() });
  return { balance, entries };
}

export async function rebuildDayBook() {
  const [bills, salesReturns, purchases, purchaseReturns, receipts, payments] = await Promise.all([Bill.find({ status: { $ne: 'Cancelled' } }).lean(), SalesReturn.find({ status: 'Completed' }).lean(), Purchase.find({ active: true }).lean(), PurchaseReturn.find({ status: 'Completed' }).lean(), CustomerReceipt.find({ status: 'Posted' }).lean(), SupplierPayment.find({ status: 'Posted' }).lean()]);
  const entries = [];
  bills.forEach((entry) => entries.push({ referenceId: entry._id, sourceModel: 'Bill', sourceKey: `Bill:${entry._id}`, transactionType: 'Sales', documentNo: entry.invoiceNo, narration: entry.customerName, cashIn: entry.paymentMethod === 'Cash' ? entry.paidAmount : 0, cashOut: 0, amount: entry.total, createdBy: entry.staff, transactionDate: dateOf(entry.invoiceAt, entry.createdAt) }));
  salesReturns.forEach((entry) => entries.push({ referenceId: entry._id, sourceModel: 'SalesReturn', sourceKey: `SalesReturn:${entry._id}`, transactionType: 'Sales Return', documentNo: entry.returnNo, narration: entry.customerName, cashIn: 0, cashOut: entry.refundMethod === 'Cash' ? entry.refundAmount : 0, amount: entry.refundAmount, createdBy: entry.processedBy, transactionDate: dateOf(entry.returnDate, entry.createdAt) }));
  purchases.forEach((entry) => entries.push({ referenceId: entry._id, sourceModel: 'Purchase', sourceKey: `Purchase:${entry._id}`, transactionType: 'Purchase', documentNo: entry.invoiceNumber, cashIn: 0, cashOut: entry.paidAmount, amount: entry.total, createdBy: entry.user, transactionDate: dateOf(entry.purchaseDate, entry.createdAt) }));
  purchaseReturns.forEach((entry) => entries.push({ referenceId: entry._id, sourceModel: 'PurchaseReturn', sourceKey: `PurchaseReturn:${entry._id}`, transactionType: 'Purchase Return', documentNo: entry.returnNo, cashIn: entry.returnAmount, cashOut: 0, amount: entry.returnAmount, createdBy: entry.processedBy, transactionDate: dateOf(entry.returnDate, entry.createdAt) }));
  receipts.forEach((entry) => entries.push({ referenceId: entry._id, sourceModel: 'CustomerReceipt', sourceKey: `CustomerReceipt:${entry._id}`, transactionType: 'Receipt', documentNo: entry.receiptNo, cashIn: entry.paymentMethod === 'Cash' ? entry.amount : 0, cashOut: 0, amount: entry.amount, createdBy: entry.createdBy, transactionDate: dateOf(entry.receiptDate, entry.createdAt) }));
  payments.forEach((entry) => entries.push({ referenceId: entry._id, sourceModel: 'SupplierPayment', sourceKey: `SupplierPayment:${entry._id}`, transactionType: 'Supplier Payment', documentNo: entry.voucherNo, cashIn: 0, cashOut: entry.paymentMethod === 'Cash' ? entry.amount : 0, amount: entry.amount, createdBy: entry.createdBy, transactionDate: dateOf(entry.paymentDate, entry.createdAt) }));
  if (entries.length) {
    await DayBookEntry.bulkWrite(entries.map((entry) => ({ updateOne: { filter: { sourceKey: entry.sourceKey }, update: { $set: entry }, upsert: true } })));
    await DayBookEntry.deleteMany({ sourceKey: { $nin: entries.map((entry) => entry.sourceKey) } });
  } else await DayBookEntry.deleteMany({});
  return entries;
}
