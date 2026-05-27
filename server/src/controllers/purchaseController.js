import { body } from 'express-validator';
import { InventoryLog } from '../models/InventoryLog.js';
import { Product } from '../models/Product.js';
import { Purchase } from '../models/Purchase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';

export const purchaseRules = [
  body('items').isArray({ min: 1 }),
  body('items.*.product').isMongoId(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('items.*.costPrice').isFloat({ min: 0 })
];

export const listPurchases = asyncHandler(async (req, res) => {
  const purchases = await Purchase.find().populate('supplier', 'name').populate('user', 'name').sort({ createdAt: -1 });
  res.json({ purchases });
});

export const createPurchase = asyncHandler(async (req, res) => {
  let total = 0;
  const items = [];

  for (const item of req.body.items) {
    const product = await Product.findById(item.product);
    if (!product) throw new ApiError(404, 'Product not found');
    const lineTotal = Number(item.quantity) * Number(item.costPrice);
    total += lineTotal;
    items.push({ product: product._id, name: product.name, quantity: item.quantity, costPrice: item.costPrice, lineTotal });
  }

  const purchase = await Purchase.create({
    supplier: req.body.supplier,
    invoiceNumber: req.body.invoiceNumber,
    items,
    total,
    paidAmount: req.body.paidAmount || 0,
    user: req.user._id,
    notes: req.body.notes
  });

  for (const item of items) {
    const product = await Product.findById(item.product);
    const stockBefore = product.stock;
    product.stock += item.quantity;
    product.purchasePrice = item.costPrice;
    await product.save();
    await InventoryLog.create({
      product: product._id,
      type: 'stock_in',
      quantity: item.quantity,
      stockBefore,
      stockAfter: product.stock,
      reason: `Purchase ${purchase.invoiceNumber || purchase._id}`,
      source: 'purchase',
      referenceId: purchase._id,
      user: req.user._id
    });
  }

  res.status(201).json({ purchase });
});
