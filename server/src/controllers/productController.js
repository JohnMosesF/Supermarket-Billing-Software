import { body, query } from 'express-validator';
import { Product } from '../models/Product.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { makeSku } from '../utils/invoice.js';

export const productRules = [
  body('name').trim().notEmpty(),
  body('purchasePrice').isFloat({ min: 0 }),
  body('sellingPrice').isFloat({ min: 0 }),
  body('stock').optional().isInt({ min: 0 }),
  body('taxRate').optional().isFloat({ min: 0 })
];

export const productQueryRules = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
];

export const listProducts = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const search = req.query.search?.trim();
  const filter = {};

  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { sku: new RegExp(search, 'i') },
      { barcode: new RegExp(search, 'i') }
    ];
  }

  if (req.query.category) filter.category = req.query.category;
  if (req.query.lowStock === 'true') filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] };

  const [products, total] = await Promise.all([
    Product.find(filter).populate('category').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter)
  ]);

  res.json({ products, total, page, pages: Math.ceil(total / limit) });
});

export const createProduct = asyncHandler(async (req, res) => {
  const total = await Product.countDocuments();
  const payload = {
    ...req.body,
    sku: req.body.sku || makeSku(req.body.name, total),
    imageUrl: req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl
  };

  const product = await Product.create(payload);

  if (product.stock > 0) {
    await InventoryLog.create({
      product: product._id,
      type: 'stock_in',
      quantity: product.stock,
      stockBefore: 0,
      stockAfter: product.stock,
      reason: 'Opening stock',
      user: req.user._id
    });
  }

  res.status(201).json({ product });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');

  const oldStock = product.stock;
  Object.assign(product, req.body);
  if (req.file) product.imageUrl = `/uploads/${req.file.filename}`;
  await product.save();

  if (Number(req.body.stock) !== oldStock && req.body.stock !== undefined) {
    await InventoryLog.create({
      product: product._id,
      type: 'adjustment',
      quantity: Number(req.body.stock) - oldStock,
      stockBefore: oldStock,
      stockAfter: product.stock,
      reason: 'Product stock edited',
      user: req.user._id
    });
  }

  res.json({ product });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  res.json({ message: 'Product deleted' });
});

export const generateSku = asyncHandler(async (req, res) => {
  const total = await Product.countDocuments();
  res.json({ sku: makeSku(req.query.name || 'Product', total) });
});
