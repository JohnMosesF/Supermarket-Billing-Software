import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import Bill from '../models/Bill.js';
import { Sale } from "../models/Sale.js";
import { Purchase } from '../models/Purchase.js';
import { Product } from '../models/Product.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { Customer } from '../models/Customer.js';
import { Supplier } from '../models/Supplier.js';
import { CustomerLedger } from '../models/CustomerLedger.js';
import { SupplierLedger } from '../models/SupplierLedger.js';
import { CustomerReceipt } from '../models/CustomerReceipt.js';
import { SupplierPayment } from '../models/SupplierPayment.js';
import { Expense } from '../models/Expense.js';
import { DayBookEntry } from '../models/DayBookEntry.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logAudit } from '../utils/audit.js';
import { rebuildDayBook, reconcileCustomerAccounting, reconcileSalePaymentFields, reconcileSupplierAccounting } from '../services/accountingService.js';

const number = (value) => Number(value || 0);
const docNo = (prefix) => `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-7)}`;
const dateQuery = (from, to) => { const query = {}; if (from) query.$gte = new Date(from); if (to) { const date = new Date(to); date.setHours(23, 59, 59, 999); query.$lte = date; } return Object.keys(query).length ? query : null; };
const invoiceNoOf = (bill) => bill.invoiceNo || bill.invoiceNumber || String(bill._id);
const paymentMethods = ['Cash', 'Bank', 'UPI', 'Card', 'Cheque', 'Wallet'];
const unpaidLegacyBillFilter = (customerId) => ({
  customer: customerId,
  status: { $ne: 'Cancelled' },
  balanceAmount: { $gt: 0 }
});

function normalizeReceivableDocument(bill, sourceModel) {
  const invoiceNo = invoiceNoOf(bill);
  return {
    ...bill,
    sourceModel,
    invoiceNo,
    invoiceNumber: bill.invoiceNumber || invoiceNo,
    dueAmount: Number(bill.balanceAmount ?? 0)
  };
}

async function pendingCustomerDocuments(customerId) {
  const [sales, bills] = await Promise.all([
    Sale.find({ customer: customerId, balanceAmount: { $gt: 0 } }).sort({ createdAt: 1 }).lean(),
    Bill.find(unpaidLegacyBillFilter(customerId)).sort({ createdAt: 1 }).lean()
  ]);
  return [
    ...sales.map((bill) => normalizeReceivableDocument(bill, 'Sale')),
    ...bills.map((bill) => normalizeReceivableDocument(bill, 'Bill'))
  ].sort((a, b) => new Date(a.invoiceAt || a.createdAt || 0) - new Date(b.invoiceAt || b.createdAt || 0));
}

async function pendingCustomerRecords(customerId) {
  const [sales, bills] = await Promise.all([
    Sale.find({ customer: customerId, balanceAmount: { $gt: 0 } }).sort({ createdAt: 1 }),
    Bill.find(unpaidLegacyBillFilter(customerId)).sort({ createdAt: 1 })
  ]);
  return [
    ...sales.map((document) => ({ document, sourceModel: 'Sale' })),
    ...bills.map((document) => ({ document, sourceModel: 'Bill' }))
  ].sort((a, b) => new Date(a.document.invoiceAt || a.document.createdAt || 0) - new Date(b.document.invoiceAt || b.document.createdAt || 0));
}

function applyReceiptToReceivable(bill, applied, sourceModel) {
  if (sourceModel === 'Sale') {
    const paymentState = reconcileSalePaymentFields(bill.total, number(bill.paidAmount) + applied, number(bill.balanceAmount) - applied);
    bill.paidAmount = paymentState.paidAmount;
    bill.balanceAmount = paymentState.balanceAmount;
    bill.paymentStatus = paymentState.paymentStatus;
    return;
  }
  const paidAmount = number(bill.paidAmount) + applied;
  const balanceAmount = Math.max(number(bill.balanceAmount ?? bill.dueAmount) - applied, 0);
  bill.paidAmount = paidAmount;
  bill.balanceAmount = balanceAmount;
  bill.dueAmount = balanceAmount;
  bill.paymentStatus = balanceAmount <= 0.001 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
}

