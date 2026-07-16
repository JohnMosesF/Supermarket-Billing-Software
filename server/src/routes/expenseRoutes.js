import express from 'express';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  cancelExpense,
  categoryRules,
  approveExpense,
  createExpense,
  createExpenseCategory,
  deleteExpense,
  deleteExpenseAttachment,
  deleteExpenseCategory,
  downloadExpenseAttachment,
  exportExpenseVoucherPdf,
  expenseLedger,
  expenseSummary,
  expenseUpload,
  expenseVoucher,
  listExpenseCategories,
  listExpenses,
  markExpensePrinted,
  postExpense,
  rejectExpense,
  restoreExpense,
  seedExpenseCategories,
  updateExpense,
  updateExpenseCategory
} from '../controllers/expenseController.js';

export const expenseRoutes = express.Router();

expenseRoutes.use(protect);

expenseRoutes.post('/categories/seed', authorize('admin', 'manager'), seedExpenseCategories);
expenseRoutes.route('/categories')
  .get(listExpenseCategories)
  .post(authorize('admin', 'manager'), categoryRules, validate, createExpenseCategory);
expenseRoutes.route('/categories/:id')
  .patch(authorize('admin', 'manager'), categoryRules, validate, updateExpenseCategory)
  .delete(authorize('admin'), deleteExpenseCategory);

expenseRoutes.get('/ledger', expenseLedger);
expenseRoutes.get('/summary', expenseSummary);
expenseRoutes.get('/:id/voucher', expenseVoucher);
expenseRoutes.get('/:id/voucher.pdf', exportExpenseVoucherPdf);
expenseRoutes.get('/:id/attachment', downloadExpenseAttachment);
expenseRoutes.post('/:id/print', markExpensePrinted);
expenseRoutes.post('/:id/approve', authorize('admin', 'manager'), approveExpense);
expenseRoutes.post('/:id/reject', authorize('admin', 'manager'), rejectExpense);
expenseRoutes.post('/:id/post', authorize('admin', 'manager'), postExpense);
expenseRoutes.post('/:id/cancel', authorize('admin', 'manager'), cancelExpense);
expenseRoutes.post('/:id/restore', authorize('admin'), restoreExpense);
expenseRoutes.delete('/:id/attachment', authorize('admin', 'manager'), deleteExpenseAttachment);
expenseRoutes.route('/:id')
  .patch(authorize('admin', 'manager'), expenseUpload.single('attachment'), updateExpense)
  .delete(authorize('admin', 'manager'), deleteExpense);

expenseRoutes.route('/')
  .get(listExpenses)
  .post(expenseUpload.single('attachment'), createExpense);
