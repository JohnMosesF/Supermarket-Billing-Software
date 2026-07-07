import express from 'express';
import * as billController from '../controllers/billController.js';
import { protect } from '../middleware/auth.js';

export const billRoutes = express.Router();

// Apply auth middleware to all routes
billRoutes.use(protect);

// Bill CRUD
billRoutes.post('/', billController.createBill);
billRoutes.post('/:id/delete', billController.deleteBill);

// Bill search and list
billRoutes.get('/stats/today', billController.getTodaysSales);
billRoutes.get('/search', billController.searchBills);
billRoutes.get('/deleted', billController.getDeletedBills);
billRoutes.post('/deleted/:id/restore', billController.restoreDeletedBill);
billRoutes.delete('/deleted/:id', billController.permanentlyDeleteDeletedBill);
// Hold bills
billRoutes.post('/hold', billController.holdBill);
billRoutes.get('/hold/all', billController.getHeldBills);
billRoutes.get('/hold/:id', billController.resumeHeldBill);
billRoutes.delete('/hold/:id', billController.deleteHeldBill);

// Dynamic bill routes must come after /hold and /deleted routes.
billRoutes.get('/:id', billController.getBill);
billRoutes.put('/:id', billController.updateBill);
billRoutes.get('/', billController.getBills);

// Refunds
billRoutes.post('/refunds', billController.createRefund);
billRoutes.get('/refunds', billController.getRefunds);

// Print logs
billRoutes.post('/print-logs', billController.logPrint);
