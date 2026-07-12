import Bill from '../models/Bill.js';
import { Customer } from '../models/Customer.js';
import DraftBill from '../models/DraftBill.js';
import DeletedBill from '../models/DeletedBill.js';
import PrintLog from '../models/PrintLog.js';
import HoldBill from '../models/HoldBill.js';
import { Product } from '../models/Product.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { Unit } from '../models/Unit.js';
import { ensureDefaultUnits } from './unitController.js';
import mongoose from 'mongoose';
import Refund from '../models/Refund.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { normalizeBillItemSnapshot } from '../utils/billItemSnapshot.js';
import { reconcileCustomerAccounting, rebuildDayBook } from '../services/accountingService.js';
import { logAudit } from '../utils/audit.js';

function normalizePaymentMethod(value) {
  const normalized = String(value || 'Cash').trim().toLowerCase();
  if (normalized === 'upi') return 'UPI';
  if (normalized === 'card') return 'Card';
  if (normalized === 'credit') return 'Credit';
  return 'Cash';
}

function paymentStatusFromAmounts(total, paid) {
  if (paid >= total) return 'Paid';
  if (paid > 0) return 'Partial';
  return 'Unpaid';
}

function requestPaidAmount(body, fallback = 0) {
  return Number(body.paidAmount ?? body.amountPaid ?? body.paid ?? fallback);
}

function isWholeNumber(value) {
  return Math.abs(Number(value) - Math.round(Number(value))) < 0.0000001;
}

async function getUnitRule(unitName) {
  await ensureDefaultUnits();
  const name = String(unitName || 'pcs').trim().toLowerCase();
  const unit = await Unit.findOne({ name, active: true }).lean();
  return unit || { name: 'pcs', allowDecimal: false };
}

async function validateBillItemsForSale(items, stockCredits = []) {
  const creditsByProduct = new Map();
  for (const item of stockCredits || []) {
    const key = String(item.productId || item.product || item._id);
    creditsByProduct.set(key, (creditsByProduct.get(key) || 0) + Math.abs(Number(item.quantity || item.qty || 0)));
  }

  for (const it of items) {
    const product = await Product.findById(it.productId);
    if (!product) throw new ApiError(400, `Product not found: ${String(it.productId)}`);
    const unit = await getUnitRule(product.unit || it.unit);
    it.unit = unit.name;
    if (!unit.allowDecimal && !isWholeNumber(it.quantity)) {
      throw new ApiError(400, `${product.name} must use whole number quantity for ${unit.name}`);
    }
    const available = Number(product.stock || 0) + (creditsByProduct.get(String(it.productId)) || 0);
    if (available < it.quantity) {
      throw new ApiError(400, 'Insufficient stock available.');
    }
  }
}

async function deductSoldStock(items, bill, userId) {
  for (const it of items) {
    const product = await Product.findOneAndUpdate(
      { _id: it.productId, stock: { $gte: it.quantity } },
      { $inc: { stock: -Math.abs(it.quantity) } },
      { new: false }
    );
    if (!product) throw new ApiError(400, 'Insufficient stock available.');
    const stockBefore = Number(product.stock || 0);
    const stockAfter = stockBefore - Math.abs(it.quantity);
    await InventoryLog.create({
      product: it.productId,
      type: 'stock_out',
      quantity: Math.abs(it.quantity),
      stockBefore,
      stockAfter,
      invoiceId: bill._id,
      referenceId: bill._id,
      reason: `Sale ${bill.invoiceNo}`,
      source: 'sale',
      user: userId
    });
  }
}

async function restoreSoldStock(items, reason, userId, billId) {
  for (const it of items || []) {
    const quantity = Math.abs(Number(it.quantity || it.qty || 0));
    if (!quantity) continue;
    const product = await Product.findById(it.productId);
    if (!product) continue;
    const stockBefore = Number(product.stock || 0);
    product.stock = stockBefore + quantity;
    await product.save();
    await InventoryLog.create({
      product: product._id,
      type: 'stock_in',
      quantity,
      stockBefore,
      stockAfter: product.stock,
      invoiceId: billId,
      referenceId: billId,
      reason,
      source: 'restore',
      user: userId
    });
  }
}

