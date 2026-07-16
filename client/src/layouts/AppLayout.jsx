import clsx from 'clsx';
import {
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Tags,
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
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { useUiStore } from '../store/uiStore.js';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard' },
  { to: '/billing', label: 'Billing', icon: ShoppingCart, permission: 'billing' },
  { to: '/products', label: 'Products', icon: Package, permission: 'products' },
  { to: '/masters/categories', label: 'Categories', icon: Tags, permission: 'products' },
  { to: '/masters/brands', label: 'Brands', icon: Tags, permission: 'products' },
  { to: '/masters/units', label: 'Units', icon: Tags, permission: 'products' },
  { to: '/masters/gst', label: 'GST', icon: Tags, permission: 'products' },
  { to: '/customers', label: 'Customers', icon: Users, permission: 'customers' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory' },
  { to: '/purchases', label: 'Purchases', icon: ClipboardList, permission: 'purchases' },
  { to: '/sales-returns', label: 'Sales Returns', icon: Undo2, permission: 'sales_returns' },
  { to: '/purchase-returns', label: 'Purchase Returns', icon: Undo2, permission: 'purchase_returns' },
  { to: '/accounting/customer-ledger', label: 'Customer Ledger', icon: BookOpen, permission: 'accounting' },
  { to: '/accounting/supplier-ledger', label: 'Supplier Ledger', icon: BookOpen, permission: 'accounting' },
  { to: '/accounting/customer-outstanding', label: 'Customer Outstanding', icon: WalletCards, permission: 'accounting' },
  { to: '/accounting/supplier-outstanding', label: 'Supplier Outstanding', icon: WalletCards, permission: 'accounting' },
  { to: '/accounting/receipts', label: 'Receipts', icon: WalletCards, permission: 'accounting' },
  { to: '/accounting/supplier-payments', label: 'Supplier Payments', icon: WalletCards, permission: 'accounting' },
  { to: '/accounting/day-book', label: 'Day Book', icon: BookOpen, permission: 'accounting' },
  { to: '/accounting/cash-book', label: 'Cash Book', icon: BookOpen, permission: 'accounting' },
  { to: '/accounting/sales-ledger', label: 'Sales Ledger', icon: BookOpen, permission: 'accounting' },
  { to: '/accounting/purchase-ledger', label: 'Purchase Ledger', icon: BookOpen, permission: 'accounting' },
  { to: '/accounting/item-ledger', label: 'Item Ledger', icon: BookOpen, permission: 'accounting' },
  { to: '/accounting/stock-ledger', label: 'Stock Ledger', icon: BookOpen, permission: 'accounting' },
  { to: '/accounting/collections', label: 'Collections', icon: WalletCards, permission: 'accounting' },
  { to: '/expenses', label: 'Expenses', icon: WalletCards, permission: 'expenses' },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, permission: 'purchases' },
  { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports' },
  { to: '/users', label: 'Users', icon: Users, permission: 'users' },
  { to: '/settings', label: 'Settings', icon: Settings, permission: 'settings' }
];

const navGroups = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard' }]
  },
  {
    key: 'sales',
    label: 'Sales',
    items: [
      { to: '/billing', label: 'Billing', icon: ShoppingCart, permission: 'billing' },
      { to: '/sales-returns', label: 'Sales Returns', icon: Undo2, permission: 'sales_returns' }
    ]
  },
  {
    key: 'masters',
    label: 'Masters',
    items: [
      { to: '/products', label: 'Products', icon: Package, permission: 'products' },
      { to: '/masters/categories', label: 'Categories', icon: Tags, permission: 'products' },
      { to: '/masters/brands', label: 'Brands', icon: Tags, permission: 'products' },
      { to: '/masters/units', label: 'Units', icon: Tags, permission: 'products' },
      { to: '/masters/gst', label: 'GST', icon: Tags, permission: 'products' },
      { to: '/customers', label: 'Customers', icon: Users, permission: 'customers' },
      { to: '/suppliers', label: 'Suppliers', icon: Truck, permission: 'purchases' }
    ]
  },
  {
    key: 'inventory',
    label: 'Inventory',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory' },
      { to: '/purchases', label: 'Purchases', icon: ClipboardList, permission: 'purchases' },
      { to: '/purchase-returns', label: 'Purchase Returns', icon: Undo2, permission: 'purchase_returns' }
    ]
  },
  {
    key: 'accounts',
    label: 'Accounts',
    items: [
      { to: '/accounting/customer-ledger', label: 'Customer Ledger', icon: BookOpen, permission: 'accounting' },
      { to: '/accounting/supplier-ledger', label: 'Supplier Ledger', icon: BookOpen, permission: 'accounting' },
      { to: '/accounting/customer-outstanding', label: 'Customer Outstanding', icon: WalletCards, permission: 'accounting' },
      { to: '/accounting/supplier-outstanding', label: 'Supplier Outstanding', icon: WalletCards, permission: 'accounting' },
      { to: '/accounting/receipts', label: 'Receipts', icon: WalletCards, permission: 'accounting' },
      { to: '/accounting/supplier-payments', label: 'Supplier Payments', icon: WalletCards, permission: 'accounting' },
      { to: '/expenses', label: 'Expenses', icon: WalletCards, permission: 'expenses' },
      { to: '/accounting/day-book', label: 'Day Book', icon: BookOpen, permission: 'accounting' },
      { to: '/accounting/cash-book', label: 'Cash Book', icon: BookOpen, permission: 'accounting' },
      { to: '/accounting/sales-ledger', label: 'Sales Ledger', icon: BookOpen, permission: 'accounting' },
      { to: '/accounting/purchase-ledger', label: 'Purchase Ledger', icon: BookOpen, permission: 'accounting' },
      { to: '/accounting/item-ledger', label: 'Item Ledger', icon: BookOpen, permission: 'accounting' },
      { to: '/accounting/stock-ledger', label: 'Stock Ledger', icon: BookOpen, permission: 'accounting' },
      { to: '/accounting/collections', label: 'Collections', icon: WalletCards, permission: 'accounting' }
    ]
  },
  {
    key: 'reports',
    label: 'Reports',
    items: [{ to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports' }]
  },
  {
    key: 'administration',
    label: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: Users, permission: 'users' },
      { to: '/settings', label: 'Settings', icon: Settings, permission: 'settings' }
    ]
  }
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { darkMode, collapsed, toggleTheme, toggleSidebar } = useUiStore();
  const [expandedGroup, setExpandedGroup] = useState(() => sessionStorage.getItem('storedesk-sidebar-group') || 'sales');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const permissions = useMemo(() => user?.role === 'admin' ? navItems.map((item) => item.permission) : user?.permissions || [], [user?.permissions, user?.role]);
  const visibleItems = navItems.filter((item) => !item.permission || permissions.includes(item.permission));
  const visibleGroups = useMemo(() => navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || permissions.includes(item.permission))
  })).filter((group) => group.items.length > 0), [permissions]);

  useEffect(() => {
    const activeGroup = visibleGroups.find((group) => group.items.some((item) => item.to === location.pathname || (item.to !== '/' && location.pathname.startsWith(item.to))));
    if (activeGroup) setExpandedGroup(activeGroup.key);
  }, [location.pathname, visibleGroups]);

  useEffect(() => {
    sessionStorage.setItem('storedesk-sidebar-group', expandedGroup);
  }, [expandedGroup]);

  return (
    <div className="min-h-screen bg-mist text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className={clsx('fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white transition-all dark:border-slate-800 dark:bg-slate-900 lg:block', collapsed ? 'w-20' : 'w-[var(--sidebar-width)]')}>
        <div className="flex h-[var(--header-height)] items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
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
            h-[calc(100vh-var(--header-height))]
            overflow-y-auto
            space-y-1
            p-3
            scrollbar-thin
            scrollbar-thumb-slate-400
            scrollbar-track-transparent
          "
        >
          {visibleGroups.map((group) => {
            const isOpen = collapsed || expandedGroup === group.key;
            const hasActive = group.items.some((item) => item.to === location.pathname || (item.to !== '/' && location.pathname.startsWith(item.to)));
            return (
              <div key={group.key} className="space-y-1">
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => setExpandedGroup((current) => current === group.key ? '' : group.key)}
                    className={clsx(
                      'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition',
                      hasActive ? 'bg-emerald-50 text-leaf dark:bg-emerald-950/40' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    )}
                  >
                    <span>{group.label}</span>
                    <ChevronDown size={15} className={clsx('transition-transform duration-200', isOpen ? 'rotate-180' : 'rotate-0')} />
                  </button>
                )}
                <div className={clsx('grid overflow-hidden transition-all duration-200 ease-out', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <div className="min-h-0 space-y-1">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
                            collapsed ? 'justify-center' : 'pl-5',
                            isActive
                              ? 'bg-emerald-50 text-leaf shadow-sm dark:bg-emerald-950/40'
                              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                          )
                        }
                        title={collapsed ? item.label : undefined}
                      >
                        <item.icon size={18} className="shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className={clsx('transition-all', collapsed ? 'lg:pl-20' : 'lg:pl-[var(--sidebar-width)]')}>
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

        <main className="p-[var(--page-padding)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
