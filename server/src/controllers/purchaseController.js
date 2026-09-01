import { body } from 'express-validator';
import { Product } from '../models/Product.js';
import { Purchase } from '../models/Purchase.js';
import { PurchaseOrder } from '../models/PurchaseOrder.js';
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
import { getInventorySettings, moveStock, nextPurchaseNumber } from '../services/inventoryService.js';

export const purchaseRules = [
  body('items').isArray({ min: 1 }),
  body('items.*.product').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('items.*.quantity').isFloat({ min: 0.001 }),
  body('items.*.freeQuantity').optional().isFloat({ min: 0 }),
  body('items.*.costPrice').optional().isFloat({ min: 0 }),
  body('items.*.purchasePrice').optional().isFloat({ min: 0 }),
  body('items.*.gstRate').optional().isFloat({ min: 0, max: 100 }),
  body('items.*.gst').optional().isFloat({ min: 0, max: 100 }),
  body('items.*.gstInclusive').optional().isBoolean(),
  body('items.*.discountPercent').optional().isFloat({ min: 0, max: 100 }),
  body('items.*.discountAmount').optional().isFloat({ min: 0 }),
  body('roundOff').optional().isFloat(),
  body('roundOffMode').optional().isIn(['auto', 'manual']),
  body('paidAmount').optional().isFloat({ min: 0 })
];

