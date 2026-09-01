import { body } from 'express-validator';
import { Customer } from '../models/Customer.js';
import Bill from '../models/Bill.js';
import { Sale } from '../models/Sale.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { CustomerReceipt } from '../models/CustomerReceipt.js';
import { reconcileCustomerAccounting, rebuildDayBook } from '../services/accountingService.js';

export const customerRules = [
  body('name').trim().notEmpty().withMessage('Customer name is required.'),
  body('mobile').trim().notEmpty().withMessage('Mobile number is required.').bail().matches(/^[0-9+\-\s]{7,15}$/).withMessage('Mobile number is invalid.'),
  body('alternatePhone').optional({ checkFalsy: true }).trim().matches(/^[0-9+\-\s]{7,15}$/).withMessage('Alternate phone is invalid.'),
  body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Email is invalid.').normalizeEmail(),
  body('gstNumber').optional({ checkFalsy: true }).trim().matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i).withMessage('GST number is invalid.'),
  body('panNumber').optional({ checkFalsy: true }).trim().matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/i).withMessage('PAN number is invalid.'),
  body('openingBalance').optional().isFloat({ min: 0 }).withMessage('Opening balance must be zero or greater.'),
  body('creditLimit').optional().isFloat({ min: 0 }).withMessage('Credit limit must be zero or greater.')
];

export const collectionRules = [
  body('amount').isFloat({ min: 0.01 }),
  body('paymentMethod').isIn(['Cash', 'UPI', 'Card', 'Bank Transfer']),
  body('notes').optional().trim()
];

export const listCustomers = asyncHandler(async (req, res) => {
  const search = req.query.search?.trim();
  const showDeleted = String(req.query.showDeleted || 'false').toLowerCase() === 'true';
  const filter = {
    ...(showDeleted ? {} : { active: true }),
    ...(search ? { $or: [{ customerId: new RegExp(search, 'i') }, { name: new RegExp(search, 'i') }, { mobile: new RegExp(search, 'i') }, { gstNumber: new RegExp(search, 'i') }] } : {})
  };
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 1000);
  const [customers, total] = await Promise.all([
    Customer.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Customer.countDocuments(filter)
  ]);
  res.json({ customers, total, page, pages: Math.ceil(total / limit) });
});

const duplicateCustomerFields = [
  ['customerId', 'Customer ID already exists.'],
  ['mobile', 'Mobile number already exists.'],
  ['gstNumber', 'GST number already exists.'],
  ['email', 'Email already exists.']
];

function normalizeCustomerPayload(payload) {
  const normalized = { ...payload };
  for (const field of ['customerId', 'name', 'mobile', 'alternatePhone', 'email', 'gstNumber', 'panNumber', 'address', 'city', 'state', 'pincode', 'remarks', 'notes']) {
    if (typeof normalized[field] === 'string') normalized[field] = normalized[field].trim();
  }
  if (normalized.email) normalized.email = normalized.email.toLowerCase();
  if (normalized.gstNumber) normalized.gstNumber = normalized.gstNumber.toUpperCase();
  if (normalized.panNumber) normalized.panNumber = normalized.panNumber.toUpperCase();
  return normalized;
}

async function ensureCustomerIsUnique(payload, currentId = null) {
  const checks = duplicateCustomerFields
    .filter(([field]) => payload[field])
    .map(([field, message]) => ({
      field,
      message,
      query: { [field]: payload[field], ...(currentId ? { _id: { $ne: currentId } } : {}) }
    }));

  const details = [];
  for (const check of checks) {
    if (await Customer.exists(check.query)) {
      details.push({ path: check.field, msg: check.message, value: payload[check.field] });
    }
  }

  if (details.length) {
    throw new ApiError(409, details.map((detail) => detail.msg).join('\n'), details);
  }
}