async function resolveBillCustomer({ customerId, customerMobile, customerName, customerAddress }) {
  if (customerId) return Customer.findById(customerId);
  const mobile = String(customerMobile || '').trim();
  if (!mobile) return null;

  const name = String(customerName || '').trim() || 'Walk-in Customer';
  let customer = await Customer.findOne({ mobile });
  if (!customer) {
    customer = await Customer.create({ name, mobile, address: customerAddress || '' });
  } else {
    if (name && name !== 'Walk-in Customer') customer.name = name;
    if (customerAddress) customer.address = customerAddress;
    await customer.save();
  }
  return customer;
}

async function recalculateCustomerBillingTotals(customerId) {
  if (!customerId) return;
  const customer = await Customer.findById(customerId);
  if (!customer) return;
  const bills = await Bill.find({ customer: customerId, status: { $ne: 'Cancelled' } }).lean();
  const creditBills = bills.filter((bill) => bill.paymentMethod === 'Credit');
  const paidAmount = bills.reduce((sum, bill) => sum + Number(bill.paidAmount || 0), 0);
  const creditPaid = creditBills.reduce((sum, bill) => sum + Number(bill.paidAmount || 0), 0);
  const dueAmount = creditBills.reduce((sum, bill) => sum + Number(bill.balanceAmount ?? 0), 0);

  customer.totalSpent = bills.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
  customer.loyaltyPoints = Math.floor(customer.totalSpent / 100);
  customer.totalCredit = creditBills.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
  customer.totalCreditSales = customer.totalCredit;
  customer.totalPaid = paidAmount;
  customer.totalPaidAmount = paidAmount;
  customer.outstandingBalance = dueAmount;
  customer.creditBalance = dueAmount;

  const billTransactions = creditBills.map((bill) => ({
    billId: bill._id,
    billModel: 'Bill',
    invoiceNo: bill.invoiceNo,
    billAmount: bill.total,
    paidAmount: bill.paidAmount,
    dueAmount: bill.dueAmount,
    paymentMethod: 'Credit',
    paymentStatus: bill.paymentStatus,
    date: bill.invoiceAt || bill.createdAt
  }));
  customer.creditTransactions = [
    ...customer.creditTransactions.filter((entry) => entry.billModel !== 'Bill'),
    ...billTransactions
  ];
  customer.creditHistory = [
    ...customer.creditHistory.filter((entry) => entry.billModel !== 'Bill'),
    ...billTransactions
  ];
  customer.lastCreditDate = creditBills.length ? new Date(Math.max(...creditBills.map((bill) => new Date(bill.invoiceAt || bill.createdAt).getTime()))) : undefined;
  customer.lastPaymentDate = creditPaid > 0 || paidAmount > 0
    ? new Date(Math.max(...bills.filter((bill) => Number(bill.paidAmount || 0) > 0).map((bill) => new Date(bill.invoiceAt || bill.createdAt).getTime())))
    : undefined;
  await customer.save();
}

