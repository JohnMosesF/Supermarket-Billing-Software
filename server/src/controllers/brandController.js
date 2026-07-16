import { body } from 'express-validator';
import { Brand } from '../models/Brand.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const brandRules = [
  body('name').trim().notEmpty(),
  body('description').optional().trim(),
  body('active').optional().isBoolean()
];

export const listBrands = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const showDeleted = String(req.query.showDeleted || 'false').toLowerCase() === 'true';
  const filter = {
    ...(showDeleted ? {} : { active: true }),
    ...(search ? { name: new RegExp(search, 'i') } : {})
  };
  const brands = await Brand.find(filter).sort({ name: 1 });
  res.json({ brands });
});

export const createBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.create(req.body);
  res.status(201).json({ brand });
});

export const updateBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!brand) throw new ApiError(404, 'Brand not found');
  res.json({ brand });
});

export const deleteBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!brand) throw new ApiError(404, 'Brand not found');
  res.json({ brand, message: 'Brand deleted' });
});