export const createCustomer = asyncHandler(async (req, res) => {
  const payload = normalizeCustomerPayload(req.body);
  const nextId = payload.customerId || `CUST-${String((await Customer.countDocuments()) + 1).padStart(5, '0')}`;
  await ensureCustomerIsUnique({ ...payload, customerId: nextId });
  const customer = await Customer.create({ ...payload, customerId: nextId });
  res.status(201).json({ customer });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new ApiError(404, 'Customer not found');
  res.json({ customer });
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const payload = normalizeCustomerPayload(req.body);
  await ensureCustomerIsUnique(payload, req.params.id);
  const customer = await Customer.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  if (!customer) throw new ApiError(404, 'Customer not found');
  res.json({ customer });
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!customer) throw new ApiError(404, 'Customer not found');
  res.json({ customer, message: 'Customer soft deleted' });
});

export const customerHistory = asyncHandler(async (req, res) => {
  const sales = await Sale.find({ customer: req.params.id }).sort({ createdAt: -1 }).limit(50);
  res.json({ sales });
});

export const recordCollection = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new ApiError(404, 'Customer not found');

  const amount = Number(req.body.amount);
  if (amount <= 0) throw new ApiError(400, 'Collection amount must be greater than zero');
  if (amount > customer.outstandingBalance) {
    throw new ApiError(400, 'Collection amount cannot exceed outstanding balance');
  }

  let remaining = amount;
  const appliedTo = [];
  const transactions = [...customer.creditTransactions].sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const tx of transactions) {
    if (remaining <= 0 || tx.dueAmount <= 0) continue;
    const applied = Math.min(tx.dueAmount, remaining);
    tx.paidAmount += applied;
    tx.dueAmount -= applied;
    tx.paymentStatus = tx.dueAmount <= 0 ? 'Paid' : 'Partial';
    remaining -= applied;
    appliedTo.push({ billId: tx.billId, billModel: tx.billModel || 'Bill', invoiceNo: tx.invoiceNo, amount: applied });

    if (tx.billModel === 'Bill') {
      await Bill.findByIdAndUpdate(tx.billId, {
        $inc: { paidAmount: applied, balanceAmount: -applied, dueAmount: -applied },
        $set: { paymentStatus: tx.dueAmount <= 0 ? 'Paid' : 'Partial' }
      });
    } else {
      const sale = await Sale.findById(tx.billId);
      if (sale) {
        const paidAfter = Number(sale.paidAmount || 0) + applied;
        const balanceAfter = Math.max(Number(sale.total || 0) - paidAfter, 0);
        sale.paidAmount = paidAfter;
        sale.balanceAmount = balanceAfter;
        sale.paymentStatus = balanceAfter <= 0.001 ? 'paid' : paidAfter > 0 ? 'partial' : 'unpaid';
        await sale.save();
      }
    }
  }

  customer.creditTransactions = transactions;
  customer.creditHistory = transactions;
  customer.totalPaid += amount;
  customer.totalPaidAmount += amount;
  customer.outstandingBalance = Math.max(customer.outstandingBalance - amount, 0);
  customer.creditBalance = Math.max(customer.creditBalance - amount, 0);
  customer.lastPaymentDate = new Date();
  customer.paymentHistory.push({
    amount,
    paymentMethod: req.body.paymentMethod,
    notes: req.body.notes,
    receiptNo: `RCPT-${Date.now()}`,
    appliedTo
  });
  await customer.save();

  const embeddedReceipt = customer.paymentHistory[customer.paymentHistory.length - 1];
  await CustomerReceipt.create({
    receiptNo: embeddedReceipt.receiptNo,
    customer: customer._id,
    amount,
    paymentMethod: req.body.paymentMethod === 'Bank Transfer' ? 'Bank' : req.body.paymentMethod,
    allocationType: 'Allocated',
    allocations: appliedTo.map((entry) => ({ bill: entry.billId, billModel: entry.billModel, invoiceNo: entry.invoiceNo, amount: entry.amount })),
    unallocatedAmount: 0,
    notes: req.body.notes,
    createdBy: req.user._id
  });
  await reconcileCustomerAccounting(customer._id);
  await rebuildDayBook();

  res.status(201).json({
    message: 'Collection recorded',
    customer,
    receipt: embeddedReceipt
  });
});