function rollbackReceiptOnReceivable(bill, applied, sourceModel) {
  if (sourceModel === 'Sale') {
    const paymentState = reconcileSalePaymentFields(bill.total, number(bill.paidAmount) - applied, number(bill.balanceAmount) + applied);
    bill.paidAmount = paymentState.paidAmount;
    bill.balanceAmount = paymentState.balanceAmount;
    bill.paymentStatus = paymentState.paymentStatus;
    return;
  }
  const paidAmount = Math.max(number(bill.paidAmount) - applied, 0);
  const balanceAmount = number(bill.balanceAmount ?? bill.dueAmount) + applied;
  bill.paidAmount = paidAmount;
  bill.balanceAmount = balanceAmount;
  bill.dueAmount = balanceAmount;
  bill.paymentStatus = balanceAmount <= 0.001 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
}

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
    const [fresh, lastSale, lastBill, pendingSaleBills, pendingLegacyBills] = await Promise.all([
      Customer.findById(customer._id).lean(),
      Sale.findOne({
          customer: customer._id
      })
          .sort({ createdAt: -1 })
          .lean(),
      Bill.findOne({ customer: customer._id, status: { $ne: 'Cancelled' } }).sort({ createdAt: -1 }).lean(),
      Sale.countDocuments({
          customer: customer._id,
          balanceAmount: { $gt: 0 }
      }),
      Bill.countDocuments(unpaidLegacyBillFilter(customer._id))
  ]);
    const latestBill = [lastSale, lastBill].filter(Boolean).sort((a, b) => new Date(b.invoiceAt || b.createdAt || 0) - new Date(a.invoiceAt || a.createdAt || 0))[0];
    return { ...fresh, lastPurchase: latestBill?.invoiceAt || latestBill?.createdAt, pendingBills: pendingSaleBills + pendingLegacyBills };
  }));
  res.json({ customers: rows.filter((row) => number(row.outstandingBalance) > 0) });
});

export const supplierOutstanding = asyncHandler(async (req, res) => {
  const suppliers = await Supplier.find({ active: true }).lean();
  const rows = await Promise.all(suppliers.map(async (supplier) => { await reconcileSupplierAccounting(supplier._id); return Supplier.findById(supplier._id).lean(); }));
  res.json({ suppliers: rows.filter((row) => number(row.outstandingBalance) > 0) });
});

export const pendingCustomerBills = asyncHandler(async (req, res) => {
  await reconcileCustomerAccounting(req.params.id);
  const bills = await pendingCustomerDocuments(req.params.id);
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
  if (req.body.date && Number.isNaN(new Date(req.body.date).getTime())) throw new ApiError(400, 'Invalid receipt date');
  let remaining = amount;
  const requested = new Map((req.body.allocations || []).map((entry) => [String(entry.billId), number(entry.amount)]));
  const requestedTotal = [...requested.values()].reduce((sum, value) => sum + value, 0);
  if (requestedTotal - amount > 0.001) throw new ApiError(400, 'Allocation cannot exceed receipt amount');
  const bills = await pendingCustomerRecords(customer._id);
  const allocations = [];
  const changed = [];
  try {
    for (const entry of bills) {
      if (remaining <= 0) break;
      const bill = entry.document;
      const wanted = requested.size ? number(requested.get(String(bill._id))) : remaining;
      if (wanted <= 0) continue;
      if (wanted - number(bill.balanceAmount) > 0.001) throw new ApiError(400, `Allocation exceeds pending amount for ${invoiceNoOf(bill)}`);
      const applied = Math.min(wanted, remaining, number(bill.balanceAmount));
      if (applied <= 0) continue;
      applyReceiptToReceivable(bill, applied, entry.sourceModel);
      await bill.save(); 
      changed.push({ bill, applied, sourceModel: entry.sourceModel }); 
      remaining -= applied; 
      allocations.push({ bill: bill._id, billModel: entry.sourceModel, invoiceNo: invoiceNoOf(bill), amount: applied });
    }
    const receipt = await CustomerReceipt.create({ receiptNo: req.body.receiptNo || docNo('RCT'), customer: customer._id, amount, paymentMethod: req.body.paymentMethod || 'Cash', referenceNumber: req.body.referenceNumber || '', allocationType: remaining > 0 ? (req.body.allocationType === 'Advance' ? 'Advance' : 'On Account') : 'Allocated', allocations, unallocatedAmount: remaining, notes: req.body.notes || req.body.narration, narration: req.body.narration || req.body.notes, attachmentUrl: req.body.attachmentUrl || '', createdBy: req.user._id, receiptDate: req.body.date || new Date() });
    await reconcileCustomerAccounting(customer._id).catch((error) => console.error('Customer ledger reconciliation failed', error));
    await rebuildDayBook().catch((error) => console.error('Day book rebuild failed', error));
    await logAudit(req, { action: 'Customer Receipt', module: 'Accounting', newValue: receipt.toObject() });
    res.status(201).json({ receipt });
  } catch (error) {
      for (const { bill, applied, sourceModel } of changed.reverse()) {
          rollbackReceiptOnReceivable(bill, applied, sourceModel);
          await bill.save();
      }
      throw error;
  }
  });
