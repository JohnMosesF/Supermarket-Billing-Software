import express from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController.js';
import { authorize, protect } from '../middleware/auth.js';

export const settingsRoutes = express.Router();

settingsRoutes.use(protect);
settingsRoutes.get('/', getSettings);
settingsRoutes.patch('/', authorize('admin'), updateSettings);
