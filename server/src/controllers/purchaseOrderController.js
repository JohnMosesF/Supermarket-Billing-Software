import { body, param, query } from 'express-validator';
import { Product } from '../models/Product.js';
import { Purchase } from '../models/Purchase.js';
import { PurchaseOrder } from '../models/PurchaseOrder.js';
import { Supplier } from '../models/Supplier.js';
import { Unit } from '../models/Unit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logAudit } from '../utils/audit.js';
import { createPurchaseFromPurchaseOrder } from './purchaseController.js';
import { ensureDefaultUnits } from './unitController.js';

const statuses = ['draft', 'ordered', 'pending', 'partially_received', 'completed', 'cancelled'];
const editableStatuses = ['draft', 'ordered'];
const receivableStatuses = ['ordered', 'pending', 'partially_received'];

export const purchaseOrderRules = [
  body('supplier').isMongoId(),
  body('status').optional().isIn(statuses),
  body('referenceNumber').optional({ nullable: true, checkFalsy: true }).isString().trim(),
  body('orderDate').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('expectedDate').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('items').isArray({ min: 1 }),
  body('items.*.product').isMongoId(),
  body('items.*.quantity').isFloat({ min: 0.001 }),
  body('items.*.freeQuantity').optional().isFloat({ min: 0 }),
  body('items.*.costPrice').optional().isFloat({ min: 0 }),
  body('items.*.purchasePrice').optional().isFloat({ min: 0 }),
  body('items.*.gstRate').optional().isFloat({ min: 0, max: 100 }),
  body('items.*.gstInclusive').optional().isBoolean(),
  body('items.*.discountPercent').optional().isFloat({ min: 0, max: 100 }),
  body('items.*.discountAmount').optional().isFloat({ min: 0 }),
  body('items.*.mrp').optional().isFloat({ min: 0 }),
  body('items.*.wholesalePrice').optional().isFloat({ min: 0 }),
  body('items.*.retailPrice').optional().isFloat({ min: 0 }),
  body('items.*.sellingPrice').optional().isFloat({ min: 0 }),
  body('roundOff').optional().isFloat(),
  body('roundOffMode').optional().isIn(['auto', 'manual'])
];

export const purchaseOrderListRules = [
  query('status').optional().isIn(statuses),
  query('supplier').optional().isMongoId(),
  query('from').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  query('to').optional({ nullable: true, checkFalsy: true }).isISO8601()
];

export const receivePurchaseOrderRules = [
  body('items').isArray({ min: 1 }),
  body('items.*.product').isMongoId(),
  body('items.*.receivedQuantity').isFloat({ min: 0.001 }),
  body('items.*.freeQuantity').optional().isFloat({ min: 0 }),
  body('notes').optional({ nullable: true, checkFalsy: true }).isString().trim()
];

export const cancelPurchaseOrderRules = [
  body('reason').trim().notEmpty().withMessage('Cancellation reason is required')
];

export const idRule = [param('id').isMongoId()];

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Math.round(number(value) * 100) / 100;
}

function automaticRoundOff(value) {
  const total = money(value);
  return money(Math.round(total) - total);
}

function roundOffModeFor(body) {
  if (body?.roundOffMode === 'manual' || body?.roundOffMode === 'auto') return body.roundOffMode;
  return money(body?.roundOff || 0) !== 0 ? 'manual' : 'auto';
}

function isWholeNumber(value) {
  return Math.abs(Number(value) - Math.round(Number(value))) < 0.0000001;
}

function hasExplicitDiscountAmount(item) {
  return item.discountAmount !== '' && item.discountAmount !== undefined && item.discountAmount !== null;
}

function normalizeStatus(status) {
  return status === 'pending' ? 'ordered' : status;
}

async function nextPoNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const count = await PurchaseOrder.countDocuments({ createdAt: { $gte: start, $lt: end } });
  return `PO-${datePart}-${String(count + 1).padStart(4, '0')}`;
}

async function getUnit(name) {
  await ensureDefaultUnits();
  const unit = await Unit.findOne({ name: String(name || 'pcs').trim().toLowerCase(), active: true }).lean();
  if (!unit) throw new ApiError(400, `Invalid unit: ${name}`);
  return unit;
}

