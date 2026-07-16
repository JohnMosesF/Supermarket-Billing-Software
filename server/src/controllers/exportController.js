import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Category } from '../models/Category.js';
import { Customer } from '../models/Customer.js';
import { Expense } from '../models/Expense.js';
import { ExpenseLedger } from '../models/ExpenseLedger.js';
import { Product } from '../models/Product.js';
import { Purchase } from '../models/Purchase.js';
import { Sale } from '../models/Sale.js';
import { Supplier } from '../models/Supplier.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';

const datasets = {
  products: Product,
  customers: Customer,
  suppliers: Supplier,
  sales: Sale,
  purchases: Purchase,
  categories: Category,
  expenses: Expense,
  'expense-list': Expense,
  'expense-ledger': ExpenseLedger,
  'expense-summary': Expense,
  'expense-category-summary': Expense
};

function dateRange(query, field = 'createdAt') {
  if (!query.from && !query.to) return {};
  const range = {};
  if (query.from) range.$gte = new Date(query.from);
  if (query.to) {
    const to = new Date(query.to);
    to.setHours(23, 59, 59, 999);
    range.$lte = to;
  }
  return { [field]: range };
}

async function exportRows(dataset, query) {
  const Model = datasets[dataset];
  if (!Model) throw new ApiError(400, 'Unsupported export dataset');
  if (dataset === 'expense-summary' || dataset === 'expense-category-summary') return exportExpenseSummaryRows(dataset, query);
  const dateField = ['purchases'].includes(dataset) ? 'purchaseDate' : ['expenses', 'expense-list'].includes(dataset) ? 'expenseDate' : dataset === 'expense-ledger' ? 'transactionDate' : 'createdAt';
  const filter = { ...dateRange(query, dateField) };
  if (query.product && dataset === 'products') filter._id = query.product;
  if (query.category && dataset === 'products') filter.category = query.category;
  if (query.category && ['expenses', 'expense-list', 'expense-ledger'].includes(dataset)) filter.category = query.category;
  if (query.customer && dataset === 'sales') filter.customer = query.customer;
  if (query.supplier && dataset === 'purchases') filter.supplier = query.supplier;
  if (query.paymentMethod && ['expenses', 'expense-list', 'expense-ledger'].includes(dataset)) filter.paymentMethod = query.paymentMethod;
  if (query.status && ['expenses', 'expense-list'].includes(dataset)) filter.status = query.status;
  if (query.vendor && ['expenses', 'expense-list'].includes(dataset)) filter.vendor = new RegExp(query.vendor, 'i');
  if (query.user && ['expenses', 'expense-list', 'expense-ledger'].includes(dataset)) filter.createdBy = query.user;
  if (query.product && ['sales', 'purchases'].includes(dataset)) filter['items.product'] = query.product;

  const queryBuilder = Model.find(filter).sort({ createdAt: -1 }).limit(10000);
  if (dataset === 'products') queryBuilder.populate('category', 'name');
  if (dataset === 'sales') queryBuilder.populate('customer', 'name mobile');
  if (dataset === 'purchases') queryBuilder.populate('supplier', 'name mobile');
  if (['expenses', 'expense-list', 'expense-ledger'].includes(dataset)) queryBuilder.populate('category', 'name code').populate('createdBy', 'name email');
  return queryBuilder.lean();
}

