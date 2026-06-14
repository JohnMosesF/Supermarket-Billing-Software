import Bill from '../models/Bill.js';
import { Customer } from '../models/Customer.js';
import DraftBill from '../models/DraftBill.js';
import DeletedBill from '../models/DeletedBill.js';
import PrintLog from '../models/PrintLog.js';
import HoldBill from '../models/HoldBill.js';
import { Product } from '../models/Product.js';
import mongoose from 'mongoose';
import Refund from '../models/Refund.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';

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

    const normalized = {
      productId: productIdObj,
      productName: it.productName || it.name || '',
      quantity: Number(it.quantity || it.qty || 1),
      price: Number(it.price || it.sellingPrice || it.rate || 0),
      tax: Number(it.gst || it.taxRate || it.tax || 0),
      total: Number(it.total != null ? it.total : (Number(it.price || it.sellingPrice || it.rate || 0) * Number(it.quantity || it.qty || 1)))
    };

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
    ? Number(req.body.paidAmount || 0)
    : Number(req.body.paidAmount ?? billTotal);

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

  // Deduct stock for each item (ensure availability)
  for (const it of normalizedItems) {
    const prod = await Product.findById(it.productId);
    if (!prod) throw new ApiError(400, `Product not found: ${String(it.productId)}`);
    if (prod.stock < it.quantity) {
      throw new ApiError(400, `Insufficient stock for ${prod.name || prod.sku}. Available ${prod.stock}, requested ${it.quantity}`);
    }
  }

  // Apply stock deduction
  for (const it of normalizedItems) {
    await Product.updateOne({ _id: it.productId }, { $inc: { stock: -Math.abs(it.quantity) } });
  }

  const bill = await Bill.create(billPayload);

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
  }

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
  const { items, subtotal, taxTotal, discount } = req.body;
  const bill = await Bill.findById(req.params.id);

  if (!bill) throw new ApiError(404, 'Bill not found');

  // Restore stock from old bill items
  for (const old of bill.items || []) {
    try {
      await Product.updateOne({ _id: old.productId }, { $inc: { stock: Math.abs(old.quantity) } });
    } catch (e) {
      console.warn('Failed to restore stock for', old.productId, e);
    }
  }

  // Normalize incoming items similar to create
  const normalizedItems = [];
  for (const it of items) {
    let pid = it.productId || it._id || null;
    if (!pid || !mongoose.Types.ObjectId.isValid(String(pid))) {
      throw new ApiError(400, `Invalid product identifier for item: ${JSON.stringify(it)}`);
    }
    const productIdObj = new mongoose.Types.ObjectId(String(pid));
    normalizedItems.push({
      productId: productIdObj,
      productName: it.productName || it.name || '',
      quantity: Number(it.quantity || it.qty || 1),
      price: Number(it.price || it.sellingPrice || it.rate || 0),
      tax: Number(it.gst || it.taxRate || it.tax || 0),
      total: Number(it.total != null ? it.total : (Number(it.price || it.sellingPrice || it.rate || 0) * Number(it.quantity || it.qty || 1)))
    });
  }

  // Check availability for new items
  for (const it of normalizedItems) {
    const prod = await Product.findById(it.productId);
    if (!prod) throw new ApiError(400, `Product not found: ${String(it.productId)}`);
    if (prod.stock < it.quantity) {
      throw new ApiError(400, `Insufficient stock for ${prod.name || prod.sku}. Available ${prod.stock}, requested ${it.quantity}`);
    }
  }

  // Apply stock deduction for new items
  for (const it of normalizedItems) {
    await Product.updateOne({ _id: it.productId }, { $inc: { stock: -Math.abs(it.quantity) } });
  }

  // Update bill fields
  bill.items = normalizedItems;
  bill.subtotal = subtotal;
  bill.taxTotal = taxTotal;
  bill.discount = discount;
  bill.total = subtotal + taxTotal - discount;
  bill.updatedAt = new Date();

  await bill.save();
  res.json({ bill, message: 'Bill updated successfully' });
});

// Delete bill (soft delete)
export const deleteBill = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const bill = await Bill.findById(req.params.id);

  if (!bill) throw new ApiError(404, 'Bill not found');

  // Create deleted bill record
  await DeletedBill.create({
    invoiceNo: bill.invoiceNo,
    deletedBy: req.user?._id,
    reason,
    originalData: bill.toObject(),
  });
  // Restore stock for all items before deleting
  for (const it of bill.items || []) {
    try {
      await Product.updateOne({ _id: it.productId }, { $inc: { stock: Math.abs(it.quantity) } });
    } catch (e) {
      console.warn('Failed to restore stock for', it.productId, e);
    }
  }

  // Delete bill
  await Bill.findByIdAndDelete(req.params.id);

  res.json({ message: 'Bill deleted successfully' });
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

    const normalized = {
      productId: productIdObj,
      productName: it.productName || it.name || '',
      quantity: Number(it.quantity || it.qty || 1),
      price: Number(it.price || it.sellingPrice || it.rate || 0),
      gst: Number(it.gst || it.taxRate || it.tax || 0),
      total: Number(it.total != null ? it.total : (Number(it.price || it.sellingPrice || it.rate || 0) * Number(it.quantity || it.qty || 1)))
    };

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
