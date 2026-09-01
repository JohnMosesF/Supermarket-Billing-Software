import { body } from 'express-validator';
import ExcelJS from 'exceljs';
import { InventoryLog } from '../models/InventoryLog.js';
import { Product } from '../models/Product.js';
import { Purchase } from '../models/Purchase.js';
import { StockAdjustment } from '../models/StockAdjustment.js';
import { Unit } from '../models/Unit.js';
import { ensureDefaultUnits } from './unitController.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';
import { makeSku } from '../utils/invoice.js';
import { getInventorySettings, recordAdjustmentMovement } from '../services/inventoryService.js';

export const adjustmentRules = [
  body('product').isMongoId().withMessage('Product is required.'),
  body('quantity').optional({ checkFalsy: true }).trim().custom((value) => {
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantity must be a positive number.');
    return true;
  }),
  body('adjustedQuantity').optional({ checkFalsy: true }).trim().custom((value) => {
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Adjusted quantity must be a positive number.');
    return true;
  }),
  body('adjustmentType').optional().isIn(['Increase', 'Decrease', 'Damage', 'Expired', 'Lost', 'Opening Correction']).withMessage('Adjustment type is invalid.'),
  body('reason').trim().notEmpty().withMessage('Reason is required.')
];

function isWholeNumber(value) {
  return Number.isInteger(value);
}

export const listInventoryLogs = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.product) filter.product = req.query.product;
  const logs = await InventoryLog.find(filter)
    .populate('product', 'name sku unit')
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ logs });
});

export const adjustStock = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.body.product);
  if (!product) throw new ApiError(404, 'Product not found');
  await ensureDefaultUnits();
  const unit = await Unit.findOne({ name: product.unit || 'pcs', active: true }).lean();
  const rawQuantity = String(req.body.adjustedQuantity ?? req.body.quantity ?? '').trim();
  const quantity = Number(rawQuantity);
  if (!Number.isFinite(quantity)) {
    throw new ApiError(400, 'Adjusted quantity must be a valid number.', [{ path: 'adjustedQuantity', msg: 'Adjusted quantity must be a valid number.', value: req.body.adjustedQuantity ?? req.body.quantity }]);
  }
  if (quantity <= 0) {
    throw new ApiError(400, 'Adjusted quantity must be greater than zero.', [{ path: 'adjustedQuantity', msg: 'Adjusted quantity must be greater than zero.', value: quantity }]);
  }
  if (unit && !unit.allowDecimal && !isWholeNumber(quantity)) {
    throw new ApiError(400, `${product.unit || 'pcs'} accepts whole number quantities only`, [{ path: 'adjustedQuantity', msg: `${product.unit || 'pcs'} accepts whole number quantities only`, value: quantity }]);
  }

  const adjustmentType = req.body.adjustmentType || (quantity < 0 ? 'Decrease' : 'Increase');
  const adjustedQuantity = Math.abs(quantity);
  const adjustment = await StockAdjustment.create({
    product: product._id,
    adjustmentType,
    currentStock: Number(product.stock || 0),
    adjustedQuantity,
    resultingStock: Number(product.stock || 0),
    reason: req.body.reason,
    remarks: req.body.remarks,
    adjustedBy: req.user._id,
    adjustmentDate: req.body.date ? new Date(req.body.date) : new Date()
  });

  const log = await recordAdjustmentMovement({
    productId: product._id,
    quantity: adjustedQuantity,
    adjustmentType,
    referenceId: adjustment._id,
    reason: req.body.reason,
    remarks: req.body.remarks,
    userId: req.user._id
  });
  adjustment.resultingStock = log.stockAfter;
  adjustment.stockMovement = log._id;
  await adjustment.save();
  const updatedProduct = await Product.findById(product._id);

  await logAudit(req, { action: 'Stock Adjustment', module: 'Inventory', previousValue: { product: product._id, stock: adjustment.currentStock }, newValue: adjustment.toObject() });
  res.status(201).json({ product: updatedProduct, adjustment, log });
});

export const listAdjustments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.product) filter.product = req.query.product;
  const adjustments = await StockAdjustment.find(filter)
    .populate('product', 'name sku stock unit')
    .populate('adjustedBy', 'name')
    .sort({ adjustmentDate: -1, createdAt: -1 })
    .limit(Number(req.query.limit || 200));
  res.json({ adjustments });
});