// Create bill
export const createBill = asyncHandler(async (req, res) => {
  const { invoiceNo, items, subtotal, taxTotal, discount, discountPercent, total, customerMobile, customerName, customerAddress, notes } = req.body;
  const paymentMethod = normalizePaymentMethod(req.body.paymentMethod);

  if (!items || items.length === 0) {
    throw new ApiError(400, 'Bill must have at least one item');
  }

  // Normalize and validate items - CRITICAL: Ensure productId is MongoDB ObjectId
  const normalizedItems = [];
  for (const it of items) {
    let pid = it.productId || it._id || null;

    // If pid is not a valid ObjectId, try to resolve it
    if (pid && !mongoose.Types.ObjectId.isValid(String(pid))) {
      const pidStr = String(pid);
      // Try numeric productId (handle number or numeric string)
      if (/^[0-9]+$/.test(pidStr)) {
        const prod = await Product.findOne({ productId: Number(pidStr), active: true }).lean();
        if (prod) {
          pid = prod._id;
        }
      } else if (it.productName) {
        const prod = await Product.findOne({ name: it.productName }).lean();
        if (prod) {
          pid = prod._id;
        }
      }
    }

    if (!pid || !mongoose.Types.ObjectId.isValid(String(pid))) {
      throw new ApiError(400, `Invalid product identifier for item: ${JSON.stringify(it)}. Expected MongoDB ObjectId, got: ${pid}`);
    }

    const productIdObj = new mongoose.Types.ObjectId(String(pid));

    const product = await Product.findById(productIdObj).lean();
    const normalized = normalizeBillItemSnapshot({
      ...it,
      productId: productIdObj,
      productIdNumber: it.productIdNumber ?? it.numericProductId ?? it.productIdValue,
      productName: it.productName || it.name || '',
      quantity: it.quantity || it.qty || 0.001,
      unit: it.unit || 'pcs',
      price: it.price || it.sellingPrice || it.rate || 0,
      gst: it.gst || it.taxRate || it.tax || 0,
      total: it.total != null ? it.total : (Number(it.price || it.sellingPrice || it.rate || 0) * parseFloat(it.quantity || it.qty || 0.001)),
      discount: it.discount || 0,
      sku: it.sku || it.code || '',
      barcode: it.barcode || '',
      localName: it.localName || '',
      purchasePrice: it.purchasePrice || '',
      wholesalePrice: it.wholesalePrice || '',
      mrp: it.mrp || '',
      hsnCode: it.hsnCode || it.hsn || '',
      category: it.category || '',
      companyName: it.companyName || '',
      stockAtSale: it.stockAtSale || product?.stock || 0,
      metadata: it.metadata || {}
    }, product);

    normalizedItems.push(normalized);
  }

  // Auto-generate invoice number if not provided
  let finalInvoiceNo = invoiceNo;
  if (!finalInvoiceNo) {
    const lastBill = await Bill.findOne().sort({ createdAt: -1 }).lean();
    const lastNumber = lastBill ? parseInt(lastBill.invoiceNo.replace(/\D/g, '') || 0) : 0;
    finalInvoiceNo = `INV${String(lastNumber + 1).padStart(6, '0')}`;
  }

  const billTotal = Number(total || 0);
  const paidAmount = paymentMethod === 'Credit'
    ? requestPaidAmount(req.body, 0)
    : requestPaidAmount(req.body, billTotal);

  if (paidAmount < 0) {
    throw new ApiError(400, 'Amount paid cannot be negative');
  }
  if (paymentMethod === 'Credit' && paidAmount > billTotal) {
    throw new ApiError(400, 'Amount paid cannot exceed bill total for credit sales');
  }

  const dueAmount = Math.max(billTotal - paidAmount, 0);
  const paymentStatus = paymentStatusFromAmounts(billTotal, paidAmount);
  const customer = await resolveBillCustomer({
    customerId: req.body.customer,
    customerMobile,
    customerName,
    customerAddress
  });

  if (paymentMethod === 'Credit' && !customer) {
    throw new ApiError(400, 'Customer name and mobile number are required for credit bills');
  }

  const billPayload = {
    invoiceNo: finalInvoiceNo,
    customer: customer?._id,
    items: normalizedItems,
    subtotal: subtotal || 0,
    taxTotal: taxTotal || 0,
    discount: discount || 0,
    discountPercent: discountPercent || 0,
    total: billTotal,
    paidAmount,
    balanceAmount: dueAmount,
    dueAmount,
    paymentStatus,
    paymentMethod,
    customerMobile: customerMobile || null,
    customerName: customerName || 'Walk-in Customer',
    customerAddress: customerAddress || '',
    notes: notes || '',
    staff: req.user?._id
  };
  // honor editable invoice date/time if supplied
  if (req.body.invoiceAt) {
    const at = new Date(req.body.invoiceAt);
    if (!isNaN(at.getTime())) billPayload.invoiceAt = at;
  }

  console.log('Creating bill with normalized items:', {
    itemCount: normalizedItems.length,
    items: normalizedItems.map(it => ({
      productId: String(it.productId),
      productName: it.productName,
      quantity: it.quantity,
      price: it.price
    })),
    total: billPayload.total
  });

  await validateBillItemsForSale(normalizedItems);

  const bill = await Bill.create(billPayload);
  await deductSoldStock(normalizedItems, bill, req.user?._id);

  if (customer) {
    const loyaltyPoints = Math.floor(bill.total / 100);
    customer.totalSpent += bill.total;
    customer.loyaltyPoints += loyaltyPoints;

    if (paymentMethod === 'Credit') {
      const tx = {
        billId: bill._id,
        billModel: 'Bill',
        invoiceNo: bill.invoiceNo,
        billAmount: bill.total,
        paidAmount: bill.paidAmount,
        dueAmount: bill.dueAmount,
        paymentMethod: 'Credit',
        paymentStatus: bill.paymentStatus,
        date: bill.createdAt
      };
      customer.totalCredit += bill.total;
      customer.totalCreditSales += bill.total;
      customer.totalPaid += bill.paidAmount;
      customer.totalPaidAmount += bill.paidAmount;
      customer.outstandingBalance += bill.dueAmount;
      customer.creditBalance += bill.dueAmount;
      customer.lastCreditDate = bill.createdAt;
      if (bill.paidAmount > 0) customer.lastPaymentDate = bill.createdAt;
      customer.creditTransactions.push(tx);
      customer.creditHistory.push(tx);
    } else if (bill.paidAmount > 0) {
      customer.totalPaid += bill.paidAmount;
      customer.totalPaidAmount += bill.paidAmount;
      customer.lastPaymentDate = bill.createdAt;
    }

    await customer.save();
    await reconcileCustomerAccounting(customer._id);
  }
  await rebuildDayBook();

  await logAudit(req, { action: 'Bill Created', module: 'Billing', newValue: bill.toObject() });
  res.status(201).json({ bill, message: 'Bill created successfully' });
});

