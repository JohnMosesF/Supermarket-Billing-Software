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
import { UsersPage } from './pages/UsersPage.jsx';

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
            <Route path="customers" element={<Customers />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="reports" element={<Reports />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}
