import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { AppLayout } from './layouts/AppLayout.jsx';
import Billing from './billing/BillingDashboard.jsx';
import BillingWindow from './billing/BillingWindow.jsx';
import { Customers } from './pages/Customers.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Inventory } from './pages/Inventory.jsx';
import { Login } from './pages/Login.jsx';
import { NotFound } from './pages/NotFound.jsx';
import { Products } from './pages/Products.jsx';
import { Purchases } from './pages/Purchases.jsx';
import { Reports } from './pages/Reports.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { Suppliers } from './pages/Suppliers.jsx';
import { SalesReturns } from './pages/SalesReturns.jsx';
import { PurchaseReturns } from './pages/PurchaseReturns.jsx';
import { CashBook, CollectionReport, DayBook, ItemLedger, LedgerPage, OutstandingPage, PurchaseLedger, ReceiptEntry, SalesLedger, StockLedger, SupplierPaymentEntry } from './pages/Accounting.jsx';
import { Expenses } from './pages/Expenses.jsx';
import { UsersPage } from './pages/UsersPage.jsx';
import { MasterDataPage } from './pages/MasterDataPage.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="billing-window" element={<BillingWindow />} />
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="billing" element={<Billing />} />
            <Route path="products" element={<Products />} />
            <Route path="masters/categories" element={<MasterDataPage type="categories" />} />
            <Route path="masters/brands" element={<MasterDataPage type="brands" />} />
            <Route path="masters/units" element={<MasterDataPage type="units" />} />
            <Route path="masters/gst" element={<MasterDataPage type="taxes" />} />
            <Route path="customers" element={<Customers />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="sales-returns" element={<SalesReturns />} />
            <Route path="purchase-returns" element={<PurchaseReturns />} />
            <Route path="accounting/customer-ledger" element={<LedgerPage type="customer" />} />
            <Route path="accounting/supplier-ledger" element={<LedgerPage type="supplier" />} />
            <Route path="accounting/customer-outstanding" element={<OutstandingPage type="customer" />} />
            <Route path="accounting/supplier-outstanding" element={<OutstandingPage type="supplier" />} />
            <Route path="accounting/receipts" element={<ReceiptEntry />} />
            <Route path="accounting/supplier-payments" element={<SupplierPaymentEntry />} />
            <Route path="accounting/day-book" element={<DayBook />} />
            <Route path="accounting/cash-book" element={<CashBook />} />
            <Route path="accounting/sales-ledger" element={<SalesLedger />} />
            <Route path="accounting/purchase-ledger" element={<PurchaseLedger />} />
            <Route path="accounting/stock-ledger" element={<StockLedger />} />
            <Route path="accounting/item-ledger" element={<ItemLedger />} />
            <Route path="accounting/collections" element={<CollectionReport />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="reports/*" element={<Reports />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}
