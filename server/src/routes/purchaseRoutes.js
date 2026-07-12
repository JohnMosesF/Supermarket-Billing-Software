import express from 'express';
import { createPurchase, deletePurchase, getPurchase, getSupplierPriceHistory, listPurchases, purchaseRules, updatePurchase } from '../controllers/purchaseController.js';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const purchaseRoutes = express.Router();

purchaseRoutes.use(protect, authorize('admin', 'manager'));
purchaseRoutes.get('/price-history', getSupplierPriceHistory);
purchaseRoutes.route('/').get(listPurchases).post(purchaseRules, validate, createPurchase);
purchaseRoutes.route('/:id').get(getPurchase).put(purchaseRules, validate, updatePurchase).delete(deletePurchase);
