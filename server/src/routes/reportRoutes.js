import express from 'express';
import { exportSalesExcel, exportSalesPdf, productAnalytics, profitLossReport, salesReport, stockValuation } from '../controllers/reportController.js';
import { authorize, protect } from '../middleware/auth.js';

export const reportRoutes = express.Router();

reportRoutes.use(protect, authorize('admin', 'manager'));
reportRoutes.get('/sales', salesReport);
reportRoutes.get('/profit-loss', profitLossReport);
reportRoutes.get('/products', productAnalytics);
reportRoutes.get('/stock-valuation', stockValuation);
reportRoutes.get('/sales/export.xlsx', exportSalesExcel);
reportRoutes.get('/sales/export.pdf', exportSalesPdf);
