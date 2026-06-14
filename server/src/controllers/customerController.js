import { body } from 'express-validator';
import { Customer } from '../models/Customer.js';
import Bill from '../models/Bill.js';
import { Sale } from '../models/Sale.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const customerRules = [
  body('name').trim().notEmpty(),
  body('mobile').trim().notEmpty()
];

export const collectionRules = [
  body('amount').isFloat({ min: 0.01 }),
  body('paymentMethod').isIn(['Cash', 'UPI', 'Card', 'Bank Transfer']),
  body('notes').optional().trim()
];

export const listCustomers = asyncHandler(async (req, res) => {
  const search = req.query.search?.trim();
  const filter = search
    ? { $or: [{ name: new RegExp(search, 'i') }, { mobile: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }] }
    : {};
  const customers = await Customer.find(filter).sort({ updatedAt: -1 }).limit(100);
  res.json({ customers });
});

export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.create(req.body);
  res.status(201).json({ customer });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new ApiError(404, 'Customer not found');
  res.json({ customer });
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!customer) throw new ApiError(404, 'Customer not found');
  res.json({ customer });
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findByIdAndDelete(req.params.id);
  if (!customer) throw new ApiError(404, 'Customer not found');
  res.json({ message: 'Customer deleted' });
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
    appliedTo.push({ billId: tx.billId, invoiceNo: tx.invoiceNo, amount: applied });

    if (tx.billModel === 'Bill') {
      await Bill.findByIdAndUpdate(tx.billId, {
        $inc: { paidAmount: applied, balanceAmount: -applied, dueAmount: -applied },
        $set: { paymentStatus: tx.dueAmount <= 0 ? 'Paid' : 'Partial' }
      });
    } else {
      await Sale.findByIdAndUpdate(tx.billId, {
        $inc: { paidAmount: applied, balanceAmount: -applied },
        $set: { paymentStatus: tx.dueAmount <= 0 ? 'paid' : 'partial' }
      });
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

  res.status(201).json({
    message: 'Collection recorded',
    customer,
    receipt: customer.paymentHistory[customer.paymentHistory.length - 1]
  });
});
