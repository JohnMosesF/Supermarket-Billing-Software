import express from 'express';
import {
  cancelPurchaseOrder,
  cancelPurchaseOrderRules,
  convertPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  idRule,
  listPurchaseOrders,
  printPurchaseOrder,
  purchaseOrderListRules,
  purchaseOrderRules,
  receivePurchaseOrder,
  receivePurchaseOrderRules,
  updatePurchaseOrder
} from '../controllers/purchaseOrderController.js';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const purchaseOrderRoutes = express.Router();

purchaseOrderRoutes.use(protect, authorize('admin', 'manager'));
purchaseOrderRoutes.route('/')
  .get(purchaseOrderListRules, validate, listPurchaseOrders)
  .post(purchaseOrderRules, validate, createPurchaseOrder);
purchaseOrderRoutes.route('/:id')
  .get(idRule, validate, getPurchaseOrder)
  .put(idRule, purchaseOrderRules, validate, updatePurchaseOrder);
purchaseOrderRoutes.post('/:id/receive', idRule, receivePurchaseOrderRules, validate, receivePurchaseOrder);
purchaseOrderRoutes.post('/:id/convert', idRule, validate, convertPurchaseOrder);
purchaseOrderRoutes.post('/:id/cancel', idRule, cancelPurchaseOrderRules, validate, cancelPurchaseOrder);
purchaseOrderRoutes.post('/:id/print', idRule, validate, printPurchaseOrder);
