import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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
  next();
});

export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new ApiError(403, 'You do not have permission for this action'));
  }
  next();
};