export const createSupplierPayment = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.body.supplierId); if (!supplier) throw new ApiError(404, 'Supplier not found');
  const amount = number(req.body.amount); if (amount <= 0) throw new ApiError(400, 'Payment amount must be greater than zero');
  if (req.body.date && Number.isNaN(new Date(req.body.date).getTime())) throw new ApiError(400, 'Invalid payment date');
  let remaining = amount; const requested = new Map((req.body.allocations || []).map((entry) => [String(entry.purchaseId), number(entry.amount)]));
  const requestedTotal = [...requested.values()].reduce((sum, value) => sum + value, 0);
  if (requestedTotal - amount > 0.001) throw new ApiError(400, 'Allocation cannot exceed payment amount');
  const purchases = await Purchase.find({ supplier: supplier._id, active: true, $expr: { $gt: ['$total', { $add: ['$paidAmount', { $ifNull: ['$returnCreditAmount', 0] }] }] } }).sort({ purchaseDate: 1 });
  const allocations = []; const changed = [];
  try {
    for (const purchase of purchases) { if (remaining <= 0) break; const wanted = requested.size ? number(requested.get(String(purchase._id))) : remaining; if (wanted <= 0) continue; const due = number(purchase.total) - number(purchase.paidAmount) - number(purchase.returnCreditAmount); if (wanted - due > 0.001) throw new ApiError(400, `Allocation exceeds pending amount for ${purchase.invoiceNumber || purchase.purchaseNo}`); const applied = Math.min(wanted, remaining, due); purchase.paidAmount += applied; purchase.amountPaid = purchase.paidAmount; purchase.balance = Math.max(number(purchase.total) - number(purchase.paidAmount) - number(purchase.returnCreditAmount), 0); purchase.paymentStatus = purchase.balance <= 0.001 ? 'Paid' : purchase.paidAmount > 0 ? 'Partial' : 'Unpaid'; await purchase.save(); changed.push({ purchase, applied }); remaining -= applied; allocations.push({ purchase: purchase._id, invoiceNumber: purchase.invoiceNumber, amount: applied }); }
    const payment = await SupplierPayment.create({ voucherNo: req.body.voucherNo || docNo('PAY'), supplier: supplier._id, amount, paymentMethod: req.body.paymentMethod || 'Cash', referenceNumber: req.body.referenceNumber || '', allocations, unallocatedAmount: remaining, notes: req.body.notes || req.body.narration, narration: req.body.narration || req.body.notes, attachmentUrl: req.body.attachmentUrl || '', createdBy: req.user._id, paymentDate: req.body.date || new Date() });
    await reconcileSupplierAccounting(supplier._id).catch((error) => console.error('Supplier ledger reconciliation failed', error));
    await rebuildDayBook().catch((error) => console.error('Day book rebuild failed', error));
    await logAudit(req, { action: 'Supplier Payment', module: 'Accounting', newValue: payment.toObject() });
    res.status(201).json({ payment });
  } catch (error) { for (const { purchase, applied } of changed.reverse()) { purchase.paidAmount -= applied; await purchase.save(); } throw error; }
});

