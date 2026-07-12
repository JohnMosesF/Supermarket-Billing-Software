import { body } from 'express-validator';
import { InventoryLog } from '../models/InventoryLog.js';
import { Product } from '../models/Product.js';
import { Purchase } from '../models/Purchase.js';
import { PurchaseReturn } from '../models/PurchaseReturn.js';
import { Supplier } from '../models/Supplier.js';
import { SupplierPriceHistory } from '../models/SupplierPriceHistory.js';
import { Unit } from '../models/Unit.js';
import { ensureDefaultUnits } from './unitController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { makeSku } from '../utils/invoice.js';
import { reconcileSupplierAccounting, rebuildDayBook } from '../services/accountingService.js';
import { logAudit } from '../utils/audit.js';

export const purchaseRules = [
  body('items').isArray({ min: 1 }),
  body('items.*.product').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('items.*.quantity').isFloat({ min: 0.001 }),
  body('items.*.costPrice').isFloat({ min: 0 }),
  body('paidAmount').optional().isFloat({ min: 0 })
];

export const listPurchases = asyncHandler(async (req, res) => {
  const showDeleted = String(req.query.showDeleted || 'false').toLowerCase() === 'true';
  const filter = showDeleted ? {} : { active: true };
  const purchases = await Purchase.find(filter).populate('supplier', 'name mobile').populate('user', 'name').sort({ purchaseDate: -1, createdAt: -1 });
  res.json({ purchases });
});

async function getUnit(name) {
  await ensureDefaultUnits();
  const unit = await Unit.findOne({ name: String(name || 'pcs').trim().toLowerCase(), active: true }).lean();
  if (!unit) throw new ApiError(400, `Invalid unit: ${name}`);
  return unit;
}

function isWholeNumber(value) {
  return Math.abs(Number(value) - Math.round(Number(value))) < 0.0000001;
}

async function resolvePurchaseItems(rawItems) {
  const items = [];

  for (const item of rawItems) {
    const unit = await getUnit(item.unit);
    const quantity = Number(item.quantity || 0);
    if (!unit.allowDecimal && !isWholeNumber(quantity)) {
      throw new ApiError(400, `Quantity for ${unit.name} must be a whole number`);
    }

    let product = item.product ? await Product.findById(item.product) : null;
    if (!product) {
      if (!item.name && !item.productName) throw new ApiError(400, 'Product is required');
      const totalProducts = await Product.countDocuments();
      const lastProduct = await Product.findOne().sort({ productId: -1 }).lean();
      product = await Product.create({
        productId: (lastProduct?.productId || 0) + 1,
        name: item.name || item.productName,
        sku: item.sku || makeSku(item.name || item.productName, totalProducts),
        purchasePrice: Number(item.costPrice || 0),
        sellingPrice: Number(item.sellingPrice || item.mrp || item.costPrice || 0),
        mrp: Number(item.mrp || 0),
        taxRate: Number(item.gstRate || item.gst || 0),
        unit: unit.name,
        allowDecimalQty: unit.allowDecimal,
        stock: 0,
        active: true
      });
    }

    const costPrice = Number(item.costPrice || 0);
    const gstRate = Number(item.gstRate ?? item.gst ?? 0);
    const lineTotal = quantity * costPrice * (1 + gstRate / 100);
    items.push({
      product: product._id,
      name: product.name,
      quantity,
      unit: unit.name,
      costPrice,
      gstRate,
      mrp: Number(item.mrp || product.mrp || 0),
      sellingPrice: Number(item.sellingPrice || product.sellingPrice || 0),
      lineTotal
    });
  }

  return items;
}

