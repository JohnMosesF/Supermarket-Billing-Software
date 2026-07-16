import { InventoryLog } from '../models/InventoryLog.js';
import { Product } from '../models/Product.js';
import { Setting } from '../models/Setting.js';
import { ApiError } from '../utils/apiError.js';

export async function getInventorySettings() {
  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  return settings;
}

export async function nextPurchaseNumber() {
  const settings = await getInventorySettings();
  const prefix = String(settings.purchaseNumberPrefix || 'PUR').trim().toUpperCase() || 'PUR';
  const next = Number(settings.purchaseNumberNext || 1);
  settings.purchaseNumberNext = next + 1;
  await settings.save();
  return `${prefix}${String(next).padStart(6, '0')}`;
}

export async function moveStock({
  productId,
  quantity,
  direction,
  referenceType = 'Manual',
  referenceNumber = '',
  referenceId,
  source = 'manual',
  reason,
  remarks,
  userId,
  supplier,
  invoiceId,
  purchaseInvoiceNo,
  allowNegativeStock
}) {
  const movementQty = Math.abs(Number(quantity || 0));
  if (!Number.isFinite(movementQty) || movementQty <= 0) {
    throw new ApiError(400, 'Stock quantity must be greater than zero');
  }

  const settings = allowNegativeStock === undefined ? await getInventorySettings() : null;
  const canGoNegative = allowNegativeStock ?? Boolean(settings?.allowNegativeStock);
  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, 'Product not found');

  const stockBefore = Number(product.stock || 0);
  const delta = direction === 'out' ? -movementQty : movementQty;
  const stockAfter = stockBefore + delta;
  if (stockAfter < 0 && !canGoNegative) {
    throw new ApiError(400, 'Insufficient stock available.');
  }

  product.stock = stockAfter;
  await product.save();

  return InventoryLog.create({
    product: product._id,
    type: direction === 'out' ? 'stock_out' : 'stock_in',
    quantity: movementQty,
    quantityIn: direction === 'in' ? movementQty : 0,
    quantityOut: direction === 'out' ? movementQty : 0,
    openingStock: stockBefore,
    closingStock: stockAfter,
    stockBefore,
    stockAfter,
    referenceType,
    referenceNumber,
    referenceId,
    invoiceId,
    reason: reason || `${referenceType} ${referenceNumber}`.trim(),
    remarks,
    source,
    supplier,
    purchaseInvoiceNo,
    user: userId
  });
}

export async function recordAdjustmentMovement({
  productId,
  quantity,
  adjustmentType,
  referenceId,
  reason,
  remarks,
  userId
}) {
  const negativeTypes = ['Decrease', 'Damage', 'Expired', 'Lost'];
  const direction = negativeTypes.includes(adjustmentType) ? 'out' : 'in';
  return moveStock({
    productId,
    quantity,
    direction,
    referenceType: 'Adjustment',
    referenceNumber: adjustmentType,
    referenceId,
    source: 'adjustment',
    reason,
    remarks,
    userId
  });
}