export const cancelCustomerReceipt = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new ApiError(400, 'Cancellation reason is required');
  const receipt = await CustomerReceipt.findById(req.params.id);
  if (!receipt) throw new ApiError(404, 'Receipt not found');
  if (receipt.status === 'Cancelled') return res.json({ receipt, message: 'Receipt already cancelled' });
  const previous = receipt.toObject();
  for (const allocation of receipt.allocations || []) {
    const Model = allocation.billModel === 'Sale' ? Sale : Bill;
    const bill = await Model.findById(allocation.bill);
    if (!bill) continue;
    rollbackReceiptOnReceivable(bill, number(allocation.amount), allocation.billModel);
    await bill.save();
  }
  receipt.status = 'Cancelled';
  receipt.cancelledAt = new Date();
  receipt.cancelledBy = req.user._id;
  receipt.cancellationReason = reason;
  await receipt.save();
  await reconcileCustomerAccounting(receipt.customer);
  await rebuildDayBook();
  await logAudit(req, { action: 'Receipt Cancelled', module: 'Accounting', previousValue: previous, newValue: receipt.toObject() });
  res.json({ receipt, message: 'Receipt cancelled' });
});

export const cancelSupplierPayment = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new ApiError(400, 'Cancellation reason is required');
  const payment = await SupplierPayment.findById(req.params.id);
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status === 'Cancelled') return res.json({ payment, message: 'Payment already cancelled' });
  const previous = payment.toObject();
  for (const allocation of payment.allocations || []) {
    const purchase = await Purchase.findById(allocation.purchase);
    if (!purchase) continue;
    purchase.paidAmount = Math.max(number(purchase.paidAmount) - number(allocation.amount), 0);
    purchase.amountPaid = purchase.paidAmount;
    purchase.balance = Math.max(number(purchase.total) - number(purchase.paidAmount) - number(purchase.returnCreditAmount), 0);
    purchase.paymentStatus = purchase.balance <= 0.001 ? 'Paid' : purchase.paidAmount > 0 ? 'Partial' : 'Unpaid';
    await purchase.save();
  }
  payment.status = 'Cancelled';
  payment.cancelledAt = new Date();
  payment.cancelledBy = req.user._id;
  payment.cancellationReason = reason;
  await payment.save();
  await reconcileSupplierAccounting(payment.supplier);
  await rebuildDayBook();
  await logAudit(req, { action: 'Supplier Payment Cancelled', module: 'Accounting', previousValue: previous, newValue: payment.toObject() });
  res.json({ payment, message: 'Payment cancelled' });
});

export const markReceiptReprint = asyncHandler(async (req, res) => {
  const receipt = await CustomerReceipt.findByIdAndUpdate(req.params.id, { $inc: { reprintCount: 1 } }, { new: true });
  if (!receipt) throw new ApiError(404, 'Receipt not found');
  await logAudit(req, { action: 'Receipt Reprinted', module: 'Accounting', newValue: { receiptNo: receipt.receiptNo } });
  res.json({ receipt });
});

export const markPaymentReprint = asyncHandler(async (req, res) => {
  const payment = await SupplierPayment.findByIdAndUpdate(req.params.id, { $inc: { reprintCount: 1 } }, { new: true });
  if (!payment) throw new ApiError(404, 'Payment not found');
  await logAudit(req, { action: 'Payment Voucher Reprinted', module: 'Accounting', newValue: { voucherNo: payment.voucherNo } });
  res.json({ payment });
});