function calculatePurchaseLine(item, product = {}) {
  const quantity = Math.max(number(item.quantity), 0);
  const freeQuantity = Math.max(number(item.freeQuantity), 0);
  const costPrice = Math.max(number(item.purchasePrice ?? item.costPrice), 0);
  const gstRate = Math.max(number(item.gstRate ?? item.gst ?? product.taxRate), 0);
  const grossAmount = money(quantity * costPrice);
  const discountPercent = Math.max(number(item.discountPercent), 0);
  const percentDiscount = grossAmount * discountPercent / 100;
  const discountAmount = money(Math.min(hasExplicitDiscountAmount(item) ? number(item.discountAmount) : percentDiscount, grossAmount));
  const discountedAmount = money(Math.max(grossAmount - discountAmount, 0));
  const gstInclusive = Boolean(item.gstInclusive ?? product.gstInclusive ?? false);
  const gstAmount = money(gstInclusive && gstRate > 0
    ? discountedAmount - discountedAmount / (1 + gstRate / 100)
    : discountedAmount * gstRate / 100);
  const taxableAmount = money(gstInclusive ? discountedAmount - gstAmount : discountedAmount);
  const lineTotal = money(gstInclusive ? discountedAmount : taxableAmount + gstAmount);
  const cgst = money(gstAmount / 2);
  const sgst = money(gstAmount - cgst);

  return { quantity, freeQuantity, costPrice, gstRate, gstInclusive, grossAmount, discountPercent, discountAmount, taxableAmount, gstAmount, cgst, sgst, igst: 0, lineTotal, netAmount: lineTotal };
}

async function resolveItems(rawItems) {
  const merged = new Map();
  for (const raw of rawItems || []) {
    const key = String(raw.product || '');
    if (!key) continue;
    const current = merged.get(key);
    if (current) {
      current.quantity = number(current.quantity) + number(raw.quantity);
      current.freeQuantity = number(current.freeQuantity) + number(raw.freeQuantity);
    } else {
      merged.set(key, { ...raw });
    }
  }

  const items = [];
  for (const row of merged.values()) {
    const product = await Product.findById(row.product).lean();
    if (!product || product.active === false) throw new ApiError(400, 'Product is required and must be active');
    const supplierUnit = await getUnit(row.unit || product.unit || 'pcs');
    const quantity = number(row.quantity);
    const freeQuantity = number(row.freeQuantity);
    if (quantity <= 0) throw new ApiError(400, `Quantity must be greater than zero for ${product.name}`);
    if (freeQuantity < 0) throw new ApiError(400, `Free quantity cannot be negative for ${product.name}`);
    if (!supplierUnit.allowDecimal && !isWholeNumber(quantity)) throw new ApiError(400, `Quantity for ${supplierUnit.name} must be a whole number`);
    if (!supplierUnit.allowDecimal && !isWholeNumber(freeQuantity)) throw new ApiError(400, `Free quantity for ${supplierUnit.name} must be a whole number`);

    const line = calculatePurchaseLine({ ...row, quantity, freeQuantity }, product);
    items.push({
      product: product._id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      pid: product.productId ? String(product.productId) : '',
      quantity: line.quantity,
      freeQuantity: line.freeQuantity,
      receivedQuantity: number(row.receivedQuantity),
      receivedFreeQuantity: number(row.receivedFreeQuantity),
      convertedQuantity: number(row.convertedQuantity),
      convertedFreeQuantity: number(row.convertedFreeQuantity),
      unit: supplierUnit.name,
      costPrice: line.costPrice,
      purchasePrice: line.costPrice,
      gstRate: line.gstRate,
      gstInclusive: line.gstInclusive,
      taxableAmount: line.taxableAmount,
      gstAmount: line.gstAmount,
      cgst: line.cgst,
      sgst: line.sgst,
      igst: line.igst,
      discountPercent: line.discountPercent,
      discountAmount: line.discountAmount,
      mrp: number(row.mrp || product.mrp),
      wholesalePrice: number(row.wholesalePrice || product.wholesalePrice),
      retailPrice: number(row.retailPrice ?? row.sellingPrice ?? product.retailPrice ?? product.sellingPrice),
      sellingPrice: number(row.sellingPrice || product.sellingPrice),
      netAmount: line.netAmount,
      lineTotal: line.lineTotal
    });
  }

  if (!items.length) throw new ApiError(400, 'At least one product is required');
  return items;
}

