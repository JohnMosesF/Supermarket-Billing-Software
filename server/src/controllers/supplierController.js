import { body } from 'express-validator';
import { Supplier } from '../models/Supplier.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const supplierRules = [body('name').trim().notEmpty()];

export const listSuppliers = asyncHandler(async (req, res) => {
  const showDeleted = String(req.query.showDeleted || 'false').toLowerCase() === 'true';
  const filter = showDeleted ? {} : { active: true };
  const limit = Math.min(Number(req.query.limit || 100), 1000);
  const suppliers = await Supplier.find(filter).sort({ name: 1 }).limit(limit);
  res.json({ suppliers });
});

export const createSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.create(req.body);
  res.status(201).json({ supplier });
});

export const updateSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  res.json({ supplier });
});

export const deleteSupplier = asyncHandler(async (req, res) => {
  const { permanent } = req.query;
  if (String(permanent) === 'true') {
    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) throw new ApiError(404, 'Supplier not found');
    return res.json({ message: 'Supplier permanently deleted' });
  }

  const supplier = await Supplier.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  res.json({ supplier, message: 'Supplier soft deleted' });
});

export const restoreSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, { active: true }, { new: true });
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  res.json({ supplier, message: 'Supplier restored' });
});