export const receiptRegister = asyncHandler(async (req, res) => { const range = dateQuery(req.query.from, req.query.to); const query = { status: 'Posted', ...(range ? { receiptDate: range } : {}), ...(req.query.customer ? { customer: req.query.customer } : {}), ...(req.query.paymentMethod ? { paymentMethod: req.query.paymentMethod } : {}) }; const receipts = await CustomerReceipt.find(query).populate('customer', 'name mobile').populate('createdBy', 'name').sort({ receiptDate: -1 }).lean(); res.json({ receipts, total: receipts.reduce((sum, entry) => sum + entry.amount, 0) }); });
export const paymentRegister = asyncHandler(async (req, res) => { const range = dateQuery(req.query.from, req.query.to); const query = { status: 'Posted', ...(range ? { paymentDate: range } : {}) }; const payments = await SupplierPayment.find(query).populate('supplier', 'name mobile').populate('createdBy', 'name').sort({ paymentDate: -1 }).lean(); res.json({ payments, total: payments.reduce((sum, entry) => sum + entry.amount, 0) }); });
export const dayBook = asyncHandler(async (req, res) => { await rebuildDayBook(); const range = dateQuery(req.query.from || req.query.date, req.query.to || req.query.date); const query = { ...(range ? { transactionDate: range } : {}), ...(req.query.user ? { createdBy: req.query.user } : {}) }; const entries = await DayBookEntry.find(query).populate('createdBy', 'name').sort({ transactionDate: 1 }).lean(); const opening = 0; const cashIn = entries.reduce((sum, entry) => sum + number(entry.cashIn), 0); const cashOut = entries.reduce((sum, entry) => sum + number(entry.cashOut), 0); res.json({ openingCash: opening, entries, totals: { cashIn, cashOut, closingCash: opening + cashIn - cashOut } }); });

export const salesLedger = asyncHandler(async (req, res) => {
  const range = dateQuery(req.query.from, req.query.to);
  const billQuery = { status: { $ne: 'Cancelled' }, ...(range ? { createdAt: range } : {}) };
  const saleQuery = { ...(range ? { createdAt: range } : {}) };
  const [bills, sales] = await Promise.all([
    Bill.find(billQuery).populate('customer', 'name mobile gstNumber').sort({ createdAt: -1 }).lean(),
    Sale.find(saleQuery).populate('customer', 'name mobile gstNumber').sort({ createdAt: -1 }).lean()
  ]);
  const rows = [...bills.map((entry) => ({ source: 'Bill', invoiceNo: entry.invoiceNo, date: entry.invoiceAt || entry.createdAt, customerName: entry.customerName || entry.customer?.name, gst: entry.taxTotal, discount: entry.discount, amount: entry.total, paid: entry.paidAmount, outstanding: entry.balanceAmount, paymentMethod: entry.paymentMethod })), ...sales.map((entry) => ({ source: 'Sale', invoiceNo: invoiceNoOf(entry), date: entry.invoiceAt || entry.createdAt, customerName: entry.customerName || entry.customer?.name, gst: entry.taxTotal || entry.taxAmount || 0, discount: entry.discount || 0, amount: entry.total, paid: entry.paidAmount, outstanding: entry.balanceAmount, paymentMethod: entry.paymentMethod }))].sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ rows, totals: rows.reduce((sum, row) => ({ amount: sum.amount + number(row.amount), gst: sum.gst + number(row.gst), discount: sum.discount + number(row.discount), outstanding: sum.outstanding + number(row.outstanding) }), { amount: 0, gst: 0, discount: 0, outstanding: 0 }) });
});

export const purchaseLedger = asyncHandler(async (req, res) => {
  const range = dateQuery(req.query.from, req.query.to);
  const purchases = await Purchase.find({ active: true, ...(range ? { purchaseDate: range } : {}) }).populate('supplier', 'name mobile gstNumber').sort({ purchaseDate: -1 }).lean();
  const rows = purchases.map((entry) => ({ invoiceNumber: entry.invoiceNumber || entry.purchaseNo, date: entry.purchaseDate || entry.createdAt, supplierName: entry.supplier?.name, gst: entry.gstTotal, freight: entry.freightCharges, discount: entry.discount, amount: entry.total, paid: entry.paidAmount, balance: Math.max(number(entry.total) - number(entry.paidAmount) - number(entry.returnCreditAmount), 0), paymentStatus: entry.paymentStatus }));
  res.json({ rows, totals: rows.reduce((sum, row) => ({ amount: sum.amount + number(row.amount), gst: sum.gst + number(row.gst), freight: sum.freight + number(row.freight), discount: sum.discount + number(row.discount), balance: sum.balance + number(row.balance) }), { amount: 0, gst: 0, freight: 0, discount: 0, balance: 0 }) });
});

