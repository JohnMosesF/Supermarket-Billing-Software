import mongoose from 'mongoose';
import Bill from '../models/Bill.js';
import { Purchase } from '../models/Purchase.js';
import { Product } from '../models/Product.js';
import { Customer } from '../models/Customer.js';
import { Supplier } from '../models/Supplier.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { SalesReturn } from '../models/SalesReturn.js';
import { PurchaseReturn } from '../models/PurchaseReturn.js';
import { ReturnBalance } from '../models/ReturnBalance.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { reconcileCustomerAccounting, reconcileSupplierAccounting, rebuildDayBook } from '../services/accountingService.js';

const EPSILON = 0.000001;
const regex = (value) => new RegExp(String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const returnNo = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

function dateRange(from, to) {
  if (!from && !to) return undefined;
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return range;
}

function combineRequested(items, idField) {
  const combined = new Map();
  for (const raw of items || []) {
    const id = String(raw[idField] || raw.product || raw.productId || '');
    const quantity = Number(raw.quantity || 0);
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid return product');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError(400, 'Return quantity must be greater than zero');
    combined.set(id, (combined.get(id) || 0) + quantity);
  }
  if (!combined.size) throw new ApiError(400, 'Select at least one item to return');
  return combined;
}

async function reserveQuantities(sourceType, source, requested, soldByProduct) {
  await ReturnBalance.updateOne({ sourceType, source }, { $setOnInsert: { quantities: {} } }, { upsert: true });
  const checks = [];
  const increments = {};
  for (const [id, quantity] of requested) {
    const sold = Number(soldByProduct.get(id) || 0);
    if (!sold) throw new ApiError(400, 'Product was not part of the original document');
    checks.push({ $lte: [{ $add: [{ $ifNull: [`$quantities.${id}`, 0] }, quantity] }, sold + EPSILON] });
    increments[`quantities.${id}`] = quantity;
  }
  const reserved = await ReturnBalance.findOneAndUpdate(
    { sourceType, source, $expr: { $and: checks } },
    { $inc: increments },
    { new: true }
  );
  if (!reserved) throw new ApiError(409, 'Return quantity exceeds the remaining returnable quantity');
}

async function releaseQuantities(sourceType, source, requested) {
  const increments = {};
  for (const [id, quantity] of requested) increments[`quantities.${id}`] = -quantity;
  await ReturnBalance.updateOne({ sourceType, source }, { $inc: increments });
}

async function applyStock(items, direction, context) {
  const applied = [];
  try {
    for (const item of items) {
      const quantity = Math.abs(Number(item.quantity));
      const query = direction < 0 ? { _id: item.product, stock: { $gte: quantity } } : { _id: item.product };
      const product = await Product.findOneAndUpdate(query, { $inc: { stock: direction * quantity } }, { new: false });
      if (!product) throw new ApiError(400, direction < 0 ? 'Insufficient stock for purchase return' : 'Product not found');
      const stockBefore = Number(product.stock || 0);
      const stockAfter = stockBefore + direction * quantity;
      applied.push({ product: product._id, quantity });
      await InventoryLog.create({
        product: product._id,
        type: direction > 0 ? 'stock_in' : 'stock_out',
        quantity,
        stockBefore,
        stockAfter,
        reason: `${context.kind} ${context.returnNo} | ${context.originalNo}`,
        source: context.source,
        referenceId: context.referenceId,
        invoiceId: context.billId,
        supplier: context.supplier,
        purchaseInvoiceNo: context.originalNo,
        user: context.userId
      });
    }
  } catch (error) {
    for (const entry of applied.reverse()) {
      await Product.updateOne({ _id: entry.product }, { $inc: { stock: -direction * entry.quantity } });
    }
    throw error;
  }
}

export const searchSalesInvoices = asyncHandler(async (req, res) => {
  const query = {};
  const term = String(req.query.q || '').trim();
  if (term) query.$or = [{ invoiceNo: regex(term) }, { customerName: regex(term) }, { customerMobile: regex(term) }];
  const dates = dateRange(req.query.from || req.query.date, req.query.to || req.query.date);
  if (dates) query.createdAt = dates;
  let bills = await Bill.find(query).populate('staff', 'name').sort({ createdAt: -1 }).limit(100).lean();
  if (req.query.cashier) bills = bills.filter((bill) => regex(req.query.cashier).test(bill.staff?.name || ''));
  res.json({ bills });
});

export const getSalesReturnable = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id).populate('staff', 'name').lean();
  if (!bill) throw new ApiError(404, 'Invoice not found');
  const balance = await ReturnBalance.findOne({ sourceType: 'Bill', source: bill._id }).lean();
  const returned = balance?.quantities || {};
  bill.items = bill.items.map((item) => ({
    ...item,
    returnedQuantity: Number(returned[String(item.productId)] || 0),
    returnableQuantity: Math.max(0, Number(item.quantity) - Number(returned[String(item.productId)] || 0))
  }));
  res.json({ bill });
});