function summarize(items, body = {}) {
  const lineTotal = money(items.reduce((sum, item) => sum + number(item.lineTotal), 0));
  const roundOffMode = roundOffModeFor(body);
  const roundOff = roundOffMode === 'manual' ? money(body.roundOff) : automaticRoundOff(lineTotal);
  const grandTotal = money(Math.max(lineTotal + roundOff, 0));
  return {
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + number(item.quantity) + number(item.freeQuantity), 0),
    receivedQuantity: items.reduce((sum, item) => sum + number(item.receivedQuantity), 0),
    subTotal: money(items.reduce((sum, item) => sum + number(item.grossAmount ?? item.quantity * item.costPrice), 0)),
    taxableAmount: money(items.reduce((sum, item) => sum + number(item.taxableAmount), 0)),
    gstTotal: money(items.reduce((sum, item) => sum + number(item.gstAmount), 0)),
    discount: money(items.reduce((sum, item) => sum + number(item.discountAmount), 0)),
    roundOff,
    roundOffMode,
    grandTotal,
    total: grandTotal
  };
}

function statusFor(order) {
  const current = normalizeStatus(order.status);
  if (current === 'cancelled' || current === 'draft') return current;
  const items = order.items || [];
  const ordered = items.reduce((sum, item) => sum + number(item.quantity), 0);
  const received = items.reduce((sum, item) => sum + number(item.receivedQuantity), 0);
  if (ordered > 0 && received >= ordered - 0.000001) return 'completed';
  if (received > 0) return 'partially_received';
  return 'ordered';
}

function dateRange(query) {
  const range = {};
  if (query.from) range.$gte = new Date(query.from);
  if (query.to) {
    const end = new Date(query.to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? range : null;
}

async function buildSearchFilter(req) {
  const filter = { active: true };
  if (req.query.status) filter.status = ['ordered', 'pending'].includes(req.query.status) ? { $in: ['ordered', 'pending'] } : req.query.status;
  if (req.query.supplier) filter.supplier = req.query.supplier;
  const range = dateRange(req.query);
  if (range) filter.orderDate = range;
  if (req.query.search) {
    const term = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matchingSuppliers = await Supplier.find({
      $or: [{ supplierId: term }, { name: term }, { mobile: term }, { gstNumber: term }, { panNumber: term }]
    }).select('_id').lean();
    filter.$or = [
      { poNumber: term },
      { referenceNumber: term },
      { notes: term },
      { 'items.name': term },
      ...(matchingSuppliers.length ? [{ supplier: { $in: matchingSuppliers.map((supplier) => supplier._id) } }] : [])
    ];
  }
  return filter;
}

async function assertSupplier(id) {
  const supplier = await Supplier.findById(id).lean();
  if (!supplier || supplier.active === false) throw new ApiError(400, 'Supplier is required and must be active');
  return supplier;
}

function assertDates(orderDate, expectedDate) {
  if (!expectedDate) return;
  if (Number.isNaN(new Date(expectedDate).getTime())) throw new ApiError(400, 'Expected date is invalid');
  if (new Date(expectedDate) < new Date(orderDate)) throw new ApiError(400, 'Expected date cannot be before PO date');
}

async function loadOrder(id) {
  const order = await PurchaseOrder.findById(id);
  if (!order) throw new ApiError(404, 'Purchase order not found');
  if (order.status === 'pending') order.status = 'ordered';
  return order;
}

export const listPurchaseOrders = asyncHandler(async (req, res) => {
  const purchaseOrders = await PurchaseOrder.find(await buildSearchFilter(req))
    .populate('supplier', 'supplierId name mobile gstNumber address')
    .populate('purchase', 'purchaseNo invoiceNumber total purchaseDate')
    .populate('user cancelledBy convertedBy', 'name email')
    .populate('receivingHistory.receivedBy', 'name email')
    .sort({ orderDate: -1, createdAt: -1 })
    .limit(Number(req.query.limit || 1000));
  res.json({ purchaseOrders });
});

export const createPurchaseOrder = asyncHandler(async (req, res) => {
  await assertSupplier(req.body.supplier);
  const orderDate = req.body.orderDate ? new Date(req.body.orderDate) : new Date();
  assertDates(orderDate, req.body.expectedDate);
  const items = await resolveItems(req.body.items || []);
  const purchaseOrder = await PurchaseOrder.create({
    poNumber: req.body.poNumber || await nextPoNumber(),
    referenceNumber: req.body.referenceNumber,
    supplier: req.body.supplier,
    orderDate,
    expectedDate: req.body.expectedDate ? new Date(req.body.expectedDate) : undefined,
    status: normalizeStatus(req.body.status || 'draft'),
    items,
    ...summarize(items, req.body),
    notes: req.body.notes,
    user: req.user?._id
  });
  await logAudit(req, { action: 'Purchase Order Created', module: 'Purchase Orders', newValue: purchaseOrder.toObject() });
  res.status(201).json({ purchaseOrder });
});

export const getPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await PurchaseOrder.findById(req.params.id)
    .populate('supplier')
    .populate('items.product')
    .populate('purchase')
    .populate('user cancelledBy convertedBy receivingHistory.receivedBy', 'name email');
  if (!purchaseOrder) throw new ApiError(404, 'Purchase order not found');
  res.json({ purchaseOrder });
});

