import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  ClipboardList,
  FileBarChart,
  Landmark,
  PackageSearch,
  Receipt,
  Scale,
  ShoppingCart,
  Tags,
  Users,
  Wallet
} from 'lucide-react';

export const reportGroups = [
  {
    id: 'transactions',
    title: 'Transaction Reports',
    icon: Receipt,
    reports: [
      { id: 'sales', title: 'Sales Invoices', path: '/reports/sales', description: 'Invoice register with collections, balances, GST, discounts and payment status.', endpoint: '/reports/sales', exportBase: '/reports/sales/export', dataKey: 'sales', summaryType: 'sales', preset: 'month' },
      { id: 'purchases', title: 'Purchase Invoices', path: '/reports/purchases', description: 'Supplier purchase register with paid, balance, GST and discount totals.', endpoint: '/accounting/purchase-ledger', dataKey: 'rows', summaryType: 'purchases', preset: 'month' },
      { id: 'day-book', title: 'Day Book', path: '/reports/day-book', description: 'Chronological transaction book from posted accounting entries.', endpoint: '/accounting/day-book', exportBase: '/accounting/exports/day-book', dataKey: 'entries', summaryType: 'dayBook', preset: 'today' },
      { id: 'all-transactions', title: 'All Transactions', path: '/reports/all-transactions', description: 'Combined transaction register from available sales, purchases, returns, payments and expenses APIs.', endpoint: 'combined:transactions', dataKey: 'rows', summaryType: 'allTransactions', preset: 'month' },
      { id: 'cash-book', title: 'Cash Book', path: '/reports/cash-book', description: 'Cash, bank and wallet movement with running balance.', endpoint: '/accounting/cash-book', dataKey: 'rows', summaryType: 'cashBook', preset: 'month' },
      { id: 'bank-cash-flow', title: 'Bank / Cash Flow', path: '/reports/bank-cash-flow', description: 'Cash flow by payment method.', endpoint: '/accounting/cash-book', dataKey: 'rows', summaryType: 'cashBook', preset: 'month' }
    ]
  },
  {
    id: 'accounting',
    title: 'Accounting',
    icon: Scale,
    reports: [
      { id: 'customer-ledger', title: 'Customer Ledger', path: '/reports/customer-ledger', description: 'Customer running balance by voucher.', endpoint: 'ledger:customer', dataKey: 'entries', summaryType: 'customerLedger', needsParty: 'customer', preset: 'month' },
      { id: 'supplier-ledger', title: 'Supplier Ledger', path: '/reports/supplier-ledger', description: 'Supplier running balance by voucher.', endpoint: 'ledger:supplier', dataKey: 'entries', summaryType: 'supplierLedger', needsParty: 'supplier', preset: 'month' },
      { id: 'customer-outstanding', title: 'Customer Outstanding', path: '/reports/customer-outstanding', description: 'Customers with receivable balances and last activity.', endpoint: '/accounting/customers/outstanding', dataKey: 'customers', summaryType: 'customerOutstanding' },
      { id: 'supplier-outstanding', title: 'Supplier Outstanding', path: '/reports/supplier-outstanding', description: 'Suppliers with payable balances and last activity.', endpoint: '/accounting/suppliers/outstanding', dataKey: 'suppliers', summaryType: 'supplierOutstanding' },
      { id: 'trial-balance', title: 'Trial Balance', path: '/reports/trial-balance', description: 'Account debit and credit balance validation.', requiredEndpoint: 'GET /api/reports/trial-balance' },
      { id: 'profit-loss', title: 'Profit & Loss', path: '/reports/profit-loss', description: 'Revenue, cost and profit from backend accounting/reporting data.', endpoint: '/reports/profit-loss', dataKey: null, summaryType: 'profitLoss', preset: 'month' },
      { id: 'balance-sheet', title: 'Balance Sheet', path: '/reports/balance-sheet', description: 'Assets, liabilities and equity statement.', requiredEndpoint: 'GET /api/reports/balance-sheet' }
    ]
  },
  {
    id: 'sales',
    title: 'Sales Reports',
    icon: BarChart3,
    reports: [
      { id: 'sales-summary', title: 'Sales Summary', path: '/reports/sales-summary', description: 'Item-level sales performance from existing sales report data.', endpoint: '/reports/sales', exportBase: '/reports/sales/export', dataKey: 'sales', summaryType: 'sales', preset: 'month' },
      { id: 'bill-wise-profit', title: 'Bill-wise Profit', path: '/reports/bill-wise-profit', description: 'Invoice profitability from backend sales profit fields.', endpoint: '/reports/sales', exportBase: '/reports/sales/export', dataKey: 'sales', summaryType: 'salesProfit', preset: 'month' },
      { id: 'item-wise-sales', title: 'Item-wise Sales', path: '/reports/item-wise-sales', description: 'Product sales quantity and revenue.', endpoint: '/reports/products', dataKey: 'products', summaryType: 'items', preset: 'month' },
      { id: 'item-wise-profit-loss', title: 'Item-wise Profit & Loss', path: '/reports/item-wise-profit-loss', description: 'Product-wise profit and loss where source data includes cost.', endpoint: '/reports/profit', exportBase: '/reports/profit/export', dataKey: 'rows', summaryType: 'advanced', preset: 'month' },
      { id: 'customer-wise-sales', title: 'Customer-wise Sales', path: '/reports/customer-wise-sales', description: 'Customer purchase totals from sales data.', endpoint: '/reports/customer-purchases', exportBase: '/reports/customer-purchases/export', dataKey: 'rows', summaryType: 'advanced', preset: 'month' },
      { id: 'sales-return', title: 'Sales Return', path: '/reports/sales-return', description: 'Completed sales return register.', endpoint: '/reports/sales-returns', exportBase: '/reports/sales-returns/export', dataKey: 'returns', summaryType: 'returns', preset: 'month' },
      { id: 'discount-report', title: 'Discount Report', path: '/reports/discount-report', description: 'Discounts from sales invoices.', endpoint: '/reports/sales', dataKey: 'sales', summaryType: 'discounts', preset: 'month' }
    ]
  },
  {
    id: 'purchases',
    title: 'Purchase Reports',
    icon: ShoppingCart,
    reports: [
      { id: 'purchase-summary', title: 'Purchase Summary', path: '/reports/purchase-summary', description: 'Supplier purchase totals.', endpoint: '/reports/purchases', exportBase: '/reports/purchases/export', dataKey: 'rows', summaryType: 'advanced', preset: 'month' },
      { id: 'item-wise-purchase', title: 'Item-wise Purchase', path: '/reports/item-wise-purchase', description: 'Product-wise purchased quantity and value.', endpoint: '/reports/purchases', exportBase: '/reports/purchases/export', dataKey: 'rows', summaryType: 'advanced', preset: 'month' },
      { id: 'supplier-wise-purchase', title: 'Supplier-wise Purchase', path: '/reports/supplier-wise-purchase', description: 'Supplier purchase frequency and totals.', endpoint: '/reports/supplier-purchases', exportBase: '/reports/supplier-purchases/export', dataKey: 'rows', summaryType: 'advanced', preset: 'month' },
      { id: 'purchase-return', title: 'Purchase Return', path: '/reports/purchase-return', description: 'Completed purchase return register.', endpoint: '/reports/purchase-returns', exportBase: '/reports/purchase-returns/export', dataKey: 'returns', summaryType: 'returns', preset: 'month' }
    ]
  },
  {
    id: 'inventory',
    title: 'Inventory Reports',
    icon: Boxes,
    reports: [
      { id: 'stock-summary', title: 'Stock Summary', path: '/reports/stock-summary', description: 'Current product stock and valuation.', endpoint: '/reports/stock-valuation', exportBase: '/reports/stock-valuation/export', dataKey: 'products', summaryType: 'stock' },
      { id: 'stock-detail', title: 'Stock Detail', path: '/reports/stock-detail', description: 'Stock movement ledger.', endpoint: '/accounting/stock-ledger', dataKey: 'entries', summaryType: 'stockMovement', preset: 'month' },
      { id: 'item-detail', title: 'Item Detail', path: '/reports/item-detail', description: 'Complete movement history for a selected product.', endpoint: 'item-ledger', dataKey: 'entries', summaryType: 'stockMovement', needsParty: 'product', preset: 'month' },
      { id: 'low-stock', title: 'Low Stock', path: '/reports/low-stock', description: 'Products at or below configured minimum stock.', endpoint: '/reports/low-stock', exportBase: '/reports/low-stock/export', dataKey: 'rows', summaryType: 'lowStock' },
      { id: 'category-wise-stock', title: 'Category-wise Stock', path: '/reports/category-wise-stock', description: 'Category stock valuation requires category aggregation from backend.', requiredEndpoint: 'GET /api/reports/category-wise-stock' },
      { id: 'stock-movement', title: 'Stock Movement', path: '/reports/stock-movement', description: 'Inward and outward product movement.', endpoint: '/accounting/stock-ledger', dataKey: 'entries', summaryType: 'stockMovement', preset: 'month' }
    ]
  },
  {
    id: 'gst',
    title: 'GST / Tax Reports',
    icon: FileBarChart,
    reports: [
      { id: 'gstr1', title: 'GSTR-1', path: '/reports/gst/gstr1', description: 'Outward supply GST details from sales data.', endpoint: '/reports/gst', exportBase: '/reports/gst/export', dataKey: 'rows', summaryType: 'gst', preset: 'month', fixedType: 'Sales' },
      { id: 'gstr2', title: 'GSTR-2', path: '/reports/gst/gstr2', description: 'Inward supply GST details from purchase data.', endpoint: '/reports/gst', exportBase: '/reports/gst/export', dataKey: 'rows', summaryType: 'gst', preset: 'month', fixedType: 'Purchase' },
      { id: 'gstr3b', title: 'GSTR-3B', path: '/reports/gst/gstr3b', description: 'GST return summary from available GST report data.', endpoint: '/reports/gst', exportBase: '/reports/gst/export', dataKey: 'rows', summaryType: 'gst', preset: 'month' },
      { id: 'gstr9', title: 'GSTR-9', path: '/reports/gst/gstr9', description: 'Annual GST summary from available GST report data.', endpoint: '/reports/gst', exportBase: '/reports/gst/export', dataKey: 'rows', summaryType: 'gst', preset: 'year' },
      { id: 'gst-summary', title: 'GST Summary', path: '/reports/gst/summary', description: 'Taxable value and GST by transaction type/rate.', endpoint: '/reports/gst', exportBase: '/reports/gst/export', dataKey: 'rows', summaryType: 'gst', preset: 'month' },
      { id: 'gst-rate-report', title: 'GST Rate Report', path: '/reports/gst/rate-report', description: 'GST grouped by rate.', endpoint: '/reports/gst', exportBase: '/reports/gst/export', dataKey: 'rows', summaryType: 'gst', preset: 'month' },
      { id: 'hsn-summary', title: 'HSN Summary', path: '/reports/gst/hsn-summary', description: 'HSN-wise reporting needs HSN fields from products/invoices.', requiredEndpoint: 'GET /api/reports/gst/hsn-summary' },
      { id: 'sac-report', title: 'SAC Report', path: '/reports/gst/sac-report', description: 'SAC service reporting needs service/SAC source data.', requiredEndpoint: 'GET /api/reports/gst/sac-report' },
      { id: 'tds-payable', title: 'TDS Payable', path: '/reports/gst/tds-payable', description: 'TDS payable requires TDS ledger/service data.', requiredEndpoint: 'GET /api/reports/tds-payable' },
      { id: 'tds-receivable', title: 'TDS Receivable', path: '/reports/gst/tds-receivable', description: 'TDS receivable requires TDS ledger/service data.', requiredEndpoint: 'GET /api/reports/tds-receivable' },
      { id: 'tcs-receivable', title: 'TCS Receivable', path: '/reports/gst/tcs-receivable', description: 'TCS receivable requires TCS ledger/service data.', requiredEndpoint: 'GET /api/reports/tcs-receivable' }
    ]
  },
  {
    id: 'expenses',
    title: 'Expense Reports',
    icon: Wallet,
    reports: [
      { id: 'expenses', title: 'Expense', path: '/reports/expenses', description: 'Posted expense register.', endpoint: '/expenses', dataKey: 'expenses', summaryType: 'expenses', preset: 'month' },
      { id: 'expense-categories', title: 'Expense Category Report', path: '/reports/expenses/categories', description: 'Category expense totals require backend grouping.', requiredEndpoint: 'GET /api/reports/expenses/categories' },
      { id: 'expense-items', title: 'Expense Item Report', path: '/reports/expenses/items', description: 'Itemized expense totals require backend grouping.', requiredEndpoint: 'GET /api/reports/expenses/items' }
    ]
  },
  {
    id: 'parties',
    title: 'Party Reports',
    icon: Users,
    reports: [
      { id: 'party-statement', title: 'Party Statement', path: '/reports/party-statement', description: 'Select a customer or supplier to view a ledger-style statement.', endpoint: 'party-statement', dataKey: 'entries', summaryType: 'customerLedger', needsParty: 'party', preset: 'month' },
      { id: 'party-profit-loss', title: 'Party-wise Profit & Loss', path: '/reports/party-profit-loss', description: 'Party profit requires backend party-cost attribution.', requiredEndpoint: 'GET /api/reports/party-profit-loss' },
      { id: 'all-parties', title: 'All Parties', path: '/reports/all-parties', description: 'Customers and suppliers with balances.', endpoint: 'combined:parties', dataKey: 'rows', summaryType: 'parties' },
      { id: 'sale-purchase-by-party', title: 'Sale/Purchase by Party', path: '/reports/sale-purchase-by-party', description: 'Party sale/purchase totals require backend grouping.', requiredEndpoint: 'GET /api/reports/sale-purchase-by-party' },
      { id: 'sale-purchase-by-party-group', title: 'Sale/Purchase by Party Group', path: '/reports/sale-purchase-by-party-group', description: 'Party group reporting requires party group data.', requiredEndpoint: 'GET /api/reports/sale-purchase-by-party-group' }
    ]
  },
  {
    id: 'business',
    title: 'Business Reports',
    icon: Building2,
    reports: [
      { id: 'bank-statement', title: 'Bank Statement', path: '/reports/bank-statement', description: 'Bank method movement from cash book.', endpoint: '/accounting/cash-book', dataKey: 'rows', summaryType: 'cashBook', preset: 'month', fixedMethod: 'Bank' },
      { id: 'cash-flow', title: 'Cash Flow', path: '/reports/cash-flow', description: 'Cash flow by in/out transaction.', endpoint: '/accounting/cash-book', dataKey: 'rows', summaryType: 'cashBook', preset: 'month' },
      { id: 'business-summary', title: 'Business Summary', path: '/reports/business-summary', description: 'Business intelligence summary with existing backend metrics.', endpoint: '/reports/business-intelligence', exportBase: '/reports/business-intelligence/export', dataKey: null, summaryType: 'businessSummary', preset: 'month' }
    ]
  }
];

export const flatReports = reportGroups.flatMap((group) =>
  group.reports.map((report) => ({ ...report, groupId: group.id, groupTitle: group.title, groupIcon: group.icon }))
);

export const reportByPath = new Map(flatReports.map((report) => [report.path.replace('/reports/', ''), report]));

export const centerStats = [
  { label: 'Transaction Reports', value: reportGroups[0].reports.length, icon: ClipboardList },
  { label: 'Accounting Reports', value: reportGroups[1].reports.length, icon: BookOpen },
  { label: 'Inventory Reports', value: reportGroups[4].reports.length, icon: PackageSearch },
  { label: 'GST / Tax Reports', value: reportGroups[5].reports.length, icon: Tags },
  { label: 'Business Reports', value: reportGroups[8].reports.length, icon: Landmark }
];