async function recordSupplierPriceHistory(purchase) {
  await SupplierPriceHistory.deleteMany({ purchase: purchase._id });
  const entries = (purchase.items || []).map((item) => ({
    product: item.product,
    supplier: purchase.supplier,
    purchase: purchase._id,
    purchaseDate: purchase.purchaseDate || purchase.createdAt || new Date(),
    purchasePrice: Number(item.costPrice || 0),
    quantity: Number(item.quantity || 0),
    invoiceNumber: purchase.invoiceNumber
  })).filter((entry) => entry.product && entry.quantity > 0);
  if (entries.length) await SupplierPriceHistory.insertMany(entries);
}

async function applyPurchaseStock(items, purchase, userId, direction = 1) {
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product) throw new ApiError(404, 'Product not found');
    const quantity = Math.abs(Number(item.quantity || 0)) * direction;
    const stockBefore = Number(product.stock || 0);
    const stockAfter = stockBefore + quantity;
    if (stockAfter < 0) throw new ApiError(400, 'Insufficient stock available.');
    product.stock = stockAfter;
    if (direction > 0) {
      product.purchasePrice = item.costPrice;
      if (item.sellingPrice) product.sellingPrice = item.sellingPrice;
      if (item.mrp) product.mrp = item.mrp;
      if (item.gstRate != null) product.taxRate = item.gstRate;
      product.unit = item.unit || product.unit;
    }
    await product.save();
    await InventoryLog.create({
      product: product._id,
      type: direction > 0 ? 'stock_in' : 'stock_out',
      quantity: Math.abs(Number(item.quantity || 0)),
      stockBefore,
      stockAfter,
      reason: direction > 0 ? `Purchase ${purchase.invoiceNumber || purchase._id}` : `Purchase edit restore ${purchase.invoiceNumber || purchase._id}`,
      source: 'purchase',
      referenceId: purchase._id,
      supplier: purchase.supplier,
      purchaseInvoiceNo: purchase.invoiceNumber,
      user: userId
    });
  }
}

async function recalculateSupplier(supplierId) {
  if (!supplierId) return;
  const [purchases, returns] = await Promise.all([
    Purchase.find({ supplier: supplierId, active: true }).lean(),
    PurchaseReturn.find({ supplier: supplierId, status: 'Completed' }).lean()
  ]);
  const grossPurchases = purchases.reduce((sum, purchase) => sum + Number(purchase.total || 0), 0);
  const paid = purchases.reduce((sum, purchase) => sum + Number(purchase.paidAmount || 0), 0);
  const returned = returns.reduce((sum, entry) => sum + Number(entry.returnAmount || 0), 0);
  await Supplier.updateOne({ _id: supplierId }, {
    $set: {
      totalReturns: returned,
      totalPurchases: Math.max(grossPurchases - returned, 0),
      outstandingBalance: Math.max(grossPurchases - paid - returned, 0)
    }
  });
}

export const createPurchase = asyncHandler(async (req, res) => {
  const items = await resolvePurchaseItems(req.body.items || []);
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const paidAmount = Math.min(Number(req.body.paidAmount || 0), total);

  const purchase = await Purchase.create({
    supplier: req.body.supplier,
    invoiceNumber: req.body.invoiceNumber,
    purchaseDate: req.body.purchaseDate ? new Date(req.body.purchaseDate) : new Date(),
    items,
    total,
    paidAmount,
    sourcePurchaseOrder: req.body.sourcePurchaseOrder,
    user: req.user?._id,
    notes: req.body.notes
  });

  await applyPurchaseStock(items, purchase, req.user?._id, 1);
  await recordSupplierPriceHistory(purchase);
  await recalculateSupplier(purchase.supplier);
  await reconcileSupplierAccounting(purchase.supplier);
  await rebuildDayBook();
  await logAudit(req, { action: 'Purchase Created', module: 'Purchases', newValue: purchase.toObject() });

  res.status(201).json({ purchase });
});

export const getPurchase = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findById(req.params.id).populate('supplier').populate('items.product');
  if (!purchase) throw new ApiError(404, 'Purchase not found');
  res.json({ purchase });
});

