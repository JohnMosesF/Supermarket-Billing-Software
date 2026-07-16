import { body } from 'express-validator';
import { Category } from '../models/Category.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const categoryRules = [
  body('name').trim().notEmpty(),
  body('description').optional().trim(),
  body('taxRate').optional().isFloat({ min: 0 }),
  body('active').optional().isBoolean()
];

export const listCategories = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const showDeleted = String(req.query.showDeleted || 'false').toLowerCase() === 'true';
  const filter = {
    ...(showDeleted ? {} : { active: true }),
    ...(search ? { name: new RegExp(search, 'i') } : {})
  };
  const categories = await Category.find(filter).sort({ name: 1 });
  res.json({ categories });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create(req.body);
  res.status(201).json({ category });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!category) throw new ApiError(404, 'Category not found');
  res.json({ category });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!category) throw new ApiError(404, 'Category not found');
  res.json({ category, message: 'Category deleted' });
});