export const createSalesReturn = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.body.billId).lean();
  if (!bill) throw new ApiError(404, 'Invoice not found');
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new ApiError(400, 'Return reason is required');
  const requested = combineRequested(req.body.items, 'productId');
  const originals = new Map(bill.items.map((item) => [String(item.productId), item]));
  const sold = new Map(bill.items.map((item) => [String(item.productId), Number(item.quantity)]));
  await reserveQuantities('Bill', bill._id, requested, sold);

  const items = [];
  let stockApplied = false;
  let createdReturn = null;
  let billCreditApplied = 0;
  try {
    for (const [id, quantity] of requested) {
      const item = originals.get(id);
      const soldQty = Number(item.quantity);
      const taxable = Number(item.taxableAmount ?? soldQty * Number(item.sellingPrice || item.price || 0));
      const gst = Number(item.gstAmount ?? taxable * Number(item.gst || 0) / 100);
      const discount = Number(item.discount || 0);
      items.push({
        product: id, productIdNumber: item.productIdNumber, sku: item.sku, barcode: item.barcode,
        productName: item.productName, localName: item.localName, companyName: item.companyName,
        category: item.category, hsnCode: item.hsnCode, unit: item.unit, quantity,
        price: Number(item.sellingPrice || item.price || 0), gstRate: Number(item.gst || 0),
        discount: discount * quantity / soldQty, taxableAmount: taxable * quantity / soldQty,
        gstAmount: gst * quantity / soldQty,
        refundAmount: Number(item.netAmount ?? taxable + gst) * quantity / soldQty
      });
    }
    const number = returnNo('SR');
    await applyStock(items, 1, { kind: 'Sales Return', source: 'sales_return', returnNo: number, originalNo: bill.invoiceNo, referenceId: bill._id, billId: bill._id, userId: req.user._id });
    stockApplied = true;
    const totals = items.reduce((sum, item) => ({ taxable: sum.taxable + item.taxableAmount, gst: sum.gst + item.gstAmount, discount: sum.discount + item.discount, refund: sum.refund + item.refundAmount }), { taxable: 0, gst: 0, discount: 0, refund: 0 });
    const salesReturn = await SalesReturn.create({
      returnNo: number, originalBill: bill._id, originalInvoiceNo: bill.invoiceNo, customer: bill.customer,
      customerName: bill.customerName, customerMobile: bill.customerMobile, originalPaymentMethod: bill.paymentMethod,
      items, taxableAmount: totals.taxable, gstAmount: totals.gst, discount: totals.discount, refundAmount: totals.refund,
      refundMethod: bill.paymentMethod === 'Credit' ? 'Credit Adjustment' : (['UPI', 'Card'].includes(bill.paymentMethod) ? bill.paymentMethod : 'Cash'),
      reason, processedBy: req.user._id
    });
    createdReturn = salesReturn;
    if (bill.paymentMethod === 'Credit') {
      billCreditApplied = Math.min(totals.refund, Number(bill.dueAmount || 0));
      if (billCreditApplied > 0) await Bill.updateOne({ _id: bill._id }, { $inc: { returnCreditAmount: billCreditApplied, dueAmount: -billCreditApplied }, $set: { paymentStatus: Number(bill.dueAmount) - billCreditApplied <= EPSILON ? 'Paid' : 'Partial' } });
    }
    await reconcileCustomerAccounting(bill.customer).catch((error) => console.error('Customer ledger reconciliation failed', error));
    await rebuildDayBook().catch((error) => console.error('Day book rebuild failed', error));
    res.status(201).json({ salesReturn });
  } catch (error) {
    if (billCreditApplied > 0) await Bill.updateOne({ _id: bill._id }, { $inc: { returnCreditAmount: -billCreditApplied, dueAmount: billCreditApplied } });
    if (createdReturn) await SalesReturn.findByIdAndDelete(createdReturn._id);
    if (stockApplied) await applyStock(items, -1, { kind: 'Sales Return rollback', source: 'adjustment', returnNo: createdReturn?.returnNo || 'failed', originalNo: bill.invoiceNo, referenceId: bill._id, billId: bill._id, userId: req.user._id });
    await releaseQuantities('Bill', bill._id, requested);
    throw error;
  }
});

export const searchPurchases = asyncHandler(async (req, res) => {
  const query = { active: true };
  if (req.query.q) query.invoiceNumber = regex(req.query.q);
  const dates = dateRange(req.query.from, req.query.to);
  if (dates) query.purchaseDate = dates;
  let purchases = await Purchase.find(query).populate('supplier', 'name mobile').populate('items.product', 'name sku').sort({ purchaseDate: -1 }).limit(100).lean();
  if (req.query.supplier) purchases = purchases.filter((purchase) => regex(req.query.supplier).test(purchase.supplier?.name || ''));
  if (req.query.product) purchases = purchases.filter((purchase) => purchase.items.some((item) => regex(req.query.product).test(item.name || item.product?.name || '')));
  res.json({ purchases });
});

export const getPurchaseReturnable = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findById(req.params.id).populate('supplier').populate('items.product').lean();
  if (!purchase) throw new ApiError(404, 'Purchase not found');
  const balance = await ReturnBalance.findOne({ sourceType: 'Purchase', source: purchase._id }).lean();
  const returned = balance?.quantities || {};
  purchase.items = purchase.items.map((item) => {
    const id = String(item.product?._id || item.product);
    return { ...item, product: item.product, returnedQuantity: Number(returned[id] || 0), returnableQuantity: Math.max(0, Number(item.quantity) - Number(returned[id] || 0)) };
  });
  res.json({ purchase });
});

