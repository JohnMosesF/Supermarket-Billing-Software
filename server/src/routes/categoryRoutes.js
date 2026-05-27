import express from 'express';
import { createCategory, deleteCategory, listCategories, updateCategory, categoryRules } from '../controllers/categoryController.js';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const categoryRoutes = express.Router();

categoryRoutes.use(protect);
categoryRoutes.route('/').get(listCategories).post(authorize('admin', 'manager'), categoryRules, validate, createCategory);
categoryRoutes.route('/:id').patch(authorize('admin', 'manager'), categoryRules, validate, updateCategory).delete(authorize('admin'), deleteCategory);
