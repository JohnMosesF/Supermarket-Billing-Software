import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Customer } from '../models/Customer.js';
import { Product } from '../models/Product.js';
import { Sale } from '../models/Sale.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function dateFilter(req) {
  const filter = {};
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  return filter;
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