// Get bill by ID
export const getBill = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id).populate('items.productId');
  if (!bill) throw new ApiError(404, 'Bill not found');
  res.json({ bill });
});

// Update bill
export const updateBill = asyncHandler(async (req, res) => {
  const {
    items,
    subtotal,
    taxTotal,
    discount,
    total,
    customerName,
    customerMobile,
    paymentMethod,
    amountPaid,
    discountPercent,
    notes,
    customerAddress
  } = req.body;

  const bill = await Bill.findById(req.params.id);
  if (!bill) throw new ApiError(404, 'Bill not found');
  const previous = bill.toObject();
  const previousCustomerId = bill.customer ? String(bill.customer) : null;

  if (!items || items.length === 0) {
    throw new ApiError(400, 'Bill must have at least one item');
  }

  const normalizedItems = [];
  for (const it of items) {
    let pid = it.productId || it._id || null;
    if (!pid || !mongoose.Types.ObjectId.isValid(String(pid))) {
      throw new ApiError(400, `Invalid product identifier for item: ${JSON.stringify(it)}`);
    }
    const productIdObj = new mongoose.Types.ObjectId(String(pid));
    const product = await Product.findById(productIdObj).lean();
    normalizedItems.push(normalizeBillItemSnapshot({
      ...it,
      productId: productIdObj,
      productIdNumber: it.productIdNumber ?? it.numericProductId ?? it.productIdValue,
      productName: it.productName || it.name || '',
      quantity: it.quantity || it.qty || 0.001,
      unit: it.unit || 'pcs',
      price: it.price || it.sellingPrice || it.rate || 0,
      gst: it.gst || it.taxRate || it.tax || 0,
      total: it.total != null ? it.total : (Number(it.price || it.sellingPrice || it.rate || 0) * parseFloat(it.quantity || it.qty || 0.001)),
      discount: it.discount || 0,
      sku: it.sku || it.code || '',
      barcode: it.barcode || '',
      localName: it.localName || '',
      purchasePrice: it.purchasePrice || '',
      wholesalePrice: it.wholesalePrice || '',
      mrp: it.mrp || '',
      hsnCode: it.hsnCode || it.hsn || '',
      category: it.category || '',
      companyName: it.companyName || '',
      stockAtSale: it.stockAtSale || product?.stock || 0,
      metadata: it.metadata || {}
    }, product));
  }

  const customer = await resolveBillCustomer({
    customerId: req.body.customer,
    customerMobile,
    customerName,
    customerAddress
  });
  if (normalizePaymentMethod(paymentMethod || bill.paymentMethod) === 'Credit' && !customer) {
    throw new ApiError(400, 'Customer name and mobile number are required for credit bills');
  }

  await validateBillItemsForSale(normalizedItems, bill.items);
  await restoreSoldStock(bill.items, `Bill edit restore ${bill.invoiceNo}`, req.user?._id, bill._id);
  try {
    await deductSoldStock(normalizedItems, bill, req.user?._id);
  } catch (error) {
    await deductSoldStock(bill.items, bill, req.user?._id);
    throw error;
  }

  bill.items = normalizedItems;
  bill.subtotal = subtotal != null ? subtotal : bill.subtotal;
  bill.taxTotal = taxTotal != null ? taxTotal : bill.taxTotal;
  bill.discount = discount != null ? discount : bill.discount;
  bill.discountPercent = discountPercent != null ? discountPercent : bill.discountPercent;
  bill.total = total != null ? total : bill.subtotal + bill.taxTotal - bill.discount;
  bill.customer = customer?._id || undefined;
  bill.customerName = customerName || 'Walk-in Customer';
  bill.customerMobile = customerMobile || undefined;
  bill.customerAddress = customerAddress || customer?.address || '';
  bill.paymentMethod = normalizePaymentMethod(paymentMethod || bill.paymentMethod);
  bill.paidAmount = requestPaidAmount(req.body, bill.paymentMethod === 'Credit' ? bill.paidAmount ?? 0 : bill.total);
  const balanceAmount = Math.max(bill.total - bill.paidAmount - Number(bill.returnCreditAmount || 0), 0);
  bill.dueAmount = balanceAmount;
  bill.balanceAmount = balanceAmount;
  bill.paymentStatus = paymentStatusFromAmounts(bill.total, bill.paidAmount);
  bill.notes = notes != null ? notes : bill.notes;
  await bill.save();
  await recalculateCustomerBillingTotals(previousCustomerId);
  if (customer?._id && String(customer._id) !== previousCustomerId) {
    await recalculateCustomerBillingTotals(customer._id);
  }
  await reconcileCustomerAccounting(previousCustomerId);
  if (customer?._id && String(customer._id) !== previousCustomerId) await reconcileCustomerAccounting(customer._id);
  await rebuildDayBook();
  await logAudit(req, { action: 'Bill Edited', module: 'Billing', previousValue: previous, newValue: bill.toObject() });
  res.json({ bill, message: 'Bill updated successfully' });
});

