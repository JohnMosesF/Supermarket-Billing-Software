import express from 'express';
import {
  advancedReport,
  businessIntelligenceDashboard,
  creditSalesReport,
  customerDueReport,
  exportBusinessDashboardCsv,
  exportBusinessDashboardExcel,
  exportBusinessDashboardPdf,
  exportAdvancedReportExcel,
  exportAdvancedReportPdf,
  exportReturnsExcel,
  exportReturnsPdf,
  exportSalesExcel,
  exportSalesPdf,
  outstandingBalanceReport,
  paymentCollectionReport,
  productAnalytics,
  profitLossReport,
  returnsReport,
  salesReport,
  stockValuation
} from '../controllers/reportController.js';
import { authorize, protect } from '../middleware/auth.js';

export const reportRoutes = express.Router();

reportRoutes.use(protect, authorize('admin', 'manager'));
reportRoutes.get('/business-intelligence', businessIntelligenceDashboard);
reportRoutes.get('/business-intelligence/export.xlsx', exportBusinessDashboardExcel);
reportRoutes.get('/business-intelligence/export.pdf', exportBusinessDashboardPdf);
reportRoutes.get('/business-intelligence/export.csv', exportBusinessDashboardCsv);
reportRoutes.get('/sales', salesReport);
reportRoutes.get('/purchases', advancedReport('purchases'));
reportRoutes.get('/profit', advancedReport('profit'));
reportRoutes.get('/gst', advancedReport('gst'));
reportRoutes.get('/profit-loss', profitLossReport);
reportRoutes.get('/products', productAnalytics);
reportRoutes.get('/stock-valuation', stockValuation);
reportRoutes.get('/dead-stock', advancedReport('dead-stock'));
reportRoutes.get('/fast-moving-products', advancedReport('fast-moving-products'));
reportRoutes.get('/slow-moving-products', advancedReport('slow-moving-products'));
reportRoutes.get('/customer-purchases', advancedReport('customer-purchases'));
reportRoutes.get('/supplier-purchases', advancedReport('supplier-purchases'));
reportRoutes.get('/low-stock', advancedReport('low-stock'));
reportRoutes.get('/customer-due', customerDueReport);
reportRoutes.get('/outstanding-balances', outstandingBalanceReport);
reportRoutes.get('/credit-sales', creditSalesReport);
reportRoutes.get('/payment-collections', paymentCollectionReport);
reportRoutes.get('/sales/export.xlsx', exportSalesExcel);
reportRoutes.get('/sales/export.pdf', exportSalesPdf);
reportRoutes.get('/purchases/export.xlsx', exportAdvancedReportExcel('purchases'));
reportRoutes.get('/purchases/export.pdf', exportAdvancedReportPdf('purchases'));
reportRoutes.get('/profit/export.xlsx', exportAdvancedReportExcel('profit'));
reportRoutes.get('/profit/export.pdf', exportAdvancedReportPdf('profit'));
reportRoutes.get('/gst/export.xlsx', exportAdvancedReportExcel('gst'));
reportRoutes.get('/gst/export.pdf', exportAdvancedReportPdf('gst'));
reportRoutes.get('/stock-valuation/export.xlsx', exportAdvancedReportExcel('stock-valuation'));
reportRoutes.get('/stock-valuation/export.pdf', exportAdvancedReportPdf('stock-valuation'));
reportRoutes.get('/dead-stock/export.xlsx', exportAdvancedReportExcel('dead-stock'));
reportRoutes.get('/dead-stock/export.pdf', exportAdvancedReportPdf('dead-stock'));
reportRoutes.get('/fast-moving-products/export.xlsx', exportAdvancedReportExcel('fast-moving-products'));
reportRoutes.get('/fast-moving-products/export.pdf', exportAdvancedReportPdf('fast-moving-products'));
reportRoutes.get('/slow-moving-products/export.xlsx', exportAdvancedReportExcel('slow-moving-products'));
reportRoutes.get('/slow-moving-products/export.pdf', exportAdvancedReportPdf('slow-moving-products'));
reportRoutes.get('/customer-purchases/export.xlsx', exportAdvancedReportExcel('customer-purchases'));
reportRoutes.get('/customer-purchases/export.pdf', exportAdvancedReportPdf('customer-purchases'));
reportRoutes.get('/supplier-purchases/export.xlsx', exportAdvancedReportExcel('supplier-purchases'));
reportRoutes.get('/supplier-purchases/export.pdf', exportAdvancedReportPdf('supplier-purchases'));
reportRoutes.get('/low-stock/export.xlsx', exportAdvancedReportExcel('low-stock'));
reportRoutes.get('/low-stock/export.pdf', exportAdvancedReportPdf('low-stock'));
reportRoutes.get('/sales-returns', returnsReport('sales'));
reportRoutes.get('/purchase-returns', returnsReport('purchase'));
reportRoutes.get('/sales-returns/export.xlsx', exportReturnsExcel('sales'));
reportRoutes.get('/sales-returns/export.pdf', exportReturnsPdf('sales'));
reportRoutes.get('/purchase-returns/export.xlsx', exportReturnsExcel('purchase'));
reportRoutes.get('/purchase-returns/export.pdf', exportReturnsPdf('purchase'));
