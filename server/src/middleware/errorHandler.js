import { env } from '../config/env.js';

const duplicateFieldLabels = {
  barcode: 'Barcode',
  customerId: 'Customer ID',
  email: 'Email',
  gstNumber: 'GST number',
  mobile: 'Mobile number',
  productId: 'Product ID',
  receiptNo: 'Receipt number',
  sku: 'SKU',
  username: 'Username'
};

function duplicateMessage(field) {
  const label = duplicateFieldLabels[field] || field;
  return `${label} already exists.`;
}

export function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

export function errorHandler(error, req, res, next) {
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'record';
    error.statusCode = 409;
    error.message = duplicateMessage(field);
    error.details = [{ path: field, msg: error.message, value: error.keyValue?.[field] }];
  }

  if (error?.name === 'ValidationError' && error.errors) {
    const details = Object.entries(error.errors).map(([field, entry]) => ({
      path: field,
      msg: entry.message,
      value: entry.value
    }));
    error.statusCode = 422;
    error.message = details.map((entry) => entry.msg).join('\n') || 'Validation failed';
    error.details = details;
  }

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