// Delete bill (soft delete)
export const deleteBill = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const bill = await Bill.findById(req.params.id);

  if (!bill) throw new ApiError(404, 'Bill not found');
  const previous = bill.toObject();
  const customerId = bill.customer;

  // Create deleted bill record
  await DeletedBill.create({
    invoiceNo: bill.invoiceNo,
    deletedBy: req.user?._id,
    reason,
    originalData: bill.toObject(),
  });
  await restoreSoldStock(bill.items, `Deleted bill restore ${bill.invoiceNo}`, req.user?._id, bill._id);

  // Delete bill
  await Bill.findByIdAndDelete(req.params.id);
  await recalculateCustomerBillingTotals(customerId);
  await reconcileCustomerAccounting(customerId);
  await rebuildDayBook();
  await logAudit(req, { action: 'Bill Deleted', module: 'Billing', previousValue: previous, newValue: { reason } });

  res.json({ message: 'Bill deleted successfully' });
});

export const getDeletedBills = asyncHandler(async (req, res) => {
  const deletedBills = await DeletedBill.find()
    .populate('deletedBy', 'name email')
    .sort({ createdAt: -1 });
  res.json({ deletedBills });
});

export const restoreDeletedBill = asyncHandler(async (req, res) => {
  const deletedBill = await DeletedBill.findById(req.params.id).lean();
  if (!deletedBill) throw new ApiError(404, 'Deleted bill not found');

  const existingBill = await Bill.findOne({ invoiceNo: deletedBill.originalData.invoiceNo }).lean();
  if (existingBill) {
    throw new ApiError(409, 'Invoice number already exists in active bills');
  }

  const originalItems = (deletedBill.originalData.items || []).map((item) =>
    normalizeBillItemSnapshot(item)
  );

  await validateBillItemsForSale(originalItems);
  await deductSoldStock(originalItems, { _id: deletedBill._id, invoiceNo: deletedBill.originalData.invoiceNo }, req.user?._id);

  const restoredBillData = {
    ...deletedBill.originalData,
    _id: undefined,
    invoiceNo: deletedBill.originalData.invoiceNo,
    invoiceNumber: deletedBill.originalData.invoiceNumber || deletedBill.originalData.invoiceNo,
    items: originalItems,
    status: 'Completed',
    paidAmount: Number(deletedBill.originalData.paidAmount ?? deletedBill.originalData.total ?? 0),
    dueAmount: Math.max(Number(deletedBill.originalData.dueAmount || 0), 0),
    balanceAmount: Number(deletedBill.originalData.balanceAmount || 0),
    paymentStatus: deletedBill.originalData.paymentStatus || paymentStatusFromAmounts(Number(deletedBill.originalData.total || 0), Number(deletedBill.originalData.paidAmount || deletedBill.originalData.total || 0)),
    createdAt: deletedBill.originalData.createdAt,
    updatedAt: new Date()
  };

  const bill = await Bill.create(restoredBillData);
  await reconcileCustomerAccounting(bill.customer);
  await rebuildDayBook();
  await DeletedBill.findByIdAndDelete(req.params.id);

  res.json({ bill, message: 'Deleted bill restored' });
});

