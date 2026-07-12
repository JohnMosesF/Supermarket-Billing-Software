import { body } from 'express-validator';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';
import { modulePermissions } from '../middleware/auth.js';

export const userRules = [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('role').optional().isIn(['admin', 'manager', 'cashier', 'store_staff']),
  body('permissions').optional().isArray(),
  body('permissions.*').optional().isIn(modulePermissions),
  body('password').optional().isLength({ min: 8 })
];

export const listUsers = asyncHandler(async (req, res) => {
  const showDeleted = String(req.query.showDeleted || 'false').toLowerCase() === 'true';
  const filter = showDeleted ? {} : { active: true };
  const users = await User.find(filter).sort({ createdAt: -1 });
  res.json({ users });
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  await logAudit(req, { action: 'User Changes', module: 'Users', newValue: user.toObject() });
  res.status(201).json({ user });
});

export const updateUser = asyncHandler(async (req, res) => {
  const allowed = ['name', 'email', 'phone', 'role', 'permissions', 'active', 'password'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  const user = await User.findById(req.params.id).select('+password');

  if (!user) throw new ApiError(404, 'User not found');
  const previous = user.toObject();

  Object.assign(user, updates);
  await user.save();
  user.password = undefined;
  await logAudit(req, { action: 'User Changes', module: 'Users', previousValue: previous, newValue: user.toObject() });
  res.json({ user });
});

export const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.user._id) === req.params.id) {
    throw new ApiError(400, 'You cannot delete your own account');
  }

  const user = await User.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!user) throw new ApiError(404, 'User not found');
  await logAudit(req, { action: 'User Changes', module: 'Users', previousValue: { _id: user._id }, newValue: { active: false } });
  res.json({ user, message: 'User soft deleted' });
});
