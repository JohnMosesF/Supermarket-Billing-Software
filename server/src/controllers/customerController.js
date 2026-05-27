import { body } from 'express-validator';
import { Customer } from '../models/Customer.js';
import { Sale } from '../models/Sale.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const customerRules = [
  body('name').trim().notEmpty(),
  body('mobile').trim().notEmpty()
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
