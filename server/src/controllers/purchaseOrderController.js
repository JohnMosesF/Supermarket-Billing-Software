import { body, param, query } from 'express-validator';
import { Product } from '../models/Product.js';
import { PurchaseOrder } from '../models/PurchaseOrder.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { createPurchaseFromPurchaseOrder } from './purchaseController.js';

const statuses = ['draft', 'pending', 'partially_received', 'completed', 'cancelled'];

export const purchaseOrderRules = [
  body('supplier').isMongoId(),
  body('status').optional().isIn(statuses),
  body('items').isArray({ min: 1 }),
  body('items.*.product').isMongoId(),
  body('items.*.quantity').isFloat({ min: 0.001 }),
  body('items.*.costPrice').isFloat({ min: 0 }),
  body('items.*.gstRate').optional().isFloat({ min: 0 }),
  body('items.*.mrp').optional().isFloat({ min: 0 }),
  body('items.*.sellingPrice').optional().isFloat({ min: 0 })
];

export const purchaseOrderListRules = [
  query('status').optional().isIn(statuses),
  query('supplier').optional().isMongoId()
];

export const receivePurchaseOrderRules = [
  body('items').isArray({ min: 1 }),
  body('items.*.product').isMongoId(),
  body('items.*.receivedQuantity').isFloat({ min: 0.001 })
];

export const idRule = [param('id').isMongoId()];

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

async function resolveItems(rawItems) {
  const items = [];
  for (const row of rawItems) {
    const product = await Product.findById(row.product).lean();
    if (!product) throw new ApiError(404, 'Product not found');
    const quantity = Number(row.quantity || 0);
    const costPrice = Number(row.costPrice || 0);
    const gstRate = Number(row.gstRate ?? product.taxRate ?? 0);
    items.push({
      product: product._id,
      name: product.name,
      quantity,
      receivedQuantity: Number(row.receivedQuantity || 0),
      convertedQuantity: Number(row.convertedQuantity || 0),
      unit: row.unit || product.unit || 'pcs',
      costPrice,
      gstRate,
      mrp: Number(row.mrp || product.mrp || 0),
      sellingPrice: Number(row.sellingPrice || product.sellingPrice || 0),
      lineTotal: quantity * costPrice * (1 + gstRate / 100)
    });
  }
  return items;
}

function statusFor(order) {
  if (order.status === 'cancelled' || order.status === 'draft') return order.status;
  const items = order.items || [];
  const ordered = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const received = items.reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0);
  const converted = items.reduce((sum, item) => sum + Number(item.convertedQuantity || 0), 0);
  if (ordered > 0 && converted >= ordered) return 'completed';
  if (received > 0 || converted > 0) return 'partially_received';
  return 'pending';
}

function buildSearchFilter(req) {
  const filter = { active: true };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.supplier) filter.supplier = req.query.supplier;
  if (req.query.search) {
    const term = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ poNumber: term }, { notes: term }, { 'items.name': term }];
  }
  return filter;
}

export const listPurchaseOrders = asyncHandler(async (req, res) => {
  const purchaseOrders = await PurchaseOrder.find(buildSearchFilter(req))
    .populate('supplier', 'name mobile gstNumber address')
    .populate('purchase', 'invoiceNumber total purchaseDate')
    .sort({ createdAt: -1 })
    .limit(1000);
  res.json({ purchaseOrders });
});

export const createPurchaseOrder = asyncHandler(async (req, res) => {
  const items = await resolveItems(req.body.items || []);
  const purchaseOrder = await PurchaseOrder.create({
    poNumber: req.body.poNumber || await nextPoNumber(),
    supplier: req.body.supplier,
    orderDate: req.body.orderDate ? new Date(req.body.orderDate) : new Date(),
    expectedDate: req.body.expectedDate ? new Date(req.body.expectedDate) : undefined,
    status: req.body.status || 'draft',
    items,
    total: items.reduce((sum, item) => sum + item.lineTotal, 0),
    notes: req.body.notes,
    user: req.user?._id
  });
  res.status(201).json({ purchaseOrder });
});