export const createPurchaseReturn = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findById(req.body.purchaseId).populate('supplier').lean();
  if (!purchase) throw new ApiError(404, 'Purchase not found');
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new ApiError(400, 'Return reason is required');
  const requested = combineRequested(req.body.items, 'productId');
  const originals = new Map(purchase.items.map((item) => [String(item.product), item]));
  const purchased = new Map(purchase.items.map((item) => [String(item.product), Number(item.quantity)]));
  await reserveQuantities('Purchase', purchase._id, requested, purchased);
  let stockApplied = false;
  let createdReturn = null;
  let items = [];
  let purchaseCreditApplied = 0;
  try {
    items = [...requested].map(([id, quantity]) => {
      const item = originals.get(id);
      const taxableAmount = quantity * Number(item.costPrice || 0);
      const gstAmount = taxableAmount * Number(item.gstRate || 0) / 100;
      return { product: id, productName: item.name, unit: item.unit, quantity, costPrice: item.costPrice, gstRate: item.gstRate, taxableAmount, gstAmount, returnAmount: taxableAmount + gstAmount };
    });
    const number = returnNo('PR');
    await applyStock(items, -1, { kind: 'Purchase Return', source: 'purchase_return', returnNo: number, originalNo: purchase.invoiceNumber, referenceId: purchase._id, supplier: purchase.supplier?._id || purchase.supplier, userId: req.user._id });
    stockApplied = true;
    const totals = items.reduce((sum, item) => ({ taxable: sum.taxable + item.taxableAmount, gst: sum.gst + item.gstAmount, total: sum.total + item.returnAmount }), { taxable: 0, gst: 0, total: 0 });
    const purchaseReturn = await PurchaseReturn.create({ returnNo: number, originalPurchase: purchase._id, originalInvoiceNo: purchase.invoiceNumber, supplier: purchase.supplier?._id, supplierName: purchase.supplier?.name, items, taxableAmount: totals.taxable, gstAmount: totals.gst, returnAmount: totals.total, reason, processedBy: req.user._id });
    createdReturn = purchaseReturn;
    purchaseCreditApplied = Math.min(totals.total, Math.max(Number(purchase.total || 0) - Number(purchase.paidAmount || 0) - Number(purchase.returnCreditAmount || 0), 0));
    if (purchaseCreditApplied > 0) await Purchase.updateOne({ _id: purchase._id }, { $inc: { returnCreditAmount: purchaseCreditApplied } });
    await reconcileSupplierAccounting(purchase.supplier?._id).catch((error) => console.error('Supplier ledger reconciliation failed', error));
    await rebuildDayBook().catch((error) => console.error('Day book rebuild failed', error));
    res.status(201).json({ purchaseReturn });
  } catch (error) {
    if (purchaseCreditApplied > 0) await Purchase.updateOne({ _id: purchase._id }, { $inc: { returnCreditAmount: -purchaseCreditApplied } });
    if (createdReturn) await PurchaseReturn.findByIdAndDelete(createdReturn._id);
    if (stockApplied) await applyStock(items, 1, { kind: 'Purchase Return rollback', source: 'adjustment', returnNo: createdReturn?.returnNo || 'failed', originalNo: purchase.invoiceNumber, referenceId: purchase._id, supplier: purchase.supplier?._id || purchase.supplier, userId: req.user._id });
    await releaseQuantities('Purchase', purchase._id, requested);
    throw error;
  }
});

function returnFilters(req, kind) {
  const query = { status: 'Completed' };
  const dates = dateRange(req.query.from, req.query.to);
  if (dates) query.returnDate = dates;
  if (kind === 'sales' && req.query.customer) query.customerName = regex(req.query.customer);
  if (kind === 'purchase' && req.query.supplier) query.supplierName = regex(req.query.supplier);
  if (req.query.product) query['items.productName'] = regex(req.query.product);
  return query;
}

export const listSalesReturns = asyncHandler(async (req, res) => res.json({ returns: await SalesReturn.find(returnFilters(req, 'sales')).populate('processedBy', 'name').sort({ returnDate: -1 }).limit(500) }));
export const listPurchaseReturns = asyncHandler(async (req, res) => res.json({ returns: await PurchaseReturn.find(returnFilters(req, 'purchase')).populate('processedBy', 'name').sort({ returnDate: -1 }).limit(500) }));
export const getSalesReturn = asyncHandler(async (req, res) => { const value = await SalesReturn.findById(req.params.id).populate('processedBy', 'name'); if (!value) throw new ApiError(404, 'Sales return not found'); res.json({ salesReturn: value }); });
export const getPurchaseReturn = asyncHandler(async (req, res) => { const value = await PurchaseReturn.findById(req.params.id).populate('processedBy', 'name'); if (!value) throw new ApiError(404, 'Purchase return not found'); res.json({ purchaseReturn: value }); });
