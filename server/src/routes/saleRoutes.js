import express from 'express';
import { createSale, getSale, listSales, saleRules } from '../controllers/saleController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const saleRoutes = express.Router();

saleRoutes.use(protect);
saleRoutes.route('/').get(listSales).post(saleRules, validate, createSale);
saleRoutes.get('/:id', getSale);