export const listPurchases = asyncHandler(async (req, res) => {
  const showDeleted = String(req.query.showDeleted || 'false').toLowerCase() === 'true';
  const filter = showDeleted ? {} : { active: true };
  const search = String(req.query.search || req.query.q || '').trim();
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matchingSuppliers = await Supplier.find({
      $or: [{ supplierId: regex }, { name: regex }, { mobile: regex }, { gstNumber: regex }, { panNumber: regex }]
    }).select('_id').lean();
    filter.$or = [
      { purchaseNo: regex },
      { invoiceNumber: regex },
      { supplierInvoice: regex },
      { remarks: regex },
      ...(matchingSuppliers.length ? [{ supplier: { $in: matchingSuppliers.map((supplier) => supplier._id) } }] : [])
    ];
  }
  if (req.query.supplier) filter.supplier = req.query.supplier;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
  if (req.query.status === 'cancelled') filter.active = false;
  if (req.query.status === 'active') filter.active = true;
  if (req.query.from || req.query.to) {
    filter.purchaseDate = {};
    if (req.query.from) filter.purchaseDate.$gte = new Date(req.query.from);
    if (req.query.to) {
      const end = new Date(req.query.to);
      end.setHours(23, 59, 59, 999);
      filter.purchaseDate.$lte = end;
    }
  }
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

function roundOffModeForSource(source) {
  if (source?.roundOffMode === 'manual' || source?.roundOffMode === 'auto') return source.roundOffMode;
  return money(source?.roundOff || 0) !== 0 ? 'manual' : 'auto';
}

function hasExplicitDiscountAmount(item) {
  return item.discountAmount !== '' && item.discountAmount !== undefined && item.discountAmount !== null;
}

function calculatePurchaseLine(item, product = {}) {
  const quantity = Math.max(number(item.quantity), 0);
  const freeQuantity = Math.max(number(item.freeQuantity), 0);
  const costPrice = Math.max(number(item.purchasePrice ?? item.costPrice), 0);
  const gstRate = Math.max(number(item.gstRate ?? item.gst), 0);
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

  return {
    quantity,
    freeQuantity,
    costPrice,
    gstRate,
    gstInclusive,
    grossAmount,
    discountPercent,
    discountAmount,
    taxableAmount,
    gstAmount,
    cgst,
    sgst,
    igst: 0,
    lineTotal,
    netAmount: lineTotal
  };
}

async function resolvePurchaseItems(rawItems, settings) {
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

    const line = calculatePurchaseLine({ ...item, quantity }, product);
    items.push({
      product: product._id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      batchNo: item.batchNo,
      expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
      quantity: line.quantity,
      freeQuantity: line.freeQuantity,
      unit: unit.name,
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
      mrp: Number(item.mrp || product.mrp || 0),
      wholesalePrice: Number(item.wholesalePrice || product.wholesalePrice || 0),
      retailPrice: Number(item.retailPrice ?? item.sellingPrice ?? product.retailPrice ?? product.sellingPrice ?? 0),
      sellingPrice: Number(item.sellingPrice || product.sellingPrice || 0),
      netAmount: line.netAmount,
      lineTotal: line.lineTotal
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

function summarizePurchase(items, body = {}) {
  const subTotal = money(items.reduce((sum, item) => {
    const taxable = item.taxableAmount ?? (Number(item.quantity || 0) * Number(item.costPrice || item.purchasePrice || 0) - Number(item.discountAmount || 0));
    return sum + Math.max(Number(taxable || 0), 0);
  }, 0));
  const gstTotal = money(items.reduce((sum, item) => sum + Number(item.gstAmount || 0), 0));
  const discount = money(items.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0));
  const lineTotal = money(items.reduce((sum, item) => sum + Number(item.lineTotal ?? item.netAmount ?? 0), 0));
  const freightCharges = money(body.freightCharges || 0);
  const preRoundTotal = money(lineTotal + freightCharges);
  const roundOffMode = roundOffModeForSource(body);
  const roundOff = roundOffMode === 'manual' ? money(body.roundOff || 0) : automaticRoundOff(preRoundTotal);
  const grandTotal = money(Math.max(preRoundTotal + roundOff, 0));
  const amountPaid = money(Math.min(Number(body.amountPaid ?? body.paidAmount ?? 0), grandTotal));
  return {
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0) + Number(item.freeQuantity || 0), 0),
    subTotal,
    gstTotal,
    discount,
    freightCharges,
    roundOff,
    roundOffMode,
    grandTotal,
    total: grandTotal,
    paidAmount: amountPaid,
    amountPaid,
    balance: Math.max(grandTotal - amountPaid, 0),
    paymentStatus: amountPaid >= grandTotal ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Unpaid'
  };
}

async function applyPurchaseStock(items, purchase, userId, direction = 1) {
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product) throw new ApiError(404, 'Product not found');
    const stockQuantity = Math.abs(Number(item.quantity || 0) + Number(item.freeQuantity || 0));
    if (direction > 0) {
      product.purchasePrice = item.costPrice;
      if (item.sellingPrice) product.sellingPrice = item.sellingPrice;
      if (item.retailPrice) product.retailPrice = item.retailPrice;
      if (item.wholesalePrice) product.wholesalePrice = item.wholesalePrice;
      if (item.mrp) product.mrp = item.mrp;
      if (item.gstRate != null) product.taxRate = item.gstRate;
      product.unit = item.unit || product.unit;
      await product.save();
    }
    await moveStock({
      productId: product._id,
      quantity: stockQuantity,
      direction: direction > 0 ? 'in' : 'out',
      referenceType: 'Purchase',
      referenceNumber: purchase.purchaseNo || purchase.invoiceNumber || String(purchase._id),
      referenceId: purchase._id,
      reason: direction > 0 ? `Purchase ${purchase.purchaseNo || purchase.invoiceNumber || purchase._id}` : `Purchase edit reversal ${purchase.purchaseNo || purchase.invoiceNumber || purchase._id}`,
      source: 'purchase',
      supplier: purchase.supplier,
      purchaseInvoiceNo: purchase.invoiceNumber || purchase.supplierInvoice,
      userId
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
  const settings = await getInventorySettings();
  let sourcePurchaseOrder = null;
  if (req.body.sourcePurchaseOrder) {
    sourcePurchaseOrder = await PurchaseOrder.findById(req.body.sourcePurchaseOrder);
    if (!sourcePurchaseOrder) throw new ApiError(404, 'Purchase order not found');
    if (sourcePurchaseOrder.status === 'cancelled') throw new ApiError(400, 'Cancelled Purchase Orders cannot be converted');
    if (sourcePurchaseOrder.status === 'draft') throw new ApiError(400, 'Draft Purchase Orders must be ordered before conversion');
    if (sourcePurchaseOrder.purchase || sourcePurchaseOrder.convertedAt || await Purchase.exists({ sourcePurchaseOrder: sourcePurchaseOrder._id, active: true })) {
      throw new ApiError(409, 'Purchase Order has already been converted');
    }
  }
  const items = await resolvePurchaseItems(req.body.items || [], settings);
  const summary = summarizePurchase(items, req.body);
  const purchaseNo = String(req.body.purchaseNo || '').trim() || (settings.autoGeneratePurchaseNumber ? await nextPurchaseNumber() : undefined);
  if (purchaseNo && await Purchase.exists({ purchaseNo })) throw new ApiError(409, 'Purchase number already exists');
  const supplierInvoice = String(req.body.supplierInvoice || req.body.invoiceNumber || '').trim();
  if (settings.preventDuplicateSupplierInvoice && supplierInvoice) {
    const duplicate = await Purchase.exists({ supplier: req.body.supplier, supplierInvoice, active: true });
    if (duplicate) throw new ApiError(409, 'Supplier invoice already exists');
  }

  const purchase = await Purchase.create({
    purchaseNo,
    supplier: req.body.supplier,
    invoiceNumber: req.body.invoiceNumber,
    supplierInvoice,
    purchaseDate: req.body.purchaseDate ? new Date(req.body.purchaseDate) : new Date(),
    expectedDeliveryDate: req.body.expectedDeliveryDate ? new Date(req.body.expectedDeliveryDate) : undefined,
    items,
    ...summary,
    sourcePurchaseOrder: req.body.sourcePurchaseOrder,
    user: req.user?._id,
    notes: req.body.notes || req.body.remarks,
    remarks: req.body.remarks
  });

  await applyPurchaseStock(items, purchase, req.user?._id, 1);
  await recordSupplierPriceHistory(purchase);
  if (sourcePurchaseOrder) {
    sourcePurchaseOrder.items.forEach((item) => {
      const purchased = items.find((row) => String(row.product) === String(item.product));
      if (purchased) {
        item.convertedQuantity = Number(item.convertedQuantity || 0) + Number(purchased.quantity || 0);
        item.convertedFreeQuantity = Number(item.convertedFreeQuantity || 0) + Number(purchased.freeQuantity || 0);
      }
    });
    sourcePurchaseOrder.purchase = purchase._id;
    sourcePurchaseOrder.convertedAt = new Date();
    sourcePurchaseOrder.convertedBy = req.user?._id;
    sourcePurchaseOrder.status = 'completed';
    await sourcePurchaseOrder.save();
  }
  await recalculateSupplier(purchase.supplier);
  await reconcileSupplierAccounting(purchase.supplier);
  await rebuildDayBook();
  await logAudit(req, { action: 'Purchase Created', module: 'Purchases', newValue: purchase.toObject() });
  if (sourcePurchaseOrder) {
    await logAudit(req, { action: 'Purchase Order Converted to Purchase', module: 'Purchase Orders', newValue: { poNumber: sourcePurchaseOrder.poNumber, purchase: purchase._id } });
  }

  res.status(201).json({ purchase });
});

export const getPurchase = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findById(req.params.id).populate('supplier').populate('items.product');
  if (!purchase) throw new ApiError(404, 'Purchase not found');
  res.json({ purchase });
});