export const updatePurchase = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) throw new ApiError(404, 'Purchase not found');
  const previous = purchase.toObject();
  const previousSupplier = purchase.supplier;

  const items = await resolvePurchaseItems(req.body.items || []);
  await applyPurchaseStock(purchase.items, purchase, req.user?._id, -1);

  purchase.supplier = req.body.supplier || undefined;
  purchase.invoiceNumber = req.body.invoiceNumber;
  purchase.purchaseDate = req.body.purchaseDate ? new Date(req.body.purchaseDate) : purchase.purchaseDate;
  purchase.items = items;
  purchase.total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  purchase.paidAmount = Math.min(Number(req.body.paidAmount || 0), purchase.total);
  purchase.sourcePurchaseOrder = req.body.sourcePurchaseOrder || purchase.sourcePurchaseOrder;
  purchase.notes = req.body.notes;
  await purchase.save();

  await applyPurchaseStock(items, purchase, req.user?._id, 1);
  await recordSupplierPriceHistory(purchase);
  await recalculateSupplier(previousSupplier);
  if (String(previousSupplier || '') !== String(purchase.supplier || '')) await recalculateSupplier(purchase.supplier);
  await reconcileSupplierAccounting(previousSupplier);
  if (String(previousSupplier || '') !== String(purchase.supplier || '')) await reconcileSupplierAccounting(purchase.supplier);
  await rebuildDayBook();
  await logAudit(req, { action: 'Purchase Updated', module: 'Purchases', previousValue: previous, newValue: purchase.toObject() });
  res.json({ purchase });
});

export const deletePurchase = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!purchase) throw new ApiError(404, 'Purchase not found');
  await SupplierPriceHistory.deleteMany({ purchase: purchase._id });
  await recalculateSupplier(purchase.supplier);
  await reconcileSupplierAccounting(purchase.supplier);
  await rebuildDayBook();
  await logAudit(req, { action: 'Purchase Deleted', module: 'Purchases', previousValue: purchase.toObject(), newValue: { active: false } });
  res.json({ purchase, message: 'Purchase soft deleted' });
});

export const getSupplierPriceHistory = asyncHandler(async (req, res) => {
  const productId = req.query.product;
  if (!productId) throw new ApiError(400, 'Product is required');

  const limit = Math.min(Number(req.query.limit || 20), 100);
  const filter = { product: productId };
  if (req.query.supplier) filter.supplier = req.query.supplier;

  const [history, average] = await Promise.all([
    SupplierPriceHistory.find(filter)
      .populate('supplier', 'name mobile')
      .sort({ purchaseDate: -1, createdAt: -1 })
      .limit(limit)
      .lean(),
    SupplierPriceHistory.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$product',
          averagePurchasePrice: { $avg: '$purchasePrice' },
          totalQuantity: { $sum: '$quantity' },
          entries: { $sum: 1 }
        }
      }
    ])
  ]);

  const last = history[0] || null;
  res.json({
    history,
    lastPurchasePrice: last?.purchasePrice || 0,
    lastSupplier: last?.supplier || null,
    averagePurchasePrice: average[0]?.averagePurchasePrice || 0,
    totalPurchasedQuantity: average[0]?.totalQuantity || 0,
    entries: average[0]?.entries || 0
  });
});

export async function createPurchaseFromPurchaseOrder({ purchaseOrder, items, invoiceNumber, userId, notes }) {
  const total = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const purchase = await Purchase.create({
    supplier: purchaseOrder.supplier,
    invoiceNumber,
    purchaseDate: new Date(),
    items,
    total,
    paidAmount: 0,
    sourcePurchaseOrder: purchaseOrder._id,
    user: userId,
    notes
  });

  await applyPurchaseStock(items, purchase, userId, 1);
  await recordSupplierPriceHistory(purchase);
  await recalculateSupplier(purchase.supplier);
  await reconcileSupplierAccounting(purchase.supplier);
  await rebuildDayBook();
  return purchase;
}
