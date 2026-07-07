import express from 'express';
import { protect } from '../middleware/auth.js';
import { ApiError } from '../utils/apiError.js';
import {
  createPurchaseReturn, createSalesReturn, getPurchaseReturn, getPurchaseReturnable,
  getSalesReturn, getSalesReturnable, listPurchaseReturns, listSalesReturns,
  searchPurchases, searchSalesInvoices
} from '../controllers/returnController.js';

const permission = (name, fallbackRoles = []) => (req, res, next) => {
  if (req.user.role === 'admin' || req.user.permissions?.includes(name) || fallbackRoles.includes(req.user.role)) return next();
  return next(new ApiError(403, `Permission required: ${name}`));
};

export const returnRoutes = express.Router();
returnRoutes.use(protect);
returnRoutes.get('/sales/invoices', permission('view_returns', ['manager', 'cashier']), searchSalesInvoices);
returnRoutes.get('/sales/invoices/:id', permission('view_returns', ['manager', 'cashier']), getSalesReturnable);
returnRoutes.post('/sales', permission('create_returns', ['manager', 'cashier']), createSalesReturn);
returnRoutes.get('/sales', permission('view_returns', ['manager', 'cashier']), listSalesReturns);
returnRoutes.get('/sales/:id', permission('view_returns', ['manager', 'cashier']), getSalesReturn);
returnRoutes.get('/purchases/search', permission('view_returns', ['manager']), searchPurchases);
returnRoutes.get('/purchases/source/:id', permission('view_returns', ['manager']), getPurchaseReturnable);
returnRoutes.post('/purchases', permission('create_returns', ['manager']), createPurchaseReturn);
returnRoutes.get('/purchases', permission('view_returns', ['manager']), listPurchaseReturns);
returnRoutes.get('/purchases/:id', permission('view_returns', ['manager']), getPurchaseReturn);