export const getPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await PurchaseOrder.findById(req.params.id)
    .populate('supplier')
    .populate('items.product')
    .populate('purchase');
  if (!purchaseOrder) throw new ApiError(404, 'Purchase order not found');
  res.json({ purchaseOrder });
});

export const updatePurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await PurchaseOrder.findById(req.params.id);
  if (!purchaseOrder) throw new ApiError(404, 'Purchase order not found');
  if (['completed', 'cancelled'].includes(purchaseOrder.status)) throw new ApiError(400, 'Completed or cancelled purchase orders cannot be edited');

  const items = await resolveItems(req.body.items || []);
  purchaseOrder.supplier = req.body.supplier;
  purchaseOrder.orderDate = req.body.orderDate ? new Date(req.body.orderDate) : purchaseOrder.orderDate;
  purchaseOrder.expectedDate = req.body.expectedDate ? new Date(req.body.expectedDate) : undefined;
  purchaseOrder.status = req.body.status || purchaseOrder.status;
  purchaseOrder.items = items;
  purchaseOrder.total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  purchaseOrder.notes = req.body.notes;
  await purchaseOrder.save();
  res.json({ purchaseOrder });
});

export const receivePurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await PurchaseOrder.findById(req.params.id);
  if (!purchaseOrder) throw new ApiError(404, 'Purchase order not found');
  if (!['pending', 'partially_received'].includes(purchaseOrder.status)) throw new ApiError(400, 'Only pending purchase orders can receive goods');

  for (const received of req.body.items || []) {
    const item = purchaseOrder.items.find((row) => String(row.product) === String(received.product));
    if (!item) throw new ApiError(400, 'Received product is not in this purchase order');
    const newReceived = Number(item.receivedQuantity || 0) + Number(received.receivedQuantity || 0);
    if (newReceived > Number(item.quantity || 0)) throw new ApiError(400, `Received quantity exceeds ordered quantity for ${item.name}`);
    item.receivedQuantity = newReceived;
  }

  purchaseOrder.status = statusFor(purchaseOrder);
  await purchaseOrder.save();
  res.json({ purchaseOrder });
});

export const convertPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await PurchaseOrder.findById(req.params.id);
  if (!purchaseOrder) throw new ApiError(404, 'Purchase order not found');
  if (!['pending', 'partially_received'].includes(purchaseOrder.status)) throw new ApiError(400, 'Purchase order cannot be converted in its current status');

  const items = purchaseOrder.items
    .map((item) => {
      const quantity = Number(item.receivedQuantity || 0) - Number(item.convertedQuantity || 0);
      if (quantity <= 0) return null;
      return {
        product: item.product,
        name: item.name,
        quantity,
        unit: item.unit,
        costPrice: item.costPrice,
        gstRate: item.gstRate,
        mrp: item.mrp,
        sellingPrice: item.sellingPrice,
        lineTotal: quantity * Number(item.costPrice || 0) * (1 + Number(item.gstRate || 0) / 100)
      };
    })
    .filter(Boolean);

  if (!items.length) throw new ApiError(400, 'Receive goods before converting to purchase');

  const purchase = await createPurchaseFromPurchaseOrder({
    purchaseOrder,
    items,
    invoiceNumber: req.body.invoiceNumber || purchaseOrder.poNumber,
    userId: req.user?._id,
    notes: req.body.notes || `Converted from ${purchaseOrder.poNumber}`
  });

  for (const convertedItem of items) {
    const item = purchaseOrder.items.find((row) => String(row.product) === String(convertedItem.product));
    item.convertedQuantity = Number(item.convertedQuantity || 0) + Number(convertedItem.quantity || 0);
  }

  purchaseOrder.purchase = purchase._id;
  purchaseOrder.status = statusFor(purchaseOrder);
  await purchaseOrder.save();

  res.json({ purchaseOrder, purchase });
});

export const cancelPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await PurchaseOrder.findById(req.params.id);
  if (!purchaseOrder) throw new ApiError(404, 'Purchase order not found');
  if (purchaseOrder.status === 'completed') throw new ApiError(400, 'Completed purchase orders cannot be cancelled');
  purchaseOrder.status = 'cancelled';
  purchaseOrder.notes = req.body.notes ?? purchaseOrder.notes;
  await purchaseOrder.save();
  res.json({ purchaseOrder });
});
