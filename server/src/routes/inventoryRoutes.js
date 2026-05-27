import express from 'express';
import { adjustStock, adjustmentRules, listInventoryLogs } from '../controllers/inventoryController.js';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const inventoryRoutes = express.Router();

inventoryRoutes.use(protect);
inventoryRoutes.get('/logs', listInventoryLogs);
inventoryRoutes.post('/adjust', authorize('admin', 'manager'), adjustmentRules, validate, adjustStock);
