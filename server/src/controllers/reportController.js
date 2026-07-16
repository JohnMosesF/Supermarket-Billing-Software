import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Customer } from '../models/Customer.js';
import { CustomerReceipt } from '../models/CustomerReceipt.js';
import { Product } from '../models/Product.js';
import { Purchase } from '../models/Purchase.js';
import { PurchaseOrder } from '../models/PurchaseOrder.js';
import { Sale } from '../models/Sale.js';
import { SalesReturn } from '../models/SalesReturn.js';
import { Supplier } from '../models/Supplier.js';
import { SupplierPayment } from '../models/SupplierPayment.js';
import { AuditLog } from '../models/AuditLog.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { PurchaseReturn } from '../models/PurchaseReturn.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getCache, setCache } from '../utils/cache.js';

function dateFilter(req) {
  const filter = {};
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  return filter;
}

function rangeFor(query, field = 'createdAt') {
  const filter = {};
  if (query.from || query.to) {
    filter[field] = {};
    if (query.from) filter[field].$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      if (String(query.to).length <= 10) to.setHours(23, 59, 59, 999);
      filter[field].$lte = to;
    }
  }
  return filter;
}

function matchesText(value, expected) {
  if (!expected) return true;
  return String(value || '').toLowerCase().includes(String(expected).toLowerCase());
}

function percent(value, total) {
  return total > 0 ? Number(((Number(value || 0) / total) * 100).toFixed(2)) : 0;
}

function normalizeMethod(method) {
  return String(method || '').toLowerCase().replace(/\s+/g, '_');
}

function csvEscape(value) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function dashboardRange(query) {
  return {
    sales: rangeFor(query, 'createdAt'),
    purchases: rangeFor(query, 'purchaseDate'),
    returns: rangeFor(query, 'returnDate'),
    supplierPayments: rangeFor(query, 'paymentDate'),
    created: rangeFor(query, 'createdAt')
  };
}

