import clsx from 'clsx';
import {
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  ClipboardList,
  Receipt,
  Settings,
  ShoppingCart,
  Sun,
  Truck,
  Undo2,
  BookOpen,
  WalletCards,
  Users
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { useUiStore } from '../store/uiStore.js';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/billing', label: 'Billing', icon: ShoppingCart },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/purchases', label: 'Purchases', icon: ClipboardList },
  { to: '/sales-returns', label: 'Sales Returns', icon: Undo2 },
  { to: '/purchase-returns', label: 'Purchase Returns', icon: Undo2 },
  { to: '/accounting/customer-ledger', label: 'Customer Ledger', icon: BookOpen },
  { to: '/accounting/supplier-ledger', label: 'Supplier Ledger', icon: BookOpen, manager: true },
  { to: '/accounting/customer-outstanding', label: 'Customer Outstanding', icon: WalletCards },
  { to: '/accounting/supplier-outstanding', label: 'Supplier Outstanding', icon: WalletCards, manager: true },
  { to: '/accounting/receipts', label: 'Receipts', icon: WalletCards },
  { to: '/accounting/supplier-payments', label: 'Supplier Payments', icon: WalletCards, manager: true },
  { to: '/accounting/day-book', label: 'Day Book', icon: BookOpen, manager: true },
  { to: '/accounting/collections', label: 'Collections', icon: WalletCards },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/users', label: 'Users', icon: Users, admin: true },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export function AppLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { darkMode, collapsed, toggleTheme, toggleSidebar } = useUiStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const visibleItems = navItems.filter((item) => (!item.admin || user?.role === 'admin') && (!item.manager || ['admin', 'manager'].includes(user?.role)));

  return (
    <div className="min-h-screen bg-mist text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className={clsx('fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white transition-all dark:border-slate-800 dark:bg-slate-900 lg:block', collapsed ? 'w-20' : 'w-64')}>
        <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-leaf text-white">
            <Receipt size={21} />
          </div>
          {!collapsed ? (
            <div>
              <p className="font-bold">StoreDesk POS</p>
              <p className="text-xs text-slate-500">Billing and inventory</p>
            </div>
          ) : null}
        </div>

        <nav
          className="
            h-[calc(100vh-64px)]
            overflow-y-auto
            space-y-1
            p-3
            scrollbar-thin
            scrollbar-thumb-slate-400
            scrollbar-track-transparent
          "
        >
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-emerald-50 text-leaf dark:bg-emerald-950/40"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                )
              }
            >
              <item.icon size={19} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className={clsx('transition-all', collapsed ? 'lg:pl-20' : 'lg:pl-64')}>
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button className="btn-muted hidden h-10 w-10 p-0 lg:inline-flex" onClick={toggleSidebar} title="Toggle sidebar">
                {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
              <div>
                <p className="text-sm font-semibold">{user?.name || 'User'}</p>
                <p className="text-xs capitalize text-slate-500">{user?.role || 'staff'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="btn-muted h-10 w-10 p-0" onClick={toggleTheme} title="Toggle theme">
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="btn-muted"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                <LogOut size={17} />
                Logout
              </button>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {visibleItems.map((item) => (
              <NavLink key={item.to} to={item.to} className="btn-muted whitespace-nowrap py-1.5">
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
