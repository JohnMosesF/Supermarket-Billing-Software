import express from 'express';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createUnit, deleteUnit, listUnits, unitRules, updateUnit } from '../controllers/unitController.js';

export const unitRoutes = express.Router();

unitRoutes.use(protect);
unitRoutes.get('/', listUnits);
unitRoutes.post('/', authorize('admin', 'manager'), unitRules, validate, createUnit);
unitRoutes.patch('/:id', authorize('admin', 'manager'), unitRules, validate, updateUnit);
unitRoutes.delete('/:id', authorize('admin'), deleteUnit);