export const duplicatePurchase = asyncHandler(async (req, res) => {
  const source = await Purchase.findById(req.params.id).lean();
  if (!source) throw new ApiError(404, 'Purchase not found');
  const settings = await getInventorySettings();
  const purchaseNo = settings.autoGeneratePurchaseNumber ? await nextPurchaseNumber() : undefined;
  const clone = await Purchase.create({
    ...source,
    _id: undefined,
    purchaseNo,
    invoiceNumber: '',
    supplierInvoice: '',
    purchaseDate: new Date(),
    expectedDeliveryDate: undefined,
    paidAmount: 0,
    amountPaid: 0,
    balance: Number(source.total || source.grandTotal || 0),
    paymentStatus: 'Unpaid',
    returnCreditAmount: 0,
    user: req.user?._id,
    active: true,
    createdAt: undefined,
    updatedAt: undefined
  });
  await logAudit(req, { action: 'Purchase Duplicated', module: 'Purchases', newValue: clone.toObject() });
  res.status(201).json({ purchase: clone });
});

export const updatePurchase = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) throw new ApiError(404, 'Purchase not found');
  const previous = purchase.toObject();
  const previousSupplier = purchase.supplier;

  const settings = await getInventorySettings();
  const items = await resolvePurchaseItems(req.body.items || [], settings);
  await applyPurchaseStock(purchase.items, purchase, req.user?._id, -1);

  purchase.supplier = req.body.supplier || undefined;
  const incomingPurchaseNo = String(req.body.purchaseNo || purchase.purchaseNo || '').trim();
  if (incomingPurchaseNo && incomingPurchaseNo !== purchase.purchaseNo && await Purchase.exists({ _id: { $ne: purchase._id }, purchaseNo: incomingPurchaseNo })) {
    throw new ApiError(409, 'Purchase number already exists');
  }
  purchase.purchaseNo = incomingPurchaseNo || purchase.purchaseNo;
  purchase.invoiceNumber = req.body.invoiceNumber;
  purchase.supplierInvoice = String(req.body.supplierInvoice || req.body.invoiceNumber || '').trim();
  purchase.purchaseDate = req.body.purchaseDate ? new Date(req.body.purchaseDate) : purchase.purchaseDate;
  purchase.expectedDeliveryDate = req.body.expectedDeliveryDate ? new Date(req.body.expectedDeliveryDate) : undefined;
  purchase.items = items;
  Object.assign(purchase, summarizePurchase(items, req.body));
  purchase.sourcePurchaseOrder = req.body.sourcePurchaseOrder || purchase.sourcePurchaseOrder;
  purchase.notes = req.body.notes || req.body.remarks;
  purchase.remarks = req.body.remarks;
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
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) throw new ApiError(404, 'Purchase not found');
  if (!purchase.active) return res.json({ purchase, message: 'Purchase already deleted' });
  await applyPurchaseStock(purchase.items, purchase, req.user?._id, -1);
  purchase.active = false;
  await purchase.save();
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
  const settings = await getInventorySettings();
  const purchase = await Purchase.create({
    purchaseNo: settings.autoGeneratePurchaseNumber ? await nextPurchaseNumber() : undefined,
    supplier: purchaseOrder.supplier,
    invoiceNumber,
    supplierInvoice: invoiceNumber,
    purchaseDate: new Date(),
    items,
    ...summarizePurchase(items, { paidAmount: 0, roundOff: purchaseOrder.roundOff, roundOffMode: roundOffModeForSource(purchaseOrder) }),
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