export const getLowStockProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ active: true, $expr: { $lte: ['$stock', '$lowStockThreshold'] } }).sort({ stock: 1 }).limit(Number(req.query.limit || 500));
  res.json({ products, count: products.length });
});

export const getOutOfStockProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ active: true, stock: { $lte: 0 } }).sort({ name: 1 }).limit(Number(req.query.limit || 500));
  res.json({ products, count: products.length });
});

export const getNearOutOfStockProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ active: true, stock: { $gt: 0 }, $expr: { $lte: ['$stock', { $multiply: ['$lowStockThreshold', 1.5] }] } }).sort({ stock: 1 }).limit(Number(req.query.limit || 500));
  res.json({ products, count: products.length });
});

export const getCurrentStock = asyncHandler(async (req, res) => {
  const products = await Product.find({ active: true }).populate('category').populate('brand').sort({ name: 1 }).limit(Number(req.query.limit || 10000));
  res.json({ products });
});

export const getStockValue = asyncHandler(async (_req, res) => {
  const [value] = await Product.aggregate([
    { $match: { active: true } },
    {
      $group: {
        _id: null,
        totalItems: { $sum: 1 },
        totalQuantity: { $sum: '$stock' },
        purchaseValue: { $sum: { $multiply: ['$stock', '$purchasePrice'] } },
        retailValue: { $sum: { $multiply: ['$stock', { $ifNull: ['$sellingPrice', 0] }] } }
      }
    }
  ]);
  res.json({ stockValue: value || { totalItems: 0, totalQuantity: 0, purchaseValue: 0, retailValue: 0 } });
});

export const getNegativeStock = asyncHandler(async (_req, res) => {
  const products = await Product.find({ active: true, stock: { $lt: 0 } }).sort({ stock: 1 });
  res.json({ products, count: products.length });
});

export const getProductStockSummary = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId).lean();
  if (!product) throw new ApiError(404, 'Product not found');
  const movements = await InventoryLog.find({ product: product._id }).sort({ createdAt: -1 }).limit(100).populate('user', 'name').lean();
  const totals = movements.reduce((sum, item) => ({
    quantityIn: sum.quantityIn + Number(item.quantityIn || 0),
    quantityOut: sum.quantityOut + Number(item.quantityOut || 0)
  }), { quantityIn: 0, quantityOut: 0 });
  res.json({ product, totals, movements });
});

export const getInventoryDashboard = asyncHandler(async (_req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const [stockValue, totalStockItems, lowStockCount, outOfStockCount, todayPurchases] = await Promise.all([
    Product.aggregate([{ $match: { active: true } }, { $group: { _id: null, value: { $sum: { $multiply: ['$stock', '$purchasePrice'] } } } }]),
    Product.countDocuments({ active: true, stock: { $gt: 0 } }),
    Product.countDocuments({ active: true, $expr: { $lte: ['$stock', '$lowStockThreshold'] } }),
    Product.countDocuments({ active: true, stock: { $lte: 0 } }),
    InventoryLog.aggregate([
      { $match: { referenceType: 'Purchase', createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: '$referenceId', quantity: { $sum: '$quantityIn' } } }
    ])
  ]);
  res.json({
    todayPurchases: todayPurchases.length,
    todayPurchaseAmount: 0,
    stockValue: stockValue[0]?.value || 0,
    totalStockItems,
    lowStockCount,
    outOfStockCount
  });
});

const bulkAllowed = ['purchasePrice', 'sellingPrice', 'retailPrice', 'mrp', 'wholesalePrice', 'taxRate', 'category', 'brand', 'unit'];

export const bulkUpdateProducts = asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body.productIds) ? req.body.productIds : [];
  if (!ids.length) throw new ApiError(400, 'Select products to update');
  const update = {};
  for (const field of bulkAllowed) {
    if (req.body[field] !== undefined && req.body[field] !== '') update[field] = req.body[field];
  }
  if (!Object.keys(update).length) throw new ApiError(400, 'No valid update fields supplied');
  if (update.unit) {
    await ensureDefaultUnits();
    const unit = await Unit.findOne({ name: String(update.unit).trim().toLowerCase(), active: true }).lean();
    if (!unit) throw new ApiError(400, 'Invalid unit');
    update.unit = unit.name;
    update.allowDecimalQty = unit.allowDecimal;
  }
  const result = await Product.updateMany({ _id: { $in: ids } }, { $set: update }, { runValidators: true });
  await logAudit(req, { action: 'Bulk Product Update', module: 'Inventory', newValue: { productIds: ids, update } });
  res.json({ matched: result.matchedCount, modified: result.modifiedCount });
});

