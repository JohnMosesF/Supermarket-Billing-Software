import express from 'express';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createTax, deleteTax, listTaxes, taxRules, updateTax } from '../controllers/taxController.js';

export const taxRoutes = express.Router();

taxRoutes.use(protect);
taxRoutes.route('/')
  .get(listTaxes)
  .post(authorize('admin', 'manager'), taxRules, validate, createTax);
taxRoutes.route('/:id')
  .patch(authorize('admin', 'manager'), taxRules, validate, updateTax)
  .delete(authorize('admin'), deleteTax);
