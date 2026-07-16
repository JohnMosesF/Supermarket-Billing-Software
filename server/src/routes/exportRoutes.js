import express from 'express';
import { exportData } from '../controllers/exportController.js';
import { protect, requirePermission } from '../middleware/auth.js';

export const exportRoutes = express.Router();

exportRoutes.use(protect, requirePermission('reports'));
exportRoutes.get('/:dataset.xlsx', exportData('xlsx'));
exportRoutes.get('/:dataset.csv', exportData('csv'));
exportRoutes.get('/:dataset.json', exportData('json'));
exportRoutes.get('/:dataset.pdf', exportData('pdf'));