function flatten(row) {
  if (row.voucherNo || row.expenseName || row.expenseNo) {
    return {
      id: row._id,
      voucherNo: row.expenseNo || row.voucherNo,
      date: row.expenseDate || row.transactionDate || row.createdAt,
      category: row.category?.name || row.categoryName || '',
      expenseName: row.expenseName || '',
      taxableAmount: row.taxableAmount ?? row.amount ?? '',
      gstAmount: row.gstAmount ?? '',
      totalAmount: row.totalAmount ?? row.debit ?? '',
      paymentMethod: row.paymentMethod || '',
      vendor: row.vendor || '',
      referenceNumber: row.referenceNumber || '',
      status: row.status || '',
      user: row.createdBy?.name || '',
      remarks: row.remarks || '',
      debit: row.debit ?? '',
      credit: row.credit ?? '',
      balance: row.balance ?? ''
    };
  }
  if (row.metric || row.category) return row;
  return {
    id: row._id,
    name: row.name || row.invoiceNumber || row.invoiceNo || row.poNumber || row.email || '',
    date: row.purchaseDate || row.createdAt,
    customer: row.customer?.name || row.customerName || '',
    supplier: row.supplier?.name || '',
    category: row.category?.name || row.category || '',
    sku: row.sku || '',
    stock: row.stock,
    total: row.total,
    paidAmount: row.paidAmount,
    balanceAmount: row.balanceAmount ?? Math.max(Number(row.total || 0) - Number(row.paidAmount || 0), 0),
    raw: JSON.stringify(row)
  };
}

async function exportExpenseSummaryRows(dataset, query) {
  const filter = { status: 'Posted', ...dateRange(query, 'expenseDate') };
  if (query.category) filter.category = query.category;
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;
  if (query.vendor) filter.vendor = new RegExp(query.vendor, 'i');
  if (query.user) filter.createdBy = query.user;
  const rows = await Expense.find(filter).populate('category', 'name code').lean();
  const total = rows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
  const gst = rows.reduce((sum, row) => sum + Number(row.gstAmount || 0), 0);
  if (dataset === 'expense-summary') {
    return [
      { metric: 'Expense Count', value: rows.length },
      { metric: 'Taxable Amount', value: rows.reduce((sum, row) => sum + Number(row.taxableAmount ?? row.amount ?? 0), 0) },
      { metric: 'GST Amount', value: gst },
      { metric: 'Total Expense', value: total }
    ];
  }
  const byCategory = new Map();
  rows.forEach((row) => {
    const category = row.category?.name || row.categoryName || 'Uncategorized';
    const current = byCategory.get(category) || { category, count: 0, taxableAmount: 0, gstAmount: 0, totalAmount: 0 };
    current.count += 1;
    current.taxableAmount += Number(row.taxableAmount ?? row.amount ?? 0);
    current.gstAmount += Number(row.gstAmount || 0);
    current.totalAmount += Number(row.totalAmount || 0);
    byCategory.set(category, current);
  });
  return [...byCategory.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

function toCsv(rows) {
  const keys = Object.keys(rows[0] || { message: '' });
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [keys.join(','), ...rows.map((row) => keys.map((key) => escape(row[key])).join(','))].join('\n');
}

export const exportData = (format) => asyncHandler(async (req, res) => {
  const dataset = req.params.dataset;
  const rows = (await exportRows(dataset, req.query)).map(flatten);
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${dataset}.json`);
    return res.json({ dataset, rows });
  }
  if (format === 'csv') {
    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${dataset}.csv`);
    return res.send(csv);
  }
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${dataset}.pdf`);
    const doc = new PDFDocument({ margin: 32, size: 'A4', layout: 'landscape' });
    doc.pipe(res);
    doc.fontSize(16).text(dataset.replace(/-/g, ' ').toUpperCase(), { align: 'center' }).moveDown();
    const keys = Object.keys(rows[0] || { message: '' }).slice(0, 8);
    rows.slice(0, 1000).forEach((row) => {
      doc.fontSize(8).text(keys.map((key) => `${key}: ${row[key] ?? ''}`).join(' | '));
      if (doc.y > 520) doc.addPage();
    });
    doc.end();
    return;
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(dataset.slice(0, 31));
  const keys = Object.keys(rows[0] || { message: '' });
  sheet.columns = keys.map((key) => ({ header: key, key, width: 22 }));
  rows.forEach((row) => sheet.addRow(row));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${dataset}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});
