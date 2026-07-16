import express from 'express';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { brandRules, createBrand, deleteBrand, listBrands, updateBrand } from '../controllers/brandController.js';

export const brandRoutes = express.Router();

brandRoutes.use(protect);
brandRoutes.route('/')
  .get(listBrands)
  .post(authorize('admin', 'manager'), brandRules, validate, createBrand);
brandRoutes.route('/:id')
  .patch(authorize('admin', 'manager'), brandRules, validate, updateBrand)
  .delete(authorize('admin'), deleteBrand);
