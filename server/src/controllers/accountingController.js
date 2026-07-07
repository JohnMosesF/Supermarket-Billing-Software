import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import Bill from '../models/Bill.js';
import { Purchase } from '../models/Purchase.js';
import { Customer } from '../models/Customer.js';
import { Supplier } from '../models/Supplier.js';
import { CustomerLedger } from '../models/CustomerLedger.js';
import { SupplierLedger } from '../models/SupplierLedger.js';
import { CustomerReceipt } from '../models/CustomerReceipt.js';
import { SupplierPayment } from '../models/SupplierPayment.js';
import { DayBookEntry } from '../models/DayBookEntry.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { rebuildDayBook, reconcileCustomerAccounting, reconcileSupplierAccounting } from '../services/accountingService.js';

const number = (value) => Number(value || 0);
const docNo = (prefix) => `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-7)}`;
const dateQuery = (from, to) => { const query = {}; if (from) query.$gte = new Date(from); if (to) { const date = new Date(to); date.setHours(23, 59, 59, 999); query.$lte = date; } return Object.keys(query).length ? query : null; };

async function ledgerResponse(Model, partyField, partyId, from, to, reconcile) {
  await reconcile(partyId);
  const range = dateQuery(from, to);
  const before = range?.$gte ? await Model.find({ [partyField]: partyId, transactionDate: { $lt: range.$gte } }).sort({ transactionDate: 1 }).lean() : [];
  const openingBalance = before.reduce((sum, entry) => sum + number(entry.debit) - number(entry.credit), 0);
  const query = { [partyField]: partyId, ...(range ? { transactionDate: range } : {}) };
  const entries = await Model.find(query).populate('createdBy', 'name').sort({ transactionDate: 1, _id: 1 }).lean();
  let running = openingBalance;
  entries.forEach((entry) => { running += number(entry.debit) - number(entry.credit); entry.balance = running; });
  return { openingBalance, entries, closingBalance: running };
}

export const customerLedger = asyncHandler(async (req, res) => res.json(await ledgerResponse(CustomerLedger, 'customer', req.params.id, req.query.from, req.query.to, reconcileCustomerAccounting)));
export const supplierLedger = asyncHandler(async (req, res) => res.json(await ledgerResponse(SupplierLedger, 'supplier', req.params.id, req.query.from, req.query.to, reconcileSupplierAccounting)));

export const customerOutstanding = asyncHandler(async (req, res) => {
  const customers = await Customer.find({ active: true }).lean();
  const rows = await Promise.all(customers.map(async (customer) => {
    await reconcileCustomerAccounting(customer._id);
    const [fresh, lastBill, pendingBills] = await Promise.all([Customer.findById(customer._id).lean(), Bill.findOne({ customer: customer._id }).sort({ createdAt: -1 }).lean(), Bill.countDocuments({ customer: customer._id, dueAmount: { $gt: 0 }, status: 'Completed' })]);
    return { ...fresh, lastPurchase: lastBill?.invoiceAt || lastBill?.createdAt, pendingBills };
  }));
  res.json({ customers: rows.filter((row) => number(row.outstandingBalance) > 0) });
});

export const supplierOutstanding = asyncHandler(async (req, res) => {
  const suppliers = await Supplier.find({ active: true }).lean();
  const rows = await Promise.all(suppliers.map(async (supplier) => { await reconcileSupplierAccounting(supplier._id); return Supplier.findById(supplier._id).lean(); }));
  res.json({ suppliers: rows.filter((row) => number(row.outstandingBalance) > 0) });
});

export const pendingCustomerBills = asyncHandler(async (req, res) => {
  const bills = await Bill.find({ customer: req.params.id, dueAmount: { $gt: 0 }, status: 'Completed' }).sort({ createdAt: 1 }).lean();
  res.json({ bills });
});
export const pendingSupplierPurchases = asyncHandler(async (req, res) => {
  const purchases = await Purchase.find({ supplier: req.params.id, active: true, $expr: { $gt: ['$total', { $add: ['$paidAmount', { $ifNull: ['$returnCreditAmount', 0] }] }] } }).sort({ purchaseDate: 1 }).lean();
  res.json({ purchases: purchases.map((entry) => ({ ...entry, dueAmount: Math.max(number(entry.total) - number(entry.paidAmount) - number(entry.returnCreditAmount), 0) })) });
});