export const permanentlyDeleteDeletedBill = asyncHandler(async (req, res) => {
  const bill = await DeletedBill.findByIdAndDelete(req.params.id);
  if (!bill) throw new ApiError(404, 'Deleted bill not found');
  res.json({ message: 'Deleted bill permanently removed' });
});

// Get all bills with filters
export const getBills = asyncHandler(async (req, res) => {
  const { startDate, endDate, paymentMethod, customerMobile, page = 1, limit = 50 } = req.query;
  const query = {};

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (paymentMethod) query.paymentMethod = paymentMethod;
  if (customerMobile) query.customerMobile = customerMobile;

  const skip = (page - 1) * limit;
  const bills = await Bill.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Bill.countDocuments(query);

  res.json({
    bills,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// Search bills
export const searchBills = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) throw new ApiError(400, 'Search query required');

  const bills = await Bill.find({
    $or: [
      { invoiceNo: { $regex: q, $options: 'i' } },
      { customerMobile: { $regex: q, $options: 'i' } },
      { customerName: { $regex: q, $options: 'i' } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({ bills });
});

// Get today's sales stats
export const getTodaysSales = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const bills = await Bill.find({
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  const stats = {
    totalSales: bills.reduce((sum, b) => sum + b.total, 0),
    totalBills: bills.length,
    totalItems: bills.reduce((sum, b) => sum + (b.items || []).length, 0),
    totalTax: bills.reduce((sum, b) => sum + b.taxTotal, 0),
    totalDiscount: bills.reduce((sum, b) => sum + b.discount, 0),
    paymentBreakdown: {},
  };

  bills.forEach((bill) => {
    stats.paymentBreakdown[bill.paymentMethod] =
      (stats.paymentBreakdown[bill.paymentMethod] || 0) + bill.total;
  });

  res.json(stats);
});

// Hold bill
export const holdBill = asyncHandler(async (req, res) => {
  const { items, subtotal, taxTotal, discount, total, paymentMethod, customerName, customerMobile, invoiceNo } = req.body;

  if (!items || items.length === 0) {
    throw new ApiError(400, 'Held bill must contain at least one item');
  }

  // Normalize and validate items
  const normalizedItems = [];
  for (const it of items) {
    let pid = it.productId || it._id || null;
    // If pid is present but not a valid ObjectId, try to resolve by numeric productId or name
    if (pid && !mongoose.Types.ObjectId.isValid(String(pid))) {
      // Try numeric productId (handle number or numeric string)
      const pidStr = String(pid);
      if (/^[0-9]+$/.test(pidStr)) {
        let prod = await Product.findOne({ productId: Number(pidStr) }).lean();
        if (prod) {
          pid = prod._id;
        } else {
          // create a minimal product record so we have an ObjectId reference
          const newProd = await Product.create({
            productId: Number(pidStr),
            name: it.productName || it.name || `Prod ${pidStr}`,
            sku: `AUTO${Date.now()}${Math.floor(Math.random() * 1000)}`,
            barcode: null,
            purchasePrice: 0,
            sellingPrice: Number(it.price || it.sellingPrice || it.rate || 0) || 0,
            taxRate: Number(it.gst || it.taxRate || it.tax || 0) || 0,
            stock: 0,
            active: true
          });
          pid = newProd._id;
        }
      } else if (it.productName) {
        const prod = await Product.findOne({ name: it.productName }).lean();
        if (prod) pid = prod._id;
      }
    }

    if (!pid || !mongoose.Types.ObjectId.isValid(String(pid))) {
      throw new ApiError(400, `Invalid product identifier for item: ${JSON.stringify(it)}`);
    }

    const productIdObj = new mongoose.Types.ObjectId(String(pid));

    const product = await Product.findById(productIdObj).lean();
    const normalized = normalizeBillItemSnapshot({
      ...it,
      productId: productIdObj,
      productIdNumber: it.productIdNumber ?? it.numericProductId ?? it.productIdValue,
      stockAtSale: it.stockAtSale ?? product?.stock ?? 0
    }, product);

    normalizedItems.push(normalized);
  }

  const payload = {
    items: normalizedItems,
    subtotal: subtotal || 0,
    taxTotal: taxTotal || 0,
    discount: discount || 0,
    total: total || 0,
    paymentMethod: paymentMethod || 'Cash',
    customerName: customerName || 'Walk-in Customer',
    customerMobile: customerMobile || null,
    invoiceNo: invoiceNo || null,
    heldBy: req.user?._id
  };

  // include invoice date/time if provided
  if (req.body.invoiceAt) {
    const at = new Date(req.body.invoiceAt);
    if (!isNaN(at.getTime())) payload.invoiceAt = at;
  }

  console.log('Saving hold bill', payload);

  const heldBill = await HoldBill.create(payload);

  res.status(201).json({ heldBill, message: 'Bill held successfully' });
});

// Get held bills
export const getHeldBills = asyncHandler(async (req, res) => {
  const heldBills = await HoldBill.find({ expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 });
  res.json({ heldBills });
});

// Resume held bill
export const resumeHeldBill = asyncHandler(async (req, res) => {
  console.log('Resume held bill requested:', req.params.id);
  const heldBill = await HoldBill.findById(req.params.id).lean();
  if (!heldBill) throw new ApiError(404, 'Held bill not found');

  // Return the complete held bill data for restoration
  res.json({ heldBill });
});

// Delete held bill
export const deleteHeldBill = asyncHandler(async (req, res) => {
  const result = await HoldBill.findByIdAndDelete(req.params.id);
  if (!result) throw new ApiError(404, 'Held bill not found');
  res.json({ message: 'Held bill discarded' });
});

// Create refund
export const createRefund = asyncHandler(async (req, res) => {
  const { bill, items, type, reason } = req.body;

  const refund = await Refund.create({
    bill,
    items,
    type,
    reason,
    processedBy: req.user?._id,
  });

  // Restore stock for refunded items
  for (const it of items || []) {
    try {
      const pid = it.productId || it._id || it.product;
      if (pid && mongoose.Types.ObjectId.isValid(String(pid))) {
        await Product.updateOne({ _id: pid }, { $inc: { stock: Math.abs(it.quantity || it.qty || 0) } });
      }
    } catch (e) {
      console.warn('Failed to restore stock for refund item', it, e);
    }
  }

  res.status(201).json({ refund, message: 'Refund created successfully' });
});

// Get refunds
export const getRefunds = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (page - 1) * limit;

  const refunds = await Refund.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Refund.countDocuments();

  res.json({
    refunds,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// Log print
export const logPrint = asyncHandler(async (req, res) => {
  const { invoiceNo, printer, success, error } = req.body;

  const printLog = await PrintLog.create({
    invoiceNo,
    printer,
    success,
    error,
  });

  res.status(201).json({ printLog });
});
