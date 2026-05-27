import { body } from 'express-validator';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const userRules = [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('role').optional().isIn(['admin', 'manager', 'cashier']),
  body('password').optional().isLength({ min: 8 })
];

export const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ users });
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  res.status(201).json({ user });
});

export const updateUser = asyncHandler(async (req, res) => {
  const allowed = ['name', 'email', 'role', 'permissions', 'active', 'password'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  const user = await User.findById(req.params.id).select('+password');

  if (!user) throw new ApiError(404, 'User not found');

  Object.assign(user, updates);
  await user.save();
  user.password = undefined;
  res.json({ user });
});

export const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.user._id) === req.params.id) {
    throw new ApiError(400, 'You cannot delete your own account');
  }

  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ message: 'User deleted' });
});