export const createCustomerReceipt = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.body.customerId);
  if (!customer) throw new ApiError(404, 'Customer not found');
  const amount = number(req.body.amount);
  if (amount <= 0) throw new ApiError(400, 'Receipt amount must be greater than zero');
  let remaining = amount;
  const requested = new Map((req.body.allocations || []).map((entry) => [String(entry.billId), number(entry.amount)]));
  const bills = await Bill.find({ customer: customer._id, dueAmount: { $gt: 0 }, status: 'Completed' }).sort({ createdAt: 1 });
  const allocations = [];
  const changed = [];
  try {
    for (const bill of bills) {
      if (remaining <= 0) break;
      const wanted = requested.size ? number(requested.get(String(bill._id))) : remaining;
      if (wanted <= 0) continue;
      const applied = Math.min(wanted, remaining, number(bill.dueAmount));
      bill.paidAmount += applied; bill.dueAmount -= applied; bill.balanceAmount = bill.dueAmount; bill.paymentStatus = bill.dueAmount <= 0.001 ? 'Paid' : 'Partial';
      await bill.save(); changed.push({ bill, applied }); remaining -= applied; allocations.push({ bill: bill._id, invoiceNo: bill.invoiceNo, amount: applied });
    }
    const receipt = await CustomerReceipt.create({ receiptNo: docNo('RCT'), customer: customer._id, amount, paymentMethod: req.body.paymentMethod || 'Cash', allocationType: remaining > 0 ? (req.body.allocationType === 'Advance' ? 'Advance' : 'On Account') : 'Allocated', allocations, unallocatedAmount: remaining, notes: req.body.notes, createdBy: req.user._id, receiptDate: req.body.date || new Date() });
    await reconcileCustomerAccounting(customer._id).catch((error) => console.error('Customer ledger reconciliation failed', error));
    await rebuildDayBook().catch((error) => console.error('Day book rebuild failed', error));
    res.status(201).json({ receipt });
  } catch (error) { for (const { bill, applied } of changed.reverse()) { bill.paidAmount -= applied; bill.dueAmount += applied; bill.balanceAmount = bill.dueAmount; await bill.save(); } throw error; }
});

export const createSupplierPayment = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.body.supplierId); if (!supplier) throw new ApiError(404, 'Supplier not found');
  const amount = number(req.body.amount); if (amount <= 0) throw new ApiError(400, 'Payment amount must be greater than zero');
  let remaining = amount; const requested = new Map((req.body.allocations || []).map((entry) => [String(entry.purchaseId), number(entry.amount)]));
  const purchases = await Purchase.find({ supplier: supplier._id, active: true, $expr: { $gt: ['$total', { $add: ['$paidAmount', { $ifNull: ['$returnCreditAmount', 0] }] }] } }).sort({ purchaseDate: 1 });
  const allocations = []; const changed = [];
  try {
    for (const purchase of purchases) { if (remaining <= 0) break; const wanted = requested.size ? number(requested.get(String(purchase._id))) : remaining; if (wanted <= 0) continue; const applied = Math.min(wanted, remaining, number(purchase.total) - number(purchase.paidAmount) - number(purchase.returnCreditAmount)); purchase.paidAmount += applied; await purchase.save(); changed.push({ purchase, applied }); remaining -= applied; allocations.push({ purchase: purchase._id, invoiceNumber: purchase.invoiceNumber, amount: applied }); }
    const payment = await SupplierPayment.create({ voucherNo: docNo('PAY'), supplier: supplier._id, amount, paymentMethod: req.body.paymentMethod || 'Cash', allocations, unallocatedAmount: remaining, notes: req.body.notes, createdBy: req.user._id, paymentDate: req.body.date || new Date() });
    await reconcileSupplierAccounting(supplier._id).catch((error) => console.error('Supplier ledger reconciliation failed', error));
    await rebuildDayBook().catch((error) => console.error('Day book rebuild failed', error));
    res.status(201).json({ payment });
  } catch (error) { for (const { purchase, applied } of changed.reverse()) { purchase.paidAmount -= applied; await purchase.save(); } throw error; }
});

export const receiptRegister = asyncHandler(async (req, res) => { const range = dateQuery(req.query.from, req.query.to); const query = { status: 'Posted', ...(range ? { receiptDate: range } : {}), ...(req.query.customer ? { customer: req.query.customer } : {}), ...(req.query.paymentMethod ? { paymentMethod: req.query.paymentMethod } : {}) }; const receipts = await CustomerReceipt.find(query).populate('customer', 'name mobile').populate('createdBy', 'name').sort({ receiptDate: -1 }).lean(); res.json({ receipts, total: receipts.reduce((sum, entry) => sum + entry.amount, 0) }); });
export const paymentRegister = asyncHandler(async (req, res) => { const range = dateQuery(req.query.from, req.query.to); const query = { status: 'Posted', ...(range ? { paymentDate: range } : {}) }; const payments = await SupplierPayment.find(query).populate('supplier', 'name mobile').populate('createdBy', 'name').sort({ paymentDate: -1 }).lean(); res.json({ payments, total: payments.reduce((sum, entry) => sum + entry.amount, 0) }); });
export const dayBook = asyncHandler(async (req, res) => { await rebuildDayBook(); const range = dateQuery(req.query.from || req.query.date, req.query.to || req.query.date); const query = { ...(range ? { transactionDate: range } : {}), ...(req.query.user ? { createdBy: req.query.user } : {}) }; const entries = await DayBookEntry.find(query).populate('createdBy', 'name').sort({ transactionDate: 1 }).lean(); const opening = 0; const cashIn = entries.reduce((sum, entry) => sum + number(entry.cashIn), 0); const cashOut = entries.reduce((sum, entry) => sum + number(entry.cashOut), 0); res.json({ openingCash: opening, entries, totals: { cashIn, cashOut, closingCash: opening + cashIn - cashOut } }); });

