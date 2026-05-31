import Bill from '../models/Bill.js';
import DraftBill from '../models/DraftBill.js';
import DeletedBill from '../models/DeletedBill.js';
import PrintLog from '../models/PrintLog.js';
import HoldBill from '../models/HoldBill.js';
import Refund from '../models/Refund.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';

// Create bill
export const createBill = asyncHandler(async (req, res) => {
  const { invoiceNo, items, subtotal, taxTotal, discount, total, paymentMethod, customerMobile, customerName } = req.body;

  if (!items || items.length === 0) {
    throw new ApiError(400, 'Bill must have at least one item');
  }

  // Auto-generate invoice number if not provided
  let finalInvoiceNo = invoiceNo;
  if (!finalInvoiceNo) {
    const lastBill = await Bill.findOne().sort({ createdAt: -1 }).lean();
    const lastNumber = lastBill ? parseInt(lastBill.invoiceNo.replace(/\D/g, '') || 0) : 0;
    finalInvoiceNo = `INV${String(lastNumber + 1).padStart(6, '0')}`;
  }

  const bill = await Bill.create({
    invoiceNo: finalInvoiceNo,
    items,
    subtotal,
    taxTotal,
    discount,
    total,
    paymentMethod: paymentMethod || 'cash',
    customerMobile: customerMobile || null,
    customerName: customerName || 'Walk-in Customer',
    staff: req.user?._id,
  });

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

  bill.items = items;
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
  const { items, subtotal, taxTotal, discount, total, paymentMethod, customerName, customerMobile } = req.body;

  if (!items || items.length === 0) {
    throw new ApiError(400, 'Held bill must contain at least one item');
  }

  const heldBill = await HoldBill.create({
    items,
    subtotal,
    taxTotal: taxTotal || 0,
    discount: discount || 0,
    total,
    paymentMethod: paymentMethod || 'cash',
    customerName: customerName || 'Walk-in Customer',
    customerMobile: customerMobile || null,
    heldBy: req.user?._id,
  });

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
  const heldBill = await HoldBill.findById(req.params.id);
  if (!heldBill) throw new ApiError(404, 'Held bill not found');
  
  // Return the complete held bill data for restoration
  res.json({
    heldBill: {
      _id: heldBill._id,
      items: heldBill.items,
      subtotal: heldBill.subtotal,
      taxTotal: heldBill.taxTotal,
      discount: heldBill.discount,
      total: heldBill.total,
      paymentMethod: heldBill.paymentMethod,
      customerName: heldBill.customerName,
      customerMobile: heldBill.customerMobile,
    }
  });
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
