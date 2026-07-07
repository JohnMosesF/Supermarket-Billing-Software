import express from 'express';
import { authorize, protect } from '../middleware/auth.js';
import {
  createCustomerReceipt, createSupplierPayment, customerLedger, customerOutstanding, dayBook,
  exportCustomerLedger, exportSupplierLedger, paymentRegister, pendingCustomerBills,
  pendingSupplierPurchases, receiptRegister, supplierLedger, supplierOutstanding, exportAccountingRegister
} from '../controllers/accountingController.js';

export const accountingRoutes = express.Router();
accountingRoutes.use(protect);
accountingRoutes.get('/customers/outstanding', customerOutstanding);
accountingRoutes.get('/customers/:id/ledger', customerLedger);
accountingRoutes.get('/customers/:id/ledger.xlsx', exportCustomerLedger('xlsx'));
accountingRoutes.get('/customers/:id/ledger.pdf', exportCustomerLedger('pdf'));
accountingRoutes.get('/customers/:id/pending-bills', pendingCustomerBills);
accountingRoutes.post('/receipts', createCustomerReceipt);
accountingRoutes.get('/receipts', receiptRegister);
accountingRoutes.get('/suppliers/outstanding', authorize('admin', 'manager'), supplierOutstanding);
accountingRoutes.get('/suppliers/:id/ledger', authorize('admin', 'manager'), supplierLedger);
accountingRoutes.get('/suppliers/:id/ledger.xlsx', authorize('admin', 'manager'), exportSupplierLedger('xlsx'));
accountingRoutes.get('/suppliers/:id/ledger.pdf', authorize('admin', 'manager'), exportSupplierLedger('pdf'));
accountingRoutes.get('/suppliers/:id/pending-purchases', authorize('admin', 'manager'), pendingSupplierPurchases);
accountingRoutes.post('/supplier-payments', authorize('admin', 'manager'), createSupplierPayment);
accountingRoutes.get('/supplier-payments', authorize('admin', 'manager'), paymentRegister);
accountingRoutes.get('/day-book', authorize('admin', 'manager'), dayBook);
for (const kind of ['receipts', 'payments', 'customer-outstanding', 'supplier-outstanding', 'day-book']) {
  accountingRoutes.get(`/exports/${kind}.xlsx`, authorize('admin', 'manager'), exportAccountingRegister(kind, 'xlsx'));
  accountingRoutes.get(`/exports/${kind}.pdf`, authorize('admin', 'manager'), exportAccountingRegister(kind, 'pdf'));
}
