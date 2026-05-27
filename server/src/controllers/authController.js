import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn
  });
}

function userPayload(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    active: user.active
  };
}

export const loginRules = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 })
];

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!user.active) {
    throw new ApiError(403, 'Your account is inactive');
  }

  user.lastLoginAt = new Date();
  await user.save();

  res.json({ token: signToken(user), user: userPayload(user) });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: userPayload(req.user) });
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
