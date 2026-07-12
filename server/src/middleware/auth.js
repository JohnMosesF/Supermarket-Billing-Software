import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const modulePermissions = [
  'dashboard',
  'billing',
  'products',
  'customers',
  'inventory',
  'purchases',
  'sales_returns',
  'purchase_returns',
  'accounting',
  'reports',
  'users',
  'settings'
];

const roleDefaults = {
  admin: modulePermissions,
  manager: modulePermissions.filter((key) => key !== 'users'),
  cashier: ['dashboard', 'billing', 'customers', 'sales_returns'],
  store_staff: ['dashboard', 'products', 'inventory', 'purchases', 'purchase_returns']
};

export function permissionsFor(user) {
  if (!user) return [];
  if (user.role === 'admin') return modulePermissions;
  return user.permissions?.length ? user.permissions : roleDefaults[user.role] || [];
}

export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    throw new ApiError(401, 'Authentication required');
  }

  const decoded = jwt.verify(token, env.jwtSecret);
  const user = await User.findById(decoded.id).select('-password');

  if (!user) {
    throw new ApiError(
      401,
      'Session is no longer valid. Please log in again.'
    );
  }

  if (!user.active) {
    throw new ApiError(
      403,
      'Your account has been disabled.'
    );
  }

  req.user = user;
  req.permissions = permissionsFor(user);
  next();
});

export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new ApiError(403, 'You do not have permission for this action'));
  }
  next();
};

export const requirePermission = (permission) => (req, res, next) => {
  if (req.user?.role === 'admin' || permissionsFor(req.user).includes(permission)) return next();
  next(new ApiError(403, 'You do not have permission for this module'));
};
