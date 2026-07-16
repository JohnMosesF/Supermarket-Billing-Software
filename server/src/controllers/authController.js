import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { logAudit } from '../utils/audit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { permissionsFor } from '../middleware/auth.js';

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn
  });
}

function userPayload(user) {
  return {
    _id: user._id,
    id: user._id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    permissions: permissionsFor(user),
    active: user.active
  };
}

export const loginRules = [
  body('email').optional({ checkFalsy: true }).trim(),
  body('username').optional({ checkFalsy: true }).trim(),
  body('password').isLength({ min: 8 })
];

export const login = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const identifier = String(req.body.email || req.body.username || '').trim().toLowerCase();
  if (!identifier) throw new ApiError(400, 'Email or username is required');
  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }]
  }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!user.active) {
    throw new ApiError(403, 'Your account is inactive');
  }

  user.lastLoginAt = new Date();
  await user.save();
  await logAudit(req, { action: 'Login', module: 'Auth', user, newValue: { email: user.email, username: user.username, role: user.role } });

  res.json({
    success: true,
    token: signToken(user),
    user: userPayload(user)
  });
});

export const logout = asyncHandler(async (req, res) => {
  await logAudit(req, { action: 'Logout', module: 'Auth' });
  res.json({ success: true, message: 'Logged out' });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: userPayload(req.user) });
});

export const changePasswordRules = [
  body('currentPassword').isLength({ min: 8 }),
  body('newPassword').isLength({ min: 8 })
];

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  const ok = await user.comparePassword(req.body.currentPassword);

  if (!ok) throw new ApiError(400, 'Current password is incorrect');

  user.password = req.body.newPassword;
  await user.save();
  res.json({ message: 'Password updated successfully' });
});
