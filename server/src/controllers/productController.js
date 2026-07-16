import { body, query } from 'express-validator';
import { Product } from '../models/Product.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { Unit } from '../models/Unit.js';
import { ensureDefaultUnits } from './unitController.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { makeSku } from '../utils/invoice.js';
import { logAudit } from '../utils/audit.js';

export const productRules = [
  body('name').trim().notEmpty(),
  body('purchasePrice').isFloat({ min: 0 }),
  body('sellingPrice').isFloat({ min: 0 }),
  body('retailPrice').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('mrp').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('wholesalePrice').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('stock').optional().isFloat({ min: 0 }),
  body('openingStock').optional().isFloat({ min: 0 }),
  body('lowStockThreshold').optional().isFloat({ min: 0 }),
  body('taxRate').optional().isFloat({ min: 0 }),
  body('unit').optional().trim().notEmpty(),
  body('barcode').optional({ checkFalsy: true }).trim(),
  body('sku').optional({ checkFalsy: true }).trim(),
  body('gstInclusive').optional().isBoolean()
];

async function resolveUnitFields(payload) {
  await ensureDefaultUnits();
  const unitName = String(payload.unit || 'pcs').trim().toLowerCase();
  const unit = await Unit.findOne({ name: unitName, active: true }).lean();
  if (!unit) throw new ApiError(400, `Invalid unit: ${unitName}`);
  return {
    ...payload,
    unit: unit.name,
    allowDecimalQty: unit.allowDecimal
  };
}

function normalizeProductPayload(payload) {
  const next = { ...payload };
  if (next.sku) next.sku = String(next.sku).trim().toUpperCase();
  if (!String(next.barcode || '').trim()) delete next.barcode;
  if (!String(next.description || '').trim()) delete next.description;
  if (next.retailPrice === undefined && next.sellingPrice !== undefined) next.retailPrice = next.sellingPrice;
  if (next.openingStock === undefined && next.stock !== undefined) next.openingStock = next.stock;
  return next;
}

export const productQueryRules = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 10000 })
];

export const listProducts = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const search = req.query.search?.trim();
  const filter = {};

  if (search) {
    const regex = new RegExp(`^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const productIdExpr = /^\d+$/.test(search)
      ? { $regexMatch: { input: { $toString: '$productId' }, regex: `^${search}` } }
      : null;
    filter.$or = [
      { name: regex },
      { sku: regex },
      { barcode: regex },
      ...(productIdExpr ? [{ $expr: productIdExpr }] : [])
    ];
  }

  if (req.query.category) filter.category = req.query.category;
  if (req.query.lowStock === 'true') filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] };

  const [products, total] = await Promise.all([
    Product.find(filter).populate('category').populate('brand').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter)
  ]);

  res.json({ products, total, page, pages: Math.ceil(total / limit) });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate('category').populate('brand').lean();
  if (!product) throw new ApiError(404, 'Product not found');
  res.json({ product });
});

export const createProduct = asyncHandler(async (req, res) => {

  let nextProductId;

  if (req.body.productId) {
    nextProductId = Number(req.body.productId);
  } else {
    const lastProduct = await Product.findOne()
      .sort({ productId: -1 });

    nextProductId = lastProduct
      ? lastProduct.productId + 1
      : 1;
  }

  const total = await Product.countDocuments();

  const payload = await resolveUnitFields(normalizeProductPayload({
    ...req.body,
    productId: nextProductId,
    sku: req.body.sku || makeSku(req.body.name, total),
    retailPrice: req.body.retailPrice || req.body.sellingPrice,
    openingStock: req.body.openingStock ?? req.body.stock ?? 0,
    imageUrl: req.file
      ? `/uploads/${req.file.filename}`
      : req.body.imageUrl
  }));

  const product = await Product.create(payload);

  if (product.stock > 0) {
    await InventoryLog.create({
      product: product._id,
      type: 'stock_in',
      quantity: product.stock,
      quantityIn: product.stock,
      openingStock: 0,
      closingStock: product.stock,
      referenceType: 'Opening',
      referenceNumber: product.sku,
      stockBefore: 0,
      stockAfter: product.stock,
      reason: 'Opening stock',
      user: req.user?._id
    });
  }

  await logAudit(req, { action: 'Product Created', module: 'Products', newValue: product.toObject() });
  res.status(201).json({ product });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  const previous = product.toObject();

  const oldStock = product.stock;
  const normalized = normalizeProductPayload(req.body);
  const payload = req.body.unit ? await resolveUnitFields(normalized) : normalized;
  Object.assign(product, payload);
  if (req.file) product.imageUrl = `/uploads/${req.file.filename}`;
  await product.save();

  if (Number(req.body.stock) !== oldStock && req.body.stock !== undefined) {
    await InventoryLog.create({
      product: product._id,
      type: 'adjustment',
      quantity: Number(req.body.stock) - oldStock,
      quantityIn: Number(req.body.stock) > oldStock ? Number(req.body.stock) - oldStock : 0,
      quantityOut: Number(req.body.stock) < oldStock ? oldStock - Number(req.body.stock) : 0,
      openingStock: oldStock,
      closingStock: product.stock,
      referenceType: 'Adjustment',
      referenceNumber: 'Product stock edited',
      stockBefore: oldStock,
      stockAfter: product.stock,
      reason: 'Product stock edited',
      user: req.user._id
    });
  }

  await logAudit(req, { action: 'Product Updated', module: 'Products', previousValue: previous, newValue: product.toObject() });
  res.json({ product });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  await logAudit(req, { action: 'Product Deleted', module: 'Products', previousValue: product.toObject() });
  res.json({ message: 'Product deleted' });
});

export const generateSku = asyncHandler(async (req, res) => {
  const total = await Product.countDocuments();
  res.json({ sku: makeSku(req.query.name || 'Product', total) });
});
