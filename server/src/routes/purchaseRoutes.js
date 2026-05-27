import express from 'express';
import { createPurchase, listPurchases, purchaseRules } from '../controllers/purchaseController.js';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const purchaseRoutes = express.Router();

purchaseRoutes.use(protect, authorize('admin', 'manager'));
purchaseRoutes.route('/').get(listPurchases).post(purchaseRules, validate, createPurchase);
