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
import { searchProducts, searchByProductId, getNextProductId } from '../controllers/productSearchController.js';
import { authorize, protect } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';

export const productRoutes = express.Router();

productRoutes.use(protect);
productRoutes.get('/sku', generateSku);
productRoutes.get('/search', searchProducts);
productRoutes.get('/id/:productId', searchByProductId); // Search by numeric product ID
productRoutes.get('/next-id', getNextProductId); // Get next available product ID
productRoutes.route('/')
  .get(productQueryRules, validate, listProducts)
  .post(authorize('admin', 'manager'), upload.single('image'), productRules, validate, createProduct);
productRoutes.route('/:id')
  .patch(authorize('admin', 'manager'), upload.single('image'), updateProduct)
  .delete(authorize('admin'), deleteProduct);
