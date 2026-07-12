import { Customer } from '../models/Customer.js';
import { Product } from '../models/Product.js';
import Bill from '../models/Bill.js';
import { Sale } from '../models/Sale.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { SalesReturn } from '../models/SalesReturn.js';
import { PurchaseReturn } from '../models/PurchaseReturn.js';
import { Supplier } from '../models/Supplier.js';
import { CustomerReceipt } from '../models/CustomerReceipt.js';
import { SupplierPayment } from '../models/SupplierPayment.js';
import { DayBookEntry } from '../models/DayBookEntry.js';

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export const getDashboard = asyncHandler(async (req, res) => {
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - 30);

  const [totalSalesAgg, todaySalesAgg, productCount, lowStock, recentTransactions, revenueChart, receivableAgg, customersWithDue, overdueCreditBills, todayCreditSalesAgg, collectedTodayAgg, todaySalesReturns, todayPurchaseReturns, monthlySalesReturns, monthlyPurchaseReturns, mostReturnedProducts] = await Promise.all([
    Bill.aggregate([{ $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    Bill.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    Product.countDocuments({ active: true }),
    Product.find({ $expr: { $lte: ['$stock', '$lowStockThreshold'] }, active: true }).sort({ stock: 1 }).limit(10).lean(),
    Bill.find().populate('customer', 'name mobile outstandingBalance creditBalance').sort({ createdAt: -1 }).limit(8).lean(),
    Bill.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: { $dayOfMonth: '$createdAt' }, revenue: { $sum: '$total' } } },
      { $sort: { _id: 1 } }
    ]),
    Customer.aggregate([{ $group: { _id: null, total: { $sum: '$creditBalance' } } }]),
    Customer.countDocuments({ creditBalance: { $gt: 0 } }),
    Bill.countDocuments({ paymentMethod: 'Credit', dueAmount: { $gt: 0 }, createdAt: { $lte: overdueDate } }),
    Bill.aggregate([{ $match: { paymentMethod: 'Credit', createdAt: { $gte: today, $lt: tomorrow } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    Customer.aggregate([
      { $unwind: '$paymentHistory' },
      { $match: { 'paymentHistory.date': { $gte: today, $lt: tomorrow } } },
      { $group: { _id: null, total: { $sum: '$paymentHistory.amount' }, count: { $sum: 1 } } }
    ]),
    SalesReturn.aggregate([{ $match: { returnDate: { $gte: today, $lt: tomorrow }, status: 'Completed' } }, { $group: { _id: null, value: { $sum: '$refundAmount' }, count: { $sum: 1 } } }]),
    PurchaseReturn.aggregate([{ $match: { returnDate: { $gte: today, $lt: tomorrow }, status: 'Completed' } }, { $group: { _id: null, value: { $sum: '$returnAmount' }, count: { $sum: 1 } } }]),
    SalesReturn.aggregate([{ $match: { returnDate: { $gte: monthStart }, status: 'Completed' } }, { $group: { _id: null, value: { $sum: '$refundAmount' }, count: { $sum: 1 } } }]),
    PurchaseReturn.aggregate([{ $match: { returnDate: { $gte: monthStart }, status: 'Completed' } }, { $group: { _id: null, value: { $sum: '$returnAmount' }, count: { $sum: 1 } } }]),
    SalesReturn.aggregate([{ $match: { returnDate: { $gte: monthStart }, status: 'Completed' } }, { $unwind: '$items' }, { $group: { _id: '$items.product', name: { $first: '$items.productName' }, quantity: { $sum: '$items.quantity' }, value: { $sum: '$items.refundAmount' } } }, { $sort: { quantity: -1 } }, { $limit: 5 }])
  ]);

  const [supplierPayables, todaysReceipts, todaysPayments, recentReceipts, recentSupplierPayments, cashSummary] = await Promise.all([
    Supplier.aggregate([{ $group: { _id: null, total: { $sum: '$outstandingBalance' } } }]),
    CustomerReceipt.aggregate([{ $match: { receiptDate: { $gte: today, $lt: tomorrow }, status: 'Posted' } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    SupplierPayment.aggregate([{ $match: { paymentDate: { $gte: today, $lt: tomorrow }, status: 'Posted' } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    CustomerReceipt.find({ status: 'Posted' }).populate('customer', 'name mobile').sort({ receiptDate: -1 }).limit(5).lean(),
    SupplierPayment.find({ status: 'Posted' }).populate('supplier', 'name mobile').sort({ paymentDate: -1 }).limit(5).lean(),
    DayBookEntry.aggregate([{ $group: { _id: null, cashIn: { $sum: '$cashIn' }, cashOut: { $sum: '$cashOut' } } }])
  ]);

  const [todaySaleDocs, monthSaleDocs, recentSaleDocs, saleChart, topSaleProducts, topBillProducts, topSaleCustomers, topBillCustomers] = await Promise.all([
    Sale.aggregate([{ $match: { createdAt: { $gte: today, $lt: tomorrow } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 }, profit: { $sum: '$profit' } } }]),
    Sale.aggregate([{ $match: { createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 }, profit: { $sum: '$profit' } } }]),
    Sale.find().populate('customer', 'name mobile outstandingBalance').sort({ createdAt: -1 }).limit(8).lean(),
    Sale.aggregate([{ $match: { createdAt: { $gte: monthStart } } }, { $group: { _id: { $dayOfMonth: '$createdAt' }, revenue: { $sum: '$total' }, profit: { $sum: '$profit' } } }, { $sort: { _id: 1 } }]),
    Sale.aggregate([{ $match: { createdAt: { $gte: monthStart } } }, { $unwind: '$items' }, { $group: { _id: '$items.product', name: { $first: '$items.name' }, quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } }, { $sort: { quantity: -1 } }, { $limit: 5 }]),
    Bill.aggregate([{ $match: { createdAt: { $gte: monthStart }, status: { $ne: 'Cancelled' } } }, { $unwind: '$items' }, { $group: { _id: '$items.productId', name: { $first: '$items.productName' }, quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.netAmount' } } }, { $sort: { quantity: -1 } }, { $limit: 5 }]),
    Sale.aggregate([{ $match: { createdAt: { $gte: monthStart } } }, { $group: { _id: '$customerName', customer: { $first: '$customerName' }, total: { $sum: '$total' }, bills: { $sum: 1 } } }, { $sort: { total: -1 } }, { $limit: 5 }]),
    Bill.aggregate([{ $match: { createdAt: { $gte: monthStart }, status: { $ne: 'Cancelled' } } }, { $group: { _id: '$customerName', customer: { $first: '$customerName' }, total: { $sum: '$total' }, bills: { $sum: 1 } } }, { $sort: { total: -1 } }, { $limit: 5 }])
  ]);

  const mergedChart = new Map();
  [...revenueChart, ...saleChart].forEach((item) => {
    const current = mergedChart.get(item._id) || { day: item._id, revenue: 0, profit: 0 };
    current.revenue += Number(item.revenue || 0);
    current.profit += Number(item.profit || 0);
    mergedChart.set(item._id, current);
  });

  const recentBills = [...recentTransactions, ...recentSaleDocs]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  res.json({
    totals: {
      allSales: totalSalesAgg[0]?.total || 0,
      allInvoices: totalSalesAgg[0]?.count || 0,
      todaySales: (todaySalesAgg[0]?.total || 0) + (todaySaleDocs[0]?.total || 0),
      todayBills: (todaySalesAgg[0]?.count || 0) + (todaySaleDocs[0]?.count || 0),
      todayInvoices: (todaySalesAgg[0]?.count || 0) + (todaySaleDocs[0]?.count || 0),
      monthlySales: (revenueChart.reduce((sum, item) => sum + Number(item.revenue || 0), 0)) + (monthSaleDocs[0]?.total || 0),
      monthlyProfit: monthSaleDocs[0]?.profit || 0,
      productCount,
      lowStockCount: lowStock.length,
      totalOutstandingReceivables: receivableAgg[0]?.total || 0,
      customersWithDue,
      overdueCreditBills,
      todayCreditSales: todayCreditSalesAgg[0]?.total || 0,
      todayCreditBills: todayCreditSalesAgg[0]?.count || 0,
      collectedToday: collectedTodayAgg[0]?.total || 0,
      collectionCountToday: collectedTodayAgg[0]?.count || 0,
      todaySalesReturns: todaySalesReturns[0]?.value || 0,
      todaySalesReturnCount: todaySalesReturns[0]?.count || 0,
      todayPurchaseReturns: todayPurchaseReturns[0]?.value || 0,
      todayPurchaseReturnCount: todayPurchaseReturns[0]?.count || 0,
      monthlyReturns: (monthlySalesReturns[0]?.value || 0) + (monthlyPurchaseReturns[0]?.value || 0),
      monthlyReturnCount: (monthlySalesReturns[0]?.count || 0) + (monthlyPurchaseReturns[0]?.count || 0)
      , totalPayables: supplierPayables[0]?.total || 0
      , todayCollections: todaysReceipts[0]?.total || 0
      , todayCollectionCount: todaysReceipts[0]?.count || 0
      , todayPayments: todaysPayments[0]?.total || 0
      , todayPaymentCount: todaysPayments[0]?.count || 0
      , cashBalance: (cashSummary[0]?.cashIn || 0) - (cashSummary[0]?.cashOut || 0)
    },
    lowStock,
    recentTransactions: recentBills,
    recentBills,
    topSellingProducts: [...topSaleProducts, ...topBillProducts].sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0)).slice(0, 5),
    topCustomers: [...topSaleCustomers, ...topBillCustomers].sort((a, b) => Number(b.total || 0) - Number(a.total || 0)).slice(0, 5),
    revenueChart: [...mergedChart.values()].sort((a, b) => a.day - b.day),
    mostReturnedProducts,
    recentReceipts,
    recentSupplierPayments
  });
});
