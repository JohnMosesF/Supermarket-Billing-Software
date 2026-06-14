import { Customer } from '../models/Customer.js';
import { Product } from '../models/Product.js';
import Bill from '../models/Bill.js';
import { Sale } from '../models/Sale.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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

  const [totalSalesAgg, todaySalesAgg, productCount, lowStock, recentTransactions, revenueChart, receivableAgg, customersWithDue, overdueCreditBills, todayCreditSalesAgg, collectedTodayAgg] = await Promise.all([
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
    ])
  ]);

  res.json({
    totals: {
      allSales: totalSalesAgg[0]?.total || 0,
      allInvoices: totalSalesAgg[0]?.count || 0,
      todaySales: todaySalesAgg[0]?.total || 0,
      todayInvoices: todaySalesAgg[0]?.count || 0,
      productCount,
      lowStockCount: lowStock.length,
      totalOutstandingReceivables: receivableAgg[0]?.total || 0,
      customersWithDue,
      overdueCreditBills,
      todayCreditSales: todayCreditSalesAgg[0]?.total || 0,
      todayCreditBills: todayCreditSalesAgg[0]?.count || 0,
      collectedToday: collectedTodayAgg[0]?.total || 0,
      collectionCountToday: collectedTodayAgg[0]?.count || 0
    },
    lowStock,
    recentTransactions,
    revenueChart: revenueChart.map((item) => ({ day: item._id, revenue: item.revenue, profit: item.profit || 0 }))
  });
});
