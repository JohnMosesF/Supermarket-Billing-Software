import { validationResult } from 'express-validator';
import { ApiError } from '../utils/apiError.js';

const fieldLabels = {
  adjustedQuantity: 'Adjusted quantity',
  adjustmentType: 'Adjustment type',
  alternatePhone: 'Alternate phone',
  creditLimit: 'Credit limit',
  customerId: 'Customer ID',
  email: 'Email',
  gstNumber: 'GST number',
  mobile: 'Mobile number',
  name: 'Customer name',
  openingBalance: 'Opening balance',
  panNumber: 'PAN number',
  product: 'Product',
  quantity: 'Quantity',
  reason: 'Reason'
};

function readableMessage(error) {
  if (error.msg && error.msg !== 'Invalid value') return error.msg;
  const label = fieldLabels[error.path || error.param] || error.path || error.param || 'Value';
  return `${label} is invalid.`;
}

export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((error) => ({
      ...error,
      msg: readableMessage(error)
    }));
    return next(new ApiError(422, details.map((error) => error.msg).join('\n'), details));
  }
  next();
}