async function buildBusinessDashboard(query = {}) {
  const range = dashboardRange(query);
  const cacheKey = `bi-dashboard:${JSON.stringify(query)}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const [
    salesSummary,
    paymentSummary,
    salesTrend,
    monthlySalesTrend,
    productPerformance,
    purchaseSummary,
    purchaseMonthlyTrend,
    inventorySummary,
    deadStockProducts,
    customerSummary,
    topCustomers,
    customerFrequency,
    supplierSummary,
    topSuppliers,
    supplierFrequency,
    salesReturnSummary,
    purchaseReturnSummary,
    taxSummary,
    supplierPaymentSummary,
    customerReceiptSummary,
    purchaseOrderCount,
    auditLogs,
    inventoryActivities
  ] = await Promise.all([
    Sale.aggregate([
      { $match: range.sales },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          grossSales: { $sum: '$subtotal' },
          gstCollected: { $sum: '$taxTotal' },
          discountsGiven: { $sum: '$discount' },
          totalProfit: { $sum: { $cond: [{ $gt: ['$profit', 0] }, '$profit', 0] } },
          totalLoss: { $sum: { $cond: [{ $lt: ['$profit', 0] }, { $abs: '$profit' }, 0] } },
          highestBill: { $max: '$total' },
          lowestBill: { $min: '$total' },
          numberOfBills: { $sum: 1 },
          creditBills: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'credit'] }, 1, 0] } },
          cashBills: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, 1, 0] } },
          paidAmount: { $sum: '$paidAmount' },
          balanceAmount: { $sum: '$balanceAmount' }
        }
      }
    ]),
    Sale.aggregate([
      { $match: range.sales },
      { $group: { _id: '$paymentMethod', amount: { $sum: '$total' }, bills: { $sum: 1 } } },
      { $sort: { amount: -1 } }
    ]),
    Sale.aggregate([
      { $match: range.sales },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sales: { $sum: '$total' },
          profit: { $sum: '$profit' },
          bills: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Sale.aggregate([
      { $match: range.sales },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          sales: { $sum: '$total' },
          profit: { $sum: '$profit' }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Sale.aggregate([
      { $match: range.sales },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          unit: { $first: '$items.unit' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
          profit: {
            $sum: {
              $multiply: [
                { $subtract: ['$items.price', '$items.purchasePrice'] },
                '$items.quantity'
              ]
            }
          },
          marginBase: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          cost: { $sum: { $multiply: ['$items.purchasePrice', '$items.quantity'] } }
        }
      },
      { $addFields: { margin: { $cond: [{ $gt: ['$marginBase', 0] }, { $multiply: [{ $divide: ['$profit', '$marginBase'] }, 100] }, 0] } } },
      { $sort: { quantity: -1 } },
      { $limit: 100 }
    ]),
    Purchase.aggregate([
      { $match: { ...range.purchases, active: true } },
      {
        $group: {
          _id: null,
          totalPurchases: { $sum: '$total' },
          purchaseInvoices: { $sum: 1 },
          amountPaid: { $sum: '$paidAmount' },
          pendingPayments: {
            $sum: {
              $cond: [
                { $gt: [{ $subtract: ['$total', { $add: [{ $ifNull: ['$paidAmount', 0] }, { $ifNull: ['$returnCreditAmount', 0] }] }] }, 0] },
                { $subtract: ['$total', { $add: [{ $ifNull: ['$paidAmount', 0] }, { $ifNull: ['$returnCreditAmount', 0] }] }] },
                0
              ]
            }
          },
          purchaseCost: { $sum: '$total' },
          purchaseGst: { $sum: { $sum: { $map: { input: '$items', as: 'item', in: { $subtract: [{ $ifNull: ['$$item.lineTotal', 0] }, { $multiply: [{ $ifNull: ['$$item.quantity', 0] }, { $ifNull: ['$$item.costPrice', 0] }] }] } } } } }
        }
      }
    ]),
    Purchase.aggregate([
      { $match: { ...range.purchases, active: true } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$purchaseDate' } }, purchases: { $sum: '$total' } } },
      { $sort: { _id: 1 } }
    ]),
    Product.aggregate([
      { $match: { active: true } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          inventoryPurchaseValue: { $sum: { $multiply: ['$purchasePrice', '$stock'] } },
          inventorySellingValue: { $sum: { $multiply: ['$sellingPrice', '$stock'] } },
          outOfStock: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } },
          lowStock: { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] }, 1, 0] } },
          expiringSoon: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$expiryDate', new Date()] }, { $lte: ['$expiryDate', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)] }] },
                1,
                0
              ]
            }
          },
          expiredProducts: { $sum: { $cond: [{ $lt: ['$expiryDate', new Date()] }, 1, 0] } }
        }
      }
    ]),
    Sale.aggregate([
      { $match: range.sales },
      { $unwind: '$items' },
      { $group: { _id: '$items.product' } }
    ]),
    Customer.aggregate([
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          newCustomers: { $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', range.created.createdAt?.$gte || new Date(0)] }, { $lte: ['$createdAt', range.created.createdAt?.$lte || new Date()] }] }, 1, 0] } },
          customerOutstanding: { $sum: '$outstandingBalance' },
          totalReceipts: { $sum: '$totalPaid' }
        }
      }
    ]),
    Sale.aggregate([
      { $match: range.sales },
      { $group: { _id: { $ifNull: ['$customer', '$customerMobile'] }, customer: { $first: { $ifNull: ['$customerName', '$customerMobile'] } }, total: { $sum: '$total' }, bills: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 }
    ]),
    Sale.aggregate([
      { $match: range.sales },
      { $group: { _id: { $ifNull: ['$customer', '$customerMobile'] }, customer: { $first: { $ifNull: ['$customerName', '$customerMobile'] } }, purchases: { $sum: 1 }, total: { $sum: '$total' } } },
      { $sort: { purchases: -1, total: -1 } },
      { $limit: 10 }
    ]),
    Supplier.aggregate([
      {
        $group: {
          _id: null,
          totalSuppliers: { $sum: 1 },
          supplierOutstanding: { $sum: '$outstandingBalance' },
          supplierPayments: { $sum: '$totalPayments' }
        }
      }
    ]),
    Purchase.aggregate([
      { $match: { ...range.purchases, active: true } },
      { $group: { _id: '$supplier', total: { $sum: '$total' }, invoices: { $sum: 1 } } },
      { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
      { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
      { $project: { supplier: { $ifNull: ['$supplier.name', 'Unknown Supplier'] }, total: 1, invoices: 1 } },
      { $sort: { total: -1 } },
      { $limit: 10 }
    ]),
    Purchase.aggregate([
      { $match: { ...range.purchases, active: true } },
      { $group: { _id: '$supplier', purchases: { $sum: 1 }, total: { $sum: '$total' } } },
      { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
      { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
      { $project: { supplier: { $ifNull: ['$supplier.name', 'Unknown Supplier'] }, purchases: 1, total: 1 } },
      { $sort: { purchases: -1, total: -1 } },
      { $limit: 10 }
    ]),
    SalesReturn.aggregate([
      { $match: { ...range.returns, status: 'Completed' } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$refundAmount' }, gst: { $sum: '$gstAmount' } } }
    ]),
    PurchaseReturn.aggregate([
      { $match: { ...range.returns, status: 'Completed' } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$returnAmount' }, gst: { $sum: '$gstAmount' } } }
    ]),
    Sale.aggregate([
      { $match: range.sales },
      { $unwind: '$items' },
      {
        $group: {
          _id: null,
          taxableAmount: { $sum: { $subtract: [{ $ifNull: ['$items.lineTotal', 0] }, { $multiply: [{ $ifNull: ['$items.lineTotal', 0] }, { $divide: [{ $ifNull: ['$items.taxRate', 0] }, { $add: [100, { $ifNull: ['$items.taxRate', 0] }] }] }] }] } },
          taxCollected: { $sum: { $multiply: [{ $ifNull: ['$items.lineTotal', 0] }, { $divide: [{ $ifNull: ['$items.taxRate', 0] }, { $add: [100, { $ifNull: ['$items.taxRate', 0] }] }] }] } }
        }
      }
    ]),
    SupplierPayment.aggregate([
      { $match: { ...range.supplierPayments, status: 'Posted' } },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    CustomerReceipt.aggregate([
      { $match: { ...rangeFor(query, 'receiptDate'), status: 'Posted' } },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    PurchaseOrder.countDocuments({ ...range.created, active: true }),
    AuditLog.find(range.created).populate('user', 'name email').sort({ createdAt: -1 }).limit(75).lean(),
    InventoryLog.find(range.created).populate('user', 'name email').sort({ createdAt: -1 }).limit(25).lean()
  ]);

  const sales = salesSummary[0] || {};
  const purchases = purchaseSummary[0] || {};
  const inventory = inventorySummary[0] || {};
  const customers = customerSummary[0] || {};
  const suppliers = supplierSummary[0] || {};
  const salesReturns = salesReturnSummary[0] || {};
  const purchaseReturns = purchaseReturnSummary[0] || {};
  const tax = taxSummary[0] || {};
  const supplierPayments = supplierPaymentSummary[0] || {};
  const customerReceipts = customerReceiptSummary[0] || {};
  const totalPaymentAmount = paymentSummary.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const soldProductIds = new Set(deadStockProducts.map((item) => String(item._id)));
  const allStockedProducts = await Product.find({ active: true, stock: { $gt: 0 } }).select('name stock purchasePrice sellingPrice').lean();
  const deadStock = allStockedProducts.filter((product) => !soldProductIds.has(String(product._id)));
  const returningCustomers = Math.max((topCustomers || []).filter((item) => item.bills > 1).length, 0);
  const productRows = productPerformance.map((item) => ({
    name: item.name || 'Unknown Product',
    unit: item.unit || 'pcs',
    quantity: Number(item.quantity || 0),
    revenue: Number(item.revenue || 0),
    profit: Number(item.profit || 0),
    margin: Number(item.margin || 0)
  }));
  const monthlyMap = new Map();
  monthlySalesTrend.forEach((item) => monthlyMap.set(item._id, { month: item._id, sales: item.sales || 0, profit: item.profit || 0, purchases: 0 }));
  purchaseMonthlyTrend.forEach((item) => {
    const current = monthlyMap.get(item._id) || { month: item._id, sales: 0, profit: 0, purchases: 0 };
    current.purchases = item.purchases || 0;
    monthlyMap.set(item._id, current);
  });

  const result = {
    generatedAt: new Date(),
    range: query,
    sales: {
      totalSales: sales.totalSales || 0,
      netSales: (sales.totalSales || 0) - (salesReturns.amount || 0),
      grossSales: sales.grossSales || 0,
      gstCollected: sales.gstCollected || 0,
      discountsGiven: sales.discountsGiven || 0,
      roundOffTotal: 0,
      totalProfit: sales.totalProfit || 0,
      totalLoss: sales.totalLoss || 0,
      averageBillValue: sales.numberOfBills ? (sales.totalSales || 0) / sales.numberOfBills : 0,
      highestBill: sales.highestBill || 0,
      lowestBill: sales.lowestBill || 0,
      numberOfBills: sales.numberOfBills || 0,
      creditBills: sales.creditBills || 0,
      cashBills: sales.cashBills || 0
    },
    purchases: {
      totalPurchases: purchases.totalPurchases || 0,
      purchaseGst: purchases.purchaseGst || 0,
      outstandingSupplierAmount: suppliers.supplierOutstanding || 0,
      amountPaidToSuppliers: supplierPayments.amount || purchases.amountPaid || 0,
      pendingSupplierPayments: purchases.pendingPayments || 0,
      purchaseReturns: purchaseReturns.amount || 0,
      purchaseCost: purchases.purchaseCost || 0
    },
    inventory: {
      inventoryPurchaseValue: inventory.inventoryPurchaseValue || 0,
      inventorySellingValue: inventory.inventorySellingValue || 0,
      totalProducts: inventory.totalProducts || 0,
      outOfStock: inventory.outOfStock || 0,
      lowStock: inventory.lowStock || 0,
      expiringSoon: inventory.expiringSoon || 0,
      expiredProducts: inventory.expiredProducts || 0,
      deadStock: deadStock.length,
      fastMovingProducts: productRows.slice(0, 10),
      slowMovingProducts: [...productRows].sort((a, b) => a.quantity - b.quantity).slice(0, 10)
    },
    customers: {
      totalCustomers: customers.totalCustomers || 0,
      newCustomers: customers.newCustomers || 0,
      returningCustomers,
      customerOutstanding: customers.customerOutstanding || 0,
      totalReceipts: customerReceipts.amount || 0,
      topCustomers: topCustomers.map((item) => ({ customer: item.customer || 'Walk-in', total: item.total || 0, bills: item.bills || 0 })),
      customerPurchaseFrequency: customerFrequency.map((item) => ({ customer: item.customer || 'Walk-in', purchases: item.purchases || 0, total: item.total || 0 }))
    },
    suppliers: {
      totalSuppliers: suppliers.totalSuppliers || 0,
      supplierOutstanding: suppliers.supplierOutstanding || 0,
      supplierPayments: supplierPayments.amount || suppliers.supplierPayments || 0,
      topSuppliers,
      purchaseFrequency: supplierFrequency
    },
    payments: ['cash', 'upi', 'card', 'credit', 'bank_transfer', 'wallet'].map((method) => {
      const found = paymentSummary.find((item) => normalizeMethod(item._id) === method);
      return { method, amount: found?.amount || 0, percentage: percent(found?.amount || 0, totalPaymentAmount), bills: found?.bills || 0 };
    }),
    products: {
      topSelling: productRows.slice(0, 10),
      leastSelling: [...productRows].sort((a, b) => a.quantity - b.quantity).slice(0, 10),
      mostProfitable: [...productRows].sort((a, b) => b.profit - a.profit).slice(0, 10),
      leastProfitable: [...productRows].sort((a, b) => a.profit - b.profit).slice(0, 10),
      highestMargin: [...productRows].sort((a, b) => b.margin - a.margin).slice(0, 10),
      lowestMargin: [...productRows].sort((a, b) => a.margin - b.margin).slice(0, 10)
    },
    returns: {
      salesReturns: salesReturns.amount || 0,
      purchaseReturns: purchaseReturns.amount || 0,
      returnAmount: (salesReturns.amount || 0) + (purchaseReturns.amount || 0),
      returnPercentage: percent(salesReturns.amount || 0, sales.totalSales || 0),
      salesReturnCount: salesReturns.count || 0,
      purchaseReturnCount: purchaseReturns.count || 0
    },
    tax: {
      cgst: (tax.taxCollected || 0) / 2,
      sgst: (tax.taxCollected || 0) / 2,
      igst: 0,
      taxableAmount: tax.taxableAmount || 0,
      taxCollected: tax.taxCollected || 0
    },
    charts: {
      dailySalesTrend: salesTrend.map((item) => ({ date: item._id, sales: item.sales || 0, profit: item.profit || 0, bills: item.bills || 0 })),
      monthlySalesTrend: monthlySalesTrend.map((item) => ({ month: item._id, sales: item.sales || 0 })),
      paymentMethod: ['cash', 'upi', 'card', 'credit', 'bank_transfer', 'wallet'].map((method) => {
        const found = paymentSummary.find((item) => normalizeMethod(item._id) === method);
        return { name: method.replace('_', ' '), value: found?.amount || 0 };
      }),
      topProducts: productRows.slice(0, 10).map((item) => ({ name: item.name, quantity: item.quantity, revenue: item.revenue })),
      monthlyProfit: monthlySalesTrend.map((item) => ({ month: item._id, profit: item.profit || 0 })),
      purchaseVsSales: [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month))
    },
    audit: [
      ...auditLogs.map((entry) => ({
        dateTime: entry.createdAt,
        user: entry.userName || entry.user?.name || entry.user?.email || 'System',
        module: entry.module,
        action: entry.action,
        referenceNumber: entry.newValue?.invoiceNumber || entry.newValue?.returnNo || entry.newValue?.voucherNo || entry.newValue?.poNumber || entry.previousValue?.invoiceNumber || '-'
      })),
      ...inventoryActivities.map((entry) => ({
        dateTime: entry.createdAt,
        user: entry.user?.name || entry.user?.email || 'System',
        module: 'Inventory',
        action: entry.type || entry.reason || 'Stock Adjustment',
        referenceNumber: entry.purchaseInvoiceNo || String(entry.referenceId || '').slice(-8) || '-'
      }))
    ].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)).slice(0, 75),
    activityCounts: {
      billsCreated: sales.numberOfBills || 0,
      billsEdited: auditLogs.filter((entry) => /edit|update/i.test(entry.action) && /bill|sale/i.test(entry.module)).length,
      billsCancelled: auditLogs.filter((entry) => /cancel|delete/i.test(entry.action) && /bill|sale/i.test(entry.module)).length,
      purchases: purchases.purchaseInvoices || 0,
      purchaseOrders: purchaseOrderCount,
      receipts: customerReceipts.count || 0,
      supplierPayments: supplierPayments.count || 0,
      returns: (salesReturns.count || 0) + (purchaseReturns.count || 0),
      stockAdjustments: inventoryActivities.filter((entry) => entry.type === 'adjustment').length,
      loginHistory: auditLogs.filter((entry) => /login/i.test(entry.action)).length,
      logoutHistory: auditLogs.filter((entry) => /logout/i.test(entry.action)).length
    }
  };

  setCache(cacheKey, result, 30000);
  return result;
}

export const salesReport = asyncHandler(async (req, res) => {
  const filter = dateFilter(req);
  const [summary, sales] = await Promise.all([
    Sale.aggregate([
      { $match: filter },
      { $group: { _id: '$paymentMethod', total: { $sum: '$total' }, invoices: { $sum: 1 }, profit: { $sum: '$profit' } } }
    ]),
    Sale.find(filter).sort({ createdAt: -1 }).limit(500)
  ]);

  res.json({ summary, sales });
});

export const profitLossReport = asyncHandler(async (req, res) => {
  const filter = dateFilter(req);
  const result = await Sale.aggregate([
    { $match: filter },
    { $group: { _id: null, revenue: { $sum: '$total' }, profit: { $sum: '$profit' }, invoices: { $sum: 1 } } }
  ]);
  const data = result[0] || { revenue: 0, profit: 0, invoices: 0 };
  res.json({ ...data, cost: Math.max(data.revenue - data.profit, 0) });
});

export const productAnalytics = asyncHandler(async (req, res) => {
  const filter = dateFilter(req);
  const products = await Sale.aggregate([
    { $match: filter },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        unit: { $first: '$items.unit' },
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' }
      }
    },
    { $sort: { quantity: -1 } },
    { $limit: 50 }
  ]);
  res.json({ products });
});

export const exportSalesExcel = asyncHandler(async (req, res) => {
  const sales = await Sale.find(dateFilter(req)).sort({ createdAt: -1 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sales');
  sheet.columns = [
    { header: 'Invoice', key: 'invoiceNumber', width: 18 },
    { header: 'Date', key: 'date', width: 20 },
    { header: 'Customer', key: 'customer', width: 24 },
    { header: 'Payment', key: 'paymentMethod', width: 12 },
    { header: 'Subtotal', key: 'subtotal', width: 12 },
    { header: 'Tax', key: 'taxTotal', width: 12 },
    { header: 'Discount', key: 'discount', width: 12 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Profit', key: 'profit', width: 12 }
  ];
  sales.forEach((sale) => sheet.addRow({
    invoiceNumber: sale.invoiceNumber,
    date: sale.createdAt.toISOString(),
    customer: sale.customerName || sale.customerMobile || 'Walk-in',
    paymentMethod: sale.paymentMethod,
    subtotal: sale.subtotal,
    taxTotal: sale.taxTotal,
    discount: sale.discount,
    total: sale.total,
    profit: sale.profit
  }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

export const exportSalesPdf = asyncHandler(async (req, res) => {
  const sales = await Sale.find(dateFilter(req)).sort({ createdAt: -1 }).limit(200);
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
  doc.pipe(res);
  doc.fontSize(18).text('Sales Report');
  doc.moveDown();
  sales.forEach((sale) => {
    doc.fontSize(10).text(`${sale.invoiceNumber} | ${sale.createdAt.toLocaleString()} | ${sale.paymentMethod.toUpperCase()} | Total: ${sale.total}`);
  });
  doc.end();
});

export const stockValuation = asyncHandler(async (req, res) => {
  const products = await Product.find({ active: true });
  const totals = products.reduce(
    (acc, product) => {
      acc.purchaseValue += product.purchasePrice * product.stock;
      acc.sellingValue += product.sellingPrice * product.stock;
      return acc;
    },
    { purchaseValue: 0, sellingValue: 0 }
  );
  res.json({ totals, products });
});

export const customerDueReport = asyncHandler(async (req, res) => {
  const customers = await Customer.find({ outstandingBalance: { $gt: 0 } })
    .select('name mobile totalCredit totalPaid outstandingBalance lastPaymentDate creditTransactions')
    .sort({ outstandingBalance: -1 });
  res.json({ customers });
});

export const outstandingBalanceReport = asyncHandler(async (req, res) => {
  const summary = await Customer.aggregate([
    {
      $group: {
        _id: null,
        totalOutstanding: { $sum: '$outstandingBalance' },
        totalCredit: { $sum: '$totalCredit' },
        totalPaid: { $sum: '$totalPaid' },
        customersWithDue: { $sum: { $cond: [{ $gt: ['$outstandingBalance', 0] }, 1, 0] } }
      }
    }
  ]);
  res.json(summary[0] || { totalOutstanding: 0, totalCredit: 0, totalPaid: 0, customersWithDue: 0 });
});

export const creditSalesReport = asyncHandler(async (req, res) => {
  const filter = { ...dateFilter(req), paymentMethod: 'credit' };
  const [summary, sales] = await Promise.all([
    Sale.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$paymentStatus',
          billAmount: { $sum: '$total' },
          paidAmount: { $sum: '$paidAmount' },
          dueAmount: { $sum: '$balanceAmount' },
          invoices: { $sum: 1 }
        }
      }
    ]),
    Sale.find(filter).populate('customer', 'name mobile outstandingBalance').sort({ createdAt: -1 }).limit(500)
  ]);
  res.json({ summary, sales });
});

export const paymentCollectionReport = asyncHandler(async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  const customers = await Customer.find({ 'paymentHistory.0': { $exists: true } }).select('name mobile paymentHistory');
  const collections = [];

  customers.forEach((customer) => {
    customer.paymentHistory.forEach((payment) => {
      const date = new Date(payment.date);
      if (from && date < from) return;
      if (to && date > to) return;
      collections.push({
        customer: { id: customer._id, name: customer.name, mobile: customer.mobile },
        receiptNo: payment.receiptNo,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        date: payment.date,
        appliedTo: payment.appliedTo
      });
    });
  });

  collections.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({
    totalCollected: collections.reduce((sum, item) => sum + item.amount, 0),
    collections
  });
});

export const businessIntelligenceDashboard = asyncHandler(async (req, res) => {
  res.json(await buildBusinessDashboard(req.query));
});

function dashboardMetricRows(dashboard) {
  const groups = [
    ['Sales Analytics', dashboard.sales],
    ['Purchase Analytics', dashboard.purchases],
    ['Inventory Analytics', dashboard.inventory],
    ['Customer Analytics', dashboard.customers],
    ['Supplier Analytics', dashboard.suppliers],
    ['Return Analytics', dashboard.returns],
    ['Tax Analytics', dashboard.tax],
    ['Audit Counts', dashboard.activityCounts]
  ];

  return groups.flatMap(([section, metrics]) => Object.entries(metrics)
    .filter(([, value]) => !Array.isArray(value) && typeof value !== 'object')
    .map(([metric, value]) => ({ section, metric, value })));
}

export const exportBusinessDashboardExcel = asyncHandler(async (req, res) => {
  const dashboard = await buildBusinessDashboard(req.query);
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('BI Summary');
  summary.columns = [
    { header: 'Section', key: 'section', width: 28 },
    { header: 'Metric', key: 'metric', width: 32 },
    { header: 'Value', key: 'value', width: 18 }
  ];
  dashboardMetricRows(dashboard).forEach((row) => summary.addRow(row));

  const payments = workbook.addWorksheet('Payments');
  payments.columns = [
    { header: 'Method', key: 'method', width: 18 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Percentage', key: 'percentage', width: 16 },
    { header: 'Bills', key: 'bills', width: 12 }
  ];
  dashboard.payments.forEach((row) => payments.addRow(row));

  const audit = workbook.addWorksheet('Audit');
  audit.columns = [
    { header: 'Date Time', key: 'dateTime', width: 24 },
    { header: 'User', key: 'user', width: 24 },
    { header: 'Module', key: 'module', width: 18 },
    { header: 'Action', key: 'action', width: 24 },
    { header: 'Reference Number', key: 'referenceNumber', width: 24 }
  ];
  dashboard.audit.forEach((row) => audit.addRow(row));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=business-intelligence-dashboard.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

export const exportBusinessDashboardPdf = asyncHandler(async (req, res) => {
  const dashboard = await buildBusinessDashboard(req.query);
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=business-intelligence-dashboard.pdf');
  doc.pipe(res);
  doc.fontSize(18).text('Business Intelligence Dashboard').moveDown(0.5);
  doc.fontSize(9).text(`Generated: ${new Date(dashboard.generatedAt).toLocaleString()}`).moveDown();
  dashboardMetricRows(dashboard).forEach((row) => {
    doc.fontSize(8).text(`${row.section} | ${row.metric}: ${row.value}`);
  });
  doc.addPage().fontSize(14).text('Recent Audit Activity').moveDown();
  dashboard.audit.slice(0, 60).forEach((row) => {
    doc.fontSize(8).text(`${new Date(row.dateTime).toLocaleString()} | ${row.user} | ${row.module} | ${row.action} | ${row.referenceNumber}`);
  });
  doc.end();
});

export const exportBusinessDashboardCsv = asyncHandler(async (req, res) => {
  const dashboard = await buildBusinessDashboard(req.query);
  const rows = [
    ['Section', 'Metric', 'Value'],
    ...dashboardMetricRows(dashboard).map((row) => [row.section, row.metric, row.value]),
    [],
    ['Payment Method', 'Amount', 'Percentage', 'Bills'],
    ...dashboard.payments.map((row) => [row.method, row.amount, row.percentage, row.bills]),
    [],
    ['Date Time', 'User', 'Module', 'Action', 'Reference Number'],
    ...dashboard.audit.map((row) => [row.dateTime, row.user, row.module, row.action, row.referenceNumber])
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=business-intelligence-dashboard.csv');
  res.send(csv);
});

function returnQuery(req, type) {
  const query = { status: 'Completed' };
  const range = dateFilter(req).createdAt;
  if (range) query.returnDate = range;
  const escaped = (value) => new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (type === 'sales' && req.query.customer) query.customerName = escaped(req.query.customer);
  if (type === 'purchase' && req.query.supplier) query.supplierName = escaped(req.query.supplier);
  if (req.query.product) query['items.productName'] = escaped(req.query.product);
  return query;
}

export const returnsReport = (type) => asyncHandler(async (req, res) => {
  const Model = type === 'sales' ? SalesReturn : PurchaseReturn;
  const returns = await Model.find(returnQuery(req, type)).sort({ returnDate: -1 }).limit(1000).lean();
  const amountKey = type === 'sales' ? 'refundAmount' : 'returnAmount';
  res.json({ returns, summary: { count: returns.length, value: returns.reduce((sum, entry) => sum + Number(entry[amountKey] || 0), 0) } });
});

export const exportReturnsExcel = (type) => asyncHandler(async (req, res) => {
  const Model = type === 'sales' ? SalesReturn : PurchaseReturn;
  const entries = await Model.find(returnQuery(req, type)).sort({ returnDate: -1 }).lean();
  const amountKey = type === 'sales' ? 'refundAmount' : 'returnAmount';
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(type === 'sales' ? 'Sales Returns' : 'Purchase Returns');
  sheet.columns = [{ header: 'Return No', key: 'returnNo', width: 24 }, { header: 'Original Invoice', key: 'originalInvoiceNo', width: 20 }, { header: type === 'sales' ? 'Customer' : 'Supplier', key: 'party', width: 28 }, { header: 'Date', key: 'date', width: 22 }, { header: 'GST', key: 'gst', width: 14 }, { header: 'Value', key: 'value', width: 16 }, { header: 'Reason', key: 'reason', width: 35 }];
  entries.forEach((entry) => sheet.addRow({ returnNo: entry.returnNo, originalInvoiceNo: entry.originalInvoiceNo, party: type === 'sales' ? entry.customerName : entry.supplierName, date: new Date(entry.returnDate).toISOString(), gst: entry.gstAmount, value: entry[amountKey], reason: entry.reason }));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${type}-returns.xlsx`);
  await workbook.xlsx.write(res); res.end();
});

