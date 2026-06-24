import { body } from 'express-validator';
import { InventoryLog } from '../models/InventoryLog.js';
import { Product } from '../models/Product.js';
import { Unit } from '../models/Unit.js';
import { ensureDefaultUnits } from './unitController.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const adjustmentRules = [
  body('product').isMongoId(),
  body('quantity').isNumeric(),
  body('reason').trim().notEmpty()
];

function isWholeNumber(value) {
  return Math.abs(Number(value) - Math.round(Number(value))) < 0.0000001;
}

export const listInventoryLogs = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.product) filter.product = req.query.product;
  const logs = await InventoryLog.find(filter)
    .populate('product', 'name sku unit')
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ logs });
});

export const adjustStock = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.body.product);
  if (!product) throw new ApiError(404, 'Product not found');
  await ensureDefaultUnits();
  const unit = await Unit.findOne({ name: product.unit || 'pcs', active: true }).lean();
  const quantity = parseFloat(req.body.quantity);
  if (unit && !unit.allowDecimal && !isWholeNumber(quantity)) {
    throw new ApiError(400, `${product.unit || 'pcs'} accepts whole number quantities only`);
  }

  const stockBefore = product.stock;
  const stockAfter = Math.max(stockBefore + quantity, 0);
  product.stock = stockAfter;
  await product.save();

  const log = await InventoryLog.create({
    product: product._id,
    type: 'adjustment',
    quantity: stockAfter - stockBefore,
    stockBefore,
    stockAfter,
    reason: req.body.reason,
    user: req.user._id
  });

  res.status(201).json({ product, log });
});
