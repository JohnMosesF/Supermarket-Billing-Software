import { body } from 'express-validator';
import { Customer } from '../models/Customer.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { Product } from '../models/Product.js';
import { Sale } from '../models/Sale.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { makeInvoiceNumber } from '../utils/invoice.js';

export const saleRules = [
  body('items').isArray({ min: 1 }),
  body('items.*.product').isMongoId(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('paymentMethod').isIn(['cash', 'upi', 'card'])
];

export const listSales = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  const sales = await Sale.find(filter)
    .populate('customer', 'name mobile')
    .populate('cashier', 'name')
    .sort({ createdAt: -1 })
    .limit(Number(req.query.limit || 100));

  res.json({ sales });
});

export const getSale = asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id).populate('customer').populate('cashier', 'name');
  if (!sale) throw new ApiError(404, 'Sale not found');
  res.json({ sale });
});

export const createSale = asyncHandler(async (req, res) => {
  const productIds = req.body.items.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds }, active: true });
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  let subtotal = 0;
  let taxTotal = 0;
  let profit = 0;
  const saleItems = [];

  for (const item of req.body.items) {
    const product = productMap.get(String(item.product));
    if (!product) throw new ApiError(404, 'One or more products were not found');
    if (product.stock < item.quantity) {
      throw new ApiError(400, `${product.name} has only ${product.stock} in stock`);
    }

    const discount = Number(item.discount || 0);
    const base = product.sellingPrice * item.quantity;
    const taxable = Math.max(base - discount, 0);
    const tax = taxable * (product.taxRate || 0) / 100;
    const lineTotal = taxable + tax;

    subtotal += base;
    taxTotal += tax;
    profit += (product.sellingPrice - product.purchasePrice) * item.quantity - discount;
    saleItems.push({
      product: product._id,
      name: product.name,
      sku: product.sku,
      quantity: item.quantity,
      price: product.sellingPrice,
      purchasePrice: product.purchasePrice,
      taxRate: product.taxRate,
      discount,
      lineTotal
    });
  }

  const discount = Number(req.body.discount || 0);
  const count = await Sale.countDocuments();
  const sale = await Sale.create({
    invoiceNumber: req.body.invoiceNumber || makeInvoiceNumber(count),
    customer: req.body.customer || undefined,
    customerName: req.body.customerName,
    customerMobile: req.body.customerMobile,
    items: saleItems,
    subtotal,
    discount,
    taxTotal,
    total: Math.max(subtotal + taxTotal - discount, 0),
    profit: Math.max(profit - discount, 0),
    paymentMethod: req.body.paymentMethod,
    paymentStatus: req.body.paymentStatus || 'paid',
    cashier: req.user._id,
    notes: req.body.notes
  });

  for (const item of saleItems) {
    const product = productMap.get(String(item.product));
    const stockBefore = product.stock;
    product.stock -= item.quantity;
    await product.save();
    await InventoryLog.create({
      product: product._id,
      type: 'stock_out',
      quantity: item.quantity,
      stockBefore,
      stockAfter: product.stock,
      reason: `Sale ${sale.invoiceNumber}`,
      source: 'sale',
      referenceId: sale._id,
      user: req.user._id
    });
  }

  if (req.body.customer) {
    const loyaltyPoints = Math.floor(sale.total / 100);
    await Customer.findByIdAndUpdate(req.body.customer, {
      $inc: { totalSpent: sale.total, loyaltyPoints }
    });
  }

  res.status(201).json({ sale });
});
