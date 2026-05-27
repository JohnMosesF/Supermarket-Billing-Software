import express from 'express';
import { createCustomer, customerHistory, customerRules, deleteCustomer, listCustomers, updateCustomer } from '../controllers/customerController.js';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const customerRoutes = express.Router();

customerRoutes.use(protect);
customerRoutes.route('/').get(listCustomers).post(customerRules, validate, createCustomer);
customerRoutes.get('/:id/history', customerHistory);
customerRoutes.route('/:id').patch(customerRules, validate, updateCustomer).delete(authorize('admin', 'manager'), deleteCustomer);