async function exportRows(req, res, kind, format) {
  let payload;
  if (kind === 'customer-ledger') payload = await ledgerResponse(CustomerLedger, 'customer', req.params.id, req.query.from, req.query.to, reconcileCustomerAccounting);
  else if (kind === 'supplier-ledger') payload = await ledgerResponse(SupplierLedger, 'supplier', req.params.id, req.query.from, req.query.to, reconcileSupplierAccounting);
  else throw new ApiError(400, 'Unsupported export');
  const rows = payload.entries;
  if (format === 'xlsx') { const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Ledger'); sheet.columns = [{ header: 'Date', key: 'date', width: 22 }, { header: 'Type', key: 'type', width: 20 }, { header: 'Document', key: 'document', width: 18 }, { header: 'Narration', key: 'narration', width: 35 }, { header: 'Debit', key: 'debit', width: 14 }, { header: 'Credit', key: 'credit', width: 14 }, { header: 'Balance', key: 'balance', width: 14 }]; rows.forEach((entry) => sheet.addRow({ date: entry.transactionDate, type: entry.transactionType, document: entry.documentNo, narration: entry.narration, debit: entry.debit, credit: entry.credit, balance: entry.balance })); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', 'attachment; filename=ledger.xlsx'); await workbook.xlsx.write(res); return res.end(); }
  const doc = new PDFDocument({ margin: 36, size: 'A4' }); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename=ledger.pdf'); doc.pipe(res); doc.fontSize(18).text('Ledger Statement').moveDown(); doc.fontSize(10).text(`Opening Balance: ${payload.openingBalance.toFixed(2)}`); rows.forEach((entry) => doc.text(`${new Date(entry.transactionDate).toLocaleDateString()} | ${entry.transactionType} | ${entry.documentNo || '-'} | Dr ${number(entry.debit).toFixed(2)} | Cr ${number(entry.credit).toFixed(2)} | Bal ${number(entry.balance).toFixed(2)}`)); doc.moveDown().text(`Closing Balance: ${payload.closingBalance.toFixed(2)}`); doc.end();
}
export const exportCustomerLedger = (format) => asyncHandler((req, res) => exportRows(req, res, 'customer-ledger', format));
export const exportSupplierLedger = (format) => asyncHandler((req, res) => exportRows(req, res, 'supplier-ledger', format));

export const exportAccountingRegister = (kind, format) => asyncHandler(async (req, res) => {
  let rows = [];
  if (kind === 'receipts') rows = (await CustomerReceipt.find({ status: 'Posted' }).populate('customer', 'name').populate('createdBy', 'name').sort({ receiptDate: -1 }).lean()).map((entry) => ({ Number: entry.receiptNo, Date: entry.receiptDate, Party: entry.customer?.name, Method: entry.paymentMethod, Amount: entry.amount, User: entry.createdBy?.name }));
  if (kind === 'payments') rows = (await SupplierPayment.find({ status: 'Posted' }).populate('supplier', 'name').populate('createdBy', 'name').sort({ paymentDate: -1 }).lean()).map((entry) => ({ Number: entry.voucherNo, Date: entry.paymentDate, Party: entry.supplier?.name, Method: entry.paymentMethod, Amount: entry.amount, User: entry.createdBy?.name }));
  if (kind === 'customer-outstanding') rows = (await Customer.find({ outstandingBalance: { $gt: 0 } }).lean()).map((entry) => ({ Customer: entry.name, Mobile: entry.mobile, Sales: entry.totalSpent, Paid: entry.totalPaid, Balance: entry.outstandingBalance, LastPayment: entry.lastPaymentDate }));
  if (kind === 'supplier-outstanding') rows = (await Supplier.find({ outstandingBalance: { $gt: 0 } }).lean()).map((entry) => ({ Supplier: entry.name, Mobile: entry.mobile, Purchases: entry.totalPurchases, Paid: entry.totalPayments, Balance: entry.outstandingBalance, LastPayment: entry.lastPaymentDate }));
  if (kind === 'day-book') { await rebuildDayBook(); rows = (await DayBookEntry.find({}).populate('createdBy', 'name').sort({ transactionDate: 1 }).lean()).map((entry) => ({ Date: entry.transactionDate, Type: entry.transactionType, Document: entry.documentNo, Narration: entry.narration, CashIn: entry.cashIn, CashOut: entry.cashOut, User: entry.createdBy?.name })); }
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Report'); const keys = Object.keys(rows[0] || { Message: '' });
    sheet.columns = keys.map((key) => ({ header: key, key, width: 22 })); rows.forEach((row) => sheet.addRow(row));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename=${kind}.xlsx`); await workbook.xlsx.write(res); return res.end();
  }
  const doc = new PDFDocument({ margin: 32, size: 'A4' }); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=${kind}.pdf`); doc.pipe(res); doc.fontSize(18).text(kind.replace(/-/g, ' ').toUpperCase()).moveDown(); rows.forEach((row) => doc.fontSize(8).text(Object.values(row).map((value) => value instanceof Date ? value.toLocaleString() : String(value ?? '-')).join(' | '))); doc.end();
});
