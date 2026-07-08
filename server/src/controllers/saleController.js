import { body } from 'express-validator';
import { Customer } from '../models/Customer.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { Product } from '../models/Product.js';
import { Sale } from '../models/Sale.js';
import { Unit } from '../models/Unit.js';
import { ensureDefaultUnits } from './unitController.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { makeInvoiceNumber } from '../utils/invoice.js';
import { reconcileCustomerAccounting, reconcileSalePaymentFields, rebuildDayBook } from '../services/accountingService.js';

async function resolveCustomerForSale(req) {
  if (req.body.customer) return req.body.customer;

  const mobile = String(req.body.customerMobile || '').trim();
  const name = String(req.body.customerName || 'Walk-in Customer').trim() || 'Walk-in Customer';
  if (!mobile) return null;

  let customer = await Customer.findOne({ mobile });
  if (!customer) {
    customer = await Customer.create({ mobile, name });
  } else if (customer.name !== name && name !== 'Walk-in Customer') {
    customer.name = name;
    if (req.body.customerAddress) customer.address = req.body.customerAddress;
    await customer.save();
  }

  return customer._id;
}

export const saleRules = [
  body('items').isArray({ min: 1 }),
  body('items.*.product').isMongoId(),
  body('items.*.quantity').isFloat({ min: 0.001 }),
  body('items.*.price').optional().isFloat({ min: 0 }),
  body('items.*.discount').optional().isFloat({ min: 0 }),
  body('paymentMethod').isIn(['cash', 'upi', 'card', 'bank_transfer', 'credit'])
];

function isWholeNumber(value) {
  return Math.abs(Number(value) - Math.round(Number(value))) < 0.0000001;
}

function requestPaidAmount(body, fallback = 0) {
  return Number(body.paidAmount ?? body.amountPaid ?? body.paid ?? fallback);
}

async function getUnitRule(unitName) {
  await ensureDefaultUnits();
  const unit = await Unit.findOne({ name: String(unitName || 'pcs').trim().toLowerCase(), active: true }).lean();
  return unit || { name: 'pcs', allowDecimal: false };
}

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
  const resolvedCustomer = await resolveCustomerForSale(req);
  if (req.body.paymentMethod === 'credit' && !resolvedCustomer) {
    throw new ApiError(400, 'Customer account is required for credit sales');
  }
  req.body.customer = resolvedCustomer || undefined;

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
    const unit = await getUnitRule(product.unit || item.unit);
    if (!unit.allowDecimal && !isWholeNumber(item.quantity)) {
      throw new ApiError(400, `${product.name} must use whole number quantity for ${unit.name}`);
    }
    if (product.stock < item.quantity) {
      throw new ApiError(400, 'Insufficient stock available.');
    }

    const price = Number(item.price ?? product.sellingPrice);
    const discount = Number(item.discount || 0);
    const base = price * item.quantity;
    const taxable = Math.max(base - discount, 0);
    const tax = taxable * (product.taxRate || 0) / 100;
    const lineTotal = taxable + tax;

    subtotal += base;
    taxTotal += tax;
    profit += (price - product.purchasePrice) * item.quantity - discount;
    saleItems.push({
      product: product._id,
      name: product.name,
      localName: product.localName || '',
      sku: product.sku,
      quantity: item.quantity,
      unit: unit.name,
      price,
      purchasePrice: product.purchasePrice,
      taxRate: product.taxRate,
      discount,
      lineTotal
    });
  }

  const discount = Number(req.body.discount || 0);
  const count = await Sale.countDocuments();
  const total = Math.max(subtotal + taxTotal - discount, 0);
  const paidAmount = requestPaidAmount(req.body, req.body.paymentMethod === 'credit' ? 0 : total);
  if (paidAmount < 0) {
    throw new ApiError(400, 'Paid amount cannot be negative');
  }
  if (req.body.paymentMethod === 'credit' && paidAmount > total) {
    throw new ApiError(400, 'Amount paid cannot exceed bill total for credit sales');
  }
  const paymentState = reconcileSalePaymentFields(total, paidAmount);

  if (req.body.paymentMethod === 'credit' && !req.body.customer) {
    throw new ApiError(400, 'Customer account is required for credit sales');
  }

  const sale = await Sale.create({
    invoiceNumber: req.body.invoiceNumber || makeInvoiceNumber(count),
    customer: req.body.customer || undefined,
    customerName: req.body.customerName,
    customerMobile: req.body.customerMobile,
    items: saleItems,
    subtotal,
    discount,
    taxTotal,
    total,
    profit: Math.max(profit - discount, 0),
    paymentMethod: req.body.paymentMethod,
    paymentStatus: paymentState.paymentStatus,
    paidAmount: paymentState.paidAmount,
    balanceAmount: paymentState.balanceAmount,
    changeReturn: Math.max(paidAmount - total, 0),
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
      invoiceId: sale._id,
      user: req.user._id
    });
  }

  if (req.body.customer) {
    const loyaltyPoints = Math.floor(sale.total / 100);
    const customerUpdates = {
      $inc: { totalSpent: sale.total, loyaltyPoints }
    };

    if (req.body.paymentMethod === 'credit') {
      customerUpdates.$inc.totalCredit = sale.balanceAmount;
      customerUpdates.$inc.outstandingBalance = sale.balanceAmount;
      customerUpdates.$inc.creditBalance = sale.balanceAmount;
      customerUpdates.$inc.totalPaid = sale.paidAmount;
      customerUpdates.$push = {
        creditTransactions: {
          billId: sale._id,
          billModel: 'Sale',
          invoiceNo: sale.invoiceNumber,
          billAmount: sale.total,
          paidAmount: sale.paidAmount,
          dueAmount: sale.balanceAmount,
          paymentMethod: 'Credit',
          paymentStatus: sale.paymentStatus === 'paid' ? 'Paid' : sale.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'
        }
      };
      if (sale.paidAmount > 0) {
        customerUpdates.$set = { lastPaymentDate: new Date() };
      }
    } else if (sale.paidAmount > 0) {
      customerUpdates.$inc.totalPaid = sale.paidAmount;
      customerUpdates.$set = { lastPaymentDate: new Date() };
    }

    await Customer.findByIdAndUpdate(req.body.customer, customerUpdates, {
      new: true,
      runValidators: true
    });
    await reconcileCustomerAccounting(req.body.customer);
    await rebuildDayBook();
  }

  res.status(201).json({ sale });
});