function addProductColumns(sheet) {
  sheet.columns = [
    { header: 'Name', key: 'name', width: 28 },
    { header: 'SKU', key: 'sku', width: 18 },
    { header: 'Barcode', key: 'barcode', width: 18 },
    { header: 'Purchase Price', key: 'purchasePrice', width: 16 },
    { header: 'Selling Price', key: 'sellingPrice', width: 16 },
    { header: 'MRP', key: 'mrp', width: 12 },
    { header: 'Wholesale Price', key: 'wholesalePrice', width: 16 },
    { header: 'GST %', key: 'taxRate', width: 10 },
    { header: 'Stock', key: 'stock', width: 10 },
    { header: 'Minimum Stock', key: 'lowStockThreshold', width: 14 },
    { header: 'Unit', key: 'unit', width: 10 }
  ];
}

export const downloadProductTemplate = asyncHandler(async (_req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');
  addProductColumns(sheet);
  sheet.addRow({ name: 'Sample Product', sku: 'SAMPLE001', barcode: '890000000001', purchasePrice: 10, sellingPrice: 12, taxRate: 5, stock: 0, lowStockThreshold: 5, unit: 'pcs' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

export const importProducts = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw new ApiError(400, 'Excel file is required');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, 'Excel file has no worksheets');
  const headers = {};
  sheet.getRow(1).eachCell((cell, col) => { headers[String(cell.value || '').trim().toLowerCase()] = col; });
  const requiredHeaders = ['name', 'purchase price', 'selling price'];
  const missing = requiredHeaders.filter((header) => !headers[header]);
  if (missing.length) throw new ApiError(400, `Missing columns: ${missing.join(', ')}`);
  const get = (row, name) => headers[name] ? row.getCell(headers[name]).value : '';
  const summary = { imported: 0, skipped: 0, invalidRows: [] };
  await ensureDefaultUnits();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const name = String(get(row, 'name') || '').trim();
    if (!name) {
      summary.skipped += 1;
      summary.invalidRows.push({ row: rowNumber, reason: 'Name is required' });
      continue;
    }
    const purchasePrice = Number(get(row, 'purchase price') || 0);
    const sellingPrice = Number(get(row, 'selling price') || 0);
    const taxRate = Number(get(row, 'gst %') || 0);
    if (purchasePrice < 0 || sellingPrice < 0 || taxRate < 0 || taxRate > 100) {
      summary.skipped += 1;
      summary.invalidRows.push({ row: rowNumber, reason: 'Invalid price or GST' });
      continue;
    }
    const total = await Product.countDocuments();
    const unitName = String(get(row, 'unit') || 'pcs').trim().toLowerCase();
    const unit = await Unit.findOne({ name: unitName, active: true }).lean();
    if (!unit) {
      summary.skipped += 1;
      summary.invalidRows.push({ row: rowNumber, reason: `Invalid unit: ${unitName}` });
      continue;
    }
    const lastProduct = await Product.findOne().sort({ productId: -1 }).lean();
    try {
      await Product.create({
        productId: (lastProduct?.productId || 0) + 1,
        name,
        sku: String(get(row, 'sku') || makeSku(name, total)).trim().toUpperCase(),
        barcode: String(get(row, 'barcode') || '').trim() || undefined,
        purchasePrice,
        sellingPrice,
        retailPrice: sellingPrice,
        mrp: Number(get(row, 'mrp') || 0),
        wholesalePrice: Number(get(row, 'wholesale price') || 0),
        taxRate,
        stock: Number(get(row, 'stock') || 0),
        openingStock: Number(get(row, 'stock') || 0),
        lowStockThreshold: Number(get(row, 'minimum stock') || 5),
        unit: unit.name,
        allowDecimalQty: unit.allowDecimal
      });
      summary.imported += 1;
    } catch (error) {
      summary.skipped += 1;
      summary.invalidRows.push({ row: rowNumber, reason: error.message });
    }
  }
  await logAudit(req, { action: 'Product Import', module: 'Inventory', newValue: summary });
  res.json({ summary });
});

async function exportWorkbook(res, filename, sheetName, rows, columns) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  rows.forEach((row) => sheet.addRow(row));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

