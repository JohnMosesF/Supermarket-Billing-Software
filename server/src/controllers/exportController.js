import ExcelJS from 'exceljs';
import { Category } from '../models/Category.js';
import { Customer } from '../models/Customer.js';
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
  categories: Category
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
  const filter = { ...dateRange(query, dataset === 'purchases' ? 'purchaseDate' : 'createdAt') };
  if (query.product && dataset === 'products') filter._id = query.product;
  if (query.category && dataset === 'products') filter.category = query.category;
  if (query.customer && dataset === 'sales') filter.customer = query.customer;
  if (query.supplier && dataset === 'purchases') filter.supplier = query.supplier;
  if (query.product && ['sales', 'purchases'].includes(dataset)) filter['items.product'] = query.product;

  const queryBuilder = Model.find(filter).sort({ createdAt: -1 }).limit(10000);
  if (dataset === 'products') queryBuilder.populate('category', 'name');
  if (dataset === 'sales') queryBuilder.populate('customer', 'name mobile');
  if (dataset === 'purchases') queryBuilder.populate('supplier', 'name mobile');
  return queryBuilder.lean();
}

function flatten(row) {
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
