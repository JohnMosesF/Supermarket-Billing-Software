import { body } from 'express-validator';
import { Unit, DEFAULT_UNITS } from '../models/Unit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';

export const unitRules = [
  body('name').trim().notEmpty(),
  body('allowDecimal').isBoolean()
];

export async function ensureDefaultUnits() {
  await Promise.all(DEFAULT_UNITS.map((unit) => Unit.updateOne(
    { name: unit.name },
    { $setOnInsert: unit },
    { upsert: true }
  )));
}

export const listUnits = asyncHandler(async (req, res) => {
  await ensureDefaultUnits();
  const units = await Unit.find({ active: true }).sort({ allowDecimal: -1, name: 1 });
  res.json({ units });
});

export const createUnit = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase();
  const unit = await Unit.create({ name, allowDecimal: Boolean(req.body.allowDecimal) });
  res.status(201).json({ unit });
});

export const updateUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.findByIdAndUpdate(
    req.params.id,
    {
      name: String(req.body.name || '').trim().toLowerCase(),
      allowDecimal: Boolean(req.body.allowDecimal)
    },
    { new: true, runValidators: true }
  );
  if (!unit) throw new ApiError(404, 'Unit not found');
  res.json({ unit });
});

export const deleteUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!unit) throw new ApiError(404, 'Unit not found');
  res.json({ message: 'Unit deleted' });
});
