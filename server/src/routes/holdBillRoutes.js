import express from 'express';
import * as billController from '../controllers/billController.js';
import { protect } from '../middleware/auth.js';

export const holdBillRoutes = express.Router();

holdBillRoutes.use(protect);

holdBillRoutes.post('/', billController.holdBill);
holdBillRoutes.get('/', billController.getHeldBills);
holdBillRoutes.get('/:id', billController.resumeHeldBill);
holdBillRoutes.delete('/:id', billController.deleteHeldBill);
