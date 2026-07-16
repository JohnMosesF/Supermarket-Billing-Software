import { body } from 'express-validator';
import { GST_SLABS, Tax } from '../models/Tax.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const taxRules = [
  body('rate').isIn(GST_SLABS),
  body('name').optional().trim(),
  body('description').optional().trim(),
  body('active').optional().isBoolean()
];

export async function ensureDefaultTaxes() {
  await Promise.all(GST_SLABS.map((rate) => Tax.updateOne(
    { rate },
    { $setOnInsert: { rate, name: `GST ${rate}%`, active: true } },
    { upsert: true }
  )));
}

export const listTaxes = asyncHandler(async (req, res) => {
  await ensureDefaultTaxes();
  const taxes = await Tax.find({ active: true }).sort({ rate: 1 });
  res.json({ taxes, slabs: GST_SLABS });
});

export const createTax = asyncHandler(async (req, res) => {
  const rate = Number(req.body.rate);
  const tax = await Tax.create({ ...req.body, rate, name: req.body.name || `GST ${rate}%` });
  res.status(201).json({ tax });
});

export const updateTax = asyncHandler(async (req, res) => {
  const rate = Number(req.body.rate);
  const tax = await Tax.findByIdAndUpdate(
    req.params.id,
    { ...req.body, rate, name: req.body.name || `GST ${rate}%` },
    { new: true, runValidators: true }
  );
  if (!tax) throw new ApiError(404, 'GST slab not found');
  res.json({ tax });
});

export const deleteTax = asyncHandler(async (req, res) => {
  const tax = await Tax.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!tax) throw new ApiError(404, 'GST slab not found');
  res.json({ tax, message: 'GST slab deleted' });
});
