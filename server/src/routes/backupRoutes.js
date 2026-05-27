import express from 'express';
import { createBackup, restoreBackup } from '../controllers/backupController.js';
import { authorize, protect } from '../middleware/auth.js';

export const backupRoutes = express.Router();

backupRoutes.use(protect, authorize('admin'));
backupRoutes.get('/', createBackup);
backupRoutes.post('/restore', express.urlencoded({ extended: true, limit: '50mb' }), restoreBackup);
