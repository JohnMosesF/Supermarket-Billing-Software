import express from 'express';
import {
  createProduct,
  deleteProduct,
  generateSku,
  listProducts,
  productQueryRules,
  productRules,
  updateProduct
} from '../controllers/productController.js';
import { authorize, protect } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';

export const productRoutes = express.Router();

productRoutes.use(protect);
productRoutes.get('/sku', generateSku);
productRoutes.route('/')
  .get(productQueryRules, validate, listProducts)
  .post(authorize('admin', 'manager'), upload.single('image'), productRules, validate, createProduct);
productRoutes.route('/:id')
  .patch(authorize('admin', 'manager'), upload.single('image'), updateProduct)
  .delete(authorize('admin'), deleteProduct);