export const exportReturnsPdf = (type) => asyncHandler(async (req, res) => {
  const Model = type === 'sales' ? SalesReturn : PurchaseReturn;
  const entries = await Model.find(returnQuery(req, type)).sort({ returnDate: -1 }).limit(500).lean();
  const amountKey = type === 'sales' ? 'refundAmount' : 'returnAmount';
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=${type}-returns.pdf`); doc.pipe(res);
  doc.fontSize(18).text(type === 'sales' ? 'Sales Return Report' : 'Purchase Return Report').moveDown();
  entries.forEach((entry) => doc.fontSize(9).text(`${entry.returnNo} | ${entry.originalInvoiceNo || '-'} | ${new Date(entry.returnDate).toLocaleString()} | ${type === 'sales' ? entry.customerName || 'Walk-in' : entry.supplierName || '-'} | ${Number(entry[amountKey] || 0).toFixed(2)}`));
  doc.end();
});

async function salesRows(query) {
  const sales = await Sale.find(rangeFor(query)).populate('customer', 'name mobile').sort({ createdAt: -1 }).limit(2000).lean();
  return sales
    .filter((sale) => matchesText(sale.customerName || sale.customer?.name || sale.customerMobile || 'Walk-in', query.customer))
    .flatMap((sale) => (sale.items || []).map((item) => ({
      date: sale.createdAt,
      invoice: sale.invoiceNumber,
      customer: sale.customerName || sale.customer?.name || sale.customerMobile || 'Walk-in',
      productId: String(item.product || ''),
      product: item.name,
      quantity: item.quantity,
      taxable: Number(item.lineTotal || 0) - (Number(item.lineTotal || 0) * Number(item.taxRate || 0) / (100 + Number(item.taxRate || 0) || 100)),
      gstRate: item.taxRate || 0,
      gst: Number(item.lineTotal || 0) * Number(item.taxRate || 0) / (100 + Number(item.taxRate || 0) || 100),
      total: item.lineTotal,
      profit: (Number(item.price || 0) - Number(item.purchasePrice || 0)) * Number(item.quantity || 0)
    })));
}

async function purchaseRows(query) {
  const purchases = await Purchase.find({ ...rangeFor(query, 'purchaseDate'), active: true }).populate('supplier', 'name mobile').sort({ purchaseDate: -1 }).limit(2000).lean();
  return purchases
    .filter((purchase) => !query.supplier || String(purchase.supplier?._id || purchase.supplier) === String(query.supplier))
    .flatMap((purchase) => (purchase.items || []).map((item) => ({
      date: purchase.purchaseDate || purchase.createdAt,
      invoice: purchase.invoiceNumber || String(purchase._id).slice(-6).toUpperCase(),
      supplier: purchase.supplier?.name || '-',
      productId: String(item.product || ''),
      product: item.name,
      quantity: item.quantity,
      costPrice: item.costPrice,
      gstRate: item.gstRate || 0,
      gst: Number(item.lineTotal || 0) - (Number(item.quantity || 0) * Number(item.costPrice || 0)),
      total: item.lineTotal
    })));
}

async function categoryProductFilter(rows, query) {
  let filtered = rows;
  if (query.product) filtered = filtered.filter((row) => String(row.productId) === String(query.product) || matchesText(row.product, query.product));
  if (!query.category) return filtered;
  const productIds = [...new Set(filtered.map((row) => row.productId).filter(Boolean))];
  const products = await Product.find({ _id: { $in: productIds }, category: query.category }).select('_id').lean();
  const allowed = new Set(products.map((product) => String(product._id)));
  return filtered.filter((row) => allowed.has(String(row.productId)));
}

function summarize(rows, amountKey = 'total') {
  return {
    count: rows.length,
    quantity: rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    total: rows.reduce((sum, row) => sum + Number(row[amountKey] || 0), 0),
    gst: rows.reduce((sum, row) => sum + Number(row.gst || 0), 0),
    profit: rows.reduce((sum, row) => sum + Number(row.profit || 0), 0)
  };
}

function columnsFor(type) {
  const common = ['date', 'invoice'];
  const definitions = {
    sales: [...common, 'customer', 'product', 'quantity', 'gstRate', 'gst', 'total', 'profit'],
    purchases: [...common, 'supplier', 'product', 'quantity', 'costPrice', 'gstRate', 'gst', 'total'],
    profit: [...common, 'customer', 'product', 'quantity', 'total', 'profit'],
    gst: [...common, 'party', 'type', 'product', 'gstRate', 'gst', 'total'],
    'stock-valuation': ['product', 'category', 'stock', 'purchasePrice', 'sellingPrice', 'purchaseValue', 'sellingValue'],
    'dead-stock': ['product', 'stock', 'purchaseValue', 'lastSoldAt'],
    'fast-moving-products': ['product', 'quantity', 'revenue'],
    'slow-moving-products': ['product', 'stock', 'quantity', 'revenue'],
    'customer-purchases': ['customer', 'invoices', 'quantity', 'total'],
    'supplier-purchases': ['supplier', 'invoices', 'quantity', 'total'],
    'low-stock': ['product', 'category', 'stock', 'lowStockThreshold', 'purchasePrice', 'sellingPrice']
  };
  return definitions[type] || definitions.sales;
}

async function buildReport(type, query) {
  if (['sales', 'profit'].includes(type)) {
    const rows = await categoryProductFilter(await salesRows(query), query);
    return { type, columns: columnsFor(type), rows, summary: summarize(rows) };
  }

  if (type === 'purchases') {
    const rows = await categoryProductFilter(await purchaseRows(query), query);
    return { type, columns: columnsFor(type), rows, summary: summarize(rows) };
  }

  if (type === 'gst') {
    const [sales, purchases] = await Promise.all([salesRows(query), purchaseRows(query)]);
    const rows = [
      ...sales.map((row) => ({ ...row, party: row.customer, type: 'Sales' })),
      ...purchases.map((row) => ({ ...row, party: row.supplier, type: 'Purchase' }))
    ];
    const filtered = await categoryProductFilter(rows, query);
    return { type, columns: columnsFor(type), rows: filtered, summary: summarize(filtered) };
  }

  if (type === 'stock-valuation' || type === 'low-stock') {
    const filter = { active: true };
    if (query.category) filter.category = query.category;
    if (type === 'low-stock') filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] };
    if (query.product) filter._id = query.product;
    const products = await Product.find(filter).populate('category', 'name').sort({ stock: 1 }).limit(3000).lean();
    const rows = products.map((product) => ({
      product: product.name,
      category: product.category?.name || '-',
      stock: product.stock || 0,
      lowStockThreshold: product.lowStockThreshold || 0,
      purchasePrice: product.purchasePrice || 0,
      sellingPrice: product.sellingPrice || 0,
      purchaseValue: Number(product.purchasePrice || 0) * Number(product.stock || 0),
      sellingValue: Number(product.sellingPrice || 0) * Number(product.stock || 0)
    }));
    return { type, columns: columnsFor(type), rows, summary: summarize(rows, 'purchaseValue') };
  }

  if (['fast-moving-products', 'slow-moving-products', 'dead-stock'].includes(type)) {
    const sold = await categoryProductFilter(await salesRows(query), query);
    const movement = new Map();
    sold.forEach((row) => {
      const current = movement.get(row.productId) || { product: row.product, quantity: 0, revenue: 0, lastSoldAt: row.date };
      current.quantity += Number(row.quantity || 0);
      current.revenue += Number(row.total || 0);
      if (new Date(row.date) > new Date(current.lastSoldAt)) current.lastSoldAt = row.date;
      movement.set(row.productId, current);
    });

    if (type === 'dead-stock') {
      const products = await Product.find({ active: true, stock: { $gt: 0 } }).lean();
      const rows = products
        .filter((product) => !movement.has(String(product._id)))
        .map((product) => ({
          product: product.name,
          stock: product.stock || 0,
          purchaseValue: Number(product.purchasePrice || 0) * Number(product.stock || 0),
          lastSoldAt: '-'
        }));
      return { type, columns: columnsFor(type), rows, summary: summarize(rows, 'purchaseValue') };
    }

    const rows = [...movement.values()].sort((a, b) => type === 'fast-moving-products' ? b.quantity - a.quantity : a.quantity - b.quantity).slice(0, 100);
    return { type, columns: columnsFor(type), rows, summary: summarize(rows, 'revenue') };
  }

  if (type === 'customer-purchases') {
    const rowsByCustomer = new Map();
    const rows = await salesRows(query);
    rows.forEach((row) => {
      if (!matchesText(row.customer, query.customer)) return;
      const current = rowsByCustomer.get(row.customer) || { customer: row.customer, invoices: new Set(), quantity: 0, total: 0 };
      current.invoices.add(row.invoice);
      current.quantity += Number(row.quantity || 0);
      current.total += Number(row.total || 0);
      rowsByCustomer.set(row.customer, current);
    });
    const reportRows = [...rowsByCustomer.values()].map((row) => ({ ...row, invoices: row.invoices.size })).sort((a, b) => b.total - a.total);
    return { type, columns: columnsFor(type), rows: reportRows, summary: summarize(reportRows) };
  }

  if (type === 'supplier-purchases') {
    const rowsBySupplier = new Map();
    const rows = await purchaseRows(query);
    rows.forEach((row) => {
      const current = rowsBySupplier.get(row.supplier) || { supplier: row.supplier, invoices: new Set(), quantity: 0, total: 0 };
      current.invoices.add(row.invoice);
      current.quantity += Number(row.quantity || 0);
      current.total += Number(row.total || 0);
      rowsBySupplier.set(row.supplier, current);
    });
    const reportRows = [...rowsBySupplier.values()].map((row) => ({ ...row, invoices: row.invoices.size })).sort((a, b) => b.total - a.total);
    return { type, columns: columnsFor(type), rows: reportRows, summary: summarize(reportRows) };
  }

  return buildReport('sales', query);
}

export const advancedReport = (type) => asyncHandler(async (req, res) => {
  res.json(await buildReport(type, req.query));
});

export const exportAdvancedReportExcel = (type) => asyncHandler(async (req, res) => {
  const report = await buildReport(type, req.query);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(type.slice(0, 31));
  sheet.columns = report.columns.map((key) => ({ header: key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()), key, width: 20 }));
  report.rows.forEach((row) => sheet.addRow(row));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${type}-report.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

export const exportAdvancedReportPdf = (type) => asyncHandler(async (req, res) => {
  const report = await buildReport(type, req.query);
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${type}-report.pdf`);
  doc.pipe(res);
  doc.fontSize(18).text(`${type.replace(/-/g, ' ')} Report`).moveDown();
  doc.fontSize(10).text(`Rows: ${report.summary.count} | Total: ${Number(report.summary.total || 0).toFixed(2)} | GST: ${Number(report.summary.gst || 0).toFixed(2)} | Profit: ${Number(report.summary.profit || 0).toFixed(2)}`).moveDown();
  report.rows.slice(0, 300).forEach((row) => {
    doc.fontSize(8).text(report.columns.map((column) => `${column}: ${row[column] instanceof Date ? row[column].toLocaleString() : row[column] ?? '-'}`).join(' | '));
  });
  doc.end();
});