export const updatePurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await loadOrder(req.params.id);
  if (!editableStatuses.includes(normalizeStatus(purchaseOrder.status))) throw new ApiError(400, 'Only draft or ordered purchase orders can be edited');
  if (purchaseOrder.receivingHistory?.length) throw new ApiError(400, 'Purchase orders with receiving history cannot be edited');

  const previous = purchaseOrder.toObject();
  await assertSupplier(req.body.supplier);
  const orderDate = req.body.orderDate ? new Date(req.body.orderDate) : purchaseOrder.orderDate;
  assertDates(orderDate, req.body.expectedDate);
  const items = await resolveItems(req.body.items || []);
  const nextStatus = normalizeStatus(req.body.status || purchaseOrder.status);
  if (normalizeStatus(purchaseOrder.status) === 'ordered' && nextStatus === 'draft') {
    throw new ApiError(400, 'Ordered purchase orders cannot be moved back to draft');
  }

  purchaseOrder.referenceNumber = req.body.referenceNumber;
  purchaseOrder.supplier = req.body.supplier;
  purchaseOrder.orderDate = orderDate;
  purchaseOrder.expectedDate = req.body.expectedDate ? new Date(req.body.expectedDate) : undefined;
  purchaseOrder.status = nextStatus;
  purchaseOrder.items = items;
  Object.assign(purchaseOrder, summarize(items, req.body));
  purchaseOrder.notes = req.body.notes;
  await purchaseOrder.save();
  await logAudit(req, { action: 'Purchase Order Edited', module: 'Purchase Orders', previousValue: previous, newValue: purchaseOrder.toObject() });
  res.json({ purchaseOrder });
});

export const receivePurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await loadOrder(req.params.id);
  if (!receivableStatuses.includes(normalizeStatus(purchaseOrder.status))) throw new ApiError(400, 'Cancelled, draft, or completed purchase orders cannot be received');
  if (purchaseOrder.purchase || purchaseOrder.convertedAt) throw new ApiError(400, 'Converted purchase orders cannot be received again');

  const previous = purchaseOrder.toObject();
  const receiptItems = [];
  for (const received of req.body.items || []) {
    const item = purchaseOrder.items.find((row) => String(row.product) === String(received.product));
    if (!item) throw new ApiError(400, 'Received product is not in this purchase order');
    const receiveNow = number(received.receivedQuantity);
    const freeNow = number(received.freeQuantity);
    if (receiveNow <= 0) throw new ApiError(400, `Receive quantity must be greater than zero for ${item.name}`);
    if (freeNow < 0) throw new ApiError(400, `Free quantity cannot be negative for ${item.name}`);
    const remaining = number(item.quantity) - number(item.receivedQuantity);
    if (receiveNow > remaining + 0.000001) throw new ApiError(400, `Cannot receive more than remaining quantity for ${item.name}`);
    item.receivedQuantity = money(number(item.receivedQuantity) + receiveNow);
    item.receivedFreeQuantity = money(number(item.receivedFreeQuantity) + freeNow);
    receiptItems.push({ product: item.product, name: item.name, quantity: receiveNow, freeQuantity: freeNow, unit: item.unit });
  }

  if (!receiptItems.length) throw new ApiError(400, 'At least one receive quantity is required');
  purchaseOrder.receivingHistory.push({
    receiptNo: `${purchaseOrder.poNumber}-RCV-${String((purchaseOrder.receivingHistory?.length || 0) + 1).padStart(2, '0')}`,
    receivedAt: new Date(),
    receivedBy: req.user?._id,
    notes: req.body.notes,
    items: receiptItems
  });
  purchaseOrder.status = statusFor(purchaseOrder);
  Object.assign(purchaseOrder, summarize(purchaseOrder.items, purchaseOrder));
  await purchaseOrder.save();
  await logAudit(req, { action: purchaseOrder.status === 'completed' ? 'Purchase Order Completed' : 'Purchase Order Partially Received', module: 'Purchase Orders', previousValue: previous, newValue: purchaseOrder.toObject() });
  res.json({ purchaseOrder });
});

