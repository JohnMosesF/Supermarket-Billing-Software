import express from 'express';
import {
  creditSalesReport,
  customerDueReport,
  exportSalesExcel,
  exportSalesPdf,
  outstandingBalanceReport,
  paymentCollectionReport,
  productAnalytics,
  profitLossReport,
  salesReport,
  stockValuation
  , returnsReport, exportReturnsExcel, exportReturnsPdf
} from '../controllers/reportController.js';
import { authorize, protect } from '../middleware/auth.js';

export const reportRoutes = express.Router();

reportRoutes.use(protect, authorize('admin', 'manager'));
reportRoutes.get('/sales', salesReport);
reportRoutes.get('/profit-loss', profitLossReport);
reportRoutes.get('/products', productAnalytics);
reportRoutes.get('/stock-valuation', stockValuation);
reportRoutes.get('/customer-due', customerDueReport);
reportRoutes.get('/outstanding-balances', outstandingBalanceReport);
reportRoutes.get('/credit-sales', creditSalesReport);
reportRoutes.get('/payment-collections', paymentCollectionReport);
reportRoutes.get('/sales/export.xlsx', exportSalesExcel);
reportRoutes.get('/sales/export.pdf', exportSalesPdf);
reportRoutes.get('/sales-returns', returnsReport('sales'));
reportRoutes.get('/purchase-returns', returnsReport('purchase'));
reportRoutes.get('/sales-returns/export.xlsx', exportReturnsExcel('sales'));
reportRoutes.get('/sales-returns/export.pdf', exportReturnsPdf('sales'));
reportRoutes.get('/purchase-returns/export.xlsx', exportReturnsExcel('purchase'));
reportRoutes.get('/purchase-returns/export.pdf', exportReturnsPdf('purchase'));
