import { body } from 'express-validator';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';
import { modulePermissions } from '../middleware/auth.js';

export const userRules = [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('username').optional().trim().isLength({ min: 3 }).toLowerCase(),
  body('phone').optional({ checkFalsy: true }).matches(/^[0-9+\-\s]{7,15}$/),
  body('role').optional().isIn(['admin', 'manager', 'cashier']),
  body('permissions').optional().isArray(),
  body('permissions.*').optional().isIn(modulePermissions),
  body('password').optional().isLength({ min: 8 })
];

export const createUserRules = [
  ...userRules,
  body('password').isLength({ min: 8 }),
  body('confirmPassword').optional().custom((value, { req }) => {
    if (value && value !== req.body.password) throw new Error('Passwords do not match');
    return true;
  })
];

export const listUsers = asyncHandler(async (req, res) => {
  const showDeleted = String(req.query.showDeleted || 'false').toLowerCase() === 'true';
  const search = String(req.query.search || '').trim();
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 1000);
  const filter = {
    ...(showDeleted ? {} : { active: true }),
    ...(search ? { $or: [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }, { username: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }] } : {})
  };
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter)
  ]);
  res.json({ users, total, page, pages: Math.ceil(total / limit) });
});

export const createUser = asyncHandler(async (req, res) => {
  const { confirmPassword, ...payload } = req.body;
  const user = await User.create(payload);
  await logAudit(req, { action: 'User Changes', module: 'Users', newValue: user.toObject() });
  res.status(201).json({ user });
});

export const updateUser = asyncHandler(async (req, res) => {
  const allowed = ['name', 'email', 'phone', 'username', 'role', 'permissions', 'active', 'password'];
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
