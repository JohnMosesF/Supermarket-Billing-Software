import { Customer } from '../models/Customer.js';
import { Product } from '../models/Product.js';
import { Sale } from '../models/Sale.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export const getDashboard = asyncHandler(async (req, res) => {
  const today = startOfToday();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - 30);

  const [totalSalesAgg, todaySalesAgg, productCount, lowStock, recentTransactions, revenueChart, receivableAgg, customersWithDue, overdueCreditBills] = await Promise.all([
    Sale.aggregate([{ $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    Sale.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    Product.countDocuments({ active: true }),
    Product.find({ $expr: { $lte: ['$stock', '$lowStockThreshold'] }, active: true }).sort({ stock: 1 }).limit(10).lean(),
    Sale.find().populate('customer', 'name mobile outstandingBalance').sort({ createdAt: -1 }).limit(8).lean(),
    Sale.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: { $dayOfMonth: '$createdAt' }, revenue: { $sum: '$total' }, profit: { $sum: '$profit' } } },
      { $sort: { _id: 1 } }
    ]),
    Customer.aggregate([{ $group: { _id: null, total: { $sum: '$outstandingBalance' } } }]),
    Customer.countDocuments({ outstandingBalance: { $gt: 0 } }),
    Sale.countDocuments({ paymentMethod: 'credit', balanceAmount: { $gt: 0 }, createdAt: { $lte: overdueDate } })
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
      overdueCreditBills
    },
    lowStock,
    recentTransactions,
    revenueChart: revenueChart.map((item) => ({ day: item._id, revenue: item.revenue, profit: item.profit || 0 }))
  });
});
