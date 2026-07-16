import express from 'express';
import multer from 'multer';
import {
  adjustStock,
  adjustmentRules,
  bulkUpdateProducts,
  downloadProductTemplate,
  exportProducts,
  exportPurchases,
  exportStock,
  getCurrentStock,
  getInventoryDashboard,
  getInventorySettingsApi,
  getLowStockProducts,
  getNearOutOfStockProducts,
  getNegativeStock,
  getOutOfStockProducts,
  getProductStockSummary,
  getStockValue,
  importProducts,
  listAdjustments,
  listInventoryLogs,
  updateInventorySettingsApi
} from '../controllers/inventoryController.js';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const inventoryRoutes = express.Router();
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.match(/\.(xlsx)$/i)) return cb(new Error('Only .xlsx files are allowed'));
    cb(null, true);
  }
});

inventoryRoutes.use(protect);
inventoryRoutes.get('/logs', listInventoryLogs);
inventoryRoutes.get('/adjustments', authorize('admin', 'manager'), listAdjustments);
inventoryRoutes.post('/adjust', authorize('admin', 'manager'), adjustmentRules, validate, adjustStock);
inventoryRoutes.get('/low-stock', getLowStockProducts);
inventoryRoutes.get('/out-of-stock', getOutOfStockProducts);
inventoryRoutes.get('/near-out-of-stock', getNearOutOfStockProducts);
inventoryRoutes.get('/current-stock', getCurrentStock);
inventoryRoutes.get('/stock-value', getStockValue);
inventoryRoutes.get('/negative-stock', getNegativeStock);
inventoryRoutes.get('/stock-summary/:productId', getProductStockSummary);
inventoryRoutes.get('/dashboard', getInventoryDashboard);
inventoryRoutes.post('/bulk-update', authorize('admin', 'manager'), bulkUpdateProducts);
inventoryRoutes.get('/settings', authorize('admin', 'manager'), getInventorySettingsApi);
inventoryRoutes.put('/settings', authorize('admin', 'manager'), updateInventorySettingsApi);
inventoryRoutes.get('/products/template', authorize('admin', 'manager'), downloadProductTemplate);
inventoryRoutes.post('/products/import', authorize('admin', 'manager'), excelUpload.single('file'), importProducts);
inventoryRoutes.get('/products/export', exportProducts);
inventoryRoutes.get('/stock/export', exportStock);
inventoryRoutes.get('/purchases/export', exportPurchases);
