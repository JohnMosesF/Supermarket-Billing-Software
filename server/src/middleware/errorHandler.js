import { env } from '../config/env.js';

export function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

export function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;
  const payload = {
    message: error.message || 'Server error',
    details: error.details || undefined
  };

  if (env.nodeEnv !== 'production') {
    payload.stack = error.stack;
  }

  res.status(statusCode).json(payload);
}