export const exportProducts = asyncHandler(async (_req, res) => {
  const products = await Product.find({ active: true }).lean();
  await exportWorkbook(res, 'products.xlsx', 'Products', products, [
    { header: 'Product ID', key: 'productId', width: 12 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'SKU', key: 'sku', width: 18 },
    { header: 'Barcode', key: 'barcode', width: 18 },
    { header: 'Purchase Price', key: 'purchasePrice', width: 16 },
    { header: 'Selling Price', key: 'sellingPrice', width: 16 },
    { header: 'Stock', key: 'stock', width: 10 },
    { header: 'GST %', key: 'taxRate', width: 10 }
  ]);
});

export const exportStock = asyncHandler(async (_req, res) => {
  const products = await Product.find({ active: true }).lean();
  await exportWorkbook(res, 'stock.xlsx', 'Stock', products, [
    { header: 'Name', key: 'name', width: 28 },
    { header: 'SKU', key: 'sku', width: 18 },
    { header: 'Barcode', key: 'barcode', width: 18 },
    { header: 'Stock', key: 'stock', width: 10 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Minimum Stock', key: 'lowStockThreshold', width: 14 }
  ]);
});

export const exportPurchases = asyncHandler(async (_req, res) => {
  const purchases = await Purchase.find({ active: true }).populate('supplier', 'name').lean();
  const rows = purchases.map((purchase) => ({
    purchaseNo: purchase.purchaseNo,
    invoiceNumber: purchase.invoiceNumber,
    supplierInvoice: purchase.supplierInvoice,
    supplier: purchase.supplier?.name || '',
    purchaseDate: purchase.purchaseDate,
    itemCount: purchase.itemCount || purchase.items?.length || 0,
    totalQuantity: purchase.totalQuantity || 0,
    subTotal: purchase.subTotal || 0,
    gstTotal: purchase.gstTotal || 0,
    discount: purchase.discount || 0,
    grandTotal: purchase.grandTotal || purchase.total || 0,
    amountPaid: purchase.amountPaid || purchase.paidAmount || 0,
    balance: purchase.balance || 0,
    paymentStatus: purchase.paymentStatus
  }));
  await exportWorkbook(res, 'purchases.xlsx', 'Purchases', rows, [
    { header: 'Purchase No', key: 'purchaseNo', width: 18 },
    { header: 'Invoice Number', key: 'invoiceNumber', width: 18 },
    { header: 'Supplier Invoice', key: 'supplierInvoice', width: 18 },
    { header: 'Supplier', key: 'supplier', width: 24 },
    { header: 'Purchase Date', key: 'purchaseDate', width: 18 },
    { header: 'No. of Items', key: 'itemCount', width: 14 },
    { header: 'Total Quantity', key: 'totalQuantity', width: 16 },
    { header: 'Sub Total', key: 'subTotal', width: 14 },
    { header: 'GST Total', key: 'gstTotal', width: 14 },
    { header: 'Discount', key: 'discount', width: 14 },
    { header: 'Grand Total', key: 'grandTotal', width: 14 },
    { header: 'Amount Paid', key: 'amountPaid', width: 14 },
    { header: 'Balance', key: 'balance', width: 14 },
    { header: 'Payment Status', key: 'paymentStatus', width: 16 }
  ]);
});

export const getInventorySettingsApi = asyncHandler(async (_req, res) => {
  const settings = await getInventorySettings();
  res.json({ settings });
});

export const updateInventorySettingsApi = asyncHandler(async (req, res) => {
  const settings = await getInventorySettings();
  const allowed = ['allowNegativeStock', 'defaultGST', 'defaultPurchaseDiscount', 'autoUpdateSellingPrice', 'autoGeneratePurchaseNumber', 'purchaseNumberPrefix', 'defaultRoundOff', 'preventDuplicateSupplierInvoice'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) settings[key] = req.body[key];
  }
  if (settings.defaultGST < 0 || settings.defaultGST > 100) throw new ApiError(400, 'Default GST must be between 0 and 100');
  if (settings.defaultPurchaseDiscount < 0 || settings.defaultPurchaseDiscount > 100) throw new ApiError(400, 'Default purchase discount must be between 0 and 100');
  await settings.save();
  await logAudit(req, { action: 'Inventory Settings Updated', module: 'Inventory', newValue: settings.toObject() });
  res.json({ settings });
});