export const stockLedger = asyncHandler(async (req, res) => {
  const range = dateQuery(req.query.from, req.query.to);
  const query = { ...(range ? { createdAt: range } : {}), ...(req.query.product ? { product: req.query.product } : {}) };
  const entries = await InventoryLog.find(query).populate('product', 'name sku productId unit').populate('user', 'name').sort({ createdAt: 1, _id: 1 }).lean();
  res.json({ entries });
});

export const itemLedger = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) throw new ApiError(404, 'Product not found');
  const range = dateQuery(req.query.from, req.query.to);
  const entries = await InventoryLog.find({ product: product._id, ...(range ? { createdAt: range } : {}) }).populate('user', 'name').sort({ createdAt: 1, _id: 1 }).lean();
  res.json({ product, entries });
});

export const cashBook = asyncHandler(async (req, res) => {
  const method = req.query.method ? String(req.query.method) : '';
  const methods = method ? [method] : paymentMethods;
  const range = dateQuery(req.query.from, req.query.to);
  const [bills, receipts, payments, expenses] = await Promise.all([
    Bill.find({ status: { $ne: 'Cancelled' }, ...(range ? { createdAt: range } : {}) }).lean(),
    CustomerReceipt.find({ status: 'Posted', ...(range ? { receiptDate: range } : {}) }).populate('customer', 'name').lean(),
    SupplierPayment.find({ status: 'Posted', ...(range ? { paymentDate: range } : {}) }).populate('supplier', 'name').lean(),
    Expense.find({ status: 'Posted', ...(range ? { expenseDate: range } : {}) }).lean()
  ]);
  const rows = [];
  bills.forEach((bill) => {
    const details = bill.paymentDetails?.length ? bill.paymentDetails : [{ method: bill.paymentMethod, amount: bill.paidAmount }];
    details.forEach((entry) => { if (methods.includes(entry.method)) rows.push({ date: bill.invoiceAt || bill.createdAt, type: 'Sale', documentNo: bill.invoiceNo, party: bill.customerName, method: entry.method, cashIn: number(entry.amount), cashOut: 0 }); });
  });
  receipts.forEach((entry) => { if (methods.includes(entry.paymentMethod)) rows.push({ date: entry.receiptDate, type: 'Customer Receipt', documentNo: entry.receiptNo, party: entry.customer?.name, method: entry.paymentMethod, cashIn: entry.amount, cashOut: 0 }); });
  payments.forEach((entry) => { if (methods.includes(entry.paymentMethod)) rows.push({ date: entry.paymentDate, type: 'Supplier Payment', documentNo: entry.voucherNo, party: entry.supplier?.name, method: entry.paymentMethod, cashIn: 0, cashOut: entry.amount }); });
  expenses.forEach((entry) => { if (methods.includes(entry.paymentMethod)) rows.push({ date: entry.expenseDate, type: 'Expense', documentNo: entry.expenseNo, party: entry.vendor || entry.expenseName, method: entry.paymentMethod, cashIn: 0, cashOut: entry.totalAmount }); });
  rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0;
  rows.forEach((row) => { running += number(row.cashIn) - number(row.cashOut); row.balance = running; });
  res.json({ rows, totals: { cashIn: rows.reduce((sum, row) => sum + number(row.cashIn), 0), cashOut: rows.reduce((sum, row) => sum + number(row.cashOut), 0), closing: running } });
});

export const collectionsReport = asyncHandler(async (req, res) => {
  const range = dateQuery(req.query.from, req.query.to);
  const receipts = await CustomerReceipt.find({ status: 'Posted', ...(range ? { receiptDate: range } : {}), ...(req.query.paymentMethod ? { paymentMethod: req.query.paymentMethod } : {}) }).populate('customer', 'name mobile').populate('createdBy', 'name').sort({ receiptDate: -1 }).lean();
  const byMethod = receipts.reduce((map, entry) => ({ ...map, [entry.paymentMethod]: (map[entry.paymentMethod] || 0) + entry.amount }), {});
  const byCustomer = receipts.reduce((map, entry) => ({ ...map, [entry.customer?.name || 'Unknown']: (map[entry.customer?.name || 'Unknown'] || 0) + entry.amount }), {});
  res.json({ receipts, byMethod, byCustomer, total: receipts.reduce((sum, entry) => sum + entry.amount, 0) });
});

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
