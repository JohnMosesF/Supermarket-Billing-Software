import express from 'express';
import { auditQueryRules, listAuditLogs } from '../controllers/auditController.js';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const auditRoutes = express.Router();

auditRoutes.use(protect, authorize('admin', 'manager'));
auditRoutes.get('/', auditQueryRules, validate, listAuditLogs);
