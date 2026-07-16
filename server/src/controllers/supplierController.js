import { body } from 'express-validator';
import { Supplier } from '../models/Supplier.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const supplierRules = [
  body('name').trim().notEmpty(),
  body('mobile').optional({ checkFalsy: true }).matches(/^[0-9+\-\s]{7,15}$/),
  body('alternatePhone').optional({ checkFalsy: true }).matches(/^[0-9+\-\s]{7,15}$/),
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body('gstNumber').optional({ checkFalsy: true }).matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i),
  body('panNumber').optional({ checkFalsy: true }).matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/i),
  body('openingBalance').optional().isFloat({ min: 0 })
];

export const listSuppliers = asyncHandler(async (req, res) => {
  const showDeleted = String(req.query.showDeleted || 'false').toLowerCase() === 'true';
  const search = String(req.query.search || '').trim();
  const filter = {
    ...(showDeleted ? {} : { active: true }),
    ...(search ? { $or: [{ supplierId: new RegExp(search, 'i') }, { name: new RegExp(search, 'i') }, { mobile: new RegExp(search, 'i') }, { gstNumber: new RegExp(search, 'i') }] } : {})
  };
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 1000);
  const [suppliers, total] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
    Supplier.countDocuments(filter)
  ]);
  res.json({ suppliers, total, page, pages: Math.ceil(total / limit) });
});

export const createSupplier = asyncHandler(async (req, res) => {
  const nextId = req.body.supplierId || `SUP-${String((await Supplier.countDocuments()) + 1).padStart(5, '0')}`;
  const supplier = await Supplier.create({ ...req.body, supplierId: nextId });
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