export const convertPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await loadOrder(req.params.id);
  if (purchaseOrder.status === 'cancelled') throw new ApiError(400, 'Cancelled Purchase Orders cannot be converted');
  if (purchaseOrder.status === 'draft') throw new ApiError(400, 'Draft Purchase Orders must be ordered before conversion');
  if (purchaseOrder.purchase || purchaseOrder.convertedAt || await Purchase.exists({ sourcePurchaseOrder: purchaseOrder._id, active: true })) {
    throw new ApiError(409, 'Purchase Order has already been converted');
  }

  const items = purchaseOrder.items
    .map((item) => {
      const quantity = number(item.receivedQuantity || item.quantity) - number(item.convertedQuantity);
      const receivedFree = number(item.receivedQuantity) > 0 ? number(item.receivedFreeQuantity) : number(item.freeQuantity);
      const freeQuantity = Math.max(receivedFree - number(item.convertedFreeQuantity), 0);
      if (quantity <= 0) return null;
      return {
        product: item.product,
        name: item.name,
        sku: item.sku,
        barcode: item.barcode,
        quantity,
        freeQuantity,
        unit: item.unit,
        costPrice: item.costPrice,
        purchasePrice: item.costPrice,
        gstRate: item.gstRate,
        gstInclusive: item.gstInclusive,
        taxableAmount: item.taxableAmount,
        gstAmount: item.gstAmount,
        cgst: item.cgst,
        sgst: item.sgst,
        igst: item.igst,
        discountPercent: item.discountPercent,
        discountAmount: item.discountAmount,
        mrp: item.mrp,
        wholesalePrice: item.wholesalePrice,
        retailPrice: item.retailPrice,
        sellingPrice: item.sellingPrice,
        netAmount: item.netAmount,
        lineTotal: calculatePurchaseLine({ ...(item.toObject ? item.toObject() : item), quantity }).lineTotal
      };
    })
    .filter(Boolean);

  if (!items.length) throw new ApiError(400, 'No quantity is available to convert');

  const previous = purchaseOrder.toObject();
  const purchase = await createPurchaseFromPurchaseOrder({
    purchaseOrder,
    items,
    invoiceNumber: req.body.invoiceNumber || purchaseOrder.poNumber,
    userId: req.user?._id,
    notes: req.body.notes || `Converted from ${purchaseOrder.poNumber}`
  });

  purchaseOrder.items.forEach((item) => {
    item.convertedQuantity = number(item.receivedQuantity || item.quantity);
    item.convertedFreeQuantity = number(item.receivedQuantity) > 0 ? number(item.receivedFreeQuantity) : number(item.freeQuantity);
  });
  purchaseOrder.purchase = purchase._id;
  purchaseOrder.convertedAt = new Date();
  purchaseOrder.convertedBy = req.user?._id;
  purchaseOrder.status = 'completed';
  await purchaseOrder.save();
  await logAudit(req, { action: 'Purchase Order Converted to Purchase', module: 'Purchase Orders', previousValue: previous, newValue: { purchaseOrder: purchaseOrder.toObject(), purchase: purchase.toObject() } });
  res.json({ purchaseOrder, purchase });
});

export const cancelPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await loadOrder(req.params.id);
  if (purchaseOrder.status === 'completed' || purchaseOrder.purchase || purchaseOrder.convertedAt) throw new ApiError(400, 'Completed or converted purchase orders cannot be cancelled');
  if (number(purchaseOrder.receivedQuantity) > 0 || purchaseOrder.receivingHistory?.length) throw new ApiError(400, 'Purchase orders with received goods cannot be cancelled');
  const previous = purchaseOrder.toObject();
  purchaseOrder.status = 'cancelled';
  purchaseOrder.cancelledAt = new Date();
  purchaseOrder.cancelledBy = req.user?._id;
  purchaseOrder.cancellationReason = req.body.reason;
  purchaseOrder.notes = req.body.notes ?? purchaseOrder.notes;
  await purchaseOrder.save();
  await logAudit(req, { action: 'Purchase Order Cancelled', module: 'Purchase Orders', previousValue: previous, newValue: purchaseOrder.toObject() });
  res.json({ purchaseOrder });
});

export const printPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await PurchaseOrder.findById(req.params.id).populate('supplier', 'name mobile gstNumber address').populate('items.product', 'productId sku barcode name');
  if (!purchaseOrder) throw new ApiError(404, 'Purchase order not found');
  await logAudit(req, { action: 'Purchase Order Printed', module: 'Purchase Orders', newValue: { poNumber: purchaseOrder.poNumber } });
  res.json({ purchaseOrder });
});
