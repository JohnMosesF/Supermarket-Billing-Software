import express from 'express';
import { createSupplier, deleteSupplier, listSuppliers, restoreSupplier, supplierRules, updateSupplier } from '../controllers/supplierController.js';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const supplierRoutes = express.Router();

supplierRoutes.use(protect, authorize('admin', 'manager'));
supplierRoutes.route('/').get(listSuppliers).post(supplierRules, validate, createSupplier);
supplierRoutes.route('/:id/restore').patch(restoreSupplier);
supplierRoutes.route('/:id').patch(supplierRules, validate, updateSupplier).delete(deleteSupplier);
