import { body } from 'express-validator';
import { InventoryLog } from '../models/InventoryLog.js';
import { Product } from '../models/Product.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const adjustmentRules = [
  body('product').isMongoId(),
  body('quantity').isNumeric(),
  body('reason').trim().notEmpty()
];

export const listInventoryLogs = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.product) filter.product = req.query.product;
  const logs = await InventoryLog.find(filter)
    .populate('product', 'name sku')
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ logs });
});

export const adjustStock = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.body.product);
  if (!product) throw new ApiError(404, 'Product not found');

  const stockBefore = product.stock;
  const stockAfter = Math.max(stockBefore + Number(req.body.quantity), 0);
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
